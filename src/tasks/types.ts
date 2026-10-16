/**
 * Multi-step work: types.
 *
 * Mission 9 replaced "one prompt, one pass" with a bounded task that has an
 * explicit state machine, a recorded plan, a budget it cannot exceed, and a
 * verification step it cannot skip. Two structural rules matter more than the
 * field list:
 *
 *   1. **Success cannot be claimed.** A task reaches `COMPLETED` only from
 *      `VERIFYING`, and `VERIFYING` is entered by running the verification, not by
 *      saying the work is done. The transition table is the enforcement.
 *   2. **Every executed action is traceable.** Each step goes through the tool
 *      policy gateway and leaves an entry in the Mission 7 audit trail, and the
 *      evidence a step returned is kept on the step itself.
 *
 * What this module refuses to pretend: there is no tokenizer and no price list in
 * this build, so *token* and *currency* budgets are declared as unmeasured rather
 * than shown as if they were enforced. Steps, wall time, tool calls, retries and
 * output characters are measured, and those are the ones that stop a task.
 */

import type { Permission } from "../tools/types";

export type TaskStatus =
  | "REQUESTED"
  | "PLANNING"
  | "WAITING_FOR_APPROVAL"
  | "RUNNING"
  | "VERIFYING"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "NEEDS_OPERATOR";

export const TASK_STATUSES: readonly TaskStatus[] = [
  "REQUESTED",
  "PLANNING",
  "WAITING_FOR_APPROVAL",
  "RUNNING",
  "VERIFYING",
  "PAUSED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "NEEDS_OPERATOR",
];

export const TERMINAL_STATUSES: readonly TaskStatus[] = ["COMPLETED", "FAILED", "CANCELLED"];

export type TransitionBy = "system" | "operator" | "model";

export interface TaskTransition {
  at: number;
  from: TaskStatus;
  to: TaskStatus;
  reason: string;
  by: TransitionBy;
}

/**
 * Autonomy, in the pack's levels.
 *
 * Level 0 advises, level 1 investigates with read-only tools, level 2 executes
 * bounded actions that each need action-specific approval. Level 3 is not
 * implemented and cannot be selected.
 */
export type AutonomyLevel = 0 | 1 | 2;

export const MAX_AUTONOMY_LEVEL: AutonomyLevel = 2;

export const AUTONOMY_LEVELS: ReadonlyArray<{
  level: AutonomyLevel;
  label: string;
  description: string;
  tools: "none" | "read-only" | "read-only + approved actions";
}> = [
  {
    level: 0,
    label: "Level 0 — advise",
    description: "Plans and explains. No tool is called and no document is read.",
    tools: "none",
  },
  {
    level: 1,
    label: "Level 1 — investigate",
    description: "Runs the read-only tools against this workspace, inside a budget.",
    tools: "read-only",
  },
  {
    level: 2,
    label: "Level 2 — bounded execution",
    description: "Each action that changes anything needs its own approval, and none is granted by the goal.",
    tools: "read-only + approved actions",
  },
];

export type StopReason =
  | "success-criteria-met"
  | "budget-exhausted"
  | "insufficient-evidence"
  | "permission-boundary"
  | "needs-operator"
  | "approval-denied"
  | "cancelled"
  | "failed";

export interface TaskBudget {
  maxSteps: number;
  maxWallMs: number;
  maxToolCalls: number;
  maxRetries: number;
  maxOutputChars: number;
}

export interface TaskSpend {
  steps: number;
  toolCalls: number;
  retries: number;
  outputChars: number;
  wallMs: number;
}

/** Budgets the task machine enforces, and the hard ceiling on what may be asked for. */
export const TASK_BUDGET_LIMITS = {
  byLevel: {
    0: { maxSteps: 4, maxWallMs: 15_000, maxToolCalls: 0, maxRetries: 0, maxOutputChars: 0 },
    1: { maxSteps: 8, maxWallMs: 120_000, maxToolCalls: 12, maxRetries: 2, maxOutputChars: 120_000 },
    2: { maxSteps: 12, maxWallMs: 240_000, maxToolCalls: 20, maxRetries: 2, maxOutputChars: 200_000 },
  } as Record<AutonomyLevel, TaskBudget>,
  ceiling: { maxSteps: 16, maxWallMs: 600_000, maxToolCalls: 24, maxRetries: 3, maxOutputChars: 200_000 },
  /**
   * Budgets the pack asks for that this build cannot measure. They are named here
   * so the UI can say what was *not* enforced, instead of showing a number that
   * nothing checks.
   */
  unmeasured: ["tokens", "currency"] as const,
} as const;

export function clampBudget(level: AutonomyLevel, requested?: Partial<TaskBudget>): TaskBudget {
  const base = TASK_BUDGET_LIMITS.byLevel[level];
  const ceiling = TASK_BUDGET_LIMITS.ceiling;
  const pick = (key: keyof TaskBudget, fallback: number): number => {
    const wanted = requested?.[key];
    if (typeof wanted !== "number" || !Number.isFinite(wanted) || wanted < 0) return fallback;
    return Math.min(Math.floor(wanted), ceiling[key]);
  };
  return {
    maxSteps: pick("maxSteps", base.maxSteps),
    maxWallMs: pick("maxWallMs", base.maxWallMs),
    maxToolCalls: pick("maxToolCalls", base.maxToolCalls),
    maxRetries: pick("maxRetries", base.maxRetries),
    maxOutputChars: pick("maxOutputChars", base.maxOutputChars),
  };
}

