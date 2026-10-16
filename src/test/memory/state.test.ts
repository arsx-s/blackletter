import { describe, expect, it } from "vitest";
import {
  MEMORY_MAX_AUTO_PER_WORKSPACE,
  MEMORY_MAX_CONTENT_CHARS,
  MEMORY_REVIEW_AFTER_MS,
  addRecord,
  applyRetention,
  clearScope,
  deleteRecord,
  detectConflicts,
  editRecord,
  emptyMemoryState,
  isExpired,
  isReviewDue,
  memoryStats,
  normaliseStoredRecord,
  resolveDispute,
  setRetention,
  statusForOrigin,
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

function add(state: MemoryState, overrides: Partial<MemoryInput>, at = NOW) {
  return addRecord(state, input(overrides), at);
}

describe("memory origin and epistemic status", () => {
  it("derives a status from the origin instead of assuming trust", () => {
    expect(statusForOrigin("user", { type: "none" })).toBe("assumed");
    expect(statusForOrigin("model-inference", { type: "conversation" })).toBe("inferred");
    expect(statusForOrigin("external-source", { type: "document", locator: "p.3" })).toBe("supported");
    expect(statusForOrigin("external-source", { type: "document" })).toBe("unverified");
    expect(statusForOrigin("legacy-import", { type: "none" })).toBe("unknown");
  });

  it("records where a claim came from and never promotes an inference by editing it", () => {
    const created = add(emptyMemoryState(), {
      provenance: { origin: "model-inference", source: { type: "conversation", id: "tab-1" }, note: "The model said it." },
    });
    expect(created.outcome).toBe("created");
    expect(created.record?.status).toBe("inferred");
    expect(created.record?.provenance.origin).toBe("model-inference");

    const edited = editRecord(
      created.state,
      created.record!.id,
      { content: "The reactor operates at 850 degrees.", note: "Wording corrected after re-reading the report." },
      NOW + 1,
    );
    expect(edited.ok).toBe(true);
    expect(edited.record?.provenance.origin).toBe("model-inference");
    expect(edited.record?.status).toBe("inferred");
    expect(edited.record?.content).toBe("The reactor operates at 850 degrees.");
  });

  it("refuses status labels that only a check or a conflict may set", () => {
    const created = add(emptyMemoryState(), {});
    const verified = editRecord(created.state, created.record!.id, { status: "verified", note: "I think it is right." }, NOW + 1);
    expect(verified.ok).toBe(false);
    expect(verified.reason).toContain("verified");

    const disputed = editRecord(created.state, created.record!.id, { status: "disputed", note: "Feels wrong." }, NOW + 1);
    expect(disputed.ok).toBe(false);
  });

  it("requires a reason for every change", () => {
    const created = add(emptyMemoryState(), {});
    const noNote = editRecord(created.state, created.record!.id, { content: "Something else.", note: "x" }, NOW + 1);
    expect(noNote.ok).toBe(false);
    expect(noNote.reason).toContain("note");

    const noDeleteNote = deleteRecord(created.state, created.record!.id, "", NOW + 1);
    expect(noDeleteNote.ok).toBe(false);

    const noRetentionNote = setRetention(created.state, created.record!.id, { mode: "keep" }, "", NOW + 1);
    expect(noRetentionNote.ok).toBe(false);
  });

  it("rejects content that is empty or larger than the limit", () => {
    expect(add(emptyMemoryState(), { content: "   " }).outcome).toBe("rejected");
    const big = add(emptyMemoryState(), { content: "x".repeat(MEMORY_MAX_CONTENT_CHARS + 1) });
    expect(big.outcome).toBe("rejected");
    expect(big.detail).toContain(String(MEMORY_MAX_CONTENT_CHARS));
  });
});

describe("duplicates and contradictions", () => {
  it("stores an identical claim once and records the second sighting", () => {
    const first = add(emptyMemoryState(), {});
    const second = add(first.state, {
      provenance: { origin: "external-source", source: { type: "document", name: "Report", locator: "p.2" }, note: "Found again." },
    });
    expect(second.outcome).toBe("duplicate");
    expect(second.state.records).toHaveLength(1);
    expect(second.state.records[0].revisions.map((revision) => revision.action)).toContain("merged");
    // The origin of the first record is unchanged: a second sighting is not a promotion.
    expect(second.state.records[0].provenance.origin).toBe("user");
  });

  it("keeps both sides of a contradiction and marks them disputed", () => {
    const first = add(emptyMemoryState(), { content: "The reactor operates at 900 degrees." });
    const second = add(first.state, { content: "The reactor does not operate at 900 degrees." }, NOW + 1);

    expect(second.outcome).toBe("conflict");
    expect(second.state.records).toHaveLength(2);
    expect(second.state.records.every((record) => record.status === "disputed")).toBe(true);
    expect(second.state.records.every((record) => record.revisions.some((revision) => revision.action === "dispute"))).toBe(true);
    expect(detectConflicts(second.state)).toHaveLength(1);
    expect(detectConflicts(second.state)[0].reason).toContain("negates");
  });

  it("treats different figures about the same subject as a contradiction", () => {
    const first = add(emptyMemoryState(), { content: "The sample contains 12 grams of copper." });
    const second = add(first.state, { content: "The sample contains 8 grams of copper." }, NOW + 1);
    expect(second.outcome).toBe("conflict");
    expect(second.detail).toContain("12");
    expect(second.detail).toContain("8");
  });

  it("does not call unrelated records contradictory just because they share a noun", () => {
    const first = add(emptyMemoryState(), { content: "The sample contains 12 grams of copper." });
    const second = add(first.state, { content: "The sample was collected in March." }, NOW + 1);
    expect(second.outcome).toBe("created");
  });

  it("resolves a dispute without deleting the record that lost", () => {
    const first = add(emptyMemoryState(), { content: "The reactor operates at 900 degrees." });
    const second = add(first.state, { content: "The reactor does not operate at 900 degrees." }, NOW + 1);
    const [a, b] = second.state.records;

    const noNote = resolveDispute(second.state, a.id, b.id, "", NOW + 2);
    expect(noNote.ok).toBe(false);

    const resolved = resolveDispute(second.state, a.id, b.id, "The commissioning report is the authority here.", NOW + 2);
    expect(resolved.ok).toBe(true);
    const winner = resolved.state.records.find((record) => record.id === a.id)!;
    const loser = resolved.state.records.find((record) => record.id === b.id)!;
    expect(winner.status).toBe("assumed");
    expect(winner.supersedes).toContain(b.id);
    expect(loser.status).toBe("unverified");
    expect(resolved.state.records).toHaveLength(2);
    expect(detectConflicts(resolved.state)).toHaveLength(0);
  });
});

describe("editing history and deletion", () => {
  it("keeps the previous text in the revision history", () => {
    const created = add(emptyMemoryState(), {});
    const edited = editRecord(created.state, created.record!.id, { content: "The reactor operates at 850 degrees.", note: "Correction." }, NOW + 5);
    expect(edited.ok).toBe(true);
    const revision = edited.record!.revisions.at(-1)!;
    expect(revision.action).toBe("edited");
    expect(revision.previousContent).toBe("The reactor operates at 900 degrees.");
    expect(revision.note).toBe("Correction.");
  });

  it("removes a deleted record from the state and audits a digest, not the text", () => {
    const created = add(emptyMemoryState(), {});
    const deleted = deleteRecord(created.state, created.record!.id, "The operator asked to forget this.", NOW + 6);
    expect(deleted.ok).toBe(true);
    expect(deleted.state.records).toHaveLength(0);
    expect(deleted.state.audit).toHaveLength(1);
    expect(deleted.state.audit[0].action).toBe("deleted");
    expect(deleted.state.audit[0].contentHash).toMatch(/^fnv1a32:/);
    expect(JSON.stringify(deleted.state.audit)).not.toContain("reactor");
  });

  it("reports a missing record instead of silently succeeding", () => {
    const result = deleteRecord(emptyMemoryState(), "mem-missing", "Tidy up.", NOW);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("not found");
  });
});

describe("clear-all scopes", () => {
  function threeScopes(): MemoryState {
    let state = add(emptyMemoryState(), { content: "Workspace one fact about pumps." }).state;
    state = add(state, { content: "Workspace two fact about valves.", scope: { workspaceId: "ws-2" } }, NOW + 1).state;
    state = add(state, { content: "A fact that applies to every workspace.", scope: { workspaceId: null } }, NOW + 2).state;
    return state;
  }

  it("requires the caller to repeat the scope key", () => {
    const state = threeScopes();
    const refused = clearScope(state, { workspaceId: "ws-1", confirm: "yes", note: "Clean up." }, NOW + 3);
    expect(refused.ok).toBe(false);
    expect(refused.removed).toBe(0);
    expect(refused.state.records).toHaveLength(3);
  });

  it("clears one workspace without touching the others or global records", () => {
    const state = threeScopes();
    const cleared = clearScope(state, { workspaceId: "ws-1", confirm: "ws-1", note: "Starting over." }, NOW + 3);
    expect(cleared.ok).toBe(true);
    expect(cleared.removed).toBe(1);
    expect(cleared.state.records.map((record) => record.scope.workspaceId).sort()).toEqual([null, "ws-2"].sort());
    expect(cleared.state.audit.filter((entry) => entry.action === "cleared")).toHaveLength(1);
    expect(JSON.stringify(cleared.state.audit)).not.toContain("pumps");
  });

  it("clears everything only through the global scope", () => {
    const state = threeScopes();
    const cleared = clearScope(state, { workspaceId: null, confirm: "*", note: "Wipe it all." }, NOW + 3);
    expect(cleared.ok).toBe(true);
    expect(cleared.removed).toBe(3);
    expect(cleared.state.records).toHaveLength(0);
  });
});

describe("retention", () => {
  it("deletes expired records and says so in the audit", () => {
    const created = add(emptyMemoryState(), {});
    const policy = setRetention(created.state, created.record!.id, { mode: "expire", expiresAt: NOW - 1 }, "Old working note.", NOW);
    expect(policy.ok).toBe(true);
    expect(isExpired(policy.state.records[0], NOW)).toBe(true);

    const sweep = applyRetention(policy.state, NOW);
    expect(sweep.expired).toHaveLength(1);
    expect(sweep.state.records).toHaveLength(0);
    expect(sweep.state.audit[0].action).toBe("expired");
    expect(JSON.stringify(sweep.state.audit)).not.toContain("reactor");
  });

  it("refuses an expiry policy with no date", () => {
    const created = add(emptyMemoryState(), {});
    const result = setRetention(created.state, created.record!.id, { mode: "expire" }, "Set to expire.", NOW);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("expiry date");
  });

  it("only asks about reviewed records, never deletes them", () => {
    const old = NOW - MEMORY_REVIEW_AFTER_MS - 1;
    const created = add(emptyMemoryState(), {}, old);
    const policy = setRetention(created.state, created.record!.id, { mode: "review" }, "Worth revisiting.", old);
    expect(isReviewDue(policy.state.records[0], NOW)).toBe(true);

    const sweep = applyRetention(policy.state, NOW);
    expect(sweep.reviewDue).toEqual([created.record!.id]);
    expect(sweep.state.records).toHaveLength(1);
    expect(sweep.expired).toHaveLength(0);
  });
});

describe("auto-recorded memory", () => {
  it("retires the oldest auto records at the cap and never touches operator records", () => {
    const words = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel"];
    let state = add(emptyMemoryState(), { content: "An operator fact that must survive the cap." }).state;
    for (let index = 0; index < MEMORY_MAX_AUTO_PER_WORKSPACE + 3; index++) {
      state = add(
        state,
        {
          content: `Observation ${index} about ${words[index % words.length]} findings.`,
          auto: true,
          provenance: { origin: "model-inference", source: { type: "conversation" }, note: "Recorded automatically." },
        },
        NOW + index + 1,
      ).state;
    }

    expect(state.records).toHaveLength(MEMORY_MAX_AUTO_PER_WORKSPACE + 1);
    expect(state.records.some((record) => record.content.includes("operator fact"))).toBe(true);
    const retired = state.audit.filter((entry) => entry.action === "retention-capped");
    expect(retired).toHaveLength(3);
    expect(JSON.stringify(state.audit)).not.toContain("Observation");
  });
});

describe("stats", () => {
  it("counts by category, status and origin without inventing anything", () => {
    let state = add(emptyMemoryState(), {}).state;
    state = add(state, {
      category: "source",
      content: "Thermal Report.pdf was read on 1 March.",
      provenance: { origin: "external-source", source: { type: "document", name: "Thermal Report.pdf", locator: "p.1" }, note: "Uploaded." },
    }, NOW + 1).state;

    const stats = memoryStats(state, NOW + 2);
    expect(stats.total).toBe(2);
    expect(stats.byCategory.semantic).toBe(1);
    expect(stats.byCategory.source).toBe(1);
    expect(stats.byStatus.assumed).toBe(1);
    expect(stats.byStatus.supported).toBe(1);
    expect(stats.byOrigin.user).toBe(1);
    expect(stats.byOrigin["external-source"]).toBe(1);
    expect(stats.disputes).toBe(0);
  });
});

describe("tolerant record reading", () => {
  it("keeps a usable record and labels a missing origin honestly", () => {
    const record = normaliseStoredRecord({
      content: "  A   claim with   irregular whitespace. ",
      category: "semantic",
      provenance: { origin: "alien" },
      status: "banana",
      scope: { workspaceId: "ws-9" },
    });
    expect(record).not.toBeNull();
    expect(record!.content).toBe("A claim with irregular whitespace.");
    expect(record!.provenance.origin).toBe("legacy-import");
    expect(record!.status).toBe("unknown");
    expect(record!.scope.workspaceId).toBe("ws-9");
    expect(record!.revisions[0].action).toBe("migrated");
  });

  it("drops records that cannot be shown", () => {
    expect(normaliseStoredRecord(null)).toBeNull();
    expect(normaliseStoredRecord({ category: "semantic" })).toBeNull();
    expect(normaliseStoredRecord({ content: "no category" })).toBeNull();
    expect(normaliseStoredRecord({ content: "bad category", category: "vibes" })).toBeNull();
  });
});
