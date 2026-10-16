import { beforeEach, describe, expect, test } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TasksPanel } from "../../components/observability/TasksPanel";
import { resetTaskStoreForTests } from "../../tasks";

/**
 * The panel drives the real machine: every click is one request for one permitted
 * action, and what the panel shows is what the task record contains. Nothing here
 * asserts a pretty picture — the assertions are about state, refusals, and the two
 * things the panel refuses to overstate (level 3, and the unmeasured budgets).
 */

beforeEach(() => {
  localStorage.clear();
  resetTaskStoreForTests();
});

function setGoal(text: string): void {
  fireEvent.change(screen.getByLabelText("Task goal"), { target: { value: text } });
}

function stepCounter(): string {
  const match = document.body.textContent?.match(/step \d+ of \d+/);
  return match ? match[0] : "";
}

function stepButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /Run next step/ }) as HTMLButtonElement;
}

async function runEveryStep(): Promise<void> {
  for (let guard = 0; guard < 8; guard++) {
    if (stepButton().disabled) {
      // Disabled either because a step is in flight, or because the task left
      // RUNNING. Wait until one of those is clearly not the case.
      await waitFor(() => {
        expect(!stepButton().disabled || screen.queryByText("VERIFYING") !== null).toBe(true);
      });
      if (stepButton().disabled) return;
    }

    const before = stepCounter();
    fireEvent.click(stepButton());
    // A step has advanced when the counter moves, or when the task stops asking for
    // steps because it has reached the verification.
    await waitFor(() => {
      expect(stepCounter() !== before || screen.queryByText("VERIFYING") !== null).toBe(true);
    });
  }
}

describe("tasks panel", () => {
  test("offers levels 0 to 2 and says level 3 is not implemented", () => {
    render(<TasksPanel />);

    const select = screen.getByLabelText("Autonomy level") as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toEqual(["0", "1", "2"]);
    expect(screen.getByText(/Level 3 is not implemented in this build/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Propose plan/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  test("proposes a deterministic plan with a reason for every step", () => {
    render(<TasksPanel />);
    setGoal("What does this workspace say about the coolant loop B incident?");
    fireEvent.click(screen.getByRole("button", { name: /Propose plan/ }));

    expect(screen.getByText("RUNNING")).toBeTruthy();
    expect(screen.getAllByText("workspace.status").length).toBeGreaterThan(0);
    expect(screen.getAllByText("workspace.search").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Included because/).length).toBeGreaterThan(1);
    expect(screen.getByText(/Success criteria/)).toBeTruthy();
    expect(screen.getByText(/Not enforced: tokens and currency budgets/)).toBeTruthy();
  });

  test("plans nothing at level 0 and says so instead of pretending", () => {
    render(<TasksPanel />);
    fireEvent.change(screen.getByLabelText("Autonomy level"), { target: { value: "0" } });
    setGoal("Explain what a coolant loop does");
    fireEvent.click(screen.getByRole("button", { name: /Propose plan/ }));

    expect(screen.getByText(/This level executes nothing/)).toBeTruthy();
    expect(screen.getByText(/no tool was called, because level 0 executes nothing/)).toBeTruthy();
  });

  test("runs one permitted action per click and reports what each one found", async () => {
    render(<TasksPanel />);
    setGoal("What does this workspace say about the coolant loop B incident?");
    fireEvent.click(screen.getByRole("button", { name: /Propose plan/ }));

    await runEveryStep();

    // The workspace in this test holds nothing, so the read step is skipped with a
    // reason and the run asks to be verified rather than announcing success.
    expect(await screen.findByText(/no earlier step returned an item id/)).toBeTruthy();
    expect(screen.getByText("VERIFYING")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Verify/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  test("verifies against the evidence and fails honestly when there is none", async () => {
    render(<TasksPanel />);
    setGoal("What does this workspace say about the coolant loop B incident?");
    fireEvent.click(screen.getByRole("button", { name: /Propose plan/ }));
    await runEveryStep();

    fireEvent.click(screen.getByRole("button", { name: /Verify/ }));

    expect(await screen.findByText("FAILED")).toBeTruthy();
    expect(screen.getByText(/no step returned any evidence/)).toBeTruthy();
    expect(screen.getByText(/Incomplete:/)).toBeTruthy();
  });

  test("revises the plan through the machine, and refuses arguments the schema rejects", async () => {
    render(<TasksPanel />);
    setGoal("What does this workspace say about the coolant loop B incident?");
    fireEvent.click(screen.getByRole("button", { name: /Propose plan/ }));

    // The default draft is the tool's required shape with an empty value, which the
    // schema refuses — the panel must say so rather than add a broken step.
    fireEvent.change(screen.getByLabelText("Step tool"), { target: { value: "workspace.read" } });
    fireEvent.click(screen.getByRole("button", { name: /Add step/ }));
    expect(await screen.findByText(/do not satisfy workspace\.read/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Step arguments"), { target: { value: '{"id": "doc-1"}' } });
    fireEvent.change(screen.getByLabelText("Step reason"), { target: { value: "read the item the search found" } });
    fireEvent.click(screen.getByRole("button", { name: /Add step/ }));

    expect(await screen.findByText(/Plan revisions \(1\)/)).toBeTruthy();
    expect(screen.getAllByText(/read the item the search found/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Plan \(6 step\(s\)\)/)).toBeTruthy();
  });

  test("pauses, resumes and cancels through the machine rather than in the UI", async () => {
    render(<TasksPanel />);
    setGoal("What does this workspace say about the coolant loop B incident?");
    fireEvent.click(screen.getByRole("button", { name: /Propose plan/ }));

    fireEvent.click(screen.getByRole("button", { name: /Pause/ }));
    expect(await screen.findByText("PAUSED")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Run next step/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Resume/ }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /Resume/ }));
    expect(await screen.findByText("RUNNING")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    expect(await screen.findByText("CANCELLED")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Run next step/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
