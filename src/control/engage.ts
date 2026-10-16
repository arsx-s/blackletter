/**
 * Engaging and releasing the stop, and revoking task-scoped access.
 *
 * `stop.ts` holds the switch; this module is the operator's *action*: the thing
 * the button calls. Engaging does three things, in one order, so that a report
 * can name exactly what happened:
 *
 *   1. engages the switch (which aborts every registered in-flight operation);
 *   2. pauses every live task — the task machine's own `pauseTask`, so the
 *      transition is recorded like any other pause;
 *   3. clears the paused tasks' grants, so that even if one were resumed it would
 *      hold no authority. The change is written as a same-state transition entry
 *      with the reason, because a silent edit to a task record would be a lie of
 *      omission.
 *
 * Releasing does **one** thing: it releases the switch. It does not resume a
 * task, re-grant a permission or restart an aborted request — those are separate
 * operator decisions, made where their evidence is (the Tasks panel and the
 * projects board), and a stop that un-stopped itself would be a worse control
 * than no stop at all.
 */

import { isTerminal } from "../tasks/machine";
import { pauseTask } from "../tasks/runner";
import { saveTask, taskById, tasksFor } from "../tasks/store";
import type { TaskRecord } from "../tasks/types";
import { engageStop, releaseStop, resetStopForTests, stopState, type EngageResult } from "./stop";
import type { StopReport, StopState } from "./types";

export interface EmergencyStopOptions {
  reason?: string;
  by?: "operator" | "system";
  at?: number;
}

/**
 * The most recent stop, for the panel to show. Not persisted: what survives a
 * restart is not this report but its *effects* — the tasks are paused, their
 * grants are empty, and the transition entries say why.
 */
let lastReport: StopReport | null = null;

export function lastStopReport(): StopReport | null {
  return lastReport;
}

/**
 * Clear a task's grants, recording why. Pure: it returns the record it would
 * store, so a test can inspect it without a store.
 */
export function revokeTaskGrants(task: TaskRecord, at: number, reason = "the global stop revoked this task's grants"): TaskRecord {
  if (task.grants.length === 0) return task;
  return {
    ...task,
    grants: [],
    updatedAt: at,
    transitions: [...task.transitions, { from: task.status, to: task.status, reason, by: "operator", at }],
  };
}

/** Revoke one task's grants in place, returning what was stored. */
export function revokeTaskAccess(taskId: string, at = Date.now()): TaskRecord | null {
  const task = taskById(taskId);
  if (!task) return null;
  const revoked = revokeTaskGrants(task, at, "the operator revoked this task's grants from the control plane");
  if (revoked === task) return task;
  return saveTask(revoked);
}

/** The operator's stop: switch, tasks, grants, in that order. */
export function emergencyStop(options: EmergencyStopOptions = {}): StopReport {
  const at = options.at ?? Date.now();
  const engaged: EngageResult = engageStop({
    reason: options.reason ?? "the operator stopped all work",
    by: options.by ?? "operator",
    at,
  });

  const pausedTaskIds: string[] = [];
  const revokedTaskIds: string[] = [];
  const refused: Array<{ taskId: string; reason: string }> = [];

  for (const task of tasksFor()) {
    if (isTerminal(task.status)) continue;
    if (task.status === "PAUSED") {
      // Already paused: the machine has no PAUSED-to-PAUSED edge, and it does not
      // need one. The stop's remaining duty to this task is its grants.
      const revoked = revokeTaskGrants(task, at);
      if (revoked !== task) {
        saveTask(revoked);
        revokedTaskIds.push(task.id);
      }
      continue;
    }
    const paused = pauseTask(task, { reason: "the global stop was engaged", at });
    if (!paused.ok) {
      refused.push({ taskId: task.id, reason: paused.reason });
      continue;
    }
    const revoked = revokeTaskGrants(paused.task, at);
    saveTask(revoked);
    pausedTaskIds.push(task.id);
    if (revoked !== paused.task) revokedTaskIds.push(task.id);
  }

  lastReport = {
    state: engaged.state,
    pausedTaskIds,
    revokedTaskIds,
    refused,
    abortedInFlight: engaged.abortedInFlight,
  };
  return lastReport;
}

/** Release the switch. Deliberately does nothing else; see the module comment. */
export function releaseEmergencyStop(at = Date.now()): StopState {
  return releaseStop({ at });
}

export function currentStopState(): StopState {
  return stopState();
}

/** Test seam: clear the stop's state and the last report together. */
export function resetControlForTests(): void {
  resetStopForTests();
  lastReport = null;
}
