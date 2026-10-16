import { digestValue } from "../lib/hash";
import { isStopEngaged } from "../control/stop";
import { attributeClaims } from "../pipeline/grounding";
import { createToolTask, runProposal } from "../tools/executor";
import { neutraliseActionBlocks } from "../tools/proposals";
import { findTool } from "../tools/registry";
import type { Permission, ToolData, ToolOutcome, ToolRunOutput } from "../tools/types";
import { validateArguments } from "../tools/validation";
import { transition } from "./machine";
import { buildPlan, goalTerms, planBudget, topTerm, type PlanRequest } from "./planner";
import {
  emptySpend,
  MAX_AUTONOMY_LEVEL,
  type AutonomyLevel,
  type CriterionResult,
  type StepEvidence,
  type StopReason,
  type TaskCriterion,
  type TaskRecord,
  type TaskStepSpec,
  type TaskStepState,
} from "./types";

/**
 * The task runner: one permitted action per step, then a verification that cannot
 * be skipped.
 *
 * The shape of the loop is the safety property. A task never runs a batch: the
 * operator (or the caller) asks for the next step, the machine checks the
 * preconditions of exactly that step — budget, permission, argument resolution,
 * approval — and only then calls the tool through the Mission 7 policy gateway.
 * A refusal anywhere stops the task with a reason instead of trying something else.
 *
 * Three rules that the tests are written against:
 *
 *   1. **A finished step is never run twice.** Resuming a task walks past steps
 *      that are already `done`, so a pause/cancel/resume cycle cannot duplicate a
 *      tool call.
 *   2. **Verification judges actual results.** The evidence a step is judged
 *      against is what the tool returned, stored on the step, never prose the
 *      operator or a model wrote about it.
 *   3. **No budget, no work.** Steps, wall time, tool calls, retries and output
 *      characters are measured before each call and spent as it happens. Token and
 *      currency budgets are declared unmeasured rather than shown as enforced.
 */

export const READ_ONLY_GRANTS: readonly Permission[] = ["workspace:read", "evidence:read", "compute:local"];

/** Denominator of the wall-clock measurement: a task's age, in milliseconds. */
function elapsed(task: TaskRecord, at: number): number {
  return Math.max(0, at - task.createdAt);
}

function defaultGrants(level: AutonomyLevel): Permission[] {
  return level === 0 ? [] : [...READ_ONLY_GRANTS];
}

/* ------------------------------------------------------------------ create */

export interface CreateTaskRequest extends PlanRequest {
  workspaceId: string;
  grants?: Permission[];
  now?: () => number;
}

export type CreateTaskResult = { ok: true; task: TaskRecord } | { ok: false; reason: string };

export function createTask(request: CreateTaskRequest): CreateTaskResult {
  const goal = request.goal.trim().replace(/\s+/g, " ");
  if (goal.length === 0) {
    return { ok: false, reason: "a task needs a goal; an empty request has nothing to plan against" };
  }
  if (request.level !== 0 && request.level !== 1 && request.level !== 2) {
    return {
      ok: false,
      reason: `autonomy level ${String(request.level)} is not implemented in this build; the machine stops at level ${MAX_AUTONOMY_LEVEL}`,
    };
  }

  const at = (request.now ?? Date.now)();
  const plan = buildPlan({ ...request, goal });
  const steps: TaskStepState[] = plan.steps.map((spec, index) => ({
    spec,
    index,
    status: "pending",
    attempts: 0,
    resolvedArgs: null,
    evidence: [],
  }));

  const base: TaskRecord = {
    id: `task-${digestValue([request.workspaceId, at, goal]).replace(/^fnv1a32:/, "")}`,
    version: 1,
    workspaceId: request.workspaceId,
    goal,
    constraints: [...request.constraints].map((entry) => entry.trim()).filter((entry) => entry.length > 0),
    level: request.level,
    status: "REQUESTED",
    plan,
    steps,
    currentStep: 0,
    budget: planBudget({ ...request, goal }),
    spend: emptySpend(),
    approvals: [],
    refusals: [],
    failures: [],
    revisions: [],
    grants: request.grants ? [...request.grants] : defaultGrants(request.level),
    createdAt: at,
    updatedAt: at,
    transitions: [],
  };

  const planning = transition(base, {
    to: "PLANNING",
    reason: "the request was received and a plan was produced",
    by: "system",
    at,
  });
  if (!planning.ok) return { ok: false, reason: planning.reason };

  const running = transition(planning.task, {
    to: "RUNNING",
    reason:
      steps.length === 0
        ? "there is nothing to execute at this level, so the task is ready to be verified"
        : `${steps.length} step(s) are ready to run one at a time`,
    by: "system",
    at,
  });
  if (!running.ok) return { ok: false, reason: running.reason };

  return { ok: true, task: running.task };
}

/* ------------------------------------------------- assignment of arguments */

