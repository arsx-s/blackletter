import { beforeEach, describe, expect, test } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryPanel } from "../../components/memory/MemoryPanel";
import { workspaceStore } from "../../stores/use-workspace";

/**
 * The panel is tested against the real store, because the point of Mission 4 is
 * that the operator can actually inspect and change what is stored — a mocked
 * store would test the mock.
 */

const RESET_NOTE = "Test setup: start from an empty memory.";

function workspaceId(): string {
  return workspaceStore.getState().activeWorkspaceId;
}

function reset(): void {
  workspaceStore.clearMemoryScope(null, "*", RESET_NOTE);
  workspaceStore.clearMemory(workspaceId());
}

function textareaByLabel(label: string): HTMLTextAreaElement {
  return screen.getByLabelText(label) as HTMLTextAreaElement;
}

describe("memory panel", () => {
  beforeEach(reset);

  test("lists a record with its provenance and how far it is trusted", () => {
    const id = workspaceId();
    workspaceStore.addMemoryRecord({
      category: "semantic",
      content: "The reactor operates at 900 degrees.",
      provenance: { origin: "model-inference", source: { type: "conversation", id: "tab-9" }, note: "The model inferred this." },
      scope: { workspaceId: id },
    });

    render(<MemoryPanel workspaceId={id} workspaceName="Personal" />);

    expect(screen.getByText("The reactor operates at 900 degrees.")).toBeTruthy();
    expect(screen.getAllByText("Semantic").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Inferred").length).toBeGreaterThan(0);
    expect(screen.getAllByText("model-inferred").length).toBeGreaterThan(0);
    expect(screen.getByText(/The model inferred this/)).toBeTruthy();
    // Nothing on the record itself claims the claim was verified. ("Verified" may
    // appear as a filter option, so the check is scoped to the record list.)
    expect(within(screen.getByRole("list", { name: "Memory records" })).queryByText("Verified")).toBeNull();
  });

  test("deletion refuses to proceed without a reason, then removes the record", () => {
    const id = workspaceId();
    workspaceStore.addMemoryRecord({
      category: "semantic",
      content: "A fact to be forgotten.",
      provenance: { origin: "user", source: { type: "none" }, note: "Operator said so." },
      scope: { workspaceId: id },
    });

    render(<MemoryPanel workspaceId={id} workspaceName="Personal" />);
    fireEvent.click(screen.getByText("Delete"));

    fireEvent.click(screen.getByText("Delete this record"));
    expect(screen.getByRole("alert").textContent).toContain("note");
    expect(screen.getByText("A fact to be forgotten.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Reason for the deletion"), { target: { value: "It was wrong." } });
    fireEvent.click(screen.getByText("Delete this record"));
    expect(screen.queryByText("A fact to be forgotten.")).toBeNull();

    const auditRow = screen.getByText(/^deleted ·/).closest("li")!;
    expect(auditRow.textContent).toContain("digest");
    expect(auditRow.textContent).not.toContain("A fact to be forgotten.");
  });

  test("a correction keeps the previous text in the history and does not relabel the origin", () => {
    const id = workspaceId();
    workspaceStore.addMemoryRecord({
      category: "semantic",
      content: "The reactor operates at 900 degrees.",
      provenance: { origin: "model-inference", source: { type: "conversation" }, note: "The model inferred this." },
      scope: { workspaceId: id },
    });

    render(<MemoryPanel workspaceId={id} workspaceName="Personal" />);
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.change(textareaByLabel("Corrected text"), { target: { value: "The reactor operates at 850 degrees." } });
    fireEvent.change(screen.getByLabelText("Reason for the correction"), {
      target: { value: "Corrected against the commissioning report." },
    });
    fireEvent.click(screen.getByText("Save correction"));

    expect(screen.getByText("The reactor operates at 850 degrees.")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Memory records" })).queryByText("Verified")).toBeNull();
    expect(screen.getAllByText("model-inferred").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText(/History \(2\)/));
    expect(screen.getByText(/was: The reactor operates at 900 degrees\./)).toBeTruthy();
    expect(screen.getByText("Corrected against the commissioning report.")).toBeTruthy();
  });

  test("shows both sides of a contradiction and resolves it without deleting either", () => {
    const id = workspaceId();
    workspaceStore.addMemoryRecord({
      category: "semantic",
      content: "The reactor operates at 900 degrees.",
      provenance: { origin: "user", source: { type: "none" }, note: "Operator said so." },
      scope: { workspaceId: id },
    });
    workspaceStore.addMemoryRecord({
      category: "semantic",
      content: "The reactor does not operate at 900 degrees.",
      provenance: { origin: "user", source: { type: "none" }, note: "Operator corrected themselves." },
      scope: { workspaceId: id },
    });

    render(<MemoryPanel workspaceId={id} workspaceName="Personal" />);

    expect(screen.getByText(/pair\(s\) of records disagree/)).toBeTruthy();
    // Both sides appear in the dispute block as well as in the record list.
    expect(screen.getAllByText("The reactor operates at 900 degrees.").length).toBeGreaterThan(1);
    expect(screen.getAllByText("The reactor does not operate at 900 degrees.").length).toBeGreaterThan(1);

    // Resolving needs a reason first.
    fireEvent.click(screen.getAllByText("Rely on this one")[0]);
    expect(screen.getByText(/dispute resolved|needs a note|explaining the decision/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Reason for resolving the dispute"), {
      target: { value: "The commissioning report is the authority." },
    });
    fireEvent.click(screen.getAllByText("Rely on this one")[0]);
    expect(screen.queryByText(/pair\(s\) of records disagree/)).toBeNull();
    // Both records survive the decision.
    expect(screen.getAllByText("The reactor does not operate at 900 degrees.").length).toBeGreaterThan(0);
  });

  test("clearing this workspace requires the workspace id and a reason", () => {
    const id = workspaceId();
    workspaceStore.addMemoryRecord({
      category: "project",
      content: "A goal that is about to be cleared.",
      provenance: { origin: "user", source: { type: "none" }, note: "Operator said so." },
      scope: { workspaceId: id },
    });

    render(<MemoryPanel workspaceId={id} workspaceName="Personal" />);
    const clearButton = screen.getByText(/^Clear Personal$/);
    expect((clearButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Type the workspace id to confirm/), { target: { value: id } });
    fireEvent.change(screen.getByLabelText("Reason for clearing this workspace's memory"), {
      target: { value: "Moving to a new project." },
    });
    expect((clearButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(clearButton);
    expect(screen.queryByText("A goal that is about to be cleared.")).toBeNull();
    expect(screen.getByText(/Cleared 1 record\(s\)/)).toBeTruthy();
  });

  test("adds a memory by hand as user-provided and assumed", () => {
    const id = workspaceId();
    render(<MemoryPanel workspaceId={id} workspaceName="Personal" />);
    expect(screen.getByText(/This workspace has no memory records yet/)).toBeTruthy();

    fireEvent.click(screen.getByText("Remember something"));
    fireEvent.change(screen.getByLabelText("What should be remembered"), {
      target: { value: "Prefer concise summaries in reports." },
    });
    fireEvent.change(screen.getByLabelText("Why this should be remembered"), {
      target: { value: "Stated as a standing preference." },
    });
    fireEvent.click(screen.getByText("Remember it"));

    const list = screen.getByRole("list", { name: "Memory records" });
    expect(within(list).getByText("Prefer concise summaries in reports.")).toBeTruthy();
    expect(screen.getAllByText("user-provided").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Assumed").length).toBeGreaterThan(0);
  });

  test("retention changes are applied and reported", () => {
    const id = workspaceId();
    workspaceStore.addMemoryRecord({
      category: "episodic",
      content: "An old working note.",
      provenance: { origin: "model-inference", source: { type: "conversation" }, note: "Recorded automatically." },
      scope: { workspaceId: id },
    });

    render(<MemoryPanel workspaceId={id} workspaceName="Personal" />);
    fireEvent.click(screen.getByText("Retention"));
    fireEvent.change(screen.getByLabelText("Policy"), { target: { value: "expire" } });
    fireEvent.change(screen.getByLabelText("Delete this record after"), { target: { value: "2020-01-01" } });
    fireEvent.change(screen.getByLabelText("Reason for the retention change"), {
      target: { value: "Only needed for last week's work." },
    });
    fireEvent.click(screen.getByText("Apply retention"));
    expect(screen.getByText(/delete after/)).toBeTruthy();

    fireEvent.click(screen.getByText("Apply retention now"));
    expect(screen.getByText(/1 record\(s\) removed by their own retention policy/)).toBeTruthy();
    expect(screen.queryByText("An old working note.")).toBeNull();
  });
});
