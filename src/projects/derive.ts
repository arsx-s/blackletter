/**
 * Derived views over a project.
 *
 * Everything in this module is a pure function of a stored project and the
 * tasks it links to. Nothing is cached into the project record, because a
 * milestone's state is a *conclusion* drawn from its task's state, and a cached
 * conclusion is how a dashboard starts lying after a restart.
 *
 * The five words the dashboard must show — completed, pending, blocked, failed,
 * approval-needed — are all here, and each state comes with the sentence that
 * explains it. A state without a reason would be a badge, and this build does
 * not ship badges.
 */

import type { TaskRecord } from "../tasks/types";
import {
  PROJECT_LIMITS,
  STALE_TASK_MS,
  type MilestoneState,
  type Project,
  type ProjectMilestone,
  type ProjectProgress,
} from "./types";

export type ApprovalStatus = "not-a-checkpoint" | "missing" | "approved" | "expired";

export type TaskLookup = (taskId: string) => TaskRecord | null;

const TERMINAL_TASK_STATUSES: readonly TaskRecord["status"][] = ["COMPLETED", "FAILED", "CANCELLED"];

export function isTerminalTask(task: TaskRecord): boolean {
  return TERMINAL_TASK_STATUSES.includes(task.status);
}

/**
 * Whether a checkpoint milestone currently has a live approval.
 *
 * An expired approval is not an approval: `expired` is a distinct answer from
 * `missing` so the dashboard can say *why* the checkpoint is open again.
 */
export function approvalStatus(project: Project, milestoneId: string, now: number): ApprovalStatus {
  const milestone = project.milestones.find((entry) => entry.id === milestoneId);
  if (!milestone || !milestone.checkpoint) return "not-a-checkpoint";
  const approvals = project.approvals.filter((entry) => entry.milestoneId === milestoneId);
  if (approvals.length === 0) return "missing";
  return approvals.some((entry) => entry.expiresAt > now) ? "approved" : "expired";
}

/** Recorded approvals for a milestone, newest first. Expired ones stay visible. */
export function approvalsFor(project: Project, milestoneId: string): Project["approvals"] {
  return project.approvals
    .filter((entry) => entry.milestoneId === milestoneId)
    .sort((a, b) => b.at - a.at);
}

export function milestoneById(project: Project, milestoneId: string): ProjectMilestone | null {
  return project.milestones.find((entry) => entry.id === milestoneId) ?? null;
}

/** Milestones whose task was planned against an older version of the goal. */
export function goalChangedMilestoneIds(project: Project): string[] {
  return project.milestones
    .filter((entry) => entry.taskId !== undefined && entry.taskGoalVersion !== undefined && entry.taskGoalVersion !== project.goal.version)
    .map((entry) => entry.id);
}

export interface MilestoneView {
  id: string;
  title: string;
  state: MilestoneState;
  /** One sentence saying why the state is what it is. */
  reason: string;
  approval: ApprovalStatus;
  taskId: string | null;
  taskStatus: TaskRecord["status"] | null;
  /** True when a non-terminal linked task has not been touched for a while. */
  stale: boolean;
  goalChanged: boolean;
  dependsOn: string[];
}

function viewFor(
  project: Project,
  milestone: ProjectMilestone,
  task: TaskRecord | null,
  byId: Map<string, MilestoneView>,
  now: number,
): MilestoneView {
  const stale = task !== null && !isTerminalTask(task) && now - task.updatedAt > STALE_TASK_MS;
  const goalChanged =
    milestone.taskId !== undefined && milestone.taskGoalVersion !== undefined && milestone.taskGoalVersion !== project.goal.version;
  const base = {
    id: milestone.id,
    title: milestone.title,
    approval: approvalStatus(project, milestone.id, now),
    taskId: milestone.taskId ?? null,
    taskStatus: task?.status ?? null,
    stale,
    goalChanged,
    dependsOn: [...milestone.dependsOn],
  };

  /* A linked task decides the state; the dependencies are already satisfied if it exists. */
  if (milestone.taskId !== undefined) {
    if (!task) {
      return { ...base, state: "blocked", reason: "Its task is no longer stored; create a new task or relink the milestone." };
    }
    switch (task.status) {
      case "COMPLETED":
        return { ...base, state: "completed", reason: "Its task reached COMPLETED after verification." };
      case "FAILED":
        return { ...base, state: "failed", reason: task.stop?.detail || "Its task failed." };
      case "CANCELLED":
        return { ...base, state: "failed", reason: "Its task was cancelled by the operator." };
      case "WAITING_FOR_APPROVAL":
        return { ...base, state: "approval-needed", reason: "Its task is waiting for an action approval." };
      case "NEEDS_OPERATOR":
        return { ...base, state: "blocked", reason: "Its task stopped and asked the operator." };
      case "PAUSED":
        return { ...base, state: "blocked", reason: "Its task is paused." };
      case "VERIFYING":
      case "RUNNING":
      case "PLANNING":
      case "REQUESTED":
      default:
        return { ...base, state: "in-progress", reason: `Its task is ${task.status.toLowerCase().replace(/_/g, " ")}.` };
    }
  }

  /* No task yet: dependencies, then the checkpoint, then readiness. */
  const dependencyStates = milestone.dependsOn.map((id) => byId.get(id) ?? null);
  const unknown = milestone.dependsOn.filter((id, index) => dependencyStates[index] === null);
  if (unknown.length > 0) {
    return { ...base, state: "blocked", reason: `A dependency (${unknown.join(", ")}) is not recorded any more.` };
  }
  const failedDependency = dependencyStates.find((entry) => entry?.state === "failed");
  if (failedDependency) {
    return { ...base, state: "blocked", reason: `Its dependency "${failedDependency.title}" failed.` };
  }
  const unfinished = dependencyStates.filter((entry) => entry !== null && entry.state !== "completed");
  if (unfinished.length > 0) {
    return {
      ...base,
      state: "pending",
      reason: `Waiting on ${unfinished.map((entry) => `"${entry?.title}"`).join(", ")}.`,
    };
  }
  if (milestone.checkpoint) {
    if (base.approval === "approved") {
      return { ...base, state: "ready", reason: "The checkpoint was approved and the approval is current." };
    }
    return {
      ...base,
      state: "approval-needed",
      reason:
        base.approval === "expired"
          ? "The checkpoint approval expired; a new approval is needed before this milestone can start."
          : "A human checkpoint: an operator must approve this milestone before a task is created for it.",
    };
  }
  return { ...base, state: "ready", reason: "Dependencies are complete; a task may be created for this milestone." };
}

