import { beforeEach, describe, expect, test } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IntegrityPanel } from "../../components/observability/IntegrityPanel";
import { workspaceStore } from "../../stores/use-workspace";
import {
  clearDerivedChanges,
  deriveTabRecords,
  recordDerivedChange,
  resetDerivedChangesForTests,
} from "../../integrity";

/**
 * The panel is exercised against the real store and the real change log: the
 * point of the change set is that the operator can see what a run changed and act
 * on the part that can be undone. A mocked store would test the mock.
 */

const ANSWER = [
  "## Coolant Loop Overview",
  "",
  "The **Coolant Loop** was isolated in 2019 after a pressure drop was recorded at Wolfe Creek Institute.",
  "",
  "What caused the pressure drop?",
].join("\n");

function workspaceId(): string {
  return workspaceStore.getState().activeWorkspaceId;
}

function seedChange(): { changeId: string; memoryId: string | null } {
  const id = workspaceId();
  const result = workspaceStore.addMemoryRecord({
    category: "episodic",
    content: "Q: What happened to the coolant loop?\nA: It was isolated.",
    provenance: { origin: "model-inference", source: { type: "conversation", id: "tab-1" }, note: "Recorded automatically." },
    scope: { workspaceId: id },
    auto: true,
  });
  const derived = deriveTabRecords(ANSWER, { tabId: "tab-1", workspaceId: id, runId: "run-7", at: 1000 });
  const change = recordDerivedChange({
    at: 2000,
    workspaceId: id,
    tabId: "tab-1",
    tabTitle: "Coolant loop incident",
    provenance: derived.provenance,
    effects: {
      knowledge: { nodesAdded: ["node-a", "node-b"], edgesAdded: [] },
      memory: { outcome: result.outcome, recordId: result.record?.id ?? null },
    },
  });
  return { changeId: change.id, memoryId: result.record?.id ?? null };
}

beforeEach(async () => {
  localStorage.clear();
  resetDerivedChangesForTests();
  await clearDerivedChanges();
  workspaceStore.clearMemoryScope(null, "*", "Test setup: start from an empty memory.");
  workspaceStore.clearMemory(workspaceId());
});

describe("integrity panel", () => {
  test("shows what a run derived, what it changed, and never presents it as verified", async () => {
    seedChange();

    render(<IntegrityPanel />);

    expect(screen.getByText("Coolant loop incident")).toBeTruthy();
    expect(screen.getByText(/run run-7/)).toBeTruthy();
    expect(screen.getByText(/derived: 1 sections · 2 entities · 1 timeline · 1 notes · 1 follow-ups/)).toBeTruthy();
    expect(screen.getByText(/knowledge: \+2 node\(s\), \+0 edge\(s\)/)).toBeTruthy();
    expect(screen.getByText(/memory: created/)).toBeTruthy();
    // The word the panel is careful not to use about its own records.
    expect(screen.queryByText(/\bverified\b/i)).toBeNull();
  });

  test("removes the memory record a change set created, through the memory layer", async () => {
    const { memoryId } = seedChange();
    expect(memoryId).toBeTruthy();

    render(<IntegrityPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Remove memory record" }));

    await waitFor(() => {
      expect(workspaceStore.memoryRecordById(memoryId!)).toBeNull();
    });
    expect(screen.getByText("Memory record removed.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove memory record" })).toBeNull();
    expect(screen.getByText(/already removed or edited away/)).toBeTruthy();
  });

  test("acknowledges a change set without removing anything", async () => {
    const { memoryId } = seedChange();

    render(<IntegrityPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));

    await waitFor(() => {
      expect(screen.getByText(/Reviewed in the integrity panel\./)).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Acknowledged" })).toBeTruthy();
    expect(workspaceStore.memoryRecordById(memoryId!)).not.toBeNull();
  });

  test("says so when nothing has been recorded yet", async () => {
    render(<IntegrityPanel />);
    expect(await screen.findByText(/No completed run has recorded a change set/)).toBeTruthy();
  });
});
