import { beforeEach, describe, expect, it } from "vitest";
import { createTask, type TaskRecord } from "../../tasks";
import { clearTasks, loadTasks, resetTaskStoreForTests, saveTask, taskById } from "../../tasks/store";
import {
  currentStopState,
  emergencyStop,
  isStopEngaged,
  lastStopReport,
  releaseEmergencyStop,
  resetControlForTests,
  revokeTaskAccess,
  revokeTaskGrants,
} from "../../control";

/**
 * The operator's stop as an action: the switch, the tasks, and the grants.
 *
 * The three claims under test are the ones the pack names — the stop cancels
 * current work, prevents new execution, and revokes task-scoped access — plus the
 * one it would be easy to get wrong: releasing the stop must not undo any of them
 * by itself.
 */

function makeTask(options: { id: string; status?: TaskRecord["status"]; grants?: TaskRecord["grants"] }): TaskRecord {
  const created = createTask({
    workspaceId: "w1",
    goal: "Summarise the coolant loop B incident",
    constraints: ["read-only"],
    level: 1,
    grants: options.grants ?? ["workspace:read"],
    now: () => 1000,
  });
  if (!created.ok) throw new Error(created.reason);
  return { ...created.task, id: options.id, status: options.status ?? "RUNNING", updatedAt: 1000 };
}

beforeEach(async () => {
  localStorage.clear();
  resetControlForTests();
  resetTaskStoreForTests();
  await clearTasks();
  await loadTasks();
  localStorage.clear();
});

describe("the operator's stop", () => {
  it("pauses every live task and clears its grants, and leaves finished work untouched", async () => {
    saveTask(makeTask({ id: "running", status: "RUNNING" }));
    saveTask(makeTask({ id: "paused", status: "PAUSED" }));
    saveTask(makeTask({ id: "done", status: "COMPLETED" }));
    await loadTasks();

    const report = emergencyStop({ reason: "drill", at: 5000 });

    expect(report.state.engaged).toBe(true);
    expect(report.pausedTaskIds).toEqual(["running"]);
    expect(report.revokedTaskIds.sort()).toEqual(["paused", "running"]);
    expect(report.refused).toEqual([]);
    expect(lastStopReport()).toBe(report);

    const running = taskById("running");
    expect(running?.status).toBe("PAUSED");
    expect(running?.grants).toEqual([]);
    // The pause is a machine transition, recorded like any other.
    expect(running?.transitions.at(-2)).toMatchObject({
      from: "RUNNING",
      to: "PAUSED",
      by: "operator",
      reason: "the global stop was engaged",
    });
    // Clearing the grants is recorded as a same-state entry, not a silent edit.
    expect(running?.transitions.at(-1)).toMatchObject({
      from: "PAUSED",
      to: "PAUSED",
      by: "operator",
      reason: "the global stop revoked this task's grants",
    });

    const paused = taskById("paused");
    expect(paused?.status, "a task that was already paused is not paused again").toBe("PAUSED");
    expect(paused?.grants).toEqual([]);

    const done = taskById("done");
    expect(done?.status).toBe("COMPLETED");
    expect(done?.grants, "terminal work is history and is never edited").toEqual(["workspace:read"]);

    expect(currentStopState().engaged).toBe(true);
    expect(isStopEngaged()).toBe(true);
  });

  it("skips terminal work entirely: not paused, not revoked, not reported", async () => {
    saveTask(makeTask({ id: "running", status: "RUNNING" }));
    saveTask(makeTask({ id: "cancelled", status: "CANCELLED" }));
    await loadTasks();

    const report = emergencyStop({ reason: "drill", at: 5000 });

    expect(report.pausedTaskIds).toEqual(["running"]);
    expect(report.revokedTaskIds).toEqual(["running"]);
    // The `refused` list exists for a pause the machine rejects; every non-terminal
    // status has a PAUSED edge, so it stays empty — but a terminal task is not the
    // thing it is for, and must not appear in it either.
    expect(report.refused).toEqual([]);
    const cancelled = taskById("cancelled");
    expect(cancelled?.grants, "a cancelled task keeps the record it finished with").toEqual(["workspace:read"]);
  });

  it("clears the grants of one task without stopping the rest", async () => {
    saveTask(makeTask({ id: "first" }));
    saveTask(makeTask({ id: "second" }));
    await loadTasks();

    const revoked = revokeTaskAccess("first", 6000);

    expect(revoked?.grants).toEqual([]);
    expect(taskById("second")?.grants).toEqual(["workspace:read"]);
    expect(isStopEngaged(), "revoking one task's access is not a stop").toBe(false);
    expect(taskById("first")?.transitions.at(-1)?.reason).toContain("revoked this task's grants");

    expect(revokeTaskAccess("missing")).toBeNull();
    // Revoking again is a no-op rather than a second history entry.
    const again = revokeTaskAccess("first", 7000);
    expect(again?.transitions).toHaveLength(revoked?.transitions.length ?? 0);
  });

  it("is pure about the record it would store", () => {
    const task = makeTask({ id: "solo" });
    const revoked = revokeTaskGrants(task, 5000);
    expect(task.grants, "the input record is not mutated").toEqual(["workspace:read"]);
    expect(revoked.grants).toEqual([]);
    expect(revokeTaskGrants(revoked, 5000)).toBe(revoked);
  });

  it("does not resume anything when it is released", async () => {
    saveTask(makeTask({ id: "running" }));
    await loadTasks();

    emergencyStop({ reason: "drill", at: 5000 });
    const released = releaseEmergencyStop(6000);

    expect(released.engaged).toBe(false);
    expect(released.releasedAt).toBe(6000);
    expect(isStopEngaged()).toBe(false);
    const task = taskById("running");
    expect(task?.status, "releasing the stop is not a resume").toBe("PAUSED");
    expect(task?.grants, "releasing the stop is not a re-grant").toEqual([]);
  });
});
