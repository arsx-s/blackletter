/**
 * Shared request policy for every server-side path that holds the OpenRouter
 * credential.
 *
 * There are two such paths and they must not drift apart:
 *   - `api/chat.ts`              the hosted (Vercel) serverless function
 *   - `scripts/dev-server.mjs`   the local development / desktop relay
 *
 * This module is deliberately plain ESM with no dependencies and no TypeScript
 * syntax, because the dev relay is plain Node and cannot import TS. Types for
 * it live in `relay-guard.d.mts`.
 *
 * Security posture
 * ----------------
 * CORS is not authentication. An `Origin` check constrains browsers only; any
 * non-browser client can forge or omit the header. So the controls here are
 * layered, and the *strong* control is deliberately separate from CORS:
 *
 *   1. Bearer token (`BLACKLETTER_RELAY_TOKEN`) — the real access control.
 *      Hosted relays fail closed if it is absent; when set, nothing passes
 *      without it, browsers included. The local relay may omit it because it
 *      binds to loopback by default.
 *   2. Origin/host policy — defence in depth for browser-borne abuse, plus
 *      same-origin-only by default on the hosted profile.
 *   3. Per-client token-bucket rate limiting — bounds cost even when 1 and 2
 *      are satisfied by an authorised but runaway client.
 *   4. Hard request-size, parameter and model-id validation.
 *   5. Error sanitisation — upstream bodies, stack traces and anything shaped
 *      like a credential never reach a client.
 *
 * Known limitations (documented, not hidden):
 *   - The rate limiter is in-process. On a serverless platform it is
 *     per-instance and resets on cold start. It is a cost bound, not a
 *     quota system.
 *   - `Origin` equality uses the `Host` header, which a reverse proxy must be
 *     trusted to set correctly.
 */

import crypto from "node:crypto";
import { DEFAULT_MODEL } from "../config/model-defaults.mjs";

export const RELAY_LIMITS = {
  maxBodyBytes: 256 * 1024,
  maxPromptChars: 120_000,
  maxSystemChars: 20_000,
  minTemperature: 0,
  maxTemperature: 2,
  minMaxTokens: 1,
  maxMaxTokens: 32_000,
  maxModelIdChars: 96,
  defaultTimeoutMs: 55_000,
  /** Token bucket: sustained rate and burst capacity, per client key. */
  ratePerMinute: 20,
  rateBurst: 6,
};

/** `<provider>/<model>` — the only shape OpenRouter accepts. */
export const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:+-]*$/i;

/**
 * Provider prefixes this relay will forward to. The client chooses the model
 * (the picker needs that), so the relay bounds *where* that choice can land
 * rather than pretending the choice does not exist.
 */
export const DEFAULT_MODEL_PREFIXES = [
  "openai",
  "anthropic",
  "google",
  "deepseek",
  "meta-llama",
  "mistralai",
  "mistral",
  "qwen",
  "x-ai",
  "cohere",
  "amazon",
  "microsoft",
];

export const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

/**
 * Only these error codes carry a message authored by us. Every other code is
 * replaced with a canned sentence, so an upstream provider body can never be
 * reflected back to a client.
 */
const SAFE_CODES = new Set([
  "BAD_REQUEST",
  "INVALID_BODY",
  "INVALID_JSON",
  "EMPTY_BODY",
  "INVALID_PROMPT",
  "INVALID_SYSTEM_INSTRUCTION",
  "INVALID_TEMPERATURE",
  "INVALID_MAX_TOKENS",
  "INVALID_MODEL",
  "UNKNOWN_FIELD",
  "UNSUPPORTED_FILE_TYPE",
  "PAYLOAD_TOO_LARGE",
  "MODEL_NOT_ALLOWED",
  "RATE_LIMITED",
  "UNAUTHORIZED",
  "RELAY_AUTH_NOT_CONFIGURED",
  "FORBIDDEN_ORIGIN",
  "METHOD_NOT_ALLOWED",
  "NOT_FOUND",
  "NO_KEY",
  "CANCELLED",
  "TIMEOUT",
]);

const CANNED_MESSAGES = {
  SERVER: "The model relay could not complete this request.",
  UPSTREAM: "The model provider returned an error.",
  INVALID_KEY: "The model relay is not correctly configured for the upstream provider.",
  NETWORK: "The model relay could not reach the upstream provider.",
  EMPTY: "The model returned an empty response.",
  UNKNOWN: "Request failed.",
};

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{8,}/g,
  /Bearer\s+[A-Za-z0-9._-]{8,}/gi,
  /\b[A-Za-z0-9_-]{40,}\b/g,
];

