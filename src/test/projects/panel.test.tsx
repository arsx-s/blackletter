import { beforeEach, describe, expect, test } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProjectsPanel } from "../../components/observability/ProjectsPanel";
import { resetTaskStoreForTests, taskById, tasksFor } from "../../tasks";
import { workspaceStore } from "../../stores/use-workspace";
import {
  createProject,
  projectsFor,
  resetProjectStoreForTests,
  saveProject,
  type Project,
} from "../../projects";

/**
 * The panel is where the pack's two hard rules become visible: a checkpoint is a
 * real gate, and a schedule is inert until an operator acknowledges it. The
 * assertions are about stored state and the words on screen, not about layout.
 */

const T0 = 1_700_000_000_000;

/** The panel works on the active workspace, so the seeds must use the same one. */
function workspaceId(): string {
  return workspaceStore.getState().activeWorkspaceId;
}

beforeEach(() => {
  localStorage.clear();
  resetProjectStoreForTests();
  resetTaskStoreForTests();
  localStorage.clear();
});

function seed(project: Project): void {
  saveProject(project);
}

function createSeed(overrides: { milestones?: Parameters<typeof createProject>[0]["milestones"]; title?: string } = {}): Project {
  const result = createProject({
    workspaceId: workspaceId(),
    title: overrides.title ?? "Coolant report",
    goal: "Document the incident",
    at: T0,
    milestones: overrides.milestones ?? [{ id: "m1", title: "Gather logs" }],
  });
  if (!result.ok) throw new Error(result.reason);
  return result.project;
}

describe("projects panel", () => {
  test("introduces itself honestly when there is nothing yet", () => {
    render(<ProjectsPanel />);
    expect(screen.getByText(/Nothing runs on its own: milestones are executed by tasks you create and run from the Tasks panel\./)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Create project/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  test("creates a project through the form and shows the budget as unmeasured where it is", () => {
    render(<ProjectsPanel />);
    fireEvent.change(screen.getByLabelText("Project title"), { target: { value: "Pump replacement" } });
    fireEvent.change(screen.getByLabelText("Project goal"), { target: { value: "Replace the pump seal" } });
    fireEvent.click(screen.getByRole("button", { name: /Create project/ }));

    expect(projectsFor(workspaceId())).toHaveLength(1);
    expect(screen.getByText(/Pump replacement\./)).toBeTruthy();
    expect(screen.getByText(/not enforced: tokens and currency budgets/)).toBeTruthy();
    expect(screen.getByText(/no timers, no background jobs/)).toBeTruthy();
  });

  test("creates a task for a ready milestone and shows the task the store holds", () => {
    seed(createSeed());
    render(<ProjectsPanel />);

    expect(screen.getByText("ready")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Create task/ }));

    const project = projectsFor(workspaceId())[0];
    const taskId = project.milestones[0].taskId;
    expect(taskId).toBeTruthy();
    expect(taskById(taskId as string)?.goal).toContain("Gather logs");
    expect(tasksFor(workspaceId())).toHaveLength(1);
    expect(screen.getByText(/task .+RUNNING/)).toBeTruthy();
  });

  test("shows a checkpoint as approval-needed until it is approved", () => {
    seed(createSeed({ milestones: [{ id: "m1", title: "Sign-off", checkpoint: true }] }));
    render(<ProjectsPanel />);

    expect(screen.getByText("approval needed")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Create task/ }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Approve checkpoint/ }));
    expect(screen.getByText(/checkpoint: approved/)).toBeTruthy();
  });

  test("keeps the schedule inert until it is acknowledged, then records runs", () => {
    seed(createSeed());
    render(<ProjectsPanel />);

    const enable = screen.getByRole("button", { name: /Enable schedule/ }) as HTMLButtonElement;
    expect(enable.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/I understand nothing runs on its own/));
    expect(enable.disabled).toBe(false);
    fireEvent.click(enable);

    const project = projectsFor(workspaceId())[0];
    expect(project.schedule.enabled).toBe(true);
    const run = screen.getByRole("button", { name: /Record a run now/ }) as HTMLButtonElement;
    expect(run.disabled).toBe(false);
    fireEvent.click(run);
    expect(projectsFor(workspaceId())[0].schedule.runsDone).toBe(1);
    expect(screen.getByText(/runs 1\/4/)).toBeTruthy();
  });

  test("says which notification channels this build cannot deliver through", () => {
    seed(createSeed());
    render(<ProjectsPanel />);
    expect(screen.getByText(/unavailable: This build has no outbound notification transport/)).toBeTruthy();
    expect(screen.getByText(/unavailable: This build has no mail transport/)).toBeTruthy();

    // The two channels this build cannot deliver through are present but unpressable.
    const enableButtons = screen.getAllByRole("button", { name: "Enable" }) as HTMLButtonElement[];
    expect(enableButtons).toHaveLength(3);
    expect(enableButtons.filter((button) => button.disabled)).toHaveLength(2);

    const pressable = enableButtons.find((button) => !button.disabled);
    expect(pressable).toBeTruthy();
    fireEvent.click(pressable as HTMLButtonElement);
    expect(projectsFor(workspaceId())[0].notifications.find((channel) => channel.id === "in-app")?.enabled).toBe(true);
  });
});
