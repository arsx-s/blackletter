import { describe, it, expect, beforeEach } from "vitest";
import { getApiProvider, setApiProvider } from "../../lib/storage";

describe("storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("getApiProvider / setApiProvider", () => {
    it("returns null when no provider is set", () => {
      expect(getApiProvider()).toBeNull();
    });

    it("stores and retrieves the provider", () => {
      setApiProvider("openai");
      expect(getApiProvider()).toBe("openai");
    });

    it("accepts all valid provider values", () => {
      const providers = ["gemini", "openai", "anthropic", "openrouter"] as const;
      for (const p of providers) {
        setApiProvider(p);
        expect(getApiProvider()).toBe(p);
      }
    });
  });
});
