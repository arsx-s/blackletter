import { describe, expect, it } from "vitest";
import {
  MEMORY_CONTEXT_MAX_CHARS,
  MEMORY_REVIEW_AFTER_MS,
  addRecord,
  applyRetention,
  deleteRecord,
  emptyMemoryState,
  formatMemoryContext,
  memoryContextText,
  recordsNeedingAttention,
  retrieveMemory,
  setRetention,
  touchRetrieved,
  type MemoryInput,
  type MemoryState,
} from "../../memory";

const NOW = 1_700_000_000_000;

function input(overrides: Partial<MemoryInput> = {}): MemoryInput {
  return {
    category: "semantic",
    content: "The reactor operates at 900 degrees.",
    provenance: { origin: "user", source: { type: "none" }, note: "Stated by the operator." },
    scope: { workspaceId: "ws-1" },
    ...overrides,
  };
}

function build(state: MemoryState, overrides: Partial<MemoryInput>, at = NOW): MemoryState {
  return addRecord(state, input(overrides), at).state;
}

function threeRecords(): MemoryState {
  let state = build(emptyMemoryState(), { content: "The reactor operates at 900 degrees." });
  state = build(state, { content: "Valve maintenance happens every March.", scope: { workspaceId: "ws-2" } }, NOW + 1);
  state = build(
    state,
    {
      category: "source",
      content: "Thermal Report.pdf contains twelve pages of measurements.",
      scope: { workspaceId: null },
      provenance: {
        origin: "external-source",
        source: { type: "document", name: "Thermal Report.pdf", locator: "p.1" },
        note: "Uploaded by the operator.",
      },
    },
    NOW + 2,
  );
  return state;
}

describe("memory retrieval", () => {
  it("returns records that share terms with the query, best first", () => {
    const state = threeRecords();
    const hits = retrieveMemory(state, "reactor degrees", { workspaceId: "ws-1", now: NOW + 3 });
    expect(hits).toHaveLength(1);
    expect(hits[0].record.content).toContain("reactor operates at 900 degrees");
    expect(hits[0].matched).toEqual(["reactor", "degrees"]);
  });

  it("never returns a record scoped to another workspace, but does return global ones", () => {
    const state = threeRecords();
    const forWs1 = retrieveMemory(state, "thermal report pages measurements", { workspaceId: "ws-1", now: NOW + 3 });
    expect(forWs1.map((hit) => hit.record.scope.workspaceId)).toEqual([null]);

    const forWs2 = retrieveMemory(state, "valve maintenance march", { workspaceId: "ws-2", now: NOW + 3 });
    expect(forWs2).toHaveLength(1);
    expect(forWs2[0].record.scope.workspaceId).toBe("ws-2");

    const forOther = retrieveMemory(state, "valve maintenance march", { workspaceId: "ws-3", now: NOW + 3 });
    expect(forOther).toHaveLength(0);
  });

  it("stops returning a record as soon as it is deleted", () => {
    const state = threeRecords();
    const record = state.records.find((entry) => entry.content.includes("reactor"))!;
    expect(retrieveMemory(state, "reactor", { workspaceId: "ws-1", now: NOW }).length).toBe(1);

    const deleted = deleteRecord(state, record.id, "No longer relevant.", NOW + 4);
    expect(retrieveMemory(deleted.state, "reactor", { workspaceId: "ws-1", now: NOW + 5 })).toHaveLength(0);
  });

  it("skips an expired record before the retention sweep runs", () => {
    const state = threeRecords();
    const record = state.records.find((entry) => entry.content.includes("reactor"))!;
    const expired = setRetention(state, record.id, { mode: "expire", expiresAt: NOW - 1 }, "Only needed last week.", NOW).state;
    expect(retrieveMemory(expired, "reactor", { workspaceId: "ws-1", now: NOW })).toHaveLength(0);
    expect(applyRetention(expired, NOW).state.records).toHaveLength(2);
  });

  it("returns the most recent records when no query is given", () => {
    const state = threeRecords();
    const hits = retrieveMemory(state, "", { workspaceId: "ws-1", now: NOW + 3, limit: 2 });
    expect(hits).toHaveLength(2);
    expect(hits[0].record.updatedAt).toBeGreaterThanOrEqual(hits[1].record.updatedAt);
  });

  it("marks records it has actually returned", () => {
    const state = threeRecords();
    const hits = retrieveMemory(state, "reactor", { workspaceId: "ws-1", now: NOW });
    const touched = touchRetrieved(state, hits.map((hit) => hit.record.id), NOW + 9);
    expect(touched.records.find((record) => record.id === hits[0].record.id)!.lastRetrievedAt).toBe(NOW + 9);
  });
});