/** Strip anything shaped like a credential or an opaque token. */
export function redact(value) {
  let out = String(value ?? "");
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, "[redacted]");
  return out;
}

/* ------------------------------------------------------------------ config */

function parseList(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isTruthy(value) {
  return value === "1" || value === "true" || value === "yes";
}

/**
 * Resolve relay policy from the environment.
 *
 * @param {Record<string, string | undefined>} env
 * @param {"hosted" | "local"} profile
 */
export function resolveConfig(env = {}, profile = "hosted") {
  const configured = parseList(env.BLACKLETTER_ALLOWED_MODELS);
  const configuredPrefixes = parseList(env.BLACKLETTER_ALLOWED_MODEL_PREFIXES).map((p) => p.toLowerCase());
  return {
    profile,
    token: env.BLACKLETTER_RELAY_TOKEN || "",
    allowedOrigins: new Set(
      [...DEFAULT_ALLOWED_ORIGINS, ...parseList(env.BLACKLETTER_ALLOWED_ORIGINS)].map((o) => o.toLowerCase()),
    ),
    allowNoOrigin: isTruthy(env.BLACKLETTER_RELAY_ALLOW_NO_ORIGIN) || profile === "local",
    allowNullOrigin: profile === "local",
    allowAnyModel: isTruthy(env.BLACKLETTER_ALLOW_ANY_MODEL),
    allowedModels: new Set(configured),
    allowedPrefixes: new Set(
      configuredPrefixes.length > 0 ? configuredPrefixes : DEFAULT_MODEL_PREFIXES,
    ),
    defaultModel: env.BLACKLETTER_DEFAULT_MODEL || env.DEFAULT_MODEL || DEFAULT_MODEL,
    ratePerMinute: Number(env.BLACKLETTER_RATE_PER_MINUTE) > 0
      ? Number(env.BLACKLETTER_RATE_PER_MINUTE)
      : RELAY_LIMITS.ratePerMinute,
    rateBurst: Number(env.BLACKLETTER_RATE_BURST) > 0
      ? Number(env.BLACKLETTER_RATE_BURST)
      : RELAY_LIMITS.rateBurst,
    timeoutMs: RELAY_LIMITS.defaultTimeoutMs,
  };
}

/* ------------------------------------------------------------------ errors */

export function isSafeCode(code) {
  return SAFE_CODES.has(code);
}

/**
 * Convert any thrown value into a client-safe `{ code, message }`. Stacks,
 * upstream response bodies and credential-shaped strings never survive.
 */
export function toClientError(error) {
  const record = error && typeof error === "object" ? error : {};
  const rawCode = typeof record.code === "string" ? record.code : "";
  const code = rawCode && isSafeCode(rawCode) ? rawCode : "SERVER";
  const rawMessage = typeof record.message === "string" ? record.message : "";
  const message = isSafeCode(rawCode) && rawMessage
    ? redact(rawMessage).slice(0, 300)
    : CANNED_MESSAGES[rawCode] ?? CANNED_MESSAGES.SERVER;
  return { code, message };
}

export function policyError(status, code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

/* -------------------------------------------------------------- http utils */

export function jsonError(res, status, code, message, extraHeaders) {
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) res.setHeader(key, value);
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: { code, message } }));
}

export function applyCors(res, origin, config) {
  if (origin && config.allowedOrigins.has(origin.toLowerCase())) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "600");
}

/**
 * Read a JSON body, refusing anything larger than `maxBytes`.
 *
 * On overflow the request is *drained and discarded* rather than destroyed:
 * destroying the socket would abort the connection before the 413 could be
 * written, which surfaces to callers as an opaque network error instead of a
 * diagnosable refusal. Memory stays bounded because the overflow is detected
 * before the payload is buffered.
 */
export function readBody(req, maxBytes = RELAY_LIMITS.maxBodyBytes) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      req.removeListener("data", onData);
      resolve(result);
    };

    const onData = (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        finish({
          ok: false,
          status: 413,
          code: "PAYLOAD_TOO_LARGE",
          message: `Request body exceeds ${Math.floor(maxBytes / 1024)} KB.`,
          close: true,
        });
        // Keep the socket readable so the response can be flushed; the excess
        // is simply not accumulated.
        if (typeof req.resume === "function") req.resume();
        return;
      }
      chunks.push(chunk);
    };

    req.on("data", onData);
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (!raw.trim()) {
        return finish({ ok: false, status: 400, code: "EMPTY_BODY", message: "Request body is empty." });
      }
      try {
        finish({ ok: true, value: JSON.parse(raw) });
      } catch {
        finish({ ok: false, status: 400, code: "INVALID_JSON", message: "Request body is not valid JSON." });
      }
    });
    req.on("error", () =>
      finish({ ok: false, status: 400, code: "INVALID_BODY", message: "Could not read the request body." }),
    );
  });
}

