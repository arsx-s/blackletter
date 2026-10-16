/**
 * Project actions: the operator's verbs, and what each of them refuses.
 *
 * Every function here is a *pure transform* of a stored project — exceptions are
 * the functions that act on linked tasks (`pause`, `resume`, `cancel`, revoke,
 * and task creation), which do so through an injected `ProjectTaskPort`. That
 * port is the only way this module can touch the task machine, and the panel
 * passes the live implementation in; tests pass a recording fake.
 *
 * Four rules hold across the whole file:
 *
 *   1. **Idempotency.** A creation or a schedule change carries a key; applying
 *      the same key twice is refused with `duplicate-action` and changes nothing.
 *      The caller may retry as often as it likes.
 *   2. **No widening.** A task created for a milestone receives exactly the
 *      project's grants — never a default, never one the operator removed. A
 *      revoked grant pauses the tasks that held it.
 *   3. **Budgets stop work, and the deadline stops creation.** Both checks run
 *      before a task exists, not after it has run.
 *   4. **Nothing is scheduled by being configured.** Enabling a schedule records
 *      an intent and needs an explicit acknowledgement; the module contains no
 *      timer, no interval, and no call to `Date.now` other than as a default.
 */

import { fnv1a32 } from "../lib/hash";
import { redactSecrets, storedText } from "../lib/redact";
import type {
  ApprovalResult,
  CreateTaskRequest,
  CreateTaskResult,
  TaskRecord,
} from "../tasks";
import { cancelTask, createTask, pauseTask, resumeTask, saveTask, taskById } from "../tasks";
import type { Permission } from "../tools/types";
import { approvalStatus, dependenciesReady, isTerminalTask, toolCallsSpent } from "./derive";
import {
  APPROVAL_TTL_MS,
  MAX_SCHEDULE_MINUTES,
  MAX_SCHEDULE_RUNS,
  MIN_SCHEDULE_MINUTES,
  PROJECT_LIMITS,
  PROJECTS_VERSION,
  type NotificationChannel,
  type Project,
  type ProjectActionResult,
  type ProjectBudget,
  type ProjectEventKind,
  type ProjectGrant,
  type ProjectMilestone,
  type ProjectRefusalCode,
  type ProjectSchedule,
} from "./types";

/* ------------------------------------------------------------------- port */

export interface ProjectTaskPort {
  create: (request: CreateTaskRequest) => CreateTaskResult;
  save: (task: TaskRecord) => TaskRecord;
  pause: (task: TaskRecord, options?: { reason?: string; at?: number }) => ApprovalResult;
  resume: (task: TaskRecord, options?: { at?: number }) => ApprovalResult;
  cancel: (task: TaskRecord, options?: { reason?: string; at?: number }) => ApprovalResult;
  byId: (id: string) => TaskRecord | null;
}

/** The live port: the Mission 9 task machine, as-is. */
export const liveTaskPort: ProjectTaskPort = {
  create: createTask,
  save: saveTask,
  pause: pauseTask,
  resume: resumeTask,
  cancel: cancelTask,
  byId: taskById,
};

export interface ProjectActionContext {
  port?: ProjectTaskPort;
}

function portOf(context: ProjectActionContext | undefined): ProjectTaskPort {
  return context?.port ?? liveTaskPort;
}

/* ---------------------------------------------------------------- helpers */

function refuse(code: ProjectRefusalCode, reason: string, project?: Project): ProjectActionResult<never> {
  return project ? { ok: false, code, reason, project } : { ok: false, code, reason };
}

function touch(project: Project, at: number): Project {
  return { ...project, updatedAt: at };
}

function appendEvent(project: Project, kind: ProjectEventKind, detail: string, by: "operator" | "system", at: number): Project {
  const { text } = redactSecrets(detail);
  const events = [...project.events, { at, kind, detail: text, by }];
  const overflow = Math.max(0, events.length - PROJECT_LIMITS.events);
  return {
    ...touch(project, at),
    events: overflow > 0 ? events.slice(overflow) : events,
    eventsDropped: project.eventsDropped + overflow,
  };
}

/**
 * Idempotency, split in two so a refusal never spends the key.
 *
 * `isApplied` answers whether this action already succeeded. `consume` records
 * the key, and is called only on the success path: an attempt that was refused
 * changed nothing, so retrying it — with the same key or a new one — must not be
 * treated as a duplicate of work that never happened.
 */
