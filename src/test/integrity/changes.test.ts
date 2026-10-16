import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_DERIVED_CHANGES,
  acknowledgeDerivedChange,
  clearDerivedChanges,
  derivedChanges,
  derivedChangesDroppedCount,
  derivedChangesRejectedOnLoad,
  deriveTabRecords,
  loadDerivedChanges,
  recordDerivedChange,
  resetDerivedChangesForTests,
  subscribeDerivedChanges,
  INTEGRITY_SCHEMA_VERSION,
  type DerivationProvenance,
} from "../../integrity";

/**
 * The change log is what makes a run's effects reviewable, so its own behaviour
 * is tested the way the store is: a payload from another version, a corrupt
 * entry, and the cap are all cases that must be reported rather than guessed at.
 */

const KEY = "integrity-changes";

const ANSWER = "## Summary\n\nThe coolant loop was drained and inspected before the restart.\n\nWhat came next?";

function provenance(overrides: Partial<DerivationProvenance> = {}): DerivationProvenance {
  const derived = deriveTabRecords(ANSWER, { tabId: "tab-1", workspaceId: "w1", runId: "run-1", at: 1000 });
  return { ...derived.provenance, ...overrides };
}

beforeEach(async () => {
  localStorage.clear();
  resetDerivedChangesForTests();
  await clearDerivedChanges();
  localStorage.clear();
});

describe("derived change log", () => {
  it("records what a run changed, copied from the derivation", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDerivedChanges(listener);

    const change = recordDerivedChange({
      at: 5000,
      workspaceId: "w1",
      tabId: "tab-1",
      tabTitle: "Coolant loop incident",
      provenance: provenance(),
      effects: {
        knowledge: { nodesAdded: ["node-a", "node-b"], edgesAdded: ["edge-a"] },
        memory: { outcome: "created", recordId: "mem-1" },
      },
    });

    expect(change.id).toMatch(/^chg-[0-9a-f]{8}$/);
    expect(change.at).toBe(5000);
    expect(change.runId).toBe("run-1");
    expect(change.answerDigest).toBe(provenance().answerDigest);
    expect(change.counts.sections).toBe(1);
    expect(change.effects.knowledge.nodesAdded).toEqual(["node-a", "node-b"]);
    expect(change.effects.memory).toEqual({ outcome: "created", recordId: "mem-1" });
    expect(change.acknowledgements).toEqual([]);

    expect(derivedChanges()).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    recordDerivedChange({ workspaceId: "w1", tabId: "tab-1", tabTitle: "again", provenance: provenance(), effects: { knowledge: { nodesAdded: [], edgesAdded: [] }, memory: null } });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps the newest change sets and counts the ones it dropped", () => {
    for (let index = 0; index < MAX_DERIVED_CHANGES + 3; index++) {
      recordDerivedChange({
        at: 1000 + index,
        workspaceId: "w1",
        tabId: "tab-1",
        tabTitle: `run ${index}`,
        provenance: provenance({ runId: `run-${index}` }),
        effects: { knowledge: { nodesAdded: [], edgesAdded: [] }, memory: null },
      });
    }

    expect(derivedChanges()).toHaveLength(MAX_DERIVED_CHANGES);
    expect(derivedChangesDroppedCount()).toBe(3);
    expect(derivedChanges()[0].runId).toBe(`run-${MAX_DERIVED_CHANGES + 2}`);
    expect(derivedChanges().some((change) => change.runId === "run-0")).toBe(false);
  });

  it("acknowledges a change set with a note, and refuses an unknown id", () => {
    const change = recordDerivedChange({
      workspaceId: "w1",
      tabId: "tab-1",
      tabTitle: "review me",
      provenance: provenance(),
      effects: { knowledge: { nodesAdded: [], edgesAdded: [] }, memory: { outcome: "duplicate", recordId: "mem-9", detail: "same exchange" } },
    });

    expect(acknowledgeDerivedChange("chg-nope", "hello")).toBe(false);
    expect(acknowledgeDerivedChange(change.id, "  Looked at it.  ")).toBe(true);

    const stored = derivedChanges().find((entry) => entry.id === change.id);
    expect(stored?.acknowledgements).toHaveLength(1);
    expect(stored?.acknowledgements[0].note).toBe("Looked at it.");
    expect(stored?.acknowledgements[0].at).toBeGreaterThan(0);
  });

  it("reads back a persisted payload and refuses the entries it cannot understand", async () => {
    const good = recordDerivedChange({
      at: 1000,
      workspaceId: "w1",
      tabId: "tab-1",
      tabTitle: "kept",
      provenance: provenance(),
      effects: { knowledge: { nodesAdded: [], edgesAdded: [] }, memory: null },
    });
    // Overwrite the persisted copy with the same good entry plus shapes that must
    // be refused. `loadDerivedChanges` replaces the in-memory list, so the entry
    // recorded above is not what is being read back.
    localStorage.setItem(
      KEY,
      JSON.stringify({ version: INTEGRITY_SCHEMA_VERSION, dropped: 7, changes: [good, { id: "bad" }, 42, null] }),
    );

    await loadDerivedChanges();

    expect(derivedChanges()).toHaveLength(1);
    expect(derivedChanges()[0].tabTitle).toBe("kept");
    expect(derivedChangesRejectedOnLoad()).toBe(3);
    expect(derivedChangesDroppedCount()).toBe(7);
  });

  it("merges a stored payload with changes recorded while the read was in flight", async () => {
    const mine = recordDerivedChange({
      at: 3000,
      workspaceId: "w1",
      tabId: "tab-1",
      tabTitle: "mine, in memory",
      provenance: provenance({ runId: "run-memory" }),
      effects: { knowledge: { nodesAdded: [], edgesAdded: [] }, memory: null },
    });
    const older = { ...mine, id: "chg-older1", at: 1000, tabTitle: "older, on disk", runId: "run-disk" };
    localStorage.setItem(KEY, JSON.stringify({ version: INTEGRITY_SCHEMA_VERSION, dropped: 0, changes: [older] }));

    await loadDerivedChanges();

    expect(derivedChanges().map((change) => change.tabTitle)).toEqual(["mine, in memory", "older, on disk"]);
  });

  it("refuses a payload written by another version instead of half-reading it", async () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 99, dropped: 0, changes: [{ id: "chg-1" }] }));

    await loadDerivedChanges();

    expect(derivedChanges()).toHaveLength(0);
    expect(derivedChangesRejectedOnLoad()).toBe(1);
  });

  it("clears the log and its persisted copy", async () => {
    recordDerivedChange({
      workspaceId: "w1",
      tabId: "tab-1",
      tabTitle: "gone",
      provenance: provenance(),
      effects: { knowledge: { nodesAdded: [], edgesAdded: [] }, memory: null },
    });
    expect(localStorage.getItem(KEY)).toBeTruthy();

    await clearDerivedChanges();
    expect(derivedChanges()).toHaveLength(0);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
