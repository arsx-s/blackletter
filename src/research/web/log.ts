import { kvDelete, kvGet, kvPut } from "../../lib/db";
import type { ResearchRunRecord } from "./types";

/**
 * The research log: every retrieval run, with the sources it actually fetched.
 *
 * Kept separate from the workspace store for the same reason the tool audit is:
 * what the app *retrieved* is evidence about its own behaviour, and it should
 * survive a reload without being part of the document state a user edits. It is
 * capped hard, because a research log that grows without limit becomes a copy of
 * the web inside the app.
 */

export const MAX_WEB_RUNS = 30;
export const MAX_WEB_RUNS_PER_WORKSPACE = 10;
const LOG_KEY = "web-research";

let runs: ResearchRunRecord[] = [];
let dropped = 0;
let loaded = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const cb of listeners) cb();
}

export function subscribeWebResearch(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Newest first, optionally for one workspace. */
export function webRunsFor(workspaceId?: string): readonly ResearchRunRecord[] {
  return workspaceId ? runs.filter((run) => run.workspaceId === workspaceId) : runs;
}

export function latestWebRunFor(workspaceId: string): ResearchRunRecord | null {
  return runs.find((run) => run.workspaceId === workspaceId) ?? null;
}

export function webRunsDroppedCount(): number {
  return dropped;
}

function persist(): void {
  void kvPut(LOG_KEY, runs).catch(() => undefined);
}

function freezeRun(run: ResearchRunRecord): ResearchRunRecord {
  const sources = Object.freeze(run.sources.map((source) => Object.freeze({ ...source, duplicates: Object.freeze([...source.duplicates]) })));
  const failures = Object.freeze(run.failures.map((failure) => Object.freeze({ ...failure })));
  const claims = Object.freeze(run.claims.map((claim) => Object.freeze({ ...claim })));
  const conflicts = Object.freeze(run.conflicts.map((conflict) => Object.freeze({ ...conflict })));
  return Object.freeze({
    ...run,
    sources: sources as unknown as ResearchRunRecord["sources"],
    failures: failures as unknown as ResearchRunRecord["failures"],
    claims: claims as unknown as ResearchRunRecord["claims"],
    conflicts: conflicts as unknown as ResearchRunRecord["conflicts"],
  });
}

/**
 * Store one run. Sources are frozen along with the run, so a panel cannot edit a
 * retrieved page after the fact and still call it retrieved.
 */
export function appendWebRun(run: ResearchRunRecord): ResearchRunRecord {
  const stored = freezeRun(run);
  runs = [stored, ...runs];

  // Per-workspace cap first: the point of the log is the recent history of this
  // workspace, not a global archive.
  const counts = new Map<string, number>();
  const kept: ResearchRunRecord[] = [];
  for (const entry of runs) {
    const used = counts.get(entry.workspaceId) ?? 0;
    if (used >= MAX_WEB_RUNS_PER_WORKSPACE) {
      dropped += 1;
      continue;
    }
    counts.set(entry.workspaceId, used + 1);
    kept.push(entry);
  }
  runs = kept.slice(0, MAX_WEB_RUNS);
  dropped += Math.max(0, kept.length - runs.length);

  persist();
  notify();
  return stored;
}

function isRunnable(value: unknown): value is ResearchRunRecord {
  if (!value || typeof value !== "object") return false;
  const run = value as Partial<ResearchRunRecord>;
  return (
    typeof run.id === "string" &&
    typeof run.workspaceId === "string" &&
    typeof run.question === "object" &&
    run.question !== null &&
    Array.isArray(run.sources) &&
    Array.isArray(run.claims) &&
    Array.isArray(run.failures) &&
    Array.isArray(run.conflicts)
  );
}

export async function loadWebResearch(): Promise<void> {
  if (loaded) return;
  loaded = true;
  const stored = await kvGet<unknown>(LOG_KEY);
  if (Array.isArray(stored)) {
    runs = stored.filter(isRunnable).map((run) => ({ ...run, sources: [...run.sources], claims: [...run.claims] }));
    notify();
  }
}

export async function clearWebResearch(): Promise<void> {
  runs = [];
  dropped = 0;
  await kvDelete(LOG_KEY);
  notify();
}

/** Test seam: forget the in-memory log without touching persisted state. */
export function resetWebResearchForTests(): void {
  runs = [];
  dropped = 0;
  loaded = false;
}
