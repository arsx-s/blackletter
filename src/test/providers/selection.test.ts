import { describe, it, expect, afterEach } from "vitest";
import {
  DEFAULT_SELECTION,
  getProviderSelection,
  normaliseSelection,
  resetProviderSelection,
  resolveProvider,
  setProviderSelection,
  validateOllamaBaseUrl,
} from "../../providers/selection";
import { OLLAMA_BASE_URL } from "../../config/model-defaults.mjs";

afterEach(() => {
  resetProviderSelection();
});

describe("provider selection defaults", () => {
  it("starts remote, with no local model assumed and no fallback allowed", () => {
    expect(DEFAULT_SELECTION.provider).toBe("openrouter");
    expect(DEFAULT_SELECTION.ollamaModel).toBe("");
    expect(DEFAULT_SELECTION.remoteFallback).toBe("never");
    expect(DEFAULT_SELECTION.allowNonLoopbackLocalProvider).toBe(false);
    expect(DEFAULT_SELECTION.ollamaBaseUrl).toBe(OLLAMA_BASE_URL);
  });

  it("applies a patch and reads it back, and reset restores the default", () => {
    setProviderSelection({ provider: "ollama", ollamaModel: "some-model:latest" });
    expect(getProviderSelection().provider).toBe("ollama");
    expect(getProviderSelection().ollamaModel).toBe("some-model:latest");

    resetProviderSelection();
    expect(getProviderSelection()).toEqual(DEFAULT_SELECTION);
    expect(getProviderSelection()).not.toBe(DEFAULT_SELECTION);
  });

  it("keeps the default base URL loopback", () => {
    const check = validateOllamaBaseUrl(DEFAULT_SELECTION.ollamaBaseUrl);
    expect(check.ok).toBe(true);
    expect(check.url).toBe(OLLAMA_BASE_URL);
  });
});

describe("validateOllamaBaseUrl", () => {
  it("accepts loopback hosts", () => {
    for (const raw of ["http://localhost:11434", "http://127.0.0.1:11434", "http://127.9.9.9:11434", "http://[::1]:11434"]) {
      expect(validateOllamaBaseUrl(raw).ok, raw).toBe(true);
    }
  });

  it("strips a trailing slash so paths concatenate cleanly", () => {
    expect(validateOllamaBaseUrl("http://127.0.0.1:11434/").url).toBe("http://127.0.0.1:11434");
  });

  it("refuses a non-loopback host unless the opt-in is given", () => {
    const refused = validateOllamaBaseUrl("http://192.168.1.10:11434");
    expect(refused.ok).toBe(false);
    expect(refused.needsOptIn).toBe(true);
    expect(refused.nonLoopback).toBe(true);
    expect(refused.reason).toContain("not loopback");

    const allowed = validateOllamaBaseUrl("http://192.168.1.10:11434", { allowNonLoopback: true });
    expect(allowed.ok).toBe(true);
    expect(allowed.url).toBe("http://192.168.1.10:11434");
    // Still reported as non-loopback so the panel can keep showing the switch.
    expect(allowed.nonLoopback).toBe(true);
  });

  it("does not mark a loopback address as non-loopback", () => {
    expect(validateOllamaBaseUrl("http://127.0.0.1:11434").nonLoopback).toBeUndefined();
  });

  it("refuses credentials embedded in the URL", () => {
    const check = validateOllamaBaseUrl("http://user:secret@127.0.0.1:11434");
    expect(check.ok).toBe(false);
    expect(check.reason).toContain("credentials");
  });

  it("refuses non-http schemes and unparseable input", () => {
    expect(validateOllamaBaseUrl("ftp://127.0.0.1:11434").ok).toBe(false);
    expect(validateOllamaBaseUrl("not a url").ok).toBe(false);
    expect(validateOllamaBaseUrl("").ok).toBe(false);
  });
});

describe("normaliseSelection", () => {
  it("falls back to defaults for anything it cannot read", () => {
    expect(normaliseSelection(null)).toEqual(DEFAULT_SELECTION);
    expect(normaliseSelection("nonsense")).toEqual(DEFAULT_SELECTION);
    expect(normaliseSelection({ provider: "somethingelse", remoteFallback: "sometimes" })).toEqual(DEFAULT_SELECTION);
  });

  it("reads a stored selection and repairs the missing keys", () => {
    const stored = normaliseSelection({ provider: "ollama", ollamaModel: "  qwen2:7b  " });
    expect(stored.provider).toBe("ollama");
    expect(stored.ollamaModel).toBe("qwen2:7b");
    expect(stored.ollamaBaseUrl).toBe(OLLAMA_BASE_URL);
    expect(stored.remoteFallback).toBe("never");
    expect(stored.allowNonLoopbackLocalProvider).toBe(false);
  });

  it("keeps an explicit remote fallback and the non-loopback opt-in", () => {
    const stored = normaliseSelection({ remoteFallback: "allow", allowNonLoopbackLocalProvider: true });
    expect(stored.remoteFallback).toBe("allow");
    expect(stored.allowNonLoopbackLocalProvider).toBe(true);
  });
});

describe("resolveProvider", () => {
  it("uses the configured provider when it is the remote one", () => {
    expect(resolveProvider()).toEqual({ provider: "openrouter" });
    expect(resolveProvider("openrouter")).toEqual({ provider: "openrouter" });
  });

  it("reports a local selection with no model rather than guessing one", () => {
    setProviderSelection({ provider: "ollama" });
    const resolved = resolveProvider();
    expect(resolved.provider).toBe("ollama");
    expect(resolved.problem).toContain("no local model");
  });

  it("reports an unusable local base URL instead of silently using the remote one", () => {
    setProviderSelection({ provider: "ollama", ollamaModel: "x", ollamaBaseUrl: "http://10.0.0.5:11434" });
    const resolved = resolveProvider();
    expect(resolved.provider).toBe("ollama");
    expect(resolved.problem).toContain("not loopback");
  });

  it("resolves a usable local selection", () => {
    setProviderSelection({ provider: "ollama", ollamaModel: "x" });
    expect(resolveProvider()).toEqual({ provider: "ollama" });
  });
});
