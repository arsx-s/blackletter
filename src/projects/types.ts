/**
 * Long-horizon projects: types.
 *
 * Mission 11 is about work that outlives one task and one session without
 * handing the system autonomy it was never given. The vocabulary is deliberately
 * small and every rule below is a *refusal*, not a permission:
 *
 *   - a project holds goals, milestones, deliverables, dependencies, deadlines,
 *     acceptance criteria, budgets, explicit grants, checkpoints and a schedule
 *     that is **off until an operator turns it on**;
 *   - a milestone is executed by a Mission 9 task, and the project never runs one
 *     itself. It asks `src/tasks` to create one, and a task still passes the
 *     Mission 7 policy gateway for every step;
 *   - the project store holds no timer, no interval, no worker and no callback
 *     loop. "Scheduling" here means a recorded intent and a due calculation that
 *     the dashboard asks for; nothing starts on its own, and nothing survives the
 *     window being closed.
 *   - a grant is recorded per project and copied to a task *at creation*. A
 *     revoked grant never silently widens back, and a running task whose
 *     permission was revoked is paused rather than left to finish on authority
 *     the operator has taken back.
 */

import type { Permission } from "../tools/types";

export const PROJECTS_VERSION = 1;

/** Caps, all reported rather than silent. */
export const PROJECT_LIMITS = {
  projects: 12,
  milestones: 12,
  acceptanceCriteria: 6,
  events: 200,
  approvals: 24,
  appliedActions: 40,
  titleChars: 120,
  goalChars: 600,
  reasonChars: 240,
} as const;

/** A linked task that has not been touched for this long is flagged stale. */
export const STALE_TASK_MS = 30 * 60 * 1000;

/** Checkpoint approvals expire; an expired approval is not an approval. */
export const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

export const MIN_SCHEDULE_MINUTES = 15;
export const MAX_SCHEDULE_MINUTES = 24 * 60;
export const MAX_SCHEDULE_RUNS = 20;

/**
 * The dashboard's five words, plus the two states a milestone passes through on
 * its way to them. `pending` means "waiting for a dependency", `ready` means "a
 * task may be created for this now".
 */
export type MilestoneState =
  | "completed"
  | "pending"
  | "ready"
  | "in-progress"
  | "blocked"
  | "failed"
  | "approval-needed";

export const MILESTONE_STATE_ORDER: readonly MilestoneState[] = [
  "approval-needed",
  "blocked",
  "failed",
  "in-progress",
  "ready",
  "pending",
  "completed",
];

export interface ProjectGoal {
  text: string;
  /** Bumped on every change, so a task can record which version it planned against. */
  version: number;
  changedAt: number;
  /** What the goal replaced, kept so a changed goal is visible rather than erased. */
  previousText?: string;
}

export interface ProjectMilestone {
  id: string;
  title: string;
  /** What this milestone produces. Empty is allowed; a blank deliverable is not invented. */
  deliverable: string;
  acceptanceCriteria: string[];
  /** Milestone ids that must be `completed` before this one is ready. */
  dependsOn: string[];
  /** A human checkpoint: no dependent proceeds until an operator approves, and the approval expires. */
  checkpoint: boolean;
  dueAt?: number;
  /** The Mission 9 task executing this milestone, once one was created. */
  taskId?: string;
  /** The project goal version the task's plan was built against. */
  taskGoalVersion?: number;
  createdAt: number;
}

export interface ProjectBudget {
  /** A hard cap on tasks this project may create. */
  maxTasks: number;
  /** Arithmetic cap on the linked tasks' tool calls, checked before creating one. */
  maxToolCalls: number;
  /** Past this instant the project creates no new tasks. */
  deadlineAt?: number;
  /**
   * Budgets the pack names that this build cannot measure. They are declared so
   * the dashboard can say what is *not* enforced instead of showing a number.
   */
  unmeasured: readonly ["tokens", "currency"];
}

export interface ProjectGrant {
  permission: Permission;
  grantedAt: number;
  by: "operator";
}

export interface ProjectApproval {
  milestoneId: string;
  by: "operator";
  at: number;
  /** Set at approval time; after this instant the approval is void. */
  expiresAt: number;
  note: string;
}

export interface ProjectSchedule {
  /** Off until an operator turns it on, and off again when they say so. */
  enabled: boolean;
  everyMinutes: number;
  maxRuns: number;
  runsDone: number;
  lastRunAt?: number;
  enabledAt?: number;
  /** An operator confirmed the consequences; code cannot set this by accident. */
  acknowledged: boolean;
}

export interface NotificationChannel {
  id: string;
  enabled: boolean;
  /** Why a channel cannot be used at all, when it cannot. */
  unavailable?: string;
}

export type ProjectEventKind =
  | "created"
  | "goal-changed"
  | "milestone-added"
  | "task-created"
  | "task-linked"
  | "approval-recorded"
  | "approval-expired"
  | "checkpoint-blocked"
  | "grant-granted"
  | "grant-revoked"
  | "schedule-enabled"
  | "schedule-disabled"
  | "schedule-run"
  | "paused"
  | "resumed"
  | "cancelled"
  | "notification-changed"
  | "refused"
  | "stale-task";

export interface ProjectEvent {
  at: number;
  kind: ProjectEventKind;
  /** Already redacted: a stored event never contains a credential. */
  detail: string;
  by: "operator" | "system";
}

export interface Project {
  id: string;
  version: typeof PROJECTS_VERSION;
  workspaceId: string;
  title: string;
  goal: ProjectGoal;
  milestones: ProjectMilestone[];
  budget: ProjectBudget;
  grants: ProjectGrant[];
  approvals: ProjectApproval[];
  schedule: ProjectSchedule;
  notifications: NotificationChannel[];
  /** Idempotency keys already applied to this project, oldest first. */
  appliedActions: string[];
  events: ProjectEvent[];
  /** Events dropped by the cap, counted rather than hidden. */
  eventsDropped: number;
  createdAt: number;
  updatedAt: number;
}

export type ProjectRefusalCode =
  | "unknown-project"
  | "unknown-milestone"
  | "unknown-channel"
  | "invalid-input"
  | "dependency-incomplete"
  | "dependency-failed"
  | "checkpoint-missing"
  | "budget-exhausted"
  | "deadline-passed"
  | "duplicate-action"
  | "duplicate-task"
  | "goal-changed"
  | "schedule-not-enabled"
  | "schedule-not-due"
  | "schedule-needs-acknowledgement"
  | "schedule-exhausted"
  | "not-a-checkpoint";

export type ProjectActionResult<T> =
  | { ok: true; project: Project; value: T }
  /**
   * A refusal that changed nothing carries no project. A refusal that *recorded
   * itself* (a refusal event, a consumed idempotency key) carries the updated
   * project so the caller persists what happened.
   */
  | { ok: false; code: ProjectRefusalCode; reason: string; project?: Project };

export interface ProjectProgress {
  milestones: number;
  counts: Record<MilestoneState, number>;
  /** Linked tasks that have not been touched in a while and are not finished. */
  staleTaskIds: string[];
  /** Milestones whose task was planned against an older goal. */
  goalChangedMilestoneIds: string[];
  tasksCreated: number;
  toolCallsSpent: number;
  budgetRemaining: { tasks: number; toolCalls: number };
  deadlinePassed: boolean;
  scheduleDue: boolean;
}