/**
 * The view of every milestone, in plan order.
 *
 * Dependencies resolve in array order, which is creation order: a milestone can
 * only depend on milestones that already existed when it was added (the action
 * layer enforces that), so one pass is enough.
 */
export function milestoneViews(project: Project, taskById: TaskLookup, now: number): MilestoneView[] {
  const byId = new Map<string, MilestoneView>();
  const views: MilestoneView[] = [];
  for (const milestone of project.milestones) {
    const task = milestone.taskId !== undefined ? taskById(milestone.taskId) : null;
    const view = viewFor(project, milestone, task, byId, now);
    byId.set(milestone.id, view);
    views.push(view);
  }
  return views;
}

/** A dependency check for the action layer, with the refusal code it should use. */
export function dependenciesReady(
  project: Project,
  milestoneId: string,
  taskById: TaskLookup,
  now: number,
): { ok: true } | { ok: false; code: "dependency-incomplete" | "dependency-failed"; reason: string } {
  const milestone = milestoneById(project, milestoneId);
  if (!milestone) return { ok: false, code: "dependency-incomplete", reason: `No milestone ${milestoneId}.` };
  for (const id of milestone.dependsOn) {
    const dep = milestoneById(project, id);
    if (!dep) return { ok: false, code: "dependency-incomplete", reason: `Dependency ${id} is not recorded.` };
    const view = viewFor(project, dep, dep.taskId !== undefined ? taskById(dep.taskId) : null, new Map(), now);
    if (view.state === "failed") {
      return { ok: false, code: "dependency-failed", reason: `"${dep.title}" failed; it must be resolved before this milestone starts.` };
    }
    if (view.state !== "completed") {
      return { ok: false, code: "dependency-incomplete", reason: `"${dep.title}" is ${view.state}, not completed.` };
    }
  }
  return { ok: true };
}

/** Sum of the tool calls every linked task has spent, from the tasks themselves. */
export function toolCallsSpent(project: Project, taskById: TaskLookup): number {
  let total = 0;
  for (const milestone of project.milestones) {
    if (milestone.taskId === undefined) continue;
    const task = taskById(milestone.taskId);
    if (task) total += task.spend.toolCalls;
  }
  return total;
}

/** Whether the recorded schedule has come due. Pulled, never pushed. */
export function scheduleDue(project: Project, now: number): boolean {
  const { enabled, everyMinutes, maxRuns, runsDone, lastRunAt } = project.schedule;
  if (!enabled) return false;
  if (runsDone >= maxRuns) return false;
  if (lastRunAt === undefined) return true;
  return now - lastRunAt >= everyMinutes * 60_000;
}

export function projectProgress(project: Project, taskById: TaskLookup, now: number): ProjectProgress {
  const views = milestoneViews(project, taskById, now);
  const counts = {
    completed: 0,
    pending: 0,
    ready: 0,
    "in-progress": 0,
    blocked: 0,
    failed: 0,
    "approval-needed": 0,
  } satisfies Record<MilestoneState, number>;
  for (const view of views) counts[view.state] += 1;

  const spent = toolCallsSpent(project, taskById);
  const tasksCreated = project.milestones.filter((entry) => entry.taskId !== undefined).length;
  const deadlinePassed = project.budget.deadlineAt !== undefined && now > project.budget.deadlineAt;

  return {
    milestones: project.milestones.length,
    counts,
    staleTaskIds: views.filter((view) => view.stale).map((view) => view.taskId as string),
    goalChangedMilestoneIds: goalChangedMilestoneIds(project),
    tasksCreated,
    toolCallsSpent: spent,
    budgetRemaining: {
      tasks: Math.max(0, project.budget.maxTasks - tasksCreated),
      toolCalls: Math.max(0, project.budget.maxToolCalls - spent),
    },
    deadlinePassed,
    scheduleDue: scheduleDue(project, now),
  };
}

/**
 * Milestones named in text that is about to be stored or shown: a helper for the
 * panel, so a state filter and the text it labels come from the same function.
 */
export function statesForIds(views: readonly MilestoneView[], ids: readonly string[]): MilestoneState[] {
  const byId = new Map(views.map((view) => [view.id, view.state]));
  return ids.map((id) => byId.get(id) ?? "pending");
}

/** The bound the panel uses to keep a milestone title readable. */
export const MILESTONE_TITLE_CHARS = PROJECT_LIMITS.titleChars;
