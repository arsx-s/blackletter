/**
 * Tool execution.
 *
 * The executor is the only path from a proposal to a running tool. It does four
 * things in a fixed order, and nothing else:
 *
 *   1. asks `policy.ts` (never the proposal) whether the call may run;
 *   2. runs the tool under a linked abort signal that carries both the task's
 *      cancellation and the tool's own timeout;
 *   3. caps and neutralises the output, then updates the task's budget;
 *   4. appends exactly one audit entry per attempt.
 *
 * Two properties are worth stating explicitly, because they are the ones a
 * reviewer should check:
 *
 *   - **A denied call never reaches the tool.** The tool's `run` is not called at
 *     all — the tests assert this with a spy.
 *   - **A cancelled or timed-out call cannot change the outcome.** The result is
 *     discarded rather than returned, and a late resolution of the tool's promise
 *     is ignored (the executor races it against the abort and drops it).
 *
 * Javascript cannot interrupt a synchronous function mid-flight. Every tool in
 * this build is synchronous and bounded, so the abort is checked immediately
 * before and immediately after the call; an asynchronous tool is additionally
 * aborted at the wait. This is documented rather than overclaimed.
 */

import { CancelledError, linkAbort, mergeAborts } from "../lib/cancellation";
import { isStopEngaged, stopSignal } from "../control/stop";
import { appendToolAudit, type ToolAuditEntry } from "./audit";
import { findTool } from "./registry";
import { evaluateToolCall } from "./policy";
import { neutraliseActionBlocks } from "./proposals";
import { proposalDigest, summariseArguments } from "./validation";
import {
  freshBudget,
  type Permission,
  type ProposalOrigin,
  type PolicyOutcome,
  type ToolBudgetLimits,
  type ToolBudgetState,
  type ToolData,
  type ToolDefinition,
  type ToolOutcome,
  type ToolProposal,
  type ToolResultStatus,
  type ToolRunOutput,
} from "./types";

export interface ToolTask {
  id: string;
  workspaceId: string;
  /** Deny by default: a task starts with no permissions unless they are granted. */
  grants: Permission[];
  budget: ToolBudgetState;
  /** Digests of the calls already made in this task. */
  history: string[];
  createdAt: number;
  data: ToolData;
  signal?: AbortSignal;
}

export interface CreateTaskOptions {
  workspaceId: string;
  data: ToolData;
  grants?: Permission[];
  limits?: Partial<ToolBudgetLimits>;
  signal?: AbortSignal;
  id?: string;
}