describe("memory prompt formatting", () => {
  it("says nothing at all when there is nothing to say", () => {
    expect(formatMemoryContext([])).toBe("");
    expect(memoryContextText(emptyMemoryState(), "ws-1", "anything")).toBe("");
  });

  it("labels every record with its category, status and origin", () => {
    const state = threeRecords();
    const text = memoryContextText(state, "ws-1", "reactor degrees");
    expect(text).toContain("[Semantic · Assumed · user-provided]");
    expect(text).toContain("reactor operates at 900 degrees");
    expect(text).toContain("WHAT BLACKLETTER REMEMBERS");
  });

  it("carries source names and locators into the prompt", () => {
    const state = threeRecords();
    const text = memoryContextText(state, "ws-1", "thermal report measurements pages");
    expect(text).toContain("Thermal Report.pdf");
    expect(text).toContain("p.1");
  });

  it("warns when a returned record is disputed or of unknown origin", () => {
    let state = build(emptyMemoryState(), { content: "The reactor operates at 900 degrees." });
    state = addRecord(
      state,
      input({ content: "The reactor does not operate at 900 degrees." }),
      NOW + 1,
    ).state;
    const disputed = memoryContextText(state, "ws-1", "reactor degrees");
    expect(disputed).toContain("Disputed");
    expect(disputed).toContain("do not present either side as settled");

    const legacy = addRecord(
      emptyMemoryState(),
      input({ provenance: { origin: "legacy-import", source: { type: "none" }, note: "Imported." } }),
      NOW,
    ).state;
    expect(memoryContextText(legacy, "ws-1", "reactor degrees")).toContain("legacy import");
  });

  it("stays inside its character budget", () => {
    let state = emptyMemoryState();
    for (let index = 0; index < 30; index++) {
      const filler = String.fromCharCode(97 + (index % 26)).repeat(3 + index);
      state = build(state, { content: `reactor covered in ${"z".repeat(600)} ${filler}` }, NOW + index);
    }
    const text = memoryContextText(state, "ws-1", "reactor");
    expect(text.length).toBeLessThanOrEqual(MEMORY_CONTEXT_MAX_CHARS + 400);
    expect(text.split("\n").length).toBeLessThanOrEqual(12);
  });
});

describe("attention", () => {
  it("lists disputes, review-due and expired records for one workspace only", () => {
    let state = build(emptyMemoryState(), { content: "The reactor operates at 900 degrees.", auto: true }, NOW - MEMORY_REVIEW_AFTER_MS - 2);
    state = build(state, { content: "The reactor does not operate at 900 degrees.", auto: true }, NOW - MEMORY_REVIEW_AFTER_MS - 1);
    state = build(
      state,
      { content: "A valve note for another workspace.", scope: { workspaceId: "ws-2" }, auto: true },
      NOW - MEMORY_REVIEW_AFTER_MS - 1,
    );

    const attention = recordsNeedingAttention(state, "ws-1", NOW);
    expect(attention.disputes).toHaveLength(1);
    expect(attention.reviewDue.map((record) => record.scope.workspaceId)).toEqual(["ws-1", "ws-1"]);
    expect(attention.expired).toHaveLength(0);
  });
});
