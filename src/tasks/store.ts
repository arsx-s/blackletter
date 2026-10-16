import { kvDelete, kvGet, kvPut } from "../lib/db";
import { isTerminal } from "./machine";
import { recoverInterruptedTask } from "./runner";
import { TASK_STATUSES, type AutonomyLevel, type TaskRecord } from "./types";

/**
 * Task persistence.
 *
 * A task that survives a restart is the point of the state machine, so the store
 * is deliberately small and conservative: a version tag, validated records, and
 * one rule that matters — **anything that was mid-flight when the app closed is
 * recovered as `PAUSED`**, with a reason. A task never resumes on its own, and an
 * interrupted task is never mistaken for a finished one.
 *
 * The cap drops the oldest *finished* work first; a live task is never silently
 * discarded to make room, because that would erase the record of what was asked.
 */

export const MAX_TASKS = 20;
export const TASKS_VERSION = 1;
const KEY = "tasks";

let tasks: TaskRecord[] = [];
let dropped = 0;
let loaded = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeTasks(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Newest first, optionally filtered to one workspace. */
export function tasksFor(workspaceId?: string): readonly TaskRecord[] {
  return workspaceId ? tasks.filter((task) => task.workspaceId === workspaceId) : tasks;
}

export function taskById(id: string): TaskRecord | null {
  return tasks.find((task) => task.id === id) ?? null;
}

export function latestTaskFor(workspaceId: string): TaskRecord | null {
  return tasks.find((task) => task.workspaceId === workspaceId) ?? null;
}

export function droppedTaskCount(): number {
  return dropped;
}

function persist(): void {
  void kvPut(KEY, { version: TASKS_VERSION, tasks }).catch(() => undefined);
}

function isLevel(value: unknown): value is AutonomyLevel {
  return value === 0 || value === 1 || value === 2;
}

/**
 * Bring a stored record up to the current shape.
 *
 * The only migration so far: `revisions` was added with plan revision, and a record
 * written before it exists is a record with no revisions — not a corrupt record.
 * Nothing is guessed at: a field that is present but the wrong type is left alone
 * and rejected by `isTaskRecord` below.
 */
function normalizeTask(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const task = value as Record<string, unknown>;
  if (task.version !== TASKS_VERSION) return value;
  if (task.revisions === undefined) return { ...task, revisions: [] };
  return value;
}

function isTaskRecord(value: unknown): value is TaskRecord {
  if (!value || typeof value !== "object") return false;
  const task = value as Partial<TaskRecord>;
  if (task.version !== TASKS_VERSION) return false;
  if (typeof task.id !== "string" || typeof task.workspaceId !== "string" || typeof task.goal !== "string") return false;
  if (!isLevel(task.level)) return false;
  if (typeof task.status !== "string" || !TASK_STATUSES.includes(task.status)) return false;
  if (!task.plan || typeof task.plan !== "object" || !Array.isArray(task.plan.steps) || !Array.isArray(task.plan.successCriteria)) return false;
  if (!Array.isArray(task.steps) || !Array.isArray(task.transitions)) return false;
  if (!task.budget || typeof task.budget !== "object" || !task.spend || typeof task.spend !== "object") return false;
  if (!Array.isArray(task.approvals) || !Array.isArray(task.grants) || !Array.isArray(task.failures) || !Array.isArray(task.refusals)) return false;
  if (!Array.isArray(task.revisions)) return false;
  return true;
}

/**
 * Upsert a task. The record is frozen on the way in, so a panel cannot edit a
 * task's history after the fact and still call it the history.
 */
export function saveTask(task: TaskRecord): TaskRecord {
  const frozen = Object.freeze({
    ...task,
    steps: Object.freeze(task.steps.map((step) => Object.freeze({ ...step, evidence: Object.freeze([...step.evidence]) }))),
    transitions: Object.freeze([...task.transitions]),
    approvals: Object.freeze([...task.approvals]),
    failures: Object.freeze([...task.failures]),
    refusals: Object.freeze([...task.refusals]),
    revisions: Object.freeze([...task.revisions]),
    grants: Object.freeze([...task.grants]),
  }) as TaskRecord;

  const existing = tasks.findIndex((candidate) => candidate.id === frozen.id);
  tasks = existing >= 0 ? tasks.map((candidate, index) => (index === existing ? frozen : candidate)) : [frozen, ...tasks];
  tasks.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));

  // Live work is never dropped to make room.
  const live = tasks.filter((task) => !isTerminal(task.status));
  const finished = tasks.filter((task) => isTerminal(task.status));
  const room = Math.max(0, MAX_TASKS - live.length);
  dropped += Math.max(0, finished.length - room);
  tasks = [...live, ...finished.slice(0, room)].sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));

  persist();
  notify();
  return frozen;
}

export function removeTask(id: string): void {
  const before = tasks.length;
  tasks = tasks.filter((task) => task.id !== id);
  if (tasks.length !== before) {
    persist();
    notify();
  }
}

function recoverAll(records: TaskRecord[]): { records: TaskRecord[]; recovered: number } {
  let recovered = 0;
  const at = Date.now();
  const next = records.map((task) => {
    const result = recoverInterruptedTask(task, at);
    if (result !== task) recovered += 1;
    return result;
  });
  return { records: next, recovered };
}

/** Load persisted tasks and recover anything that a restart interrupted. */
export async function loadTasks(): Promise<{ loaded: number; recovered: number; rejected: number }> {
  if (loaded) return { loaded: tasks.length, recovered: 0, rejected: 0 };
  loaded = true;

  const stored = await kvGet<unknown>(KEY);
  if (!stored || typeof stored !== "object") return { loaded: 0, recovered: 0, rejected: 0 };

  const record = stored as { version?: unknown; tasks?: unknown };
  if (record.version !== TASKS_VERSION || !Array.isArray(record.tasks)) {
    // A log written by another version is left alone rather than guessed at.
    return { loaded: 0, recovered: 0, rejected: Array.isArray(record.tasks) ? record.tasks.length : 0 };
  }

  const accepted = record.tasks.map(normalizeTask).filter(isTaskRecord);
  const rejected = record.tasks.length - accepted.length;
  const { records, recovered } = recoverAll(accepted);
  tasks = records.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  if (recovered > 0) persist();
  notify();
  return { loaded: tasks.length, recovered, rejected };
}

/**
 * Clear tasks, all of them or one workspace's. Removing a workspace's tasks
 * leaves other workspaces' records in the persisted payload intact.
 */
export async function clearTasks(workspaceId?: string): Promise<void> {
  if (!workspaceId) {
    tasks = [];
    dropped = 0;
    await kvDelete(KEY);
    notify();
    return;
  }
  const before = tasks.length;
  tasks = tasks.filter((task) => task.workspaceId !== workspaceId);
  if (tasks.length !== before) {
    persist();
    notify();
  }
}

/** Test seam: forget the in-memory state without touching persisted state. */
export function resetTaskStoreForTests(): void {
  tasks = [];
  dropped = 0;
  loaded = false;
}
