import { describe, it, expect, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import {
  RELAY_LIMITS,
  resolveConfig,
  readBody,
  checkOrigin,
  checkAuthorization,
  createRateLimiter,
  clientKey,
  validateChatRequest,
  validateModel,
  toClientError,
  redact,
  createAbortBridge,
  jsonError,
} from "../../server/relay-guard.mjs";

class FakeRequest extends EventEmitter {
  method = "POST";
  headers: Record<string, string> = {};
  socket = { remoteAddress: "127.0.0.1" };
  destroyed = false;
  resumed = false;

  destroy() {
    this.destroyed = true;
  }

  resume() {
    this.resumed = true;
    return this;
  }
}

class FakeResponse extends EventEmitter {
  statusCode = 0;
  headers = new Map<string, string>();
  body = "";
  writableEnded = false;

  setHeader(name: string, value: string) {
    this.headers.set(name.toLowerCase(), value);
  }

  write(chunk: string) {
    this.body += chunk;
    return true;
  }

  end(chunk?: string) {
    if (chunk) this.body += chunk;
    this.writableEnded = true;
  }
}

function makeRequest(headers: Record<string, string> = {}) {
  const req = new FakeRequest();
  req.headers = headers;
  return req;
}

function postJson(req: FakeRequest, payload: unknown) {
  req.emit("data", Buffer.from(JSON.stringify(payload)));
  req.emit("end");
}

const hosted = resolveConfig({}, "hosted");
const local = resolveConfig({}, "local");

/* ------------------------------------------------------------------ config */

describe("resolveConfig", () => {
  it("defaults the hosted profile to rejecting requests with no Origin", () => {
    expect(hosted.allowNoOrigin).toBe(false);
    expect(hosted.allowNullOrigin).toBe(false);
  });

  it("lets the local profile accept Electron's null origin and absent Origin", () => {
    expect(local.allowNoOrigin).toBe(true);
    expect(local.allowNullOrigin).toBe(true);
  });

  it("honours DEFAULT_MODEL, which .env.example documented but nothing consumed", () => {
    expect(resolveConfig({ DEFAULT_MODEL: "anthropic/claude-sonnet-4" }, "hosted").defaultModel)
      .toBe("anthropic/claude-sonnet-4");
  });

  it("prefers BLACKLETTER_DEFAULT_MODEL over DEFAULT_MODEL", () => {
    const config = resolveConfig(
      { DEFAULT_MODEL: "a/b", BLACKLETTER_DEFAULT_MODEL: "c/d" },
      "hosted",
    );
    expect(config.defaultModel).toBe("c/d");
  });

  it("narrows the provider allowlist when one is configured", () => {
    const config = resolveConfig({ BLACKLETTER_ALLOWED_MODEL_PREFIXES: "openai, google" }, "hosted");
    expect([...config.allowedPrefixes].sort()).toEqual(["google", "openai"]);
  });

  it("never widens to a wildcard by default", () => {
    expect(hosted.allowAnyModel).toBe(false);
  });
});

/* ------------------------------------------------------------------ origin */

describe("checkOrigin", () => {
  it("accepts a configured development origin", () => {
    expect(checkOrigin(makeRequest({ origin: "http://localhost:5173" }), local).ok).toBe(true);
  });

  it("accepts a same-host origin", () => {
    const req = makeRequest({ origin: "https://blackletter.example", host: "blackletter.example" });
    expect(checkOrigin(req, hosted).ok).toBe(true);
  });

  it("rejects a cross-host origin", () => {
    const req = makeRequest({ origin: "https://evil.example", host: "blackletter.example" });
    const result = checkOrigin(req, hosted);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("origin_not_allowed");
  });

  it("rejects an absent Origin on the hosted profile", () => {
    const result = checkOrigin(makeRequest({}), hosted);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("missing_origin");
  });

  it("rejects a null Origin on the hosted profile but allows it locally", () => {
    expect(checkOrigin(makeRequest({ origin: "null" }), hosted).ok).toBe(false);
    expect(checkOrigin(makeRequest({ origin: "null" }), local).ok).toBe(true);
  });

  it("can be opted out of explicitly", () => {
    const config = resolveConfig({ BLACKLETTER_RELAY_ALLOW_NO_ORIGIN: "1" }, "hosted");
    expect(checkOrigin(makeRequest({}), config).ok).toBe(true);
  });
});

/* -------------------------------------------------------------------- auth */

describe("checkAuthorization", () => {
  const secured = resolveConfig({ BLACKLETTER_RELAY_TOKEN: "s3cret-token-value" }, "hosted");

  it("fails closed for a hosted relay when no token is configured", () => {
    const result = checkAuthorization(makeRequest({}), hosted);
    expect(result.ok).toBe(false);
    expect(result.enforced).toBe(true);
    if (!result.ok) {
      expect(result.reason).toBe("not_configured");
      expect(result.status).toBe(503);
    }
  });

  it("allows the loopback local relay without a second credential", () => {
    const result = checkAuthorization(makeRequest({}), local);
    expect(result.ok).toBe(true);
    expect(result.enforced).toBe(false);
  });

  it("rejects a request with no credentials once a token exists", () => {
    expect(checkAuthorization(makeRequest({}), secured).ok).toBe(false);
  });

  it("rejects a wrong token", () => {
    const req = makeRequest({ authorization: "Bearer not-the-token" });
    expect(checkAuthorization(req, secured).ok).toBe(false);
  });

  it("accepts the configured token", () => {
    const req = makeRequest({ authorization: "Bearer s3cret-token-value" });
    const result = checkAuthorization(req, secured);
    expect(result.ok).toBe(true);
    expect(result.enforced).toBe(true);
  });

  it("rejects a token that is a prefix of the real one (no length leak)", () => {
    const req = makeRequest({ authorization: "Bearer s3cret" });
    expect(checkAuthorization(req, secured).ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ limits */

describe("createRateLimiter", () => {
  it("permits the burst then refuses with a retry hint", () => {
    const limiter = createRateLimiter({ ratePerMinute: 60, burst: 3 });
    const now = 1_000_000;
    expect(limiter.check("a", now).ok).toBe(true);
    expect(limiter.check("a", now).ok).toBe(true);
    expect(limiter.check("a", now).ok).toBe(true);
    const refused = limiter.check("a", now);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.retryAfter).toBeGreaterThan(0);
  });

  it("refills over time", () => {
    const limiter = createRateLimiter({ ratePerMinute: 60, burst: 1 });
    const now = 1_000_000;
    expect(limiter.check("a", now).ok).toBe(true);
    expect(limiter.check("a", now).ok).toBe(false);
    expect(limiter.check("a", now + 1_100).ok).toBe(true);
  });

  it("keeps separate buckets per client", () => {
    const limiter = createRateLimiter({ ratePerMinute: 60, burst: 1 });
    const now = 1_000_000;
    expect(limiter.check("a", now).ok).toBe(true);
    expect(limiter.check("b", now).ok).toBe(true);
  });
});

describe("clientKey", () => {
  it("prefers the first forwarded address", () => {
    const req = makeRequest({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    expect(clientKey(req)).toBe("203.0.113.7");
  });

  it("falls back to the socket address", () => {
    expect(clientKey(makeRequest({}))).toBe("127.0.0.1");
  });
});

/* ------------------------------------------------------------ body reading */

describe("readBody", () => {
  it("parses a valid JSON body", async () => {
    const req = makeRequest();
    const pending = readBody(req);
    postJson(req, { prompt: "hello" });
    await expect(pending).resolves.toEqual({ ok: true, value: { prompt: "hello" } });
  });

  it("rejects malformed JSON", async () => {
    const req = makeRequest();
    const pending = readBody(req);
    req.emit("data", Buffer.from("{not json"));
    req.emit("end");
    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_JSON");
  });

  it("rejects an empty body", async () => {
    const req = makeRequest();
    const pending = readBody(req);
    req.emit("end");
    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("EMPTY_BODY");
  });

  it("refuses a body over the cap, drains it, and keeps the socket alive to answer", async () => {
    const req = makeRequest();
    const pending = readBody(req, 64);
    req.emit("data", Buffer.alloc(65, 0x61));
    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("PAYLOAD_TOO_LARGE");
      expect(result.status).toBe(413);
      // The refusal must be deliverable, so the socket is not destroyed.
      expect(result.close).toBe(true);
    }
    expect(req.destroyed).toBe(false);
    expect(req.resumed).toBe(true);
  });

  it("stops accumulating once the cap is crossed", async () => {
    const req = makeRequest();
    const pending = readBody(req, 64);
    req.emit("data", Buffer.alloc(65, 0x61));
    const first = await pending;
    // Further data is discarded, not buffered or re-evaluated.
    req.emit("data", Buffer.alloc(1024 * 1024, 0x62));
    req.emit("end");
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.code).toBe("PAYLOAD_TOO_LARGE");
  });
});

/* -------------------------------------------------------------- validation */

describe("validateModel", () => {
  it("substitutes the configured default when the model is absent", () => {
    const result = validateModel(undefined, hosted);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(hosted.defaultModel);
  });

  it("accepts a well-formed id from an allowed provider", () => {
    const result = validateModel("openai/gpt-4o-mini", hosted);
    expect(result.ok).toBe(true);
  });

  it("rejects an id with no provider segment", () => {
    const result = validateModel("gpt-4o-mini", hosted);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_MODEL");
  });

  it("rejects an unknown provider rather than forwarding arbitrary spend", () => {
    const result = validateModel("totally-unknown-vendor/model-x", hosted);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.code).toBe("MODEL_NOT_ALLOWED");
    }
  });

  it("allows an explicitly configured exact id", () => {
    const config = resolveConfig({ BLACKLETTER_ALLOWED_MODELS: "other-vendor/model-x" }, "hosted");
    expect(validateModel("other-vendor/model-x", config).ok).toBe(true);
  });

  it("rejects an over-long id", () => {
    const result = validateModel(`openai/${"x".repeat(RELAY_LIMITS.maxModelIdChars)}`, hosted);
    expect(result.ok).toBe(false);
  });
});

describe("validateChatRequest", () => {
  const ok = (payload: unknown) => validateChatRequest(payload, hosted);

  it("accepts and normalises a good request", () => {
    const result = ok({ prompt: " Hi ", systemInstruction: "Be brief", temperature: 0.4, maxTokens: 512 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.prompt).toBe(" Hi ");
      expect(result.value.model).toBe(hosted.defaultModel);
      expect(result.value.temperature).toBe(0.4);
    }
  });

  it("rejects a non-object body", () => {
    expect(ok("nope").ok).toBe(false);
    expect(ok(null).ok).toBe(false);
    expect(ok([1, 2]).ok).toBe(false);
  });

  it("rejects a missing or non-string prompt", () => {
    expect(ok({}).ok).toBe(false);
    expect(ok({ prompt: 42 }).ok).toBe(false);
  });

  it("rejects a whitespace-only prompt", () => {
    const result = ok({ prompt: "   " });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_PROMPT");
  });

  it("rejects an over-long prompt", () => {
    const result = ok({ prompt: "a".repeat(RELAY_LIMITS.maxPromptChars + 1) });
    expect(result.ok).toBe(false);
  });

  it("rejects unknown fields instead of forwarding them upstream", () => {
    const result = ok({ prompt: "hi", sneaky: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UNKNOWN_FIELD");
  });

  it("rejects out-of-range temperature", () => {
    expect(ok({ prompt: "hi", temperature: 9 }).ok).toBe(false);
    expect(ok({ prompt: "hi", temperature: -1 }).ok).toBe(false);
    expect(ok({ prompt: "hi", temperature: Number.NaN }).ok).toBe(false);
  });

  it("rejects non-integer and out-of-range maxTokens", () => {
    expect(ok({ prompt: "hi", maxTokens: 1.5 }).ok).toBe(false);
    expect(ok({ prompt: "hi", maxTokens: 0 }).ok).toBe(false);
    expect(ok({ prompt: "hi", maxTokens: 10_000_000 }).ok).toBe(false);
  });

  it("rejects an over-long system instruction", () => {
    const result = ok({ prompt: "hi", systemInstruction: "x".repeat(RELAY_LIMITS.maxSystemChars + 1) });
    expect(result.ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ errors */

describe("toClientError", () => {
  it("never returns a stack", () => {
    const error = new Error("boom");
    const result = toClientError(error);
    expect(JSON.stringify(result)).not.toMatch(/at .*:\d+:\d+/);
    expect(Object.keys(result).sort()).toEqual(["code", "message"]);
  });

  it("replaces an unrecognised code's message with a canned sentence", () => {
    const result = toClientError({ code: "UPSTREAM_BODY", message: "provider said: quota exceeded for key sk-live-abcdefghijklmnop" });
    expect(result.message).not.toContain("quota exceeded");
    expect(result.message).not.toContain("sk-live");
  });

  it("keeps a message we authored for a known code", () => {
    const result = toClientError({ code: "RATE_LIMITED", message: "Too many requests. Retry in 3s." });
    expect(result.code).toBe("RATE_LIMITED");
    expect(result.message).toContain("Retry in 3s");
  });

  it("falls back to SERVER for garbage", () => {
    expect(toClientError(undefined).code).toBe("SERVER");
    expect(toClientError("string").code).toBe("SERVER");
  });
});

describe("redact", () => {
  it("masks OpenRouter-style keys", () => {
    expect(redact("key sk-or-v1-abcdefghijklmnopqrstuvwxyz")).not.toContain("sk-or-v1");
  });

  it("masks bearer credentials", () => {
    expect(redact("Authorization: Bearer abcdefghijklmnop")).not.toContain("abcdefghijklmnop");
  });

  it("masks long opaque tokens", () => {
    const token = "A".repeat(64);
    expect(redact(`token=${token}`)).toBe("token=[redacted]");
  });

  it("leaves ordinary prose alone", () => {
    expect(redact("Model returned an empty response.")).toBe("Model returned an empty response.");
  });
});

/* ---------------------------------------------------------------- abort bridge */

describe("createAbortBridge", () => {
  let res: FakeResponse;

  beforeEach(() => {
    res = new FakeResponse();
  });

  it("starts unaborted", () => {
    const bridge = createAbortBridge(res, 5_000);
    expect(bridge.aborted).toBe(false);
    expect(bridge.reason).toBeNull();
    bridge.dispose();
  });

  it("treats a close before end() as a client disconnect", () => {
    const bridge = createAbortBridge(res, 5_000);
    res.emit("close");
    expect(bridge.aborted).toBe(true);
    expect(bridge.reason).toBe("client_disconnect");
    bridge.dispose();
  });

  it("ignores the close that follows a normal end()", () => {
    const bridge = createAbortBridge(res, 5_000);
    res.end();
    res.emit("close");
    expect(bridge.aborted).toBe(false);
    bridge.dispose();
  });

  it("aborts with reason timeout when the budget runs out", () => {
    const bridge = createAbortBridge(res, 0);
    // A zero-length budget schedules an immediate timer; let it fire.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(bridge.reason).toBe("timeout");
        bridge.dispose();
        resolve();
      }, 5);
    });
  });
});

describe("jsonError", () => {
  it("writes a stable error envelope", () => {
    const res = new FakeResponse();
    jsonError(res, 403, "FORBIDDEN_ORIGIN", "This origin is not permitted.");
    expect(res.statusCode).toBe(403);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(res.body)).toEqual({
      error: { code: "FORBIDDEN_ORIGIN", message: "This origin is not permitted." },
    });
  });
});
