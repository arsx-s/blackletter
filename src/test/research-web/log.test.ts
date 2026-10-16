import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendWebRun,
  MAX_WEB_RUNS,
  MAX_WEB_RUNS_PER_WORKSPACE,
  latestWebRunFor,
  loadWebResearch,
  resetWebResearchForTests,
  subscribeWebResearch,
  webRunsDroppedCount,
  webRunsFor,
  type ResearchRunRecord,
} from "../../research/web";

const KEY = "web-research";

function run(id: string, workspaceId: string, at: number): ResearchRunRecord {
  return {
    id,
    workspaceId,
    startedAt: at,
    finishedAt: at,
    question: { question: "q", domain: "", jurisdiction: "", period: "", missingEvidence: "" },
    plan: { queries: [], rationale: "r", maxResultsPerQuery: 5 },
    providerId: "none",
    providerLabel: "No search provider",
    approvedHosts: [],
    sources: [],
    failures: [],
    claims: [],
    conflicts: [],
    synthesis: "",
    summary: "s",
    insufficientEvidence: true,
  };
}

beforeEach(() => {
  resetWebResearchForTests();
  localStorage.removeItem(KEY);
});

afterEach(() => {
  resetWebResearchForTests();
  localStorage.removeItem(KEY);
});

describe("research log", () => {
  it("keeps runs newest first, frozen", () => {
    const first = appendWebRun(run("a", "w1", 1));
    appendWebRun(run("b", "w1", 2));

    expect(Object.isFrozen(first)).toBe(true);
    expect(webRunsFor().map((entry) => entry.id)).toEqual(["b", "a"]);
    expect(webRunsFor("w1")).toHaveLength(2);
    expect(latestWebRunFor("w1")?.id).toBe("b");
    expect(webRunsFor("w2")).toEqual([]);
  });

  it("freezes the sources inside a run", () => {
    const stored = appendWebRun({
      ...run("a", "w1", 1),
      sources: [
        {
          id: "src-1",
          url: "https://regulator.gov/x",
          canonicalUrl: "https://regulator.gov/x",
          title: "t",
          publisher: null,
          author: null,
          publishedAt: null,
          retrievedAt: 1,
          method: "search-provider",
          contentType: "text/html",
          contentHash: "fnv1a32:1",
          rawHash: "fnv1a32:2",
          text: "text",
          textTruncated: false,
          kind: "likely-primary",
          kindBasis: "b",
          duplicates: [],
          representative: true,
          sanitisedElements: 0,
          linksNotFollowed: 0,
        },
      ],
    });

    expect(Object.isFrozen(stored.sources)).toBe(true);
    expect(Object.isFrozen(stored.sources[0])).toBe(true);
    expect(Object.isFrozen(stored.sources[0].duplicates)).toBe(true);
  });

  it("caps the history per workspace and counts what fell off", () => {
    for (let i = 0; i < MAX_WEB_RUNS_PER_WORKSPACE + 3; i++) appendWebRun(run(`w1-${i}`, "w1", i));

    expect(webRunsFor("w1")).toHaveLength(MAX_WEB_RUNS_PER_WORKSPACE);
    expect(webRunsFor("w1")[0].id).toBe(`w1-${MAX_WEB_RUNS_PER_WORKSPACE + 2}`);
    expect(webRunsDroppedCount()).toBe(3);
  });

  it("caps the log overall", () => {
    for (let workspace = 0; workspace < 4; workspace++) {
      for (let i = 0; i < MAX_WEB_RUNS_PER_WORKSPACE; i++) appendWebRun(run(`w${workspace}-${i}`, `w${workspace}`, workspace * 100 + i));
    }

    expect(webRunsFor()).toHaveLength(MAX_WEB_RUNS);
    expect(webRunsDroppedCount()).toBe(4 * MAX_WEB_RUNS_PER_WORKSPACE - MAX_WEB_RUNS);
  });

  it("survives a reload", async () => {
    appendWebRun(run("a", "w1", 1));
    appendWebRun(run("b", "w1", 2));
    await new Promise((resolve) => setTimeout(resolve, 0));

    resetWebResearchForTests();
    expect(webRunsFor()).toEqual([]);
    await loadWebResearch();

    expect(webRunsFor().map((entry) => entry.id)).toEqual(["b", "a"]);
  });

  it("ignores a corrupt persisted log", async () => {
    localStorage.setItem(KEY, JSON.stringify([{ nope: true }, null, run("good", "w1", 1)]));
    resetWebResearchForTests();
    await loadWebResearch();
    expect(webRunsFor().map((entry) => entry.id)).toEqual(["good"]);
  });

  it("notifies subscribers on append", () => {
    let calls = 0;
    const unsubscribe = subscribeWebResearch(() => {
      calls += 1;
    });
    appendWebRun(run("a", "w1", 1));
    expect(calls).toBe(1);
    unsubscribe();
    appendWebRun(run("b", "w1", 2));
    expect(calls).toBe(1);
  });
});
