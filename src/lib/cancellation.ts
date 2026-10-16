/**
 * Cancellation primitives shared by the UI, the pipeline and the providers.
 *
 * The important distinction this module exists to make: a *user cancellation*
 * and a *timeout* both abort a fetch, and Node/DOM surfaces both as an
 * `AbortError`. Reporting a cancelled run as "Request timed out" — or worse,
 * silently retrying it — is a correctness bug, so the reason is tracked
 * explicitly on the controller that actually performs the abort.
 */

export const CANCELLED = "CANCELLED";

export class CancelledError extends Error {
  readonly code = CANCELLED;

  constructor(message = "Cancelled by the operator.") {
    super(message);
    this.name = "CancelledError";
  }
}

/** True for our own cancellation error and for a bare DOM `AbortError`. */
export function isCancelledError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; name?: unknown };
  return record.code === CANCELLED || record.name === "AbortError";
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new CancelledError();
}

export type AbortReason = "cancelled" | "timeout" | null;

export interface LinkedAbort {
  readonly signal: AbortSignal;
  /** Why the controller fired, or `null` while it is still live. */
  readonly reason: AbortReason;
  /** Detach listeners and timers. Always call this in a `finally`. */
  dispose(): void;
}

/**
 * Merge an external cancellation signal with an internal timeout into a single
 * signal, remembering which of the two caused the abort.
 */
export function linkAbort(external: AbortSignal | undefined, timeoutMs: number): LinkedAbort {
  const controller = new AbortController();
  let reason: AbortReason = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onAbort = () => {
    if (reason) return;
    reason = "cancelled";
    controller.abort();
  };

  if (external) {
    if (external.aborted) {
      reason = "cancelled";
      controller.abort();
    } else {
      external.addEventListener("abort", onAbort, { once: true });
    }
  }

  if (timeoutMs > 0) {
    timer = setTimeout(() => {
      if (reason) return;
      reason = "timeout";
      controller.abort();
    }, timeoutMs);
  }

  return {
    signal: controller.signal,
    get reason() {
      return reason;
    },
    dispose() {
      if (timer !== undefined) clearTimeout(timer);
      external?.removeEventListener("abort", onAbort);
    },
  };
}

export interface MergedAborts {
  /** Undefined when no parent signal was given, so `linkAbort` behaves as before. */
  signal: AbortSignal | undefined;
  dispose(): void;
}

/**
 * One signal that follows several parents — the task's own cancellation and the
 * global stop, in Mission 14. `dispose` detaches from every parent, which is what
 * keeps a per-call merge from leaking a listener onto a long-lived signal.
 */
export function mergeAborts(...parents: Array<AbortSignal | undefined>): MergedAborts {
  const live = parents.filter((signal): signal is AbortSignal => signal !== undefined);
  if (live.length === 0) return { signal: undefined, dispose: () => undefined };
  if (live.length === 1) return { signal: live[0], dispose: () => undefined };

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  for (const signal of live) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", onAbort);
  }

  return {
    signal: controller.signal,
    dispose() {
      for (const signal of live) signal.removeEventListener("abort", onAbort);
    },
  };
}
