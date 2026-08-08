import { describe, it, expect } from "vitest";
import { ThinkingTools } from "../../pipeline/thinking-tools";

describe("ThinkingTools", () => {
  const tools = new ThinkingTools();

  describe("getAllToolTypes", () => {
    it("returns all 15 tool types", () => {
      const types = tools.getAllToolTypes();
      expect(types).toHaveLength(15);
      expect(types).toContain("flashcards");
      expect(types).toContain("quiz");
      expect(types).toContain("lecture");
      expect(types).toContain("report");
      expect(types).toContain("mind-map");
      expect(types).toContain("timeline");
      expect(types).toContain("flowchart");
      expect(types).toContain("presentation");
      expect(types).toContain("study-notes");
      expect(types).toContain("business-plan");
      expect(types).toContain("legal-memo");
      expect(types).toContain("case-analysis");
      expect(types).toContain("research-proposal");
      expect(types).toContain("technical-documentation");
      expect(types).toContain("project-roadmap");
    });
  });

  describe("getToolTitle", () => {
    it("returns a non-empty title for every tool type", () => {
      for (const type of tools.getAllToolTypes()) {
        expect(tools.getToolTitle(type)).toBeTruthy();
      }
    });
  });

  describe("parseSections", () => {
    it("parses header-delimited content into sections", () => {
      const content = "SUMMARY: some content\n- item one\n- item two\nDETAILS: more content\n- item three";
      const sections = (tools as any).parseSections(content, "report");
      expect(sections).toHaveLength(2);
      expect(sections[0].heading).toBe("SUMMARY");
      expect(sections[0].items).toEqual(["item one", "item two"]);
      expect(sections[1].heading).toBe("DETAILS");
      expect(sections[1].items).toEqual(["item three"]);
    });

    it("handles content with no headers", () => {
      const content = "plain text without headers\nmore text";
      const sections = (tools as any).parseSections(content, "report");
      expect(sections).toHaveLength(0);
    });

    it("handles empty content", () => {
      const sections = (tools as any).parseSections("", "report");
      expect(sections).toHaveLength(0);
    });
  });
});
