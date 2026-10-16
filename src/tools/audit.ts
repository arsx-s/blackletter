/**
 * The tool audit trail.
 *
 * Every proposal produces exactly one entry — including the ones that were
 * refused, the ones that needed approval and never ran, and the ones observed in
 * a model response and deliberately not executed. The entry carries the agent
 * that asked, the arguments as a *summary* (content fields are reduced to a
 * digest and a length), the policy decision and its code, the approval identity
 * if any, the result status, timing, and a safe error code.
 *
 * The lifecycle is three distinct states, and the fields say which ones actually
 * happened:
 *
 *   - `at`          — the call was **requested** (put to the policy);
 *   - `startedAt`   — a tool began **running** (present only when it did);
 *   - `finishedAt`  — it **stopped**, for any reason (ok, error, timeout,
 *                     cancellation; present only when a run started).
 *
 * There is no fourth state. An entry never says a tool result was "verified":
 * a tool returning data is not evidence that the data is true, and verification
 * lives in the grounding report and the task machine, not here.
 *
 * "Immutable-enough" means three concrete things:
 *
 *   1. entries are frozen, and there is no API that edits or reorders them;
 *   2. each entry carries a digest of its own fields, so a rewrite is detectable;
 *   3. sequence numbers are monotonic and never reused, even across reloads
 *      (the next sequence is derived from the highest persisted one).
 *
 * The trail is capped at `MAX_TOOL_AUDIT` entries. Dropping the oldest entry is
 * recorded as a count on the next append (`dropped`), so the cap is visible
 * rather than silent.
 */

import { kvDelete, kvGet, kvPut } from "../lib/db";
import { digestValue } from "../lib/hash";
import type { PolicyCode, PolicyDecision, ProposalOrigin, ToolResultStatus } from "./types";

export const MAX_TOOL_AUDIT = 500;
const AUDIT_KEY = "tool-audit";

export interface ToolAuditResult {
  status: ToolResultStatus;
  /** One line describing what happened; never contains document or note content. */
  summary: string;
  outputChars: number;
  durationMs: number;
  errorCode?: string;
  truncated?: boolean;
}

export interface ToolAuditEntry {
  /** Monotonic, never reused. */
  seq: number;
  /** When the call was requested (put to the policy). */
  at: number;
  /** When the tool began running. Absent when nothing ran. */
  startedAt?: number;
  /** When a running tool stopped. Absent when nothing ran. */
  finishedAt?: number;
  taskId: string;
  workspaceId: string;
  tool: string;
  by: ProposalOrigin;
  argsDigest: string;
  argSummary: string;
  decision: PolicyDecision | "observed";
  code: PolicyCode | "observed-not-executed";
  reason: string;
  approval?: { by: string; at: number };
  result?: ToolAuditResult;
  /** Digest of this entry's own fields, so a rewrite can be detected. */
  digest: string;
}

export type ToolAuditInput = Omit<ToolAuditEntry, "seq" | "digest">;

let entries: ToolAuditEntry[] = [];
let nextSeq = 1;
let loaded = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const cb of listeners) cb();
}

export function subscribeToolAudit(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Newest first. The array is a copy; the entries themselves are frozen. */
export function toolAuditEntries(): readonly ToolAuditEntry[] {
  return entries;
}

export function toolAuditDroppedCount(): number {
  return dropped;
}

let dropped = 0;

function freezeEntry(entry: ToolAuditEntry): ToolAuditEntry {
  if (entry.result) Object.freeze(entry.result);
  if (entry.approval) Object.freeze(entry.approval);
  return Object.freeze(entry);
}

function persist(): void {
  void kvPut(AUDIT_KEY, entries).catch(() => undefined);
}

export function appendToolAudit(input: ToolAuditInput): ToolAuditEntry {
  const body = {
    ...input,
    approval: input.approval ? { ...input.approval } : undefined,
    result: input.result ? { ...input.result } : undefined,
  };
  const entry = freezeEntry({ ...body, seq: nextSeq, digest: digestValue({ seq: nextSeq, ...body }) });
  nextSeq += 1;
  entries = [entry, ...entries];
  if (entries.length > MAX_TOOL_AUDIT) {
    const removed = entries.length - MAX_TOOL_AUDIT;
    entries = entries.slice(0, MAX_TOOL_AUDIT);
    dropped += removed;
  }
  persist();
  notify();
  return entry;
}

export async function loadToolAudit(): Promise<void> {
  if (loaded) return;
  loaded = true;
  const stored = await kvGet<ToolAuditEntry[]>(AUDIT_KEY);
  if (Array.isArray(stored)) {
    entries = stored
      .filter((entry) => entry && typeof entry.seq === "number" && typeof entry.tool === "string")
      .map((entry) => freezeEntry({ ...entry }));
    const highest = entries.reduce((max, entry) => Math.max(max, entry.seq), 0);
    nextSeq = highest + 1;
  }
  notify();
}

export async function clearToolAudit(): Promise<void> {
  entries = [];
  dropped = 0;
  await kvDelete(AUDIT_KEY);
  notify();
}

/** Test seam: forget everything, including the persisted copy. */
export function resetToolAuditForTests(): void {
  entries = [];
  dropped = 0;
  nextSeq = 1;
  loaded = false;
}
