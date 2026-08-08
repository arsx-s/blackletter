import { describe, it, expect } from "vitest";
import { detectMode, getModeConfig, getModeLabel, getModeDescription, getAllModeConfigs } from "../../pipeline/modes";

describe("detectMode", () => {
  it.each([
    ["teach me about quantum physics", "teach"],
    ["explain how neural networks work", "teach"],
    ["what is a black hole", "teach"],
    ["research the effects of climate change", "research"],
    ["investigate the causes of World War I", "research"],
    ["analyze the current literature on mRNA vaccines", "research"],
    ["build a React component library", "build"],
    ["create a REST API with Express", "build"],
    ["write a sorting algorithm in Python", "build"],
    ["debate the ethics of AI", "debate"],
    ["argue for and against universal basic income", "debate"],
    ["opposing viewpoints on nuclear energy", "debate"],
    ["compare React and Vue", "compare"],
    ["contrast functional and OOP paradigms", "compare"],
    ["difference between TCP and UDP", "compare"],
    ["plan a software project roadmap", "plan"],
    ["step by step guide to start a business", "plan"],
    ["break down the components of a compiler", "analyze"],
    ["evaluate the effectiveness of Remote work", "analyze"],
    ["analyze the root causes of economic inequality", "research"],
    ["brainstorm ideas for a mobile app", "create"],
    ["generate novel approaches to clean energy", "create"],
    ["design a new user experience concept", "create"],
    ["feedback on this essay structure", "review"],
    ["suggest optimizations for this database query", "review"],
    ["optimize my argument's logical structure", "review"],
    ["master quantum field theory", "master"],
    ["deep understanding of general relativity", "master"],
    ["thorough analysis of cognitive biases", "master"],
  ])("detects '%s' as mode '%s'", (query, expected) => {
    expect(detectMode(query)).toBe(expected);
  });

  it("defaults to teach when no keywords match", () => {
    expect(detectMode("hello world")).toBe("teach");
  });

  it("prefers compare over teach when vs/versus is present", () => {
    expect(detectMode("teach me the difference between cats vs dogs")).toBe("compare");
  });
});

describe("getModeConfig", () => {
  it("returns config for every mode", () => {
    const modes = ["teach", "research", "build", "debate", "compare", "plan", "analyze", "create", "review", "master"] as const;
    for (const mode of modes) {
      const config = getModeConfig(mode);
      expect(config.mode).toBe(mode);
      expect(config.label).toBeTruthy();
      expect(config.description).toBeTruthy();
      expect(config.agents.length).toBeGreaterThan(0);
    }
  });

  it("complex modes have more agents than simple ones", () => {
    const simple = getModeConfig("teach");
    const complex = getModeConfig("research");
    expect(complex.agents.length).toBeGreaterThan(simple.agents.length);
  });
});

describe("getModeLabel / getModeDescription", () => {
  it("returns label and description for all modes", () => {
    const modes = ["teach", "research", "build", "debate", "compare", "plan", "analyze", "create", "review", "master"] as const;
    for (const mode of modes) {
      expect(getModeLabel(mode)).toBeTruthy();
      expect(getModeDescription(mode)).toBeTruthy();
    }
  });
});

describe("getAllModeConfigs", () => {
  it("returns all 10 mode configs", () => {
    const configs = getAllModeConfigs();
    expect(configs).toHaveLength(10);
  });
});
