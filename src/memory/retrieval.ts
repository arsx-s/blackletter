/**
 * Memory retrieval.
 *
 * Retrieval reads the live `MemoryState`, which is the same object a deletion
 * mutates. That is the mechanism behind "deleting memory removes it from
 * retrieval": there is no index to forget to update, because the only index is
 * the record list itself. An expired record is skipped even before the retention
 * sweep runs, so an expiry cannot be delayed into a prompt.
 *
 * Retrieved records are labelled with their epistemic status and origin in the
 * prompt text. The model is told what the operator asserted, what the model
 * inferred, and what was actually verified, because treating all three alike is
 * how an inference quietly becomes a fact.
 */

import type { MemoryAuditEntry, MemoryRecord, MemoryState } from "./types";
import { EPISTEMIC_STATUS_LABELS, MEMORY_CATEGORY_LABELS, MEMORY_ORIGIN_LABELS } from "./types";
import { conflictReason, contentWords, isExpired, isReviewDue, memoryStats, type MemoryStats } from "./state";

/** Upper bound on the memory block injected into a prompt. */
export const MEMORY_CONTEXT_MAX_CHARS = 2200;

/** Per-record excerpt inside the block. */
const MEMORY_EXCERPT_CHARS = 320;

export interface MemoryHit {
  record: MemoryRecord;
  score: number;
  matched: string[];
}

export interface MemoryQueryOptions {
  /** Records scoped to this workspace, plus records scoped to every workspace. */
  workspaceId?: string | null;
  limit?: number;
  now?: number;
}

export function retrieveMemory(state: MemoryState, query: string, options: MemoryQueryOptions = {}): MemoryHit[] {
  const now = options.now ?? Date.now();
  const limit = options.limit ?? 8;
  const workspaceId = options.workspaceId ?? null;
  const terms = contentWords(query);

  const hits: MemoryHit[] = [];
  for (const record of state.records) {
    if (isExpired(record, now)) continue;
    if (record.scope.workspaceId !== null && record.scope.workspaceId !== workspaceId) continue;

    const words = new Set(contentWords(record.content));
    const matched = terms.filter((term) => words.has(term));
    // A record about the same subject outranks one that is merely recent, and a
    // global record is worth slightly less than a workspace-specific one.
    const overlap = terms.length > 0 ? matched.length / terms.length : 0;
    const scopeBonus = record.scope.workspaceId === null ? 0 : 0.05;
    const statusWeight = record.status === "verified" || record.status === "supported" ? 0.05 : 0;
    hits.push({ record, score: overlap + scopeBonus + statusWeight, matched });
  }

  // With a query in hand, a record with nothing in common is noise in a prompt.
  const candidate = terms.length > 0 ? hits.filter((hit) => hit.matched.length > 0) : hits;

  if (terms.length === 0) {
    // Nothing asked for: most recently changed first, which is the closest thing
    // to a sensible default and is at least deterministic.
    candidate.sort(
      (a, b) => b.record.updatedAt - a.record.updatedAt || (a.record.id < b.record.id ? -1 : a.record.id > b.record.id ? 1 : 0),
    );
    return candidate.slice(0, limit);
  }

  candidate.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.record.updatedAt !== a.record.updatedAt) return b.record.updatedAt - a.record.updatedAt;
    return a.record.id < b.record.id ? -1 : a.record.id > b.record.id ? 1 : 0;
  });

  return candidate.slice(0, limit);
}

function provenanceSuffix(record: MemoryRecord): string {
  const source = record.provenance.source;
  const parts: string[] = [];
  if (source.name) parts.push(source.name);
  if (source.locator) parts.push(source.locator);
  if (source.retrievedAt) parts.push(`read ${new Date(source.retrievedAt).toISOString().slice(0, 10)}`);
  return parts.length > 0 ? ` — source: ${parts.join(", ")}` : "";
}

/**
 * Render retrieved records for a prompt. Every line says what the record is and
 * how far it is trusted; an empty result renders nothing at all rather than a
 * hopeful heading.
 */