export interface ArgumentResolution {
  ok: true;
  args: Record<string, unknown>;
}

export interface ArgumentFailure {
  ok: false;
  reason: string;
}

/**
 * Fill in a step's arguments from things the machine knows: the goal, its
 * distinctive terms, or the evidence the previous step actually returned. There is
 * no inference here — an argument that cannot be resolved is reported, never
 * guessed, because a guessed search term (or worse, a guessed id) would make the
 * step's result meaningless.
 */
export function resolveArguments(
  step: TaskStepState,
  goal: string,
  previous: StepEvidence | null,
): ArgumentResolution | ArgumentFailure {
  const resolve = step.spec.resolve;
  if (!resolve || Object.keys(resolve).length === 0) return { ok: true, args: { ...step.spec.args } };

  const args: Record<string, unknown> = { ...step.spec.args };
  for (const [key, source] of Object.entries(resolve)) {
    switch (source) {
      case "goal":
        args[key] = goal.slice(0, 200);
        break;
      case "terms": {
        const terms = goalTerms(goal);
        if (terms.length === 0) return { ok: false, reason: `the goal has no distinctive terms to resolve "${key}" from` };
        args[key] = terms.slice(0, 200);
        break;
      }
      case "topTerm": {
        const term = topTerm(goal);
        if (term.length === 0) return { ok: false, reason: `the goal has no distinctive term to resolve "${key}" from` };
        args[key] = term.slice(0, 200);
        break;
      }
      case "previousHitId": {
        if (!previous) return { ok: false, reason: `no earlier step returned an item id to resolve "${key}" from` };
        args[key] = previous.id;
        break;
      }
      case "previousText": {
        if (!previous) return { ok: false, reason: `no earlier step returned text to resolve "${key}" from` };
        args[key] = previous.text.slice(0, 2000);
        break;
      }
      case "goalNumbers": {
        const numbers = (goal.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter((value) => Number.isFinite(value));
        if (numbers.length === 0) return { ok: false, reason: `the goal states no number to resolve "${key}" from` };
        args[key] = numbers.slice(0, 500);
        break;
      }
      default:
        return { ok: false, reason: `"${String(source)}" is not a known argument source` };
    }
  }
  return { ok: true, args };
}

/* --------------------------------------------------------------- evidence */

const MAX_EVIDENCE_PER_STEP = 8;
const MAX_EVIDENCE_CHARS = 2000;

/**
 * External and document text is data. It is neutralised with the same routine the
 * tool layer uses before it is stored on a step, so nothing in a retrieved
 * passage can later be read back as an instruction.
 */
function boundedEvidence(text: string): string {
  return neutraliseActionBlocks(text).slice(0, MAX_EVIDENCE_CHARS);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringField(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** The evidence a tool result actually contains, bounded. Never model prose. */
export function evidenceFromOutcome(outcome: ToolOutcome): StepEvidence[] {
  const result: ToolRunOutput | undefined = outcome.result;
  const data = asRecord(result?.data);
  const evidence: StepEvidence[] = [];

  const hits = Array.isArray(data?.hits) ? (data?.hits as unknown[]) : [];
  for (const hit of hits) {
    if (evidence.length >= MAX_EVIDENCE_PER_STEP) break;
    const record = asRecord(hit);
    const id = stringField(record, "id");
    const excerpt = stringField(record, "excerpt");
    if (!id || !excerpt) continue;
    const title = stringField(record, "title") ?? id;
    evidence.push({ id, text: boundedEvidence(`${title}: ${excerpt}`) });
  }

  const passages = Array.isArray(data?.passages) ? (data?.passages as unknown[]) : [];
  for (const passage of passages) {
    if (evidence.length >= MAX_EVIDENCE_PER_STEP) break;
    const record = asRecord(passage);
    const text = stringField(record, "text");
    if (!text) continue;
    evidence.push({
      id: stringField(record, "chunkId") ?? stringField(record, "locator") ?? `passage-${evidence.length + 1}`,
      text: boundedEvidence(text),
      ...(stringField(record, "locator") ? { locator: stringField(record, "locator") as string } : {}),
    });
  }

  const text = result?.text;
  if (text && text.trim().length > 0 && evidence.length < MAX_EVIDENCE_PER_STEP) {
    evidence.push({
      id: stringField(data, "id") ?? "text",
      text: boundedEvidence(text),
      ...(stringField(data, "locator") ? { locator: stringField(data, "locator") as string } : {}),
    });
  }

  return evidence;
}

/* ------------------------------------------------------------------ stops */

function stop(
  task: TaskRecord,
  at: number,
  to: "FAILED" | "NEEDS_OPERATOR" | "CANCELLED",
  reason: StopReason,
  detail: string,
  patch: Partial<TaskRecord> = {},
): StepResult {
  const applied = transition(task, {
    to,
    reason: detail,
    by: "system",
    at,
    patch: { ...patch, stop: { reason, detail }, updatedAt: at },
  });
  if (!applied.ok) return { ok: false, task, reason: applied.reason };
  return { ok: false, task: applied.task, reason: detail };
}

/* -------------------------------------------------------------- one step */

export interface StepOptions {
  /** The snapshot of workspace data a tool may read. Supplied by the caller. */
  data: ToolData;
  now?: () => number;
  signal?: AbortSignal;
}

export type StepResult =
  | { ok: true; ran: boolean; task: TaskRecord; note: string }
  | { ok: false; task: TaskRecord; reason: string };

function withStep(task: TaskRecord, index: number, step: TaskStepState, patch: Partial<TaskRecord> = {}): TaskRecord {
  const steps = task.steps.map((entry, position) => (position === index ? step : entry));
  return { ...task, ...patch, steps };
}

function spendOf(task: TaskRecord, outcome: ToolOutcome, durationMs: number, outputChars: number): TaskRecord["spend"] {
  // A call that the policy refused never ran, so it is not counted against the
  // call budget; everything else (including a timeout) spent a real call.
  const calls = outcome.status === "denied" || outcome.status === "needs-approval" ? 0 : 1;
  return {
    steps: task.spend.steps + 1,
    toolCalls: task.spend.toolCalls + calls,
    retries: task.spend.retries,
    outputChars: task.spend.outputChars + outputChars,
    wallMs: task.spend.wallMs + durationMs,
  };
}

/**
 * Run the next permitted action, exactly one, and return the task as it stands.
 *
 * `ok: false` means the task refused to continue and says why; `ok: true` with
 * `ran: false` means there was nothing to execute right now (a step was skipped,
 * an approval is pending, or the plan is finished and the task is ready to verify).
 */
export async function stepTask(task: TaskRecord, options: StepOptions): Promise<StepResult> {
  const now = options.now ?? Date.now;
  const at = now();

  // The global stop (Mission 14) refuses a step outright, whatever state the
  // task is in. The stop also pauses live tasks when it engages, so this is the
  // second line of the same defence: a task cannot be stepped while stopped.
  if (isStopEngaged()) {
    return {
      ok: false,
      task,
      reason: "the global stop is engaged; no step runs until an operator releases it",
    };
  }

  if (task.status !== "RUNNING") {
    return {
      ok: false,
      task,
      reason: `a step can only run while the task is RUNNING (it is ${task.status})`,
    };
  }

  const age = elapsed(task, at);
  if (age >= task.budget.maxWallMs) {
    return stop(task, at, "FAILED", "budget-exhausted", `the wall-time budget of ${task.budget.maxWallMs}ms is spent (${age}ms elapsed)`);
  }
  if (task.spend.steps >= task.budget.maxSteps) {
    return stop(task, at, "FAILED", "budget-exhausted", `the step budget of ${task.budget.maxSteps} is spent`);
  }

  // Walk past steps that already finished: resuming cannot re-run them.
  let index = task.currentStep;
  while (index < task.steps.length && task.steps[index].status !== "pending") index++;
  if (index >= task.steps.length) {
    const applied = transition(
      { ...task, currentStep: index },
      {
        to: "VERIFYING",
        reason: "every planned step has finished, so the task is ready to be verified",
        by: "system",
        at,
        patch: { currentStep: index },
      },
    );
    if (!applied.ok) return { ok: false, task, reason: applied.reason };
    return { ok: true, ran: false, task: applied.task, note: "the plan's steps are finished; the task is ready to verify" };
  }

  const step = task.steps[index];
  const spec = step.spec;

  const tool = findTool(spec.tool);
  if (!tool) {
    return stop(task, at, "FAILED", "failed", `step ${spec.id} names a tool that is not registered ("${spec.tool}")`);
  }

  if (!task.grants.includes(tool.permission)) {
    return stop(
      task,
      at,
      "NEEDS_OPERATOR",
      "permission-boundary",
      `step ${spec.id} needs the "${tool.permission}" permission, which this task does not hold; grant it and resume, or cancel`,
    );
  }

  if (tool.sideEffect !== "none" && task.level < 2) {
    return stop(
      task,
      at,
      "NEEDS_OPERATOR",
      "permission-boundary",
      `step ${spec.id} would change state and this task is at level ${task.level}; raise the level for this task if that is intended`,
    );
  }

  const previous =
    [...task.steps.slice(0, index)]
      .reverse()
      .map((candidate) => candidate.evidence[0])
      .find((candidate): candidate is StepEvidence => Boolean(candidate)) ?? null;

  const resolution = resolveArguments(step, task.goal, previous);
  if (!resolution.ok) {
    if (spec.optional) {
      const skipped: TaskStepState = { ...step, status: "skipped", attempts: step.attempts, finishedAt: at, note: resolution.reason };
      const advanced = withStep(task, index, skipped, { currentStep: index + 1, updatedAt: at });
      return {
        ok: true,
        ran: false,
        task: Object.freeze(advanced),
        note: `step ${spec.id} was skipped: ${resolution.reason}`,
      };
    }
    return stop(task, at, "NEEDS_OPERATOR", "needs-operator", `step ${spec.id} cannot run: ${resolution.reason}`);
  }

  const needsApproval = tool.highImpact.length > 0 || tool.sideEffect !== "none";
  const approval = task.approvals.find((entry) => entry.stepId === spec.id);

  if (needsApproval && approval?.decision !== "approved") {
    const waiting: TaskStepState = { ...step, status: "waiting-approval" };
    const patch: Partial<TaskRecord> = approval
      ? {}
      : {
          approvals: [
            ...task.approvals,
            { stepId: spec.id, tool: tool.name, requestedAt: at, decision: "pending" as const },
          ],
        };
    const applied = transition(withStep(task, index, waiting, patch), {
      to: "WAITING_FOR_APPROVAL",
      reason: `${tool.name} ${tool.highImpact.length > 0 ? `affects ${tool.highImpact.join(", ")}` : "changes state"}, so it needs the operator's approval`,
      by: "system",
      at,
    });
    if (!applied.ok) return { ok: false, task, reason: applied.reason };
    return { ok: true, ran: false, task: applied.task, note: `waiting for the operator's approval for ${tool.name}` };
  }

  if (task.spend.toolCalls >= task.budget.maxToolCalls) {
    return stop(task, at, "FAILED", "budget-exhausted", `the tool-call budget of ${task.budget.maxToolCalls} is spent`);
  }

  const startedAt = at;
  const toolTask = createToolTask({
    id: `${task.id}-${spec.id}`,
    workspaceId: task.workspaceId,
    data: options.data,
    grants: [...task.grants],
    limits: {
      maxCalls: Math.max(1, task.budget.maxToolCalls - task.spend.toolCalls),
      maxWallMs: Math.max(1000, task.budget.maxWallMs - age),
      maxOutputChars: Math.max(1000, task.budget.maxOutputChars - task.spend.outputChars),
      maxRetries: Math.max(0, task.budget.maxRetries - task.spend.retries),
    },
    signal: options.signal,
  });

  const outcome = await runProposal(
    toolTask,
    { tool: spec.tool, arguments: resolution.args, origin: "operator" },
    needsApproval && approval?.decision === "approved" ? { approve: { by: "operator" } } : {},
  );

  const finishedAt = now();
  const durationMs = Math.max(0, finishedAt - startedAt);
  const outputChars = (outcome.result?.text?.length ?? 0) + JSON.stringify(outcome.result?.data ?? {}).length;
  const spend = spendOf(task, outcome, durationMs, outputChars);

  if (outcome.status === "ok" && outcome.result) {
    const doneStep: TaskStepState = {
      ...step,
      status: "done",
      attempts: step.attempts + 1,
      startedAt,
      finishedAt,
      resolvedArgs: resolution.args,
      outcome: {
        status: outcome.status,
        code: outcome.code,
        summary: outcome.result.summary,
        outputChars,
        durationMs,
      },
      evidence: evidenceFromOutcome(outcome),
    };

    const nextIndex = index + 1;
    const updated = withStep(task, index, doneStep, { currentStep: nextIndex, spend, updatedAt: finishedAt });

    if (nextIndex >= task.steps.length) {
      const applied = transition(updated, {
        to: "VERIFYING",
        reason: "the last planned step finished, so the task is ready to be verified",
        by: "system",
        at: finishedAt,
      });
      if (!applied.ok) return { ok: false, task: updated, reason: applied.reason };
      return { ok: true, ran: true, task: applied.task, note: outcome.result.summary };
    }

    return { ok: true, ran: true, task: Object.freeze(updated), note: outcome.result.summary };
  }

  const failure = { stepId: spec.id, code: outcome.code, reason: outcome.reason, at: finishedAt };

  if (outcome.status === "cancelled") {
    return stop(task, finishedAt, "CANCELLED", "cancelled", `step ${spec.id} was cancelled: ${outcome.reason}`, {
      spend,
      failures: [...task.failures, failure],
    });
  }

  if (outcome.status === "timeout" && spend.retries < task.budget.maxRetries && step.attempts < 2) {
    // One retry, recorded: the step stays pending and keeps its attempt count, so
    // the retry history is visible and the budget cannot be spent twice on it.
    const retrying: TaskStepState = { ...step, attempts: step.attempts + 1, note: `timed out; retrying (${outcome.reason})` };
    const updated = withStep(task, index, retrying, {
      spend: { ...spend, retries: spend.retries + 1 },
      refusals: [...task.refusals, failure],
      updatedAt: finishedAt,
    });
    return { ok: true, ran: true, task: Object.freeze(updated), note: `step ${spec.id} timed out and is being retried once` };
  }

  if (spec.optional) {
    const failedStep: TaskStepState = { ...step, status: "failed", attempts: step.attempts + 1, finishedAt, note: outcome.reason };
    const updated = withStep(task, index, failedStep, {
      currentStep: index + 1,
      spend,
      failures: [...task.failures, failure],
      updatedAt: finishedAt,
    });
    return { ok: true, ran: true, task: Object.freeze(updated), note: `optional step ${spec.id} failed: ${outcome.reason}` };
  }

  if (outcome.status === "denied" && (outcome.code === "permission-not-granted" || outcome.code === "not-approved")) {
    return stop(task, finishedAt, "NEEDS_OPERATOR", "permission-boundary", `step ${spec.id} was refused by the policy gateway: ${outcome.reason}`, {
      spend,
      refusals: [...task.refusals, failure],
    });
  }

  if (outcome.status === "needs-approval") {
    const waiting: TaskStepState = { ...step, status: "waiting-approval" };
    const applied = transition(
      withStep(task, index, waiting, {
        spend,
        approvals: task.approvals.some((entry) => entry.stepId === spec.id)
          ? task.approvals
          : [...task.approvals, { stepId: spec.id, tool: spec.tool, requestedAt: finishedAt, decision: "pending" as const }],
      }),
      {
        to: "WAITING_FOR_APPROVAL",
        reason: `${spec.tool} needs approval before it can run`,
        by: "system",
        at: finishedAt,
      },
    );
    if (!applied.ok) return { ok: false, task, reason: applied.reason };
    return { ok: true, ran: false, task: applied.task, note: `waiting for the operator's approval for ${spec.tool}` };
  }

  return stop(task, finishedAt, "FAILED", "failed", `step ${spec.id} failed: ${outcome.reason}`, {
    spend,
    failures: [...task.failures, failure],
  });
}

/* ------------------------------------------------------------ approvals */

export interface ApprovalDecision {
  stepId: string;
  decision: "approved" | "denied";
  reason?: string;
  at?: number;
}

export type ApprovalResult = { ok: true; task: TaskRecord } | { ok: false; task: TaskRecord; reason: string };

/**
 * Record the operator's decision on one step.
 *
 * Neither answer executes anything: approval moves the task back to `RUNNING` and
 * the step runs on the next `stepTask` call, where the recorded approval is the
 * only thing that satisfies the gateway. A denial ends the task with
 * `approval-denied` and the tool is never called.
 */
export function decideApproval(task: TaskRecord, decision: ApprovalDecision): ApprovalResult {
  const at = decision.at ?? Date.now();

  if (task.status !== "WAITING_FOR_APPROVAL") {
    return { ok: false, task, reason: `there is nothing waiting for approval (the task is ${task.status})` };
  }
  const approval = task.approvals.find((entry) => entry.stepId === decision.stepId);
  if (!approval || approval.decision !== "pending") {
    return { ok: false, task, reason: `no pending approval exists for step ${decision.stepId}` };
  }

  const approvals = task.approvals.map((entry) =>
    entry.stepId === decision.stepId
      ? { ...entry, decision: decision.decision, decidedAt: at, by: "operator" as const, ...(decision.reason ? { reason: decision.reason } : {}) }
      : entry,
  );

  if (decision.decision === "approved") {
    // The step goes back to `pending`: approval allows it to run, it does not run
    // it, so the next step request is what actually calls the tool.
    const index = task.steps.findIndex((entry) => entry.spec.id === decision.stepId);
    const steps = task.steps.map((entry, position) =>
      position === index ? { ...entry, status: "pending" as const, note: `approved by the operator at ${new Date(at).toLocaleTimeString()}` } : entry,
    );
    const applied = transition(task, {
      to: "RUNNING",
      reason: `the operator approved ${approval.tool} for step ${decision.stepId}`,
      by: "operator",
      at,
      patch: { approvals, steps },
    });
    if (!applied.ok) return { ok: false, task, reason: applied.reason };
    return { ok: true, task: applied.task };
  }

  const index = task.steps.findIndex((entry) => entry.spec.id === decision.stepId);
  const steps = task.steps.map((entry, position) =>
    position === index
      ? { ...entry, status: "skipped" as const, finishedAt: at, note: decision.reason ?? "the operator declined this action" }
      : entry,
  );

  const applied = transition(task, {
    to: "FAILED",
    reason: `the operator declined ${approval.tool} for step ${decision.stepId}`,
    by: "operator",
    at,
    patch: {
      approvals,
      steps,
      stop: { reason: "approval-denied", detail: decision.reason ?? `the operator declined ${approval.tool}` },
    },
  });
  if (!applied.ok) return { ok: false, task, reason: applied.reason };
  return { ok: true, task: applied.task };
}

/* ------------------------------------------------------ pause and resume */

export function pauseTask(task: TaskRecord, options: { reason?: string; at?: number } = {}): ApprovalResult {
  const at = options.at ?? Date.now();
  const reason = options.reason ?? "paused by the operator";
  const applied = transition(task, { to: "PAUSED", reason, by: "operator", at });
  if (!applied.ok) return { ok: false, task, reason: applied.reason };
  return { ok: true, task: applied.task };
}

export function resumeTask(task: TaskRecord, options: { at?: number } = {}): ApprovalResult {
  const at = options.at ?? Date.now();
  if (task.status !== "PAUSED" && task.status !== "NEEDS_OPERATOR") {
    return { ok: false, task, reason: `only a paused task can be resumed (this one is ${task.status})` };
  }
  const applied = transition(task, { to: "RUNNING", reason: "the operator resumed the task", by: "operator", at });
  if (!applied.ok) return { ok: false, task, reason: applied.reason };
  return { ok: true, task: applied.task };
}

export function cancelTask(task: TaskRecord, options: { reason?: string; at?: number } = {}): ApprovalResult {
  const at = options.at ?? Date.now();
  const detail = options.reason ?? "cancelled by the operator";
  const applied = transition(task, {
    to: "CANCELLED",
    reason: detail,
    by: "operator",
    at,
    patch: { stop: { reason: "cancelled", detail } },
  });
  if (!applied.ok) return { ok: false, task, reason: applied.reason };
  return { ok: true, task: applied.task };
}

/**
 * Recovery after a restart.
 *
 * Anything that was mid-flight when the process died is moved to `PAUSED` with a
 * reason that says so: a task whose step was interrupted must not look like a task
 * that finished, and it may not resume on its own. A step that was `running` is put
 * back to `pending`, keeping its attempt count, so the operator decides whether to
 * spend another attempt on it.
 */
export function recoverInterruptedTask(task: TaskRecord, at = Date.now()): TaskRecord {
  const resumable: TaskRecord["status"][] = ["REQUESTED", "PLANNING", "RUNNING", "WAITING_FOR_APPROVAL", "VERIFYING"];
  if (!resumable.includes(task.status)) return task;

  const steps = task.steps.map((entry) =>
    entry.status === "running" ? { ...entry, status: "pending" as const, note: "interrupted by a restart; it will run again if the task is resumed" } : entry,
  );

  const applied = transition(task, {
    to: "PAUSED",
    reason: "the app restarted while this task was in progress; resume it or cancel it",
    by: "system",
    at,
    patch: { steps },
  });
  return applied.ok ? applied.task : task;
}

/* --------------------------------------------------------------- revision */

export interface ReviseRequest {
  tool: string;
  arguments: Record<string, unknown>;
  /** Why the step was added, in the operator's words. Required reading. */
  rationale: string;
  because: string;
  at?: number;
}

export type ReviseResult = { ok: true; task: TaskRecord } | { ok: false; task: TaskRecord; reason: string };

/**
 * Add one step to a running (or paused) plan.
 *
 * This is the only way a plan changes after it is proposed, it is operator-only,
 * and it can only *add*: a step that already ran keeps its result. The added step
 * is validated against the tool's own schema before it is accepted, and it runs
 * like any other step — through the same budget, permission and approval checks.
 * A step that does not fit the remaining budget is refused here rather than
 * discovered when it is too late to matter.
 */
export function reviseStep(task: TaskRecord, request: ReviseRequest): ReviseResult {
  const at = request.at ?? Date.now();

  if (task.status !== "RUNNING" && task.status !== "PAUSED") {
    return {
      ok: false,
      task,
      reason: `the plan can only be revised while a task is RUNNING or PAUSED (this one is ${task.status})`,
    };
  }

  const tool = findTool(request.tool);
  if (!tool) {
    return { ok: false, task, reason: `"${request.tool}" is not a registered tool, so it cannot be added to a plan` };
  }

  // The same boundary the runner enforces before a call is enforced here, so a
  // revision cannot queue up work the task would refuse. Losing the refusal until
  // execution time would waste the operator's attention, not the boundary.
  if (!task.grants.includes(tool.permission)) {
    return {
      ok: false,
      task,
      reason: `this task does not hold the "${tool.permission}" permission that ${tool.name} needs`,
    };
  }
  if (tool.sideEffect !== "none" && task.level < 2) {
    return {
      ok: false,
      task,
      reason: `${tool.name} would change state and this task is at level ${task.level}`,
    };
  }

  if (task.steps.length >= task.budget.maxSteps) {
    return {
      ok: false,
      task,
      reason: `the plan already has ${task.steps.length} step(s), which is this task's whole step budget (${task.budget.maxSteps}); start a new task with a larger budget instead`,
    };
  }

  const validation = validateArguments(tool, request.arguments);
  if (!validation.ok) {
    return { ok: false, task, reason: `the step's arguments do not satisfy ${tool.name}'s schema: ${validation.reason}` };
  }

  const stepId = `step-r${task.steps.length + 1}-${tool.name.replace(/[^a-z0-9]+/gi, "-")}`;
  if (task.steps.some((entry) => entry.spec.id === stepId)) {
    return { ok: false, task, reason: `step ${stepId} is already in this plan` };
  }

  const spec: TaskStepSpec = {
    id: stepId,
    tool: tool.name,
    rationale: request.rationale.trim().length > 0 ? request.rationale.trim() : `Added while the task was running: ${tool.name}`,
    args: validation.args,
    because: request.because.trim().length > 0 ? request.because.trim() : "the operator added it after seeing what the earlier steps returned",
  };

  const step: TaskStepState = { spec, index: task.steps.length, status: "pending", attempts: 0, resolvedArgs: null, evidence: [] };

  return {
    ok: true,
    task: Object.freeze({
      ...task,
      plan: { ...task.plan, steps: [...task.plan.steps, spec] },
      steps: [...task.steps, step],
      revisions: [...task.revisions, { at, by: "operator" as const, note: spec.because, stepId, tool: tool.name }],
      updatedAt: at,
    }) as TaskRecord,
  };
}

/* ------------------------------------------------------------ verification */

interface CriterionContext {
  task: TaskRecord;
  evidenceCount: number;
  unsupportedClaims: string[];
  supportRatio: number | null;
  judgedClaims: number;
  hasAnswer: boolean;
}

function evaluateCriterion(criterion: TaskCriterion, context: CriterionContext): CriterionResult {
  const { task } = context;

  switch (criterion.id) {
    case "steps-completed": {
      const unfinished = task.steps.filter((entry) => entry.status !== "done" && entry.status !== "skipped");
      const failed = task.steps.filter((entry) => entry.status === "failed");
      const ok = unfinished.length === 0 && failed.length === 0;
      return {
        criterion: criterion.text,
        met: ok,
        detail: ok
          ? `${task.steps.filter((entry) => entry.status === "done").length} step(s) completed, ${task.steps.filter((entry) => entry.status === "skipped").length} skipped with a reason`
          : `${unfinished.length} step(s) did not finish and ${failed.length} failed`,
      };
    }
    case "evidence-present": {
      const ok = context.evidenceCount > 0;
      return {
        criterion: criterion.text,
        met: ok,
        detail: ok ? `${context.evidenceCount} passage(s) were returned by this workspace's tools` : "no step returned any evidence",
      };
    }
    case "no-tool-calls": {
      const ok = task.spend.toolCalls === 0;
      return {
        criterion: criterion.text,
        met: ok,
        detail: ok ? "no tool was called" : `${task.spend.toolCalls} tool call(s) were made at a level that permits none`,
      };
    }
    case "numbers-grounded": {
      if (!context.hasAnswer) {
        return { criterion: criterion.text, met: true, detail: "no answer was supplied, so no sentence was judged against the evidence" };
      }
      const numericUnsupported = context.unsupportedClaims.filter((claim) => /\d/.test(claim));
      const ok = numericUnsupported.length === 0;
      return {
        criterion: criterion.text,
        met: ok,
        detail: ok ? "every sentence stating a number overlapped the retrieved evidence" : `unsupported: ${numericUnsupported.join(" | ")}`,
      };
    }
    case "support-ratio": {
      if (!context.hasAnswer) {
        return { criterion: criterion.text, met: true, detail: "no answer was supplied, so there was no ratio to compute" };
      }
      if (context.judgedClaims === 0) {
        return { criterion: criterion.text, met: true, detail: "the answer contained no sentence long enough to judge" };
      }
      const threshold = criterion.threshold ?? 0.6;
      const ratio = context.supportRatio ?? 0;
      return {
        criterion: criterion.text,
        met: ratio >= threshold,
        detail: `${Math.round(ratio * 100)}% of ${context.judgedClaims} judged sentence(s) were supported (threshold ${Math.round(threshold * 100)}%)`,
      };
    }
    default:
      return { criterion: criterion.text, met: false, detail: "this criterion has no evaluation in this build" };
  }
}

export interface VerifyOptions {
  /** The synthesis to judge against the evidence the steps returned. */
  answer?: string;
  now?: () => number;
}

export type VerifyResult = { ok: true; task: TaskRecord } | { ok: false; task: TaskRecord; reason: string };

/**
 * Run the verification and let it decide the final status.
 *
 * `COMPLETED` is only reachable through here, and only when every criterion the
 * plan declared is met. Unmet criteria that concern the investigation itself fail
 * the task; unmet criteria that concern the answer's support leave it with the
 * operator, who can add evidence and resume.
 */
export function verifyTask(task: TaskRecord, options: VerifyOptions = {}): VerifyResult {
  if (task.status !== "VERIFYING") {
    return { ok: false, task, reason: `verification runs only from VERIFYING (the task is ${task.status})` };
  }

  const at = (options.now ?? Date.now)();
  const answer = (options.answer ?? task.answer ?? "").trim();
  const evidence = task.steps.flatMap((entry) => entry.evidence);
  const chunks = evidence.map((entry) => ({ id: entry.id, text: entry.text }));
  const judged = answer.length > 0 ? attributeClaims(answer, chunks) : [];
  const unsupportedClaims = judged.filter((claim) => !claim.supported).map((claim) => claim.claim);
  const supportRatio = judged.length === 0 ? null : judged.filter((claim) => claim.supported).length / judged.length;

  const criteria = task.plan.successCriteria.map((criterion) =>
    evaluateCriterion(criterion, {
      task,
      evidenceCount: chunks.length,
      unsupportedClaims,
      supportRatio,
      judgedClaims: judged.length,
      hasAnswer: answer.length > 0,
    }),
  );

  const notes: string[] = [];
  if (answer.length === 0) {
    notes.push("no answer was supplied, so no sentence was judged; the criteria above concern the investigation itself");
  }
  if (evidence.length > 0 && chunks.length !== evidence.length) {
    notes.push(`${evidence.length - chunks.length} evidence item(s) had no id and could not be judged`);
  }
  notes.push("token and currency budgets were not enforced: nothing in this build measures them, so they are not shown as spent");

  const met = criteria.every((criterion) => criterion.met);
  const unmet = criteria.filter((criterion) => !criterion.met);
  const structuralUnmet = unmet.filter((criterion) =>
    ["steps-completed", "evidence-present", "no-tool-calls"].includes(
      task.plan.successCriteria.find((entry) => entry.text === criterion.criterion)?.id ?? "",
    ),
  );

  const verification = {
    at,
    criteria,
    met,
    unsupportedClaims,
    supportRatio,
    evidenceChunks: chunks.length,
    notes,
  };

  const done = task.steps.filter((entry) => entry.status === "done").map((entry) => `${entry.spec.tool}: ${entry.outcome?.summary ?? "completed"}`);
  const incomplete = [
    ...task.steps.filter((entry) => entry.status === "skipped").map((entry) => `${entry.spec.tool} was skipped: ${entry.note ?? "no reason recorded"}`),
    ...task.steps.filter((entry) => entry.status === "failed").map((entry) => `${entry.spec.tool} failed: ${entry.note ?? "no reason recorded"}`),
    ...task.failures.map((entry) => `${entry.stepId} reported ${entry.code}: ${entry.reason}`),
  ];

  const summary = [
    `${done.length} of ${task.steps.length} planned step(s) ran.`,
    `Evidence: ${chunks.length} passage(s) were returned by this workspace's tools.`,
    met
      ? "Verification: every success criterion is met."
      : `Verification: ${unmet.length} criterion(a) are not met — ${unmet.map((criterion) => criterion.criterion).join("; ")}.`,
    `Budget: ${task.spend.steps}/${task.budget.maxSteps} steps, ${task.spend.toolCalls}/${task.budget.maxToolCalls} tool calls, ${Math.round(elapsed(task, at) / 1000)}s of ${Math.round(task.budget.maxWallMs / 1000)}s.`,
  ].join(" ");

  const patch: Partial<TaskRecord> = {
    verification,
    answer: answer.length > 0 ? answer : task.answer,
    outcome: { summary, completed: done, incomplete, auditSeqs: [] },
  };

  if (met) {
    const applied = transition(task, {
      to: "COMPLETED",
      reason: "every success criterion is met",
      by: "system",
      at,
      patch: { ...patch, stop: { reason: "success-criteria-met", detail: "every success criterion is met" } },
    });
    if (!applied.ok) return { ok: false, task, reason: applied.reason };
    return { ok: true, task: applied.task };
  }

  if (structuralUnmet.length > 0) {
    const applied = transition(task, {
      to: "FAILED",
      reason: `the investigation did not meet ${structuralUnmet.length} criterion(a)`,
      by: "system",
      at,
      patch: { ...patch, stop: { reason: "failed", detail: structuralUnmet.map((criterion) => `${criterion.criterion}: ${criterion.detail}`).join("; ") } },
    });
    if (!applied.ok) return { ok: false, task, reason: applied.reason };
    return { ok: true, task: applied.task };
  }

  const applied = transition(task, {
    to: "NEEDS_OPERATOR",
    reason: "the answer is not fully supported by the evidence retrieved; the operator decides whether to continue",
    by: "system",
    at,
    patch: {
      ...patch,
      stop: { reason: "insufficient-evidence", detail: unmet.map((criterion) => `${criterion.criterion}: ${criterion.detail}`).join("; ") },
    },
  });
  if (!applied.ok) return { ok: false, task, reason: applied.reason };
  return { ok: true, task: applied.task };
}
