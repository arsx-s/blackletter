/**
 * Local development / desktop model relay.
 *
 * This process holds OPENROUTER_API_KEY, so it is bound to loopback only and
 * runs the exact same request policy as the hosted function
 * (`src/server/relay-guard.mjs`). It used to listen on every interface with
 * `Access-Control-Allow-Origin: *`, which let any machine on the same network
 * spend the operator's provider credits.
 *
 * Overrides, all opt-in and all explicit:
 *   BLACKLETTER_DEV_HOST       bind address (default 127.0.0.1)
 *   BLACKLETTER_DEV_PORT       port (default 3000)
 *   BLACKLETTER_RELAY_TOKEN    require a bearer token
 *   BLACKLETTER_ALLOWED_ORIGINS  extra allowed origins, comma separated
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Minimal, dependency-free `.env` reader. Existing environment variables always
 * win, and values are never logged.
 */
function loadDotEnv() {
  const file = path.join(HERE, "..", ".env");
  if (!fs.existsSync(file)) return;
  let text = "";
  try {
    text = fs.readFileSync(file, "utf-8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const UPSTREAM_URL = `${OPENROUTER_BASE}/chat/completions`;

const HOST = process.env.BLACKLETTER_DEV_HOST || "127.0.0.1";
const PORT = Number(process.env.BLACKLETTER_DEV_PORT || process.env.PORT || 3000);

const config = resolveConfig(process.env, "local");
const limiter = createRateLimiter({ ratePerMinute: config.ratePerMinute, burst: config.rateBurst });

function logSafe(event, fields = {}) {
  const parts = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${redact(value)}`)
    .join(" ");
  console.log(`[relay] ${event}${parts ? ` ${parts}` : ""}`);
}

async function handleChat(req, res) {
  const startedAt = Date.now();
  const requestId = `req-${startedAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;

  if (req.method === "OPTIONS") {
    applyCors(res, origin, config);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    applyCors(res, origin, config);
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

  applyCors(res, origin, config);

  const rate = limiter.check(clientKey(req));
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
      error: {
        code: "NO_KEY",
        message:
          "OPENROUTER_API_KEY is not set. Add it to the environment or to .env before starting the relay.",
      },
    });
    res.end();
    return;
  }

  const { prompt, systemInstruction, model, temperature, maxTokens } = validated.value;
  const messages = [];
  if (systemInstruction) messages.push({ role: "system", content: systemInstruction });
  messages.push({ role: "user", content: prompt });

  const upstreamBody = { model, messages, stream: true };
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
      let detail = "";
      try {
        detail = (await upstream.text()).slice(0, 400);
      } catch {
        detail = "<unreadable upstream body>";
      }
      const code = upstream.status === 401 || upstream.status === 403 ? "INVALID_KEY" : "UPSTREAM";
      logSafe("upstream_error", { requestId, status: upstream.status, model, detail: redact(detail) });
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
        await new Promise((resolve) => res.once("drain", resolve));
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

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === "/healthz" && req.method === "GET") {
    // Reports liveness only. Never echoes configuration or credentials.
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, service: "blackletter-relay", profile: "local" }));
    return;
  }

  if (url.pathname === "/api/chat" || url.pathname === "/") {
    if (url.pathname === "/") {
      jsonError(res, 404, "NOT_FOUND", "The relay only serves POST /api/chat.");
      return;
    }
    void handleChat(req, res);
    return;
  }

  jsonError(res, 404, "NOT_FOUND", "Unknown relay path.");
});

server.on("clientError", (_error, socket) => {
  if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

server.listen(PORT, HOST, () => {
  console.log(`[relay] listening on http://${HOST}:${PORT} (loopback-only by default)`);
  console.log(`[relay] CORS: ${config.allowedOrigins.size} allowed origin(s); wildcard disabled`);
  if (!config.token) {
    console.log(
      "[relay] note: BLACKLETTER_RELAY_TOKEN is unset. Loopback binding and the origin policy are the only controls.",
    );
  }
  if (!process.env.OPENROUTER_API_KEY) {
    console.log("[relay] OPENROUTER_API_KEY is not set — chat requests will return NO_KEY.");
  }
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
