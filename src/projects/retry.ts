/**
 * Retry policy: which failures are worth another attempt, and which are
 * decisions.
 *
 * "Retry the failure" is only meaningful if the failure can be told apart from
 * the others, so this module classifies a tool outcome into exactly three
 * classes and never guesses beyond them:
 *
 *   - **transient** — the same call may well succeed later: a timeout, or an
 *     error whose code is in the declared set below. A closed set, not a
 *     heuristic: an unknown code is deterministic.
 *   - **deterministic** — the call ran and failed on its inputs; repeating it
 *     unchanged is expected to fail again. Changing the arguments is a *plan
 *     revision*, not a retry, and belongs to the operator.
 *   - **operator** — a denial, a cancelled call or a call waiting for approval
 *     is not a failure to retry at all. Retrying a decision would be a way of
 *     asking twice, which is exactly what the approval gate exists to prevent.
 *
 * Nothing here sleeps, schedules or executes. It produces a decision and a
 * delay, and the caller decides whether to act on it.
 */

import type { ToolResultStatus } from "../tools/types";

export type FailureClass = "transient" | "deterministic" | "operator";

/** Error codes that mean "the environment was busy"; anything else is deterministic. */
export const TRANSIENT_ERROR_CODES: readonly string[] = [
  "etimedout",
  "econnreset",
  "econnrefused",
  "rate-limited",
  "busy",
  "temporarily-unavailable",
];

export const RETRY_BACKOFF_BASE_MS = 500;
export const RETRY_BACKOFF_MAX_MS = 30_000;

export function classifyToolFailure(status: ToolResultStatus, errorCode?: string): FailureClass {
  if (status === "timeout") return "transient";
  if (status === "denied" || status === "needs-approval" || status === "cancelled") return "operator";
  if (status === "error") {
    const code = (errorCode ?? "").toLowerCase();
    return TRANSIENT_ERROR_CODES.includes(code) ? "transient" : "deterministic";
  }
  // `ok` is not a failure. Calling this function on it is an error in the
  // caller's logic, and the honest answer is determinism: nothing to retry.
  return "deterministic";
}

export function describeFailureClass(failureClass: FailureClass): string {
  switch (failureClass) {
    case "transient":
      return "Transient: the same call may succeed on another attempt.";
    case "deterministic":
      return "Deterministic: the call ran and failed on its arguments; repeating it unchanged is not a retry, it is a repeat.";
    case "operator":
      return "A decision, not a failure: a denial, a cancellation or a pending approval is not retried automatically.";
  }
}

export interface RetryDecision {
  failureClass: FailureClass;
  retry: boolean;
  /** Attempts already made. 1 means one attempt happened and this is the decision about a second. */
  attempts: number;
  /** Milliseconds to wait before the next attempt, when `retry` is true. */
  delayMs: number | null;
  reason: string;
}

export interface RetryInput {
  status: ToolResultStatus;
  errorCode?: string;
  attempts: number;
  maxRetries: number;
}

/**
 * The decision for one failed call. `maxRetries` comes from the task's budget,
 * so a project cannot grant itself more attempts than the task machine allows.
 */
export function retryDecision(input: RetryInput): RetryDecision {
  const failureClass = classifyToolFailure(input.status, input.errorCode);
  const attempts = Math.max(0, Math.floor(input.attempts));
  const maxRetries = Math.max(0, Math.floor(input.maxRetries));

  if (input.status === "ok") {
    return { failureClass, retry: false, attempts, delayMs: null, reason: "Nothing to retry: the call succeeded." };
  }
  if (failureClass === "operator") {
    return { failureClass, retry: false, attempts, delayMs: null, reason: describeFailureClass(failureClass) };
  }
  if (failureClass === "deterministic") {
    return {
      failureClass,
      retry: false,
      attempts,
      delayMs: null,
      reason: describeFailureClass(failureClass),
    };
  }
  if (attempts > maxRetries) {
    return {
      failureClass,
      retry: false,
      attempts,
      delayMs: null,
      reason: `Transient, but the budget's ${maxRetries} retries are spent; the task stops and asks.`,
    };
  }
  const delayMs = Math.min(RETRY_BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1), RETRY_BACKOFF_MAX_MS);
  return {
    failureClass,
    retry: true,
    attempts,
    delayMs,
    reason: `Transient: attempt ${attempts} of ${maxRetries + 1} after ${delayMs} ms.`,
  };
}
