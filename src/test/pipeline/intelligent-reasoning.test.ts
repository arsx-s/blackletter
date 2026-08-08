import { describe, it, expect } from "vitest";
import { IntelligentReasoning } from "../../pipeline/intelligent-reasoning";

describe("IntelligentReasoning", () => {
  const reasoning = new IntelligentReasoning();

  describe("shouldEnhance", () => {
    it("always includes applications", () => {
      const result = reasoning.shouldEnhance("hello");
      expect(result).toContain("applications");
    });

    it("adds limitations and assumptions for deep/analyze queries", () => {
      const result = reasoning.shouldEnhance("deep analysis of neural networks");
      expect(result).toContain("limitations");
      expect(result).toContain("assumptions");
    });

    it("adds alternative-viewpoints and counterarguments for compare queries", () => {
      const result = reasoning.shouldEnhance("compare functional and OOP programming");
      expect(result).toContain("alternative-viewpoints");
      expect(result).toContain("counterarguments");
    });

    it("adds implications for future/impact queries", () => {
      const result = reasoning.shouldEnhance("future implications of quantum computing");
      expect(result).toContain("implications");
    });

    it("deduplicates types", () => {
      const result = reasoning.shouldEnhance("deeply analyze the future implications of AI");
      const unique = new Set(result);
      expect(result.length).toBe(unique.size);
    });

    it("combines all enhancement types for comprehensive queries", () => {
      const result = reasoning.shouldEnhance("thoroughly analyze and compare the future implications");
      expect(result).toContain("applications");
      expect(result).toContain("limitations");
      expect(result).toContain("assumptions");
      expect(result).toContain("alternative-viewpoints");
      expect(result).toContain("counterarguments");
      expect(result).toContain("implications");
    });
  });
});