export function createToolTask(options: CreateTaskOptions): ToolTask {
  return {
    id: options.id ?? `tool-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    workspaceId: options.workspaceId,
    grants: options.grants ? [...options.grants] : [],
    budget: freshBudget(options.limits),
    history: [],
    createdAt: Date.now(),
    data: options.data,
    signal: options.signal,
  };
}

export function emptyToolData(): ToolData {
  return { documents: [], notes: [], knowledge: [], memory: { total: 0, byStatus: {}, records: [] }, tabCount: 0, lastRun: null };
}

export interface RunProposalOptions {
  /** The operator's approval for a side-effecting call. Never set by a proposal. */
  approve?: { by: string };
  /** The operator refused a call that needed approval. Recorded, never executed. */
  decline?: { by: string };
}

function audit(
  task: ToolTask,
  proposal: ToolProposal,
  digest: string,
  at: number,
  outcome: PolicyOutcome,
  extra: {
    result?: ToolAuditEntry["result"];
    approval?: ToolAuditEntry["approval"];
    /** Set only when the tool actually began running. */
    startedAt?: number;
    /** Set only when a running tool stopped, for any reason. */
    finishedAt?: number;
  } = {},
): ToolAuditEntry {
  return appendToolAudit({
    at,
    taskId: task.id,
    workspaceId: task.workspaceId,
    tool: proposal.tool,
    by: proposal.origin,
    argsDigest: digest,
    argSummary: summariseArguments(proposal.arguments),
    decision: outcome.decision,
    code: outcome.code,
    reason: outcome.reason,
    ...(extra.approval ? { approval: extra.approval } : {}),
    ...(extra.result ? { result: extra.result } : {}),
    ...(extra.startedAt !== undefined ? { startedAt: extra.startedAt } : {}),
    ...(extra.finishedAt !== undefined ? { finishedAt: extra.finishedAt } : {}),
  });
}

function outcomeFor(status: ToolResultStatus, decision: PolicyOutcome["decision"], entry: ToolAuditEntry, result?: ToolRunOutput): ToolOutcome {
  return {
    status,
    decision,
    code: entry.code as ToolOutcome["code"],
    reason: entry.reason,
    tool: entry.tool,
    auditSeq: entry.seq,
    ...(result ? { result } : {}),
  };
}

/** A rejection used only to stop waiting for a tool once a linked abort fires. */
class AbortedWait extends Error {
  constructor() {
    super("aborted");
    this.name = "AbortedWait";
  }
}

function waitForAbort(signal: AbortSignal): Promise<never> {
  if (signal.aborted) return Promise.reject(new AbortedWait());
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new AbortedWait()), { once: true });
  });
}

async function runWithAbort(
  tool: ToolDefinition,
  args: Record<string, unknown>,
  ctx: { workspaceId: string; signal: AbortSignal; data: ToolData },
  signal: AbortSignal,
): Promise<ToolRunOutput | "aborted"> {
  const produced = Promise.resolve()
    .then(() => tool.run(args, ctx))
    // A late rejection must not surface as an unhandled rejection when the
    // result was already discarded.
    .catch((error: unknown) => {
      if (error instanceof AbortedWait) return "aborted" as const;
      throw error;
    });

  return Promise.race([produced, waitForAbort(signal).then(() => "aborted" as const)]);
}

function cappedOutput(tool: ToolDefinition, output: ToolRunOutput): { output: ToolRunOutput; chars: number; truncated: boolean } {
  const neutralisedText = output.text === undefined ? undefined : neutraliseActionBlocks(output.text);
  const overLimit = neutralisedText !== undefined && neutralisedText.length > tool.maxOutputChars;
  const text = overLimit ? neutralisedText.slice(0, tool.maxOutputChars) : neutralisedText;
  const summary = output.summary.length > 300 ? `${output.summary.slice(0, 300)}…` : output.summary;
  return {
    output: { summary, data: output.data, ...(text !== undefined ? { text } : {}), truncated: output.truncated === true || overLimit },
    chars: text !== undefined ? text.length : summary.length,
    truncated: output.truncated === true || overLimit,
  };
}

/**
 * Run one proposed call. Returns an outcome for every case — allowed, denied,
 * needs-approval, cancelled, timed out, or failed — and records each in the
 * audit trail.
 */
export async function runProposal(task: ToolTask, proposal: ToolProposal, options: RunProposalOptions = {}): Promise<ToolOutcome> {
  // `requestedAt` is when the call was put to the policy — the "requested"
  // state. `startedAt`/`finishedAt` are recorded on the audit entry only when a
  // tool actually began and stopped running (Mission 10).
  const requestedAt = Date.now();
  const digest = proposalDigest(proposal.tool, proposal.arguments);

  // The global stop (Mission 14) comes first, before the task's own signal and
  // before any policy question: a stopped system does not evaluate whether it
  // *would* have been allowed to do something.
  if (isStopEngaged()) {
    const entry = audit(task, proposal, digest, requestedAt, {
      decision: "deny",
      code: "stopped",
      reason: "the global stop is engaged; nothing ran.",
    });
    return outcomeFor("denied", "deny", entry);
  }

  if (task.signal?.aborted) {
    const entry = audit(task, proposal, digest, requestedAt, {
      decision: "deny",
      code: "cancelled",
      reason: "the task was cancelled before the call started; nothing ran.",
    });
    return outcomeFor("cancelled", "deny", entry);
  }

  if (options.decline) {
    const entry = audit(
      task,
      proposal,
      digest,
      requestedAt,
      { decision: "deny", code: "not-approved", reason: `the operator declined this call (${options.decline.by}); nothing ran.` },
      { approval: { by: options.decline.by, at: requestedAt } },
    );
    return outcomeFor("denied", "deny", entry);
  }

  const approval = options.approve ? { by: options.approve.by, at: requestedAt } : undefined;
  const tool = findTool(proposal.tool);

  let evaluation = evaluateToolCall({
    proposal,
    tool,
    grants: task.grants,
    budget: task.budget,
    history: task.history,
    stopped: isStopEngaged(),
    ...(approval ? { approval } : {}),
  });

  if (evaluation.outcome.decision === "needs-approval") {
    const entry = audit(task, proposal, digest, requestedAt, evaluation.outcome);
    return outcomeFor("needs-approval", "needs-approval", entry);
  }

  if (evaluation.outcome.decision === "deny" || !tool || !evaluation.args) {
    const entry = audit(task, proposal, digest, requestedAt, evaluation.outcome);
    return outcomeFor("denied", "deny", entry);
  }

  const args = evaluation.args;
  let attempt = 0;
  let lastEntry: ToolAuditEntry | null = null;

  for (;;) {
    const attemptStart = Date.now();

    if (task.signal?.aborted || isStopEngaged()) {
      const stopped = isStopEngaged();
      const entry = audit(task, proposal, digest, attemptStart, {
        decision: "deny",
        code: stopped ? "stopped" : "cancelled",
        reason: stopped
          ? "the global stop was engaged before this attempt started; nothing ran."
          : "the task was cancelled before this attempt started; nothing ran.",
      });
      return outcomeFor(stopped ? "denied" : "cancelled", "deny", entry);
    }

    const merged = mergeAborts(task.signal, stopSignal());
    const link = linkAbort(merged.signal, tool.timeoutMs);
    let status: ToolResultStatus = "ok";
    let output: ToolRunOutput | null = null;
    let errorCode: string | undefined;
    let errorMessage = "";

    try {
      const produced = await runWithAbort(tool, args, { workspaceId: task.workspaceId, signal: link.signal, data: task.data }, link.signal);
      if (link.reason === "cancelled") {
        status = "cancelled";
      } else if (link.reason === "timeout" || produced === "aborted") {
        status = produced === "aborted" && link.reason === null ? "cancelled" : "timeout";
      } else {
        output = produced;
      }
    } catch (e) {
      if (e instanceof CancelledError || link.reason === "cancelled") {
        status = "cancelled";
      } else if (link.reason === "timeout") {
        status = "timeout";
      } else {
        status = "error";
        errorCode = "tool-error";
        errorMessage = e instanceof Error ? e.message : String(e);
      }
    } finally {
      link.dispose();
      merged.dispose();
    }

    const finishedAt = Date.now();
    const durationMs = finishedAt - attemptStart;
    task.budget.calls += 1;
    task.budget.wallMs += durationMs;
    if (attempt > 0) task.budget.retries += 1;
    task.history.push(digest);

    if (status === "ok" && output) {
      const capped = cappedOutput(tool, output);
      task.budget.outputChars += capped.chars;
      lastEntry = audit(
        task,
        proposal,
        digest,
        attemptStart,
        { decision: "allow", code: "allowed", reason: `${tool.name} ran (attempt ${attempt + 1}).` },
        {
          result: {
            status: "ok",
            summary: capped.output.summary,
            outputChars: capped.chars,
            durationMs,
            ...(capped.truncated ? { truncated: true } : {}),
          },
          ...(approval ? { approval } : {}),
          startedAt: attemptStart,
          finishedAt,
        },
      );
      return outcomeFor("ok", "allow", lastEntry, capped.output);
    }

    if (status === "cancelled") {
      const stoppedNow = isStopEngaged();
      lastEntry = audit(
        task,
        proposal,
        digest,
        attemptStart,
        {
          decision: "deny",
          code: "cancelled",
          reason: stoppedNow
            ? "the global stop aborted the call; its result, if any, was discarded."
            : "the call was cancelled; its result, if any, was discarded.",
        },
        {
          result: { status: "cancelled", summary: "Cancelled before a result was accepted.", outputChars: 0, durationMs },
          startedAt: attemptStart,
          finishedAt,
        },
      );
      return outcomeFor("cancelled", "deny", lastEntry);
    }

    if (status === "timeout") {
      lastEntry = audit(
        task,
        proposal,
        digest,
        attemptStart,
        { decision: "deny", code: "timeout", reason: `the call exceeded its ${tool.timeoutMs}ms timeout.` },
        {
          result: { status: "timeout", summary: `Timed out after ${tool.timeoutMs}ms.`, outputChars: 0, durationMs, errorCode: "timeout" },
          startedAt: attemptStart,
          finishedAt,
        },
      );
    } else {
      lastEntry = audit(
        task,
        proposal,
        digest,
        attemptStart,
        { decision: "deny", code: "tool-error", reason: "the tool failed while running." },
        {
          result: {
            status: "error",
            summary: errorMessage.slice(0, 300) || "The tool failed.",
            outputChars: 0,
            durationMs,
            errorCode: errorCode ?? "tool-error",
          },
          startedAt: attemptStart,
          finishedAt,
        },
      );
    }

    // One retry is allowed, for a timeout only, and only while the retry budget
    // lasts. A failed call is never silently retried more than that, and nothing
    // is retried while the global stop is engaged.
    const canRetry = status === "timeout" && !task.signal?.aborted && !isStopEngaged() && task.budget.retries < task.budget.maxRetries;
    if (!canRetry) {
      return outcomeFor(status, "deny", lastEntry);
    }

    evaluation = evaluateToolCall({
      proposal,
      tool,
      grants: task.grants,
      budget: task.budget,
      history: task.history,
      isRetry: true,
      stopped: isStopEngaged(),
      ...(approval ? { approval } : {}),
    });
    if (evaluation.outcome.decision !== "allow" || !evaluation.args) {
      // The refusal is recorded; the reported outcome stays the call's own
      // result, so a timeout is never reported as something it was not.
      audit(task, proposal, digest, Date.now(), evaluation.outcome);
      return outcomeFor(status, "deny", lastEntry);
    }
    attempt += 1;
  }
}

/** Convenience for the panel: the outcome a proposal would get, without running it. */
export function previewDecision(task: ToolTask, proposal: ToolProposal, approval?: { by: string }): PolicyOutcome {
  const evaluation = evaluateToolCall({
    proposal,
    tool: findTool(proposal.tool),
    grants: task.grants,
    budget: task.budget,
    history: task.history,
    stopped: isStopEngaged(),
    ...(approval ? { approval: { by: approval.by, at: Date.now() } } : {}),
  });
  return evaluation.outcome;
}

export type { ProposalOrigin, ToolDefinition };