export function formatMemoryContext(hits: MemoryHit[]): string {
  if (hits.length === 0) return "";

  const lines: string[] = [
    "WHAT BLACKLETTER REMEMBERS (labelled records; [category · status · origin] is how far each is trusted)",
  ];
  for (const hit of hits) {
    const record = hit.record;
    const label = `[${MEMORY_CATEGORY_LABELS[record.category]} · ${EPISTEMIC_STATUS_LABELS[record.status]} · ${
      MEMORY_ORIGIN_LABELS[record.provenance.origin]
    }]`;
    const excerpt = record.content.length > MEMORY_EXCERPT_CHARS ? `${record.content.slice(0, MEMORY_EXCERPT_CHARS).trim()}…` : record.content;
    const line = `- ${label} ${excerpt}${provenanceSuffix(record)}`;
    const projected = lines.join("\n").length + line.length + 1;
    if (projected > MEMORY_CONTEXT_MAX_CHARS) break;
    lines.push(line);
  }

  if (hits.some((hit) => hit.record.status === "disputed")) {
    lines.push("Note: records marked Disputed conflict with another stored record; do not present either side as settled.");
  }
  if (hits.some((hit) => hit.record.provenance.origin === "legacy-import")) {
    lines.push("Note: records marked legacy import have no recorded origin; treat them as unverified background.");
  }

  return lines.join("\n");
}

/** Convenience wrapper used by the workspace store. */
export function memoryContextText(
  state: MemoryState,
  workspaceId: string | null,
  query: string,
  options: MemoryQueryOptions = {},
): string {
  return formatMemoryContext(retrieveMemory(state, query, { ...options, workspaceId }));
}

/** Records the panel should surface first: disputes, then anything due. */
export function recordsNeedingAttention(state: MemoryState, workspaceId: string | null, now: number = Date.now()): {
  disputes: Array<{ a: MemoryRecord; b: MemoryRecord; reason: string }>;
  reviewDue: MemoryRecord[];
  expired: MemoryRecord[];
} {  const mine = (record: MemoryRecord) => record.scope.workspaceId === null || record.scope.workspaceId === workspaceId;
  const pairs: Array<{ a: MemoryRecord; b: MemoryRecord; reason: string }> = [];
  for (let i = 0; i < state.records.length; i++) {
    for (let j = i + 1; j < state.records.length; j++) {
      const a = state.records[i];
      const b = state.records[j];
      if (!mine(a) || !mine(b)) continue;
      if (a.supersedes.includes(b.id) || b.supersedes.includes(a.id)) continue;
      const reason = conflictReason(a, b);
      if (reason) pairs.push({ a, b, reason });
    }
  }
  return {
    disputes: pairs,
    reviewDue: state.records.filter((record) => mine(record) && isReviewDue(record, now)),
    expired: state.records.filter((record) => mine(record) && isExpired(record, now)),
  };
}

/** Everything the memory panel shows, derived from state alone. */
export interface MemoryView {
  records: MemoryRecord[];
  audit: MemoryAuditEntry[];
  stats: MemoryStats;
  disputes: Array<{ a: MemoryRecord; b: MemoryRecord; reason: string }>;
  reviewDue: MemoryRecord[];
  expired: MemoryRecord[];
}

export function memoryView(state: MemoryState, workspaceId: string | null): MemoryView {
  const visible = (record: MemoryRecord): boolean => record.scope.workspaceId === null || record.scope.workspaceId === workspaceId;
  const records = state.records.filter(visible).sort((a, b) => b.updatedAt - a.updatedAt);
  const attention = recordsNeedingAttention(state, workspaceId);
  return {
    records,
    audit: state.audit
      .filter((entry) => entry.workspaceId === null || entry.workspaceId === workspaceId)
      .slice()
      .sort((a, b) => b.at - a.at),
    stats: memoryStats(state),
    disputes: attention.disputes,
    reviewDue: attention.reviewDue,
    expired: attention.expired,
  };
}
