import { TERMINAL_STATUSES, type TaskRecord, type TaskStatus, type TransitionBy } from "./types";

/**
 * The state machine. This is the only module that changes a task's status, and
 * the transition table is the whole policy: nothing else in the app may write
 * `status` on a task.
 *
 * Two entries in the table are load-bearing:
 *
 *   - **`COMPLETED` is reachable only from `VERIFYING`.** A run that is "done" but
 *     unverified cannot be completed by any caller, including a model, because the
 *     only edge into `COMPLETED` comes from the state that verification produces.
 *   - **Terminal states have no outgoing edges.** A completed, failed or cancelled
 *     task is immutable; changing it would rewrite history.
 */

export const ALLOWED_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  REQUESTED: ["PLANNING", "PAUSED", "CANCELLED", "FAILED"],
  PLANNING: ["RUNNING", "WAITING_FOR_APPROVAL", "PAUSED", "NEEDS_OPERATOR", "CANCELLED", "FAILED"],
  WAITING_FOR_APPROVAL: ["RUNNING", "PAUSED", "NEEDS_OPERATOR", "CANCELLED", "FAILED"],
  RUNNING: ["VERIFYING", "WAITING_FOR_APPROVAL", "PAUSED", "NEEDS_OPERATOR", "CANCELLED", "FAILED"],
  VERIFYING: ["COMPLETED", "FAILED", "NEEDS_OPERATOR", "PAUSED", "CANCELLED"],
  PAUSED: ["RUNNING", "WAITING_FOR_APPROVAL", "NEEDS_OPERATOR", "CANCELLED", "FAILED"],
  NEEDS_OPERATOR: ["RUNNING", "PAUSED", "CANCELLED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export function isTerminal(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return false;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export interface TransitionRequest {
  to: TaskStatus;
  reason: string;
  by: TransitionBy;
  at: number;
  /** Fields to set on the new record, applied atomically with the transition. */
  patch?: Partial<TaskRecord>;
}

export type TransitionResult = { ok: true; task: TaskRecord } | { ok: false; reason: string };

/**
 * Apply one transition. Refusals are returned, not thrown, because a refused
 * transition is an ordinary event (a stale UI button, a task that finished while
 * the operator was looking at it) that the caller must report rather than crash on.
 */
export function transition(task: TaskRecord, request: TransitionRequest): TransitionResult {
  if (!canTransition(task.status, request.to)) {
    return {
      ok: false,
      reason: isTerminal(task.status)
        ? `this task is ${task.status.toLowerCase()} and cannot change again`
        : `a task cannot go from ${task.status} to ${request.to}`,
    };
  }

  const from = task.status;
  const next: TaskRecord = {
    ...task,
    ...(request.patch ?? {}),
    status: request.to,
    updatedAt: request.at,
    transitions: [
      ...task.transitions,
      { at: request.at, from, to: request.to, reason: request.reason, by: request.by },
    ],
  };

  return { ok: true, task: Object.freeze(next) };
}

/** A short human summary of where a task is, for the panel header. */
export function describeStatus(task: TaskRecord): string {
  if (task.stop) return `${task.status} · ${task.stop.reason}`;
  return task.status;
}