function isApplied(project: Project, key: string): boolean {
  return project.appliedActions.includes(key);
}

function consume(project: Project, key: string): Project {
  return { ...project, appliedActions: [...project.appliedActions, key].slice(-PROJECT_LIMITS.appliedActions) };
}

export function defaultBudget(overrides: Partial<ProjectBudget> = {}): ProjectBudget {
  return {
    maxTasks: overrides.maxTasks ?? 6,
    maxToolCalls: overrides.maxToolCalls ?? 40,
    deadlineAt: overrides.deadlineAt,
    unmeasured: ["tokens", "currency"],
  };
}

export function defaultSchedule(): ProjectSchedule {
  return {
    enabled: false,
    everyMinutes: 60,
    maxRuns: 4,
    runsDone: 0,
    acknowledged: false,
  };
}

export function defaultNotifications(): NotificationChannel[] {
  return [
    { id: "in-app", enabled: false },
    {
      id: "webhook",
      enabled: false,
      unavailable: "This build has no outbound notification transport, and adding one needs its own configuration and approval.",
    },
    {
      id: "email",
      enabled: false,
      unavailable: "This build has no mail transport; the channel exists so the setting is visible, not so it can be switched on.",
    },
  ];
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/* --------------------------------------------------------- create project */

export interface NewMilestoneInput {
  title: string;
  deliverable?: string;
  acceptanceCriteria?: string[];
  dependsOn?: string[];
  checkpoint?: boolean;
  dueAt?: number;
  /** Caller-supplied id, for tests; otherwise derived from the title and time. */
  id?: string;
}

export interface CreateProjectInput {
  workspaceId: string;
  title: string;
  goal: string;
  milestones?: NewMilestoneInput[];
  budget?: Partial<ProjectBudget>;
  at?: number;
}

function buildMilestone(projectId: string, input: NewMilestoneInput, index: number, at: number, knownIds: Set<string>): ProjectMilestone | string {
  const title = storedText(input.title, PROJECT_LIMITS.titleChars).text;
  if (!title) return "a milestone needs a title";
  const dependsOn = (input.dependsOn ?? []).filter((id) => id !== "");
  for (const id of dependsOn) {
    if (!knownIds.has(id)) return `milestone "${title}" depends on ${id}, which is not in this project`;
  }
  const acceptanceCriteria = (input.acceptanceCriteria ?? [])
    .map((criterion) => storedText(criterion, 200).text)
    .filter((criterion) => criterion.length > 0)
    .slice(0, PROJECT_LIMITS.acceptanceCriteria);
  const deliverable = storedText(input.deliverable ?? "", 240).text;
  const id = input.id ?? `ms-${fnv1a32(`${projectId}|${title}|${index}|${at}`)}`;
  const milestone: ProjectMilestone = {
    id,
    title,
    deliverable,
    acceptanceCriteria,
    dependsOn,
    checkpoint: input.checkpoint === true,
    dueAt: input.dueAt,
    createdAt: at,
  };
  knownIds.add(id);
  return milestone;
}

export function createProject(input: CreateProjectInput): ProjectActionResult<Project> {
  const at = input.at ?? Date.now();
  const title = storedText(input.title, PROJECT_LIMITS.titleChars).text;
  const goal = storedText(input.goal, PROJECT_LIMITS.goalChars).text;
  if (!title) return refuse("invalid-input", "a project needs a title");
  if (!goal) return refuse("invalid-input", "a project needs a goal; a project without one has nothing to check work against");
  if (!input.workspaceId) return refuse("invalid-input", "a project belongs to a workspace");

  const id = `proj-${fnv1a32(`${input.workspaceId}|${title}|${goal.slice(0, 80)}|${at}`)}`;
  const requested = input.milestones ?? [];
  if (requested.length > PROJECT_LIMITS.milestones) {
    return refuse("invalid-input", `this build stores at most ${PROJECT_LIMITS.milestones} milestones per project`);
  }

  const knownIds = new Set<string>();
  const milestones: ProjectMilestone[] = [];
  for (let index = 0; index < requested.length; index += 1) {
    const built = buildMilestone(id, requested[index], index, at, knownIds);
    if (typeof built === "string") return refuse("invalid-input", built);
    milestones.push(built);
  }

  const budgetInput = input.budget ?? {};
  const budget = defaultBudget({
    ...budgetInput,
    maxTasks: budgetInput.maxTasks !== undefined ? clampInt(budgetInput.maxTasks, 1, 24) : undefined,
    maxToolCalls: budgetInput.maxToolCalls !== undefined ? clampInt(budgetInput.maxToolCalls, 0, 200) : undefined,
  });

  let project: Project = {
    id,
    version: PROJECTS_VERSION,
    workspaceId: input.workspaceId,
    title,
    goal: { text: goal, version: 1, changedAt: at },
    milestones,
    budget,
    grants: [],
    approvals: [],
    schedule: defaultSchedule(),
    notifications: defaultNotifications(),
    appliedActions: [],
    events: [],
    eventsDropped: 0,
    createdAt: at,
    updatedAt: at,
  };
  project = appendEvent(
    project,
    "created",
    `Project created with ${milestones.length} milestone(s), budget ${budget.maxTasks} task(s) / ${budget.maxToolCalls} tool call(s).`,
    "operator",
    at,
  );
  return { ok: true, project, value: project };
}

/* -------------------------------------------------------------- milestones */

export function addMilestone(
  project: Project,
  input: NewMilestoneInput,
  context: { at?: number; actionKey?: string } = {},
): ProjectActionResult<ProjectMilestone> {
  const at = context.at ?? Date.now();
  if (project.milestones.length >= PROJECT_LIMITS.milestones) {
    return refuse("invalid-input", `this build stores at most ${PROJECT_LIMITS.milestones} milestones per project`);
  }
  if (context.actionKey && isApplied(project, context.actionKey)) {
    return refuse("duplicate-action", `action ${context.actionKey} was already applied`);
  }
  const knownIds = new Set(project.milestones.map((entry) => entry.id));
  const built = buildMilestone(project.id, input, project.milestones.length, at, knownIds);
  if (typeof built === "string") return refuse("invalid-input", built);
  let next = { ...project, milestones: [...project.milestones, built] };
  if (context.actionKey) next = consume(next, context.actionKey);
  next = appendEvent(next, "milestone-added", `Added milestone "${built.title}"${built.checkpoint ? " (human checkpoint)" : ""}.`, "operator", at);
  return { ok: true, project: next, value: built };
}

/* -------------------------------------------------------------------- goal */

export function updateGoal(
  project: Project,
  input: { text: string; note?: string },
  context: { at?: number } = {},
): ProjectActionResult<{ changed: boolean; version: number }> {
  const at = context.at ?? Date.now();
  const text = storedText(input.text, PROJECT_LIMITS.goalChars).text;
  if (!text) return refuse("invalid-input", "the goal cannot be emptied; if the work is no longer wanted, cancel the project");
  if (text === project.goal.text) {
    return { ok: true, project, value: { changed: false, version: project.goal.version } };
  }
  const version = project.goal.version + 1;
  let next: Project = {
    ...touch(project, at),
    goal: { text, version, changedAt: at, previousText: project.goal.text },
  };
  const affected = next.milestones.filter(
    (entry) => entry.taskId !== undefined && entry.taskGoalVersion !== undefined && entry.taskGoalVersion !== project.goal.version,
  );
  const note = input.note ? ` Note: ${storedText(input.note, PROJECT_LIMITS.reasonChars).text}` : "";
  next = appendEvent(
    next,
    "goal-changed",
    `Goal is now version ${version}.${affected.length > 0 ? ` ${affected.length} milestone task(s) were planned against an older goal and will not resume; re-create their tasks.` : ""}${note}`,
    "operator",
    at,
  );
  return { ok: true, project: next, value: { changed: true, version } };
}

/* ------------------------------------------------------------------ grants */

export function grantPermission(
  project: Project,
  input: { permission: Permission },
  context: { at?: number } = {},
): ProjectActionResult<{ granted: boolean }> {
  const at = context.at ?? Date.now();
  if (project.grants.some((entry) => entry.permission === input.permission)) {
    return { ok: true, project, value: { granted: false } };
  }
  const grant: ProjectGrant = { permission: input.permission, grantedAt: at, by: "operator" };
  let next = { ...touch(project, at), grants: [...project.grants, grant] };
  next = appendEvent(next, "grant-granted", `Granted ${input.permission} to this project. Tasks created from now on inherit it.`, "operator", at);
  return { ok: true, project: next, value: { granted: true } };
}

/**
 * Revoking a grant is not just a record: a task that holds the revoked
 * permission is paused, because it would otherwise keep running on authority the
 * operator has taken back.
 */
export function revokeGrant(
  project: Project,
  input: { permission: Permission; reason?: string },
  context: { at?: number } & ProjectActionContext = {},
): ProjectActionResult<{ revoked: boolean; pausedTaskIds: string[]; failed: Array<{ taskId: string; reason: string }> }> {
  const at = context.at ?? Date.now();
  const port = portOf(context);
  if (!project.grants.some((entry) => entry.permission === input.permission)) {
    return { ok: true, project, value: { revoked: false, pausedTaskIds: [], failed: [] } };
  }
  const reason = input.reason ?? `the project grant ${input.permission} was revoked`;
  const pausedTaskIds: string[] = [];
  const failed: Array<{ taskId: string; reason: string }> = [];
  for (const milestone of project.milestones) {
    if (milestone.taskId === undefined) continue;
    const task = port.byId(milestone.taskId);
    if (!task || isTerminalTask(task) || !task.grants.includes(input.permission)) continue;
    const paused = port.pause(task, { reason, at });
    if (paused.ok) {
      port.save(paused.task);
      pausedTaskIds.push(task.id);
    } else {
      failed.push({ taskId: task.id, reason: paused.reason });
    }
  }
  let next = { ...touch(project, at), grants: project.grants.filter((entry) => entry.permission !== input.permission) };
  next = appendEvent(
    next,
    "grant-revoked",
    `Revoked ${input.permission}.${pausedTaskIds.length > 0 ? ` Paused ${pausedTaskIds.length} task(s) that held it.` : ""}${failed.length > 0 ? ` ${failed.length} task(s) could not be paused and need a look.` : ""}`,
    "operator",
    at,
  );
  return { ok: true, project: next, value: { revoked: true, pausedTaskIds, failed } };
}

/* ------------------------------------------------------------------- tasks */

export interface CreateTaskForMilestoneInput {
  milestoneId: string;
  level: CreateTaskRequest["level"];
  /** Required: retrying the same request is refused rather than creating a second task. */
  actionKey: string;
  constraints?: string[];
  at?: number;
}

export function createTaskForMilestone(
  project: Project,
  input: CreateTaskForMilestoneInput,
  context: ProjectActionContext = {},
): ProjectActionResult<{ task: TaskRecord; replannedFromGoalVersion?: number }> {
  const at = input.at ?? Date.now();
  const port = portOf(context);
  const milestone = project.milestones.find((entry) => entry.id === input.milestoneId);
  if (!milestone) return refuse("unknown-milestone", `no milestone ${input.milestoneId} in this project`);

  /* A successful attempt is applied once. A refused one spends nothing. */
  if (isApplied(project, input.actionKey)) {
    return refuse("duplicate-action", `action ${input.actionKey} was already applied; the task it created is already linked`);
  }
  let next = project;

  const existing = milestone.taskId !== undefined ? port.byId(milestone.taskId) : null;
  if (existing && !isTerminalTask(existing)) {
    next = appendEvent(next, "refused", `Refused to create a task for "${milestone.title}": its existing task is still ${existing.status}.`, "system", at);
    return refuse("duplicate-task", `"${milestone.title}" already has a live task (${existing.status}); finish, cancel or pause it first`, next);
  }

  const budget = next.budget;
  if (budget.deadlineAt !== undefined && at > budget.deadlineAt) {
    next = appendEvent(next, "refused", `Refused to create a task for "${milestone.title}": the deadline passed.`, "system", at);
    return refuse("deadline-passed", `the project deadline passed at ${new Date(budget.deadlineAt).toISOString()}; new tasks are refused`, next);
  }
  const tasksCreated = next.milestones.filter((entry) => entry.taskId !== undefined).length;
  if (tasksCreated >= budget.maxTasks) {
    next = appendEvent(next, "refused", `Refused to create a task for "${milestone.title}": the project's task budget is spent.`, "system", at);
    return refuse("budget-exhausted", `the project budget allows ${budget.maxTasks} task(s) and ${tasksCreated} exist`, next);
  }
  const spent = toolCallsSpent(next, (id) => port.byId(id));
  if (spent >= budget.maxToolCalls) {
    next = appendEvent(next, "refused", `Refused to create a task for "${milestone.title}": the project's tool-call budget is spent.`, "system", at);
    return refuse("budget-exhausted", `the project budget allows ${budget.maxToolCalls} tool call(s) across its tasks and ${spent} were spent`, next);
  }

  const deps = dependenciesReady(next, milestone.id, (id) => port.byId(id), at);
  if (!deps.ok) {
    next = appendEvent(next, "refused", `Refused to create a task for "${milestone.title}": ${deps.reason}`, "system", at);
    return refuse(deps.code, deps.reason, next);
  }
  if (milestone.checkpoint && approvalStatus(next, milestone.id, at) !== "approved") {
    const status = approvalStatus(next, milestone.id, at);
    next = appendEvent(next, "checkpoint-blocked", `Refused to create a task for "${milestone.title}": the checkpoint approval is ${status}.`, "system", at);
    return refuse("checkpoint-missing", `"${milestone.title}" is a human checkpoint and its approval is ${status}`, next);
  }

  const replannedFromGoalVersion =
    milestone.taskId !== undefined && milestone.taskGoalVersion !== undefined && milestone.taskGoalVersion !== next.goal.version
      ? milestone.taskGoalVersion
      : undefined;

  const constraints = [
    ...(milestone.deliverable ? [`Deliverable: ${milestone.deliverable}`] : []),
    ...milestone.acceptanceCriteria,
    ...(input.constraints ?? []),
  ].slice(0, 8);

  const created = port.create({
    workspaceId: next.workspaceId,
    goal: `Project "${next.title}" / milestone "${milestone.title}": ${next.goal.text}`,
    constraints,
    level: input.level,
    grants: next.grants.map((entry) => entry.permission),
    now: () => at,
  });
  if (!created.ok) {
    next = appendEvent(next, "refused", `The task machine refused a task for "${milestone.title}": ${created.reason}`, "system", at);
    return refuse("invalid-input", created.reason, next);
  }
  port.save(created.task);

  next = consume(next, input.actionKey);
  const milestones = next.milestones.map((entry) =>
    entry.id === milestone.id ? { ...entry, taskId: created.task.id, taskGoalVersion: next.goal.version } : entry,
  );
  next = { ...touch(next, at), milestones };
  next = appendEvent(
    next,
    "task-created",
    `Created task ${created.task.id} for "${milestone.title}" at autonomy level ${input.level}, with ${next.grants.length} grant(s).${
      replannedFromGoalVersion !== undefined ? ` Replanned against goal version ${next.goal.version} (the task was planned for version ${replannedFromGoalVersion}).` : ""
    }`,
    "operator",
    at,
  );
  return { ok: true, project: next, value: { task: created.task, replannedFromGoalVersion } };
}

export interface ProjectTaskSweep {
  changed: string[];
  skipped: Array<{ taskId: string; reason: string }>;
}

function sweepTasks(
  project: Project,
  port: ProjectTaskPort,
  at: number,
  work: (task: TaskRecord) => ApprovalResult,
): ProjectTaskSweep {
  const changed: string[] = [];
  const skipped: Array<{ taskId: string; reason: string }> = [];
  for (const milestone of project.milestones) {
    if (milestone.taskId === undefined) continue;
    const task = port.byId(milestone.taskId);
    if (!task) continue;
    if (isTerminalTask(task)) {
      skipped.push({ taskId: task.id, reason: `already ${task.status.toLowerCase()}` });
      continue;
    }
    const result = work(task);
    if (result.ok) {
      port.save(result.task);
      changed.push(task.id);
    } else {
      skipped.push({ taskId: task.id, reason: result.reason });
    }
  }
  return { changed, skipped };
}

export function pauseProject(
  project: Project,
  input: { reason?: string; at?: number } = {},
  context: ProjectActionContext = {},
): ProjectActionResult<ProjectTaskSweep> {
  const at = input.at ?? Date.now();
  const port = portOf(context);
  const reason = input.reason ?? "the project was paused by the operator";
  const sweep = sweepTasks(project, port, at, (task) => port.pause(task, { reason, at }));
  let next = appendEvent(
    project,
    "paused",
    `Paused ${sweep.changed.length} task(s)${sweep.skipped.length > 0 ? `; ${sweep.skipped.length} needed no change` : ""}.`,
    "operator",
    at,
  );
  next = touch(next, at);
  return { ok: true, project: next, value: sweep };
}

export function resumeProject(
  project: Project,
  input: { at?: number } = {},
  context: ProjectActionContext = {},
): ProjectActionResult<ProjectTaskSweep> {
  const at = input.at ?? Date.now();
  const port = portOf(context);
  const changed: string[] = [];
  const skipped: Array<{ taskId: string; reason: string }> = [];
  for (const milestone of project.milestones) {
    if (milestone.taskId === undefined) continue;
    const task = port.byId(milestone.taskId);
    if (!task) continue;
    if (task.status !== "PAUSED" && task.status !== "NEEDS_OPERATOR") {
      skipped.push({ taskId: task.id, reason: `not paused (${task.status})` });
      continue;
    }
    if (milestone.taskGoalVersion !== undefined && milestone.taskGoalVersion !== project.goal.version) {
      skipped.push({
        taskId: task.id,
        reason: `planned against goal version ${milestone.taskGoalVersion}, but the goal is now version ${project.goal.version}; re-create the task instead of resuming an obsolete plan`,
      });
      continue;
    }
    const resumed = port.resume(task, { at });
    if (resumed.ok) {
      port.save(resumed.task);
      changed.push(task.id);
    } else {
      skipped.push({ taskId: task.id, reason: resumed.reason });
    }
  }
  let next = appendEvent(
    project,
    "resumed",
    `Resumed ${changed.length} task(s).${
      skipped.some((entry) => entry.reason.includes("obsolete plan")) ? " At least one task was left paused because the goal changed after it was planned." : ""
    }`,
    "operator",
    at,
  );
  next = touch(next, at);
  return { ok: true, project: next, value: { changed, skipped } };
}

export function cancelProject(
  project: Project,
  input: { reason?: string; at?: number } = {},
  context: ProjectActionContext = {},
): ProjectActionResult<ProjectTaskSweep> {
  const at = input.at ?? Date.now();
  const port = portOf(context);
  const reason = input.reason ?? "the project was cancelled by the operator";
  const sweep = sweepTasks(project, port, at, (task) => port.cancel(task, { reason, at }));
  let next = appendEvent(project, "cancelled", `Cancelled ${sweep.changed.length} task(s).`, "operator", at);
  next = touch(next, at);
  return { ok: true, project: next, value: sweep };
}

/* --------------------------------------------------------------- checkpoints */

export function approveMilestone(
  project: Project,
  input: { milestoneId: string; note?: string; ttlMs?: number; at?: number; actionKey?: string },
): ProjectActionResult<{ expiresAt: number }> {
  const at = input.at ?? Date.now();
  const milestone = project.milestones.find((entry) => entry.id === input.milestoneId);
  if (!milestone) return refuse("unknown-milestone", `no milestone ${input.milestoneId} in this project`);
  if (!milestone.checkpoint) {
    return refuse("not-a-checkpoint", `"${milestone.title}" is not a checkpoint; ordinary milestones need no approval`);
  }
  if (input.actionKey && isApplied(project, input.actionKey)) {
    return refuse("duplicate-action", `action ${input.actionKey} was already applied`);
  }
  const ttlMs = input.ttlMs !== undefined && Number.isFinite(input.ttlMs) ? Math.max(0, input.ttlMs) : APPROVAL_TTL_MS;
  const expiresAt = at + ttlMs;
  const approval = {
    milestoneId: milestone.id,
    by: "operator" as const,
    at,
    expiresAt,
    note: storedText(input.note ?? "approved", PROJECT_LIMITS.reasonChars).text,
  };
  const approvals = [...project.approvals, approval].slice(-PROJECT_LIMITS.approvals);
  let next: Project = { ...touch(project, at), approvals };
  if (input.actionKey) next = consume(next, input.actionKey);
  next = appendEvent(
    next,
    "approval-recorded",
    `Checkpoint "${milestone.title}" approved; the approval expires ${new Date(expiresAt).toISOString()}.`,
    "operator",
    at,
  );
  return { ok: true, project: next, value: { expiresAt } };
}

/* ---------------------------------------------------------------- schedule */

export interface SetScheduleInput {
  enabled: boolean;
  everyMinutes?: number;
  maxRuns?: number;
  /** Must be `true` to enable. Code cannot turn scheduling on by accident. */
  acknowledged: boolean;
  at?: number;
  actionKey?: string;
}

export function setSchedule(project: Project, input: SetScheduleInput): ProjectActionResult<ProjectSchedule> {
  const at = input.at ?? Date.now();
  if (input.actionKey && isApplied(project, input.actionKey)) {
    return refuse("duplicate-action", `action ${input.actionKey} was already applied`);
  }
  if (input.enabled && input.acknowledged !== true) {
    return refuse(
      "schedule-needs-acknowledgement",
      "enabling a schedule requires an explicit acknowledgement that nothing runs on its own: the dashboard marks work due and the operator starts it",
    );
  }
  const everyMinutes = clampInt(input.everyMinutes ?? project.schedule.everyMinutes, MIN_SCHEDULE_MINUTES, MAX_SCHEDULE_MINUTES);
  const maxRuns = clampInt(input.maxRuns ?? project.schedule.maxRuns, 1, MAX_SCHEDULE_RUNS);
  const schedule: ProjectSchedule = {
    ...project.schedule,
    enabled: input.enabled,
    everyMinutes,
    maxRuns,
    acknowledged: input.acknowledged === true || project.schedule.acknowledged,
    enabledAt: input.enabled ? at : project.schedule.enabledAt,
  };
  let next: Project = { ...touch(project, at), schedule };
  if (input.actionKey) next = consume(next, input.actionKey);
  next = appendEvent(
    next,
    input.enabled ? "schedule-enabled" : "schedule-disabled",
    input.enabled
      ? `Schedule enabled: due every ${everyMinutes} minutes, at most ${maxRuns} recorded run(s). Nothing starts by itself; the dashboard shows when it is due and the operator starts it.`
      : "Schedule disabled.",
    "operator",
    at,
  );
  return { ok: true, project: next, value: schedule };
}

export function recordScheduleRun(
  project: Project,
  input: { at?: number; actionKey: string },
): ProjectActionResult<{ runsDone: number; lastRunAt: number }> {
  const at = input.at ?? Date.now();
  if (isApplied(project, input.actionKey)) {
    return refuse("duplicate-action", `action ${input.actionKey} was already applied`);
  }
  if (!project.schedule.enabled) return refuse("schedule-not-enabled", "no schedule is enabled for this project");
  if (project.schedule.runsDone >= project.schedule.maxRuns) {
    return refuse("schedule-exhausted", `the schedule recorded its ${project.schedule.maxRuns} permitted run(s)`);
  }
  if (project.schedule.lastRunAt !== undefined && at - project.schedule.lastRunAt < project.schedule.everyMinutes * 60_000) {
    return refuse("schedule-not-due", `the schedule is not due for another ${project.schedule.everyMinutes} minutes from its last recorded run`);
  }
  const runsDone = project.schedule.runsDone + 1;
  let next: Project = { ...touch(project, at), schedule: { ...project.schedule, runsDone, lastRunAt: at } };
  next = consume(next, input.actionKey);
  next = appendEvent(next, "schedule-run", `Recorded scheduled run ${runsDone} of ${next.schedule.maxRuns} at the operator's request.`, "operator", at);
  return { ok: true, project: next, value: { runsDone, lastRunAt: at } };
}

/* ------------------------------------------------------------ notifications */

export function setNotification(
  project: Project,
  input: { channelId: string; enabled: boolean; at?: number },
): ProjectActionResult<{ channels: NotificationChannel[] }> {
  const at = input.at ?? Date.now();
  const channel = project.notifications.find((entry) => entry.id === input.channelId);
  if (!channel) return refuse("unknown-channel", `no notification channel ${input.channelId}`);
  if (channel.unavailable) {
    return refuse("unknown-channel", `the ${channel.id} channel is unavailable: ${channel.unavailable}`);
  }
  const channels = project.notifications.map((entry) => (entry.id === channel.id ? { ...entry, enabled: input.enabled } : entry));
  let next: Project = { ...touch(project, at), notifications: channels };
  next = appendEvent(
    next,
    "notification-changed",
    `${channel.id} notifications ${input.enabled ? "enabled" : "disabled"}.`,
    "operator",
    at,
  );
  return { ok: true, project: next, value: { channels } };
}
