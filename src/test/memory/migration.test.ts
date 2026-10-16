import { describe, expect, it } from "vitest";
import { MEMORY_SCHEMA_VERSION, migrateMemoryState } from "../../memory";

const NOW = 1_700_000_000_000;

const LEGACY = {
  "ws-1": {
    goals: ["Understand the thermal report"],
    concepts: ["Thermal conductivity"],
    gaps: ["No data for the 2024 run"],
    entries: [{ q: "What is the operating temperature?", a: "Around 900 degrees.", at: 111, concepts: ["temperature"] }],
    updatedAt: 111,
  },
  "ws-2": { goals: [], concepts: [], gaps: [], entries: [], updatedAt: 50 },
};

describe("memory migration", () => {
  it("imports workspace memory written before records existed, marked origin-unknown", () => {
    const { state, report } = migrateMemoryState(undefined, LEGACY, NOW);

    expect(report.from).toBe("legacy");
    expect(state.legacyMigratedAt).toBe(NOW);
    expect(state.records).toHaveLength(4);
    expect(state.records.every((record) => record.provenance.origin === "legacy-import")).toBe(true);
    expect(state.records.every((record) => record.status === "unknown")).toBe(true);
    expect(state.records.every((record) => record.scope.workspaceId === "ws-1")).toBe(true);
    expect(state.records.every((record) => record.provenance.note.includes("unknown"))).toBe(true);
    expect(state.records.some((record) => record.content.includes("Around 900 degrees."))).toBe(true);
    expect(state.records.some((record) => record.content.includes("Understand the thermal report"))).toBe(true);
    expect(state.records.find((record) => record.category === "episodic")!.createdAt).toBe(111);
  });

  it("keeps existing workspaces intact and reports what it could not read", () => {
    const { state, report } = migrateMemoryState(
      undefined,
      { "ws-7": { goals: ["A goal", 42], entries: [null, { q: "Only a question?" }], updatedAt: 10 } },
      NOW,
    );
    expect(state.records).toHaveLength(2);
    expect(state.records.every((record) => record.scope.workspaceId === "ws-7")).toBe(true);
    expect(report.notes.join(" ")).toContain("not readable");
    expect(state.records.some((record) => record.content.includes("Only a question?"))).toBe(true);
  });

  it("is idempotent: migrating its own output adds nothing", () => {
    const first = migrateMemoryState(undefined, LEGACY, NOW);
    const second = migrateMemoryState(
      { version: MEMORY_SCHEMA_VERSION, records: first.state.records, audit: first.state.audit, legacyMigratedAt: first.state.legacyMigratedAt },
      LEGACY,
      NOW + 1,
    );
    expect(second.report.from).toBe("current");
    expect(second.state.records).toHaveLength(first.state.records.length);
    expect(second.state.legacyMigratedAt).toBe(NOW);
  });

  it("never invents records from an unrecognised shape", () => {
    const { state, report } = migrateMemoryState("nonsense", null, NOW);
    expect(state.records).toHaveLength(0);
    expect(report.from).toBe("empty");
    expect(report.notes.join(" ")).toContain("unrecognised shape");
  });

  it("drops unusable stored records and counts them", () => {
    const { state, report } = migrateMemoryState(
      {
        version: MEMORY_SCHEMA_VERSION,
        records: [
          { content: "A readable claim.", category: "semantic", createdAt: 5 },
          { content: "Wrong category.", category: "vibes" },
          null,
          { category: "semantic" },
        ],
        audit: [{ at: 1, action: "deleted", recordId: "mem-1", contentHash: "fnv1a32:1", category: "semantic", workspaceId: "ws-1", note: "gone" }],
        legacyMigratedAt: 5,
      },
      null,
      NOW,
    );
    expect(state.records).toHaveLength(1);
    expect(state.audit).toHaveLength(1);
    expect(report.dropped).toBe(3);
    expect(report.notes.join(" ")).toContain("3 stored record(s)");
  });

  it("keeps a stored record's own labels when they are valid", () => {
    const { state } = migrateMemoryState(
      {
        version: MEMORY_SCHEMA_VERSION,
        records: [
          {
            id: "mem-kept",
            category: "source",
            content: "Thermal Report.pdf was read.",
            status: "supported",
            provenance: {
              origin: "external-source",
              source: { type: "document", name: "Thermal Report.pdf", locator: "p.3", retrievedAt: 42 },
              note: "Uploaded by the operator.",
            },
            scope: { workspaceId: "ws-1" },
            createdAt: 7,
            updatedAt: 8,
            lastRetrievedAt: 9,
            retention: { mode: "review" },
            revisions: [{ at: 7, action: "created", note: "Uploaded by the operator." }],
            tags: ["pdf"],
            supersedes: [],
            auto: false,
          },
        ],
        audit: [],
        legacyMigratedAt: 7,
      },
      null,
      NOW,
    );
    const record = state.records[0];
    expect(record.id).toBe("mem-kept");
    expect(record.status).toBe("supported");
    expect(record.provenance.source.locator).toBe("p.3");
    expect(record.lastRetrievedAt).toBe(9);
    expect(record.retention.mode).toBe("review");
    expect(record.revisions).toHaveLength(1);
  });

  it("does not import legacy memory twice when the marker is present", () => {
    const { state } = migrateMemoryState(
      { version: MEMORY_SCHEMA_VERSION, records: [], audit: [], legacyMigratedAt: 99 },
      LEGACY,
      NOW,
    );
    expect(state.records).toHaveLength(0);
    expect(state.legacyMigratedAt).toBe(99);
  });
});
