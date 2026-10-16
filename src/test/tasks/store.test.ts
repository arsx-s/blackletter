import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTask, type TaskRecord } from "../../tasks";
import {
  MAX_TASKS,
  clearTasks,
  droppedTaskCount,
  latestTaskFor,
  loadTasks,
  removeTask,
  resetTaskStoreForTests,
  saveTask,
  subscribeTasks,
  taskById,
  tasksFor,
} from "../../tasks/store";

/**
 * Persistence is what makes a task survive a restart, so it is tested against the
 * awkward cases: an interrupted task that must come back paused, a log written by
 * a version this build does not understand, and a corrupt entry that must be
 * reported rather than guessed at.
 */

const KEY = "tasks";

function makeTask(options: { id?: string; status?: TaskRecord["status"]; updatedAt?: number; workspaceId?: string } = {}): TaskRecord {
  const created = createTask({
    workspaceId: options.workspaceId ?? "w1",
    goal: "Summarise the coolant loop B incident",
    constraints: [],
    level: 1,
    now: () => 1000,
  });
  if (!created.ok) throw new Error(created.reason);
  return {
    ...created.task,
    ...(options.id ? { id: options.id } : {}),
    status: options.status ?? created.task.status,
    updatedAt: options.updatedAt ?? created.task.updatedAt,
  };
}

beforeEach(async () => {
  localStorage.clear();
  resetTaskStoreForTests();
  await clearTasks();
  localStorage.clear();
});

describe("task store", () => {
  it("saves a task, replaces it by id, and notifies subscribers", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeTasks(listener);

    const task = makeTask({ id: "t1" });
    saveTask(task);
    expect(tasksFor("w1")).toHaveLength(1);
    expect(tasksFor("w1")[0].id).toBe("t1");
    expect(taskById("t1")?.goal).toContain("coolant");
    expect(latestTaskFor("w1")?.id).toBe("t1");
    expect(latestTaskFor("w2")).toBeNull();

    const updated = { ...task, status: "PAUSED" as const, updatedAt: 5000 };
    saveTask(updated);
    expect(tasksFor("w1")).toHaveLength(1);
    expect(taskById("t1")?.status).toBe("PAUSED");

    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    saveTask({ ...task, updatedAt: 6000 });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("returns the saved record frozen, so history cannot be edited afterwards", () => {
    const saved = saveTask(makeTask({ id: "t1" }));
    expect(Object.isFrozen(saved)).toBe(true);
    expect(() => {
      (saved as { goal: string }).goal = "something else";
    }).toThrow();
    expect(taskById("t1")?.goal).toContain("coolant");
  });

  it("orders tasks newest first and drops the oldest finished work, never a live task", () => {
    for (let index = 0; index < MAX_TASKS + 5; index++) {
      saveTask(makeTask({ id: `done-${index}`, status: "COMPLETED", updatedAt: 1000 + index }));
    }
    expect(tasksFor()).toHaveLength(MAX_TASKS);
    expect(droppedTaskCount()).toBe(5);
    // The five oldest finished tasks are the ones that went.
    expect(taskById("done-0")).toBeNull();
    expect(taskById("done-4")).toBeNull();
    expect(taskById(`done-${MAX_TASKS + 4}`)).toBeTruthy();

    const before = droppedTaskCount();
    for (let index = 0; index < 3; index++) {
      saveTask(makeTask({ id: `live-${index}`, status: "RUNNING", updatedAt: 2000 + index }));
    }
    expect(tasksFor().filter((task) => task.status === "RUNNING")).toHaveLength(3);
    expect(tasksFor().length).toBeLessThanOrEqual(MAX_TASKS);
    expect(droppedTaskCount()).toBeGreaterThanOrEqual(before);
    expect(taskById("live-0")).toBeTruthy();
    expect(taskById("live-1")).toBeTruthy();
    expect(taskById("live-2")).toBeTruthy();
  });

  it("reloads a saved task and brings an interrupted one back paused", async () => {
    const settled = makeTask({ id: "settled", status: "COMPLETED", updatedAt: 900 });
    const interrupted = makeTask({ id: "interrupted", status: "RUNNING", updatedAt: 1000 });
    saveTask(settled);
    saveTask(interrupted);

    resetTaskStoreForTests();
    const report = await loadTasks();

    expect(report.loaded).toBe(2);
    expect(report.recovered).toBe(1);
    expect(report.rejected).toBe(0);
    expect(taskById("settled")?.status).toBe("COMPLETED");

    const recovered = taskById("interrupted");
    expect(recovered?.status).toBe("PAUSED");
    expect(recovered?.transitions[recovered.transitions.length - 1].reason).toContain("restarted");
    expect(recovered?.stop).toBeUndefined();
  });

  it("migrates a record written before plan revision existed", async () => {
    const legacy = JSON.parse(JSON.stringify(makeTask({ id: "old" }))) as Record<string, unknown>;
    delete legacy.revisions;
    localStorage.setItem(KEY, JSON.stringify({ version: 1, tasks: [legacy] }));

    const report = await loadTasks();
    expect(report.loaded).toBe(1);
    expect(report.rejected).toBe(0);
    expect(taskById("old")?.revisions).toEqual([]);
  });

  it("refuses a log written by another version instead of guessing at it", async () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 99, tasks: [makeTask({ id: "t1" })] }));

    const report = await loadTasks();
    expect(report.loaded).toBe(0);
    expect(report.rejected).toBe(1);
    expect(tasksFor()).toHaveLength(0);
  });

  it("keeps the valid records and reports the corrupt ones", async () => {
    const good = makeTask({ id: "good" });
    localStorage.setItem(KEY, JSON.stringify({ version: 1, tasks: [good, { id: "bad" }, 42, null] }));

    const report = await loadTasks();
    expect(report.loaded).toBe(1);
    expect(report.rejected).toBe(3);
    expect(taskById("good")).toBeTruthy();
    expect(taskById("bad")).toBeNull();
  });

  it("removes one task, and clears the whole log on request", async () => {
    saveTask(makeTask({ id: "t1" }));
    saveTask(makeTask({ id: "t2", updatedAt: 1100 }));

    removeTask("t1");
    expect(tasksFor()).toHaveLength(1);
    expect(taskById("t1")).toBeNull();

    await clearTasks();
    expect(tasksFor()).toHaveLength(0);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
