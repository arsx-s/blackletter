/**
 * The global stop.
 *
 * One switch, and the only one in the application: while it is engaged, no tool
 * call runs, no task step runs, and everything registered as in-flight is
 * aborted. It is deliberately **not** model-reachable: nothing under
 * `src/langgraph`, `src/providers` or `src/intelligence` imports this module
 * (an architecture guard enforces that), and the only things that call
 * `engageStop` are the operator's control, the engage helper and the tests.
 *
 * Three properties, stated because a reviewer should check them:
 *
 *   - **It persists.** The state is written to the kv store. If the stop was
 *     engaged when the window closed, it is still engaged when it opens — the
 *     safe direction, chosen on purpose.
 *   - **It aborts in-flight work without cooperation.** `stopSignal()` returns a
 *     signal that is already aborted while the stop is engaged; `linkAbort` in
 *     the tool executor and the registered in-flight aborts cover work that is
 *     already running. Nothing has to notice a message or check a flag twice.
 *   - **It cannot be released by the failure it causes.** Releasing is a separate
 *     operator action; nothing inside the module calls `releaseStop`.
 *
 * What it is not: a guarantee that a synchronous tool body stops mid-function.
 * JavaScript cannot interrupt a synchronous call, so the executor checks the
 * stop immediately before and immediately after the call, discards a result that
 * arrives after an abort, and documents exactly that here and in
 * `docs/control-plane.md`.
 */

import { kvGet, kvPut } from "../lib/db";
import { storedText } from "../lib/redact";
import {
  CONTROL_VERSION,
  STOP_KEY,
  idleStopState,
  type InFlightEntry,
  type StopState,
} from "./types";

let state: StopState = idleStopState();
let controller = new AbortController();
let loaded = false;
let loading: Promise<StopState> | null = null;
let revision = 0;

const listeners = new Set<() => void>();
const inFlight = new Map<string, InFlightEntry>();

function notify(): void {
  for (const listener of listeners) listener();
}

function persist(): void {
  void kvPut(STOP_KEY, { version: CONTROL_VERSION, state }).catch(() => undefined);
}

export function subscribeStop(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The current state. Stable between changes, so it is safe as a React snapshot. */
export function stopState(): StopState {
  return state;
}

export function isStopEngaged(): boolean {
  return state.engaged;
}

/**
 * A signal that is aborted while the stop is engaged.
 *
 * Every engagement aborts the current controller and installs a fresh one on
 * release, so work that started before the stop stays aborted and work started
 * after a release is not.
 */
export function stopSignal(): AbortSignal {
  return controller.signal;
}

export function registerInFlight(entry: InFlightEntry): () => void {
  inFlight.set(entry.id, entry);
  return () => {
    inFlight.delete(entry.id);
  };
}

export function inFlightEntries(): InFlightEntry[] {
  return [...inFlight.values()];
}

export interface EngageResult {
  state: StopState;
  abortedInFlight: number;
}

/**
 * Engage the stop. Idempotent: engaging while engaged re-states the reason and
 * aborts anything registered since, which is what a second press should do.
 */
export function engageStop(input: { reason: string; by?: "operator" | "system"; at?: number }): EngageResult {
  revision += 1;
  loaded = true;
  const at = input.at ?? Date.now();
  const reason = storedText(input.reason || "the operator stopped all work", 240).text;
  state = { engaged: true, reason, by: input.by ?? "operator", at, ...(state.releasedAt !== undefined ? { releasedAt: state.releasedAt } : {}) };
  controller.abort();
  let aborted = 0;
  for (const entry of inFlight.values()) {
    try {
      entry.abort();
      aborted += 1;
    } catch {
      // An abort that throws is not allowed to stop the stop.
    }
  }
  persist();
  notify();
  return { state, abortedInFlight: aborted };
}

/** Release the stop. Never called by anything inside this module. */
export function releaseStop(input: { at?: number } = {}): StopState {
  revision += 1;
  loaded = true;
  const at = input.at ?? Date.now();
  state = { engaged: false, reason: "", by: "operator", at: null, releasedAt: at };
  controller = new AbortController();
  persist();
  notify();
  return state;
}

/**
 * Load the persisted state. If the stop was engaged when the app closed it stays
 * engaged: a restart must not be a way of continuing work an operator stopped.
 */
export function loadStop(): Promise<StopState> {
  if (loaded) return Promise.resolve(state);
  if (loading) return loading;
  const readRevision = revision;
  loading = (async () => {
    const stored = await kvGet<unknown>(STOP_KEY).catch(() => undefined);
    // An operator action while hydration was pending wins over old persisted
    // state; loading storage must never undo a stop or release just made.
    if (revision !== readRevision) return state;
    if (stored && typeof stored === "object") {
      const record = stored as { version?: unknown; state?: unknown };
      if (record.version === CONTROL_VERSION) {
        const candidate = record.state as Partial<StopState> | undefined;
        if (candidate && typeof candidate.engaged === "boolean") {
          if (candidate.engaged) {
            state = {
              engaged: true,
              reason: storedText(typeof candidate.reason === "string" ? candidate.reason : "the global stop was engaged before the last restart", 240).text,
              by: candidate.by === "system" ? "system" : "operator",
              at: typeof candidate.at === "number" ? candidate.at : null,
            };
            controller.abort();
            notify();
          } else if (typeof candidate.releasedAt === "number") {
            state = { ...idleStopState(), releasedAt: candidate.releasedAt };
            notify();
          }
        }
      }
    }
    loaded = true;
    return state;
  })().finally(() => {
    loading = null;
  });
  return loading;
}

/** Test seam: forget in-memory state without touching persisted state. */
export function resetStopForTests(): void {
  state = idleStopState();
  controller = new AbortController();
  loaded = false;
  loading = null;
  revision = 0;
  inFlight.clear();
}
