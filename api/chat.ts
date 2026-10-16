import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  RELAY_LIMITS,
  resolveConfig,
  readBody,
  checkOrigin,
  checkAuthorization,
  createRateLimiter,
  clientKey,
  validateChatRequest,
  toClientError,
  createAbortBridge,
  jsonError,
  redact,
  writeSSE,
  beginSSE,
  applyCors,
} from "../src/server/relay-guard.mjs";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const UPSTREAM_URL = `${OPENROUTER_BASE}/chat/completions`;

/**
 * Hosted model relay.
 *
 * This function is the only place in the deployed system that holds
 * `OPENROUTER_API_KEY`. Every request is checked against the shared policy in
 * `src/server/relay-guard.mjs` before a single byte reaches the provider:
 * origin, bearer token (when configured), rate limit, body size, field set and
 * model id. Client-facing errors are sanitised — no stacks, no upstream
 * bodies, no credential-shaped strings.
 *
 * The rate limiter is per-instance and resets on cold start. It bounds cost;
 * it is not a quota system.
 */

const config = resolveConfig(process.env, "hosted");
const limiter = createRateLimiter({ ratePerMinute: config.ratePerMinute, burst: config.rateBurst });

function logSafe(event: string, fields: Record<string, unknown>) {
  const parts = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${redact(value)}`)
    .join(" ");
  console.log(`[relay] ${event}${parts ? ` ${parts}` : ""}`);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startedAt = Date.now();
  const requestId = `req-${startedAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  if (req.method === "OPTIONS") {
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
    applyCors(res, origin, config);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    jsonError(res, 405, "METHOD_NOT_ALLOWED", "Only POST is supported.", { Allow: "POST, OPTIONS" });
    return;
  }

  const originCheck = checkOrigin(req, config);
  if (!originCheck.ok) {
    logSafe("rejected", { requestId, reason: originCheck.reason });
    jsonError(res, 403, "FORBIDDEN_ORIGIN", "This origin is not permitted to use the model relay.");
    return;
  }

  const auth = checkAuthorization(req, config);
  if (!auth.ok) {
    logSafe("rejected", { requestId, reason: auth.reason });
    jsonError(
      res,
      auth.status ?? 401,
      auth.reason === "not_configured" ? "RELAY_AUTH_NOT_CONFIGURED" : "UNAUTHORIZED",
      auth.reason === "not_configured"
        ? "The hosted relay is not configured with an access token."
        : "A valid relay token is required.",
    );
    return;
  }

  const key = clientKey(req);
  const rate = limiter.check(key);
  if (!rate.ok) {
    logSafe("rejected", { requestId, reason: "rate_limited" });
    jsonError(res, 429, "RATE_LIMITED", `Too many requests. Retry in ${rate.retryAfter}s.`, {
      "Retry-After": String(rate.retryAfter),
    });
    return;
  }

  const body = await readBody(req, RELAY_LIMITS.maxBodyBytes);
  if (!body.ok) {
    logSafe("rejected", { requestId, reason: body.code });
    jsonError(res, body.status, body.code, body.message, body.close ? { Connection: "close" } : undefined);
    return;
  }

  const validated = validateChatRequest(body.value, config);
  if (!validated.ok) {
    logSafe("rejected", { requestId, reason: validated.code });
    jsonError(res, validated.status, validated.code, validated.message);
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    logSafe("error", { requestId, code: "NO_KEY" });
    beginSSE(res);
    writeSSE(res, {
      error: { code: "NO_KEY", message: "OpenRouter API key is not configured on the server." },
    });
    res.end();
    return;
  }

  const { prompt, systemInstruction, model, temperature, maxTokens } = validated.value;

  const messages: Array<{ role: string; content: string }> = [];
  if (systemInstruction) messages.push({ role: "system", content: systemInstruction });
  messages.push({ role: "user", content: prompt });

  const upstreamBody: Record<string, unknown> = { model, messages, stream: true };
  if (typeof temperature === "number") upstreamBody.temperature = temperature;
  if (typeof maxTokens === "number") upstreamBody.max_tokens = maxTokens;

  const bridge = createAbortBridge(res, config.timeoutMs);
  let streamStarted = false;

  try {
    const upstream = await fetch(UPSTREAM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://blackletter.os",
        "X-Title": "BlackLetter OS",
      },
      body: JSON.stringify(upstreamBody),
      signal: bridge.signal,
    });

    if (!upstream.ok) {
      // Read a bounded slice purely for server-side diagnostics. The provider's
      // text is never forwarded to the client.
      let detail = "";
      try {
        detail = (await upstream.text()).slice(0, 400);
      } catch {
        detail = "<unreadable upstream body>";
      }
      const code = upstream.status === 401 || upstream.status === 403 ? "INVALID_KEY" : "UPSTREAM";
      logSafe("upstream_error", {
        requestId,
        status: upstream.status,
        model,
        detail: redact(detail),
      });
      beginSSE(res);
      writeSSE(res, {
        error: {
          code,
          message:
            code === "INVALID_KEY"
              ? "The relay's provider credential was rejected."
              : `The model provider returned an error (HTTP ${upstream.status}).`,
        },
      });
      res.end();
      return;
    }

    if (!upstream.body) {
      logSafe("error", { requestId, code: "UPSTREAM", detail: "no response stream" });
      beginSSE(res);
      writeSSE(res, { error: { code: "UPSTREAM", message: "The model provider returned no stream." } });
      res.end();
      return;
    }

    beginSSE(res);
    streamStarted = true;

    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(value)) {
        // Respect backpressure instead of buffering the whole answer in memory.
        await new Promise<void>((resolve) => res.once("drain", resolve));
      }
    }

    res.end();
    logSafe("ok", { requestId, model, ms: Date.now() - startedAt });
  } catch (error) {
    const { code, message } = toClientError(error);
    const cancelled = bridge.reason !== null || code === "CANCELLED";

    if (cancelled) {
      logSafe("aborted", { requestId, reason: bridge.reason ?? "cancelled", ms: Date.now() - startedAt });
    } else {
      logSafe("error", { requestId, code, ms: Date.now() - startedAt, detail: redact(message) });
    }

    if (streamStarted) {
      // Headers are already flushed; the only honest signal left is an SSE
      // error frame, and only if the socket is still open.
      if (!res.writableEnded) {
        try {
          writeSSE(res, { error: { code: cancelled ? "CANCELLED" : code, message } });
        } catch {
          /* socket already gone */
        }
        res.end();
      }
    } else if (cancelled) {
      if (!res.writableEnded) jsonError(res, 499, "CANCELLED", "The request was cancelled.");
    } else {
      jsonError(res, 502, code, message);
    }
  } finally {
    bridge.dispose();
  }
}