export function emptySpend(): TaskSpend {
  return { steps: 0, toolCalls: 0, retries: 0, outputChars: 0, wallMs: 0 };
}

/* ------------------------------------------------------------ plan and steps */

/** Where a step's argument comes from. Resolved at execution time, never guessed. */
export type ArgumentResolver =
  | "goal"
  /** The goal's distinctive terms, joined: for a scored retrieval query. */
  | "terms"
  /** Only the most distinctive term: for a *literal* search, where a phrase finds nothing. */
  | "topTerm"
  | "previousHitId"
  | "previousText"
  | "goalNumbers";

export interface TaskStepSpec {
  id: string;
  tool: string;
  rationale: string;
  args: Record<string, unknown>;
  /** Argument names to fill in at run time. */
  resolve?: Record<string, ArgumentResolver>;
  /** A step whose argument cannot be resolved is skipped, not retried forever. */
  optional?: boolean;
  /** Why the planner included this step, in the operator's terms. */
  because: string;
}

/**
 * A success criterion is a *check*, not a sentence: the id names the evaluation
 * the verifier runs, and `text` is how it is shown. A criterion that no code could
 * evaluate does not belong in a plan, because a plan whose success is unfalsifiable
 * would make `COMPLETED` meaningless.
 */
export type CriterionId = "steps-completed" | "evidence-present" | "no-tool-calls" | "numbers-grounded" | "support-ratio";

export interface TaskCriterion {
  id: CriterionId;
  text: string;
  /** Used by `support-ratio`; ignored by criteria that have no threshold. */
  threshold?: number;
}

export interface TaskPlan {
  steps: TaskStepSpec[];
  successCriteria: TaskCriterion[];
  estimate: {
    difficulty: "low" | "medium" | "high";
    uncertainty: string;
    risk: "none" | "low" | "medium";
    note: string;
  };
}

export type StepStatus = "pending" | "waiting-approval" | "running" | "done" | "failed" | "skipped";

export interface StepEvidence {
  /** Chunk or item id, when the tool returned one. */
  id: string;
  /** Bounded passage text, kept so verification reads actual results. */
  text: string;
  locator?: string;
}

export interface TaskStepState {
  spec: TaskStepSpec;
  index: number;
  status: StepStatus;
  attempts: number;
  resolvedArgs: Record<string, unknown> | null;
  startedAt?: number;
  finishedAt?: number;
  outcome?: {
    status: string;
    code: string;
    summary: string;
    outputChars: number;
    durationMs: number;
  };
  /** Evidence the tool actually returned. Never model prose. */
  evidence: StepEvidence[];
  note?: string;
}

/* ---------------------------------------------------------------- approvals */

export interface TaskApproval {
  stepId: string;
  tool: string;
  requestedAt: number;
  decidedAt?: number;
  decision: "pending" | "approved" | "denied";
  by?: "operator";
  reason?: string;
}

/* ------------------------------------------------------------- verification */

export interface CriterionResult {
  criterion: string;
  met: boolean;
  detail: string;
}

export interface TaskVerification {
  at: number;
  criteria: CriterionResult[];
  met: boolean;
  /** Sentences the evidence does not support, from the grounding check. */
  unsupportedClaims: string[];
  /** `null` when no answer was provided; never a substituted number. */
  supportRatio: number | null;
  evidenceChunks: number;
  notes: string[];
}

export interface TaskOutcome {
  summary: string;
  completed: string[];
  incomplete: string[];
  /** Ids of the audit-trail entries this task produced. */
  auditSeqs: number[];
}

export interface TaskFailure {
  stepId: string;
  code: string;
  reason: string;
  at: number;
}

/**
 * A recorded change to the plan after it was made.
 *
 * The pack's loop includes "revise the plan when evidence warrants it", and a
 * revision is not a status transition — so it gets its own record rather than being
 * folded into the status history, where a `RUNNING → RUNNING` entry would be a lie
 * about what happened. Nothing is removed from a plan: a revised plan only ever
 * grows, because deleting a step that already ran would erase its result.
 */
export interface TaskRevision {
  at: number;
  by: "operator";
  note: string;
  stepId: string;
  tool: string;
}

export interface TaskRecord {
  id: string;
  version: 1;
  workspaceId: string;
  goal: string;
  constraints: string[];
  level: AutonomyLevel;
  status: TaskStatus;
  plan: TaskPlan;
  steps: TaskStepState[];
  /** Index of the next step to run. */
  currentStep: number;
  budget: TaskBudget;
  spend: TaskSpend;
  approvals: TaskApproval[];
  refusals: TaskFailure[];
  failures: TaskFailure[];
  /** Plan changes made after the plan was proposed, in order. */
  revisions: TaskRevision[];
  verification?: TaskVerification;
  outcome?: TaskOutcome;
  stop?: { reason: StopReason; detail: string };
  /** Grants this task holds. Never widened by a plan or a proposal. */
  grants: Permission[];
  createdAt: number;
  updatedAt: number;
  transitions: TaskTransition[];
  /** The synthesis the verification judged, when one was provided. */
  answer?: string;
}
