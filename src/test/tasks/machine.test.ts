import { describe, expect, it } from "vitest";
import { ALLOWED_TRANSITIONS, canTransition, isTerminal, transition } from "../../tasks/machine";
import { createTask } from "../../tasks/runner";
import { TASK_STATUSES, type TaskStatus } from "../../tasks/types";

/**
 * The transition table is the whole policy of the task machine, so it is tested
 * as a table: which moves are legal, which are refused, and — most importantly —
 * that success cannot be declared.
 */

function freshTask() {
  const result = createTask({
    workspaceId: "w1",
    goal: "Summarise what this workspace says about coolant loop B",
    constraints: [],
    level: 1,
    now: () => 1000,
  });
  if (!result.ok) throw new Error(result.reason);
  return result.task;
}

describe("transition table", () => {
  it("covers every status, including the terminal ones with no exits", () => {
    for (const status of TASK_STATUSES) {
      expect(ALLOWED_TRANSITIONS[status], status).toBeDefined();
    }
    for (const status of ["COMPLETED", "FAILED", "CANCELLED"] as TaskStatus[]) {
      expect(ALLOWED_TRANSITIONS[status]).toEqual([]);
      expect(isTerminal(status)).toBe(true);
    }
  });

  it("reaches COMPLETED only from VERIFYING", () => {
    const sources = TASK_STATUSES.filter((status) => ALLOWED_TRANSITIONS[status].includes("COMPLETED"));
    expect(sources).toEqual(["VERIFYING"]);

    // Not even a running task can declare itself done; the runner would have to
    // move to VERIFYING from RUNNING first, which requires the plan to finish.
    expect(canTransition("RUNNING", "COMPLETED")).toBe(false);
    expect(canTransition("PLANNING", "COMPLETED")).toBe(false);
    expect(canTransition("VERIFYING", "COMPLETED")).toBe(true);
  });

  it("refuses to change a task that has finished", () => {
    const task = { ...freshTask(), status: "COMPLETED" as const };
    const result = transition(task, { to: "RUNNING", reason: "try again", by: "operator", at: 2000 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("cannot change again");
  });

  it("records who moved the task and why", () => {
    const task = freshTask();
    const result = transition(task, { to: "PAUSED", reason: "the operator paused it", by: "operator", at: 2000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task.status).toBe("PAUSED");
    const last = result.task.transitions[result.task.transitions.length - 1];
    expect(last).toMatchObject({ from: "RUNNING", to: "PAUSED", by: "operator", at: 2000 });
    expect(result.task.updatedAt).toBe(2000);
  });

  it("returns a refusal rather than throwing for an illegal move", () => {
    const task = freshTask();
    const result = transition(task, { to: "REQUESTED", reason: "go back", by: "system", at: 2000 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("cannot go from RUNNING to REQUESTED");
  });
});

describe("task creation", () => {
  it("starts a task in RUNNING with a plan and no spend", () => {
    const task = freshTask();
    expect(task.status).toBe("RUNNING");
    expect(task.transitions.map((entry) => entry.to)).toEqual(["PLANNING", "RUNNING"]);
    expect(task.spend).toEqual({ steps: 0, toolCalls: 0, retries: 0, outputChars: 0, wallMs: 0 });
    expect(task.steps.length).toBeGreaterThan(0);
    expect(task.steps.every((step) => step.status === "pending")).toBe(true);
  });

  it("refuses an empty goal and an unimplemented level", () => {
    const empty = createTask({ workspaceId: "w1", goal: "   ", constraints: [], level: 1 });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.reason).toContain("needs a goal");

    const levelThree = createTask({ workspaceId: "w1", goal: "Do something", constraints: [], level: 3 as 2 });
    expect(levelThree.ok).toBe(false);
    if (!levelThree.ok) expect(levelThree.reason).toContain("not implemented");
  });

  it("gives a level 0 task no tools and no steps", () => {
    const result = createTask({ workspaceId: "w1", goal: "Explain what a coolant loop does", constraints: [], level: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task.grants).toEqual([]);
    expect(result.task.steps).toEqual([]);
    expect(result.task.plan.successCriteria.map((criterion) => criterion.id)).toContain("no-tool-calls");
  });
});