/* ------------------------------------------------------------------- auth */

function timingSafeEqualStrings(a, b) {
  const left = Buffer.from(String(a), "utf-8");
  const right = Buffer.from(String(b), "utf-8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * The bearer-token check. This is the control that holds against non-browser
 * clients; the origin check below does not.
 */
export function checkAuthorization(req, config) {
  if (!config.token) {
    // A hosted relay holds a billable provider credential. Origin checks are
    // forgeable by non-browser clients, so missing operator auth must fail
    // closed. The loopback-only desktop/dev relay can remain usable without
    // a second credential on the same machine.
    if (config.profile === "hosted") {
      return { ok: false, enforced: true, reason: "not_configured", status: 503 };
    }
    return { ok: true, enforced: false };
  }
  const header = req.headers?.authorization || "";
  const value = String(header).replace(/^Bearer\s+/i, "").trim();
  if (!value || !timingSafeEqualStrings(value, config.token)) {
    return { ok: false, enforced: true, reason: "invalid", status: 401 };
  }
  return { ok: true, enforced: true };
}

function hostOf(origin) {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * Browser-side defence in depth. Note that `Origin` is absent for non-browser
 * clients and can be forged by them — this is why the token exists.
 */
export function checkOrigin(req, config) {
  const raw = req.headers?.origin;
  const origin = typeof raw === "string" ? raw : undefined;

  if (!origin) {
    return config.allowNoOrigin
      ? { ok: true, origin: undefined }
      : { ok: false, reason: "missing_origin" };
  }
  if (origin === "null") {
    return config.allowNullOrigin
      ? { ok: true, origin }
      : { ok: false, reason: "null_origin" };
  }
  if (config.allowedOrigins.has(origin.toLowerCase())) return { ok: true, origin };

  const host = typeof req.headers?.host === "string" ? req.headers.host.toLowerCase() : "";
  if (host && hostOf(origin) === host) return { ok: true, origin };

  return { ok: false, reason: "origin_not_allowed" };
}

export function clientKey(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

/* ------------------------------------------------------------ rate limiting */

export function createRateLimiter({ ratePerMinute, burst, maxKeys = 5000 }) {
  const capacity = Math.max(1, burst);
  const refillPerMs = Math.max(1, ratePerMinute) / 60_000;
  /** @type {Map<string, { tokens: number, at: number }>} */
  const buckets = new Map();

  function prune(now) {
    if (buckets.size <= maxKeys) return;
    for (const [key, bucket] of buckets) {
      if (now - bucket.at > 600_000) buckets.delete(key);
      if (buckets.size <= maxKeys) break;
    }
  }

  return {
    check(key, now = Date.now()) {
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { tokens: capacity, at: now };
        buckets.set(key, bucket);
      }
      const elapsed = Math.max(0, now - bucket.at);
      bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerMs);
      bucket.at = now;
      prune(now);

      if (bucket.tokens < 1) {
        const retryAfterMs = (1 - bucket.tokens) / refillPerMs;
        return { ok: false, retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
      }
      bucket.tokens -= 1;
      return { ok: true };
    },
    size() {
      return buckets.size;
    },
  };
}

/* -------------------------------------------------------- request validation */

const ALLOWED_FIELDS = new Set(["prompt", "systemInstruction", "model", "temperature", "maxTokens"]);

function invalid(code, message) {
  return { ok: false, status: 400, code, message };
}

export function validateModel(model, config) {
  if (model === undefined || model === null || model === "") {
    return { ok: true, value: config.defaultModel };
  }
  if (typeof model !== "string") return invalid("INVALID_MODEL", "Model must be a string.");
  const id = model.trim();
  if (!id) return { ok: true, value: config.defaultModel };
  if (id.length > RELAY_LIMITS.maxModelIdChars) {
    return invalid("INVALID_MODEL", `Model id must be at most ${RELAY_LIMITS.maxModelIdChars} characters.`);
  }
  if (!MODEL_ID_PATTERN.test(id)) {
    return invalid("INVALID_MODEL", "Model id must have the form '<provider>/<model>'.");
  }
  if (config.allowAnyModel || config.allowedModels.has(id)) return { ok: true, value: id };

  const prefix = id.slice(0, id.indexOf("/")).toLowerCase();
  if (!config.allowedPrefixes.has(prefix)) {
    return {
      ok: false,
      status: 403,
      code: "MODEL_NOT_ALLOWED",
      message: `Model provider "${prefix}" is not enabled on this relay.`,
    };
  }
  return { ok: true, value: id };
}

/**
 * Validate and normalise a chat request. Only the five known fields survive;
 * anything else is rejected rather than silently forwarded upstream.
 */
export function validateChatRequest(body, config) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return invalid("INVALID_BODY", "Request body must be a JSON object.");
  }

  for (const key of Object.keys(body)) {
    if (!ALLOWED_FIELDS.has(key)) {
      return invalid("UNKNOWN_FIELD", `Unsupported field "${key}".`);
    }
  }

  const { prompt, systemInstruction, temperature, maxTokens } = body;

  if (typeof prompt !== "string") {
    return invalid("INVALID_PROMPT", "Field \"prompt\" is required and must be a string.");
  }
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    return invalid("INVALID_PROMPT", "Field \"prompt\" must not be empty.");
  }
  if (prompt.length > RELAY_LIMITS.maxPromptChars) {
    return invalid(
      "INVALID_PROMPT",
      `Field "prompt" must be at most ${RELAY_LIMITS.maxPromptChars} characters.`,
    );
  }

  if (systemInstruction !== undefined && typeof systemInstruction !== "string") {
    return invalid("INVALID_SYSTEM_INSTRUCTION", "Field \"systemInstruction\" must be a string.");
  }
  if (typeof systemInstruction === "string" && systemInstruction.length > RELAY_LIMITS.maxSystemChars) {
    return invalid(
      "INVALID_SYSTEM_INSTRUCTION",
      `Field "systemInstruction" must be at most ${RELAY_LIMITS.maxSystemChars} characters.`,
    );
  }

  if (temperature !== undefined && temperature !== null) {
    if (typeof temperature !== "number" || !Number.isFinite(temperature)) {
      return invalid("INVALID_TEMPERATURE", "Field \"temperature\" must be a finite number.");
    }
    if (temperature < RELAY_LIMITS.minTemperature || temperature > RELAY_LIMITS.maxTemperature) {
      return invalid(
        "INVALID_TEMPERATURE",
        `Field "temperature" must be between ${RELAY_LIMITS.minTemperature} and ${RELAY_LIMITS.maxTemperature}.`,
      );
    }
  }

  if (maxTokens !== undefined && maxTokens !== null) {
    if (typeof maxTokens !== "number" || !Number.isInteger(maxTokens)) {
      return invalid("INVALID_MAX_TOKENS", "Field \"maxTokens\" must be an integer.");
    }
    if (maxTokens < RELAY_LIMITS.minMaxTokens || maxTokens > RELAY_LIMITS.maxMaxTokens) {
      return invalid(
        "INVALID_MAX_TOKENS",
        `Field "maxTokens" must be between ${RELAY_LIMITS.minMaxTokens} and ${RELAY_LIMITS.maxMaxTokens}.`,
      );
    }
  }

  const model = validateModel(body.model, config);
  if (!model.ok) return model;

  return {
    ok: true,
    value: {
      prompt,
      systemInstruction: typeof systemInstruction === "string" ? systemInstruction : undefined,
      model: model.value,
      temperature: typeof temperature === "number" ? temperature : undefined,
      maxTokens: typeof maxTokens === "number" ? maxTokens : undefined,
    },
  };
}

/* ---------------------------------------------------------------- aborts/SSE */

/**
 * Bridge "the client went away" and "we ran out of time" into one AbortSignal.
 *
 * `res` "close" fires both when the client disconnects mid-stream and after a
 * normal `end()`, so the handler checks `writableEnded` before treating it as
 * a cancellation.
 */
export function createAbortBridge(res, timeoutMs = RELAY_LIMITS.defaultTimeoutMs) {
  const controller = new AbortController();
  let reason = null;

  const timer = setTimeout(() => {
    if (!reason) {
      reason = "timeout";
      controller.abort();
    }
  }, timeoutMs);

  const onClose = () => {
    if (!reason && !res.writableEnded) {
      reason = "client_disconnect";
      controller.abort();
    }
  };
  res.on("close", onClose);

  return {
    signal: controller.signal,
    get reason() {
      return reason;
    },
    get aborted() {
      return controller.signal.aborted;
    },
    dispose() {
      clearTimeout(timer);
      res.removeListener("close", onClose);
    },
  };
}

export function writeSSE(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function beginSSE(res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();
}
