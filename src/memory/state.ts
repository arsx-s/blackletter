/**
 * Memory operations.
 *
 * Everything here is a pure function over `MemoryState`: the caller persists the
 * result. That keeps the guarantees testable without a browser, and it means a
 * deletion cannot "mostly" happen — retrieval reads the same state the delete
 * returned.
 *
 * The properties the tests defend:
 *
 * - an origin is recorded once and never rewritten;
 * - a duplicate is not stored twice, and the merge is visible in the history;
 * - a contradiction is preserved on both sides and marked `disputed`, never
 *   resolved by deleting one of them;
 * - a deletion removes the record from the state (so retrieval cannot return it)
 *   and leaves an audit entry containing only a content digest;
 * - legacy state is imported with unknown origin rather than guessed origin.
 */

import { STOP } from "../pipeline/grounding";
import { fnv1a32 } from "../lib/hash";
import {
  MEMORY_AUDIT_LIMIT,
  MEMORY_SCHEMA_VERSION,
  type EpistemicStatus,
  type MemoryAuditEntry,
  type MemoryCategory,
  type MemoryOrigin,
  type MemoryProvenance,
  type MemoryRecord,
  type MemoryRevision,
  type MemoryScope,
  type MemorySourceRef,
  type MemoryState,
  type RetentionPolicy,
  OPERATOR_SETTABLE_STATUSES,
} from "./types";

/** A record's content is bounded so one paste cannot dominate every prompt. */
export const MEMORY_MAX_CONTENT_CHARS = 4000;

/** Hard ceiling on stored records. Reaching it refuses new records, visibly. */
export const MEMORY_MAX_RECORDS = 5000;

/** Auto-recorded memory per workspace before the oldest are retired. */
export const MEMORY_MAX_AUTO_PER_WORKSPACE = 120;

/** How long a `review` record may sit before the panel surfaces it. */
export const MEMORY_REVIEW_AFTER_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * When two records are about the same thing, and they disagree on polarity or on
 * a figure, both are kept and marked disputed. The overlap is measured against
 * the *smaller* word set, because a longer restatement of the same claim is
 * still the same subject ("operates at 900" against "does not operate at 900").
 * Requiring two shared content words keeps unrelated sentences that happen to
 * share a noun from being flagged.
 */
export const CONTRADICTION_POLICY = {
  minSharedWords: 2,
  overlap: 0.6,
};

const NEGATION = /\b(?:no|not|never|none|without|isn'?t|aren'?t|doesn'?t|don'?t|didn'?t|won'?t|cannot|can'?t|fails?|failed|disproved)\b/i;

/* ------------------------------------------------------------------ helpers */

export function emptyMemoryState(): MemoryState {
  return { version: MEMORY_SCHEMA_VERSION, records: [], audit: [], legacyMigratedAt: null };
}

/** Trim and collapse whitespace without changing meaning. */
export function normaliseContent(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}

/** Content words, used for similarity and for conflict detection. */
export function contentWords(content: string): string[] {
  const words = normaliseContent(content)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((word) => word.length > 2 && !STOP.has(word) && !/^\d+$/.test(word));
  return [...new Set(words)];
}

export function numbersIn(content: string): string[] {
  const matches = content.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  return [...new Set(matches.map((match) => match.replace(/,/g, "")))].sort();
}

export function contentHash(content: string): string {
  return `fnv1a32:${fnv1a32(normaliseContent(content).toLowerCase())}`;
}

function scopeKey(scope: MemoryScope): string {
  return scope.workspaceId ?? "*";
}

/** Ids are content-addressed, which makes re-importing legacy state idempotent. */
export function memoryRecordId(category: MemoryCategory, content: string, scope: MemoryScope): string {
  return `mem-${fnv1a32(`${category}\u0000${normaliseContent(content).toLowerCase()}\u0000${scopeKey(scope)}`)}`;
}

/**
 * The status a record starts with, derived from where it came from. This is the
 * "never silently promote an inference into a confirmed personal fact" rule:
 * a model inference starts as `inferred`, and only an explicit revision can
 * change that.
 */
export function statusForOrigin(origin: MemoryOrigin, source: MemorySourceRef): EpistemicStatus {
  switch (origin) {
    case "user":
      // The operator said it; that is authority, not verification.
      return "assumed";
    case "model-inference":
      return "inferred";
    case "external-source":
      // A locator means the passage was retrieved and can be pointed at.
      return source.locator ? "supported" : "unverified";
    case "legacy-import":
      return "unknown";
  }
}

export function defaultRetention(auto: boolean): RetentionPolicy {
  return auto ? { mode: "review" } : { mode: "keep" };
}

/* ----------------------------------------------------------- record creation */

export interface MemoryInput {
  category: MemoryCategory;
  content: string;
  provenance: MemoryProvenance;
  scope?: MemoryScope;
  retention?: RetentionPolicy;
  tags?: string[];
  supersedes?: string[];
  /** Set by code paths that have actually performed a check. */
  status?: EpistemicStatus;
  /** True for records the application made without being asked. */
  auto?: boolean;
}

export type MemoryAddOutcome = "created" | "duplicate" | "conflict" | "rejected";

export interface MemoryAddResult {
  state: MemoryState;
  outcome: MemoryAddOutcome;
  record?: MemoryRecord;
  /** Present for `duplicate`, `conflict` and `rejected`. */
  detail?: string;
}

export function addRecord(state: MemoryState, input: MemoryInput, now: number = Date.now()): MemoryAddResult {
  const content = normaliseContent(input.content);
  const scope: MemoryScope = input.scope ?? { workspaceId: null };

  if (!content) return { state, outcome: "rejected", detail: "a memory record needs content" };
  if (content.length > MEMORY_MAX_CONTENT_CHARS) {
    return {
      state,
      outcome: "rejected",
      detail: `content is ${content.length} characters; the limit is ${MEMORY_MAX_CONTENT_CHARS}`,
    };
  }

  const auto = input.auto === true;
  const duplicate = state.records.find(
    (record) =>
      record.category === input.category &&
      record.scope.workspaceId === scope.workspaceId &&
      normaliseContent(record.content).toLowerCase() === content.toLowerCase(),
  );
  if (duplicate) {
    // Stored once. The merge is recorded so the second sighting is not invisible.
    const merged = withRevision(duplicate, { at: now, action: "merged", note: input.provenance.note }, now);
    return {
      state: replaceRecord(state, merged),
      outcome: "duplicate",
      record: merged,
      detail: "an identical record already exists; it was not stored twice",
    };
  }

  const record: MemoryRecord = {
    id: memoryRecordId(input.category, content, scope),
    category: input.category,
    content,
    status: input.status ?? statusForOrigin(input.provenance.origin, input.provenance.source),
    provenance: { ...input.provenance, source: { ...input.provenance.source } },
    scope,
    createdAt: now,
    updatedAt: now,
    lastRetrievedAt: null,
    retention: input.retention ?? defaultRetention(auto),
    revisions: [{ at: now, action: "created", note: input.provenance.note }],
    tags: [...(input.tags ?? [])],
    supersedes: [...(input.supersedes ?? [])],
    auto,
  };

  const conflicts = findConflicts(state, record);
  let next: MemoryState = insertRecord(state, record);

  if (conflicts.length > 0) {
    // Both sides are kept, and both are marked disputed with the reason.
    const reason = conflicts[0].reason;
    record.status = "disputed";
    record.revisions.push({
      at: now,
      action: "dispute",
      note: `Kept as disputed: ${reason} (conflicts with ${conflicts[0].record.id}).`,
    });
    next = replaceRecord(next, record);
    for (const conflict of conflicts) {
      const other = conflict.record.status === "disputed" ? conflict.record : { ...conflict.record, status: "disputed" as const };
      next = replaceRecord(next, {
        ...other,
        updatedAt: now,
        revisions: [
          ...other.revisions,
          { at: now, action: "dispute", note: `Kept as disputed: ${conflict.reason} (conflicts with ${record.id}).` },
        ],
      });
    }
  }

  if (auto) next = enforceAutoBudget(next, scope.workspaceId, now);

  if (next.records.length > MEMORY_MAX_RECORDS) {
    return {
      state,
      outcome: "rejected",
      detail: `memory holds ${state.records.length} records, the limit is ${MEMORY_MAX_RECORDS}; review and delete some first`,
    };
  }

  return {
    state: next,
    outcome: conflicts.length > 0 ? "conflict" : "created",
    record: next.records.find((entry) => entry.id === record.id) ?? record,
    detail: conflicts.length > 0 ? conflicts[0].reason : undefined,
  };
}

function insertRecord(state: MemoryState, record: MemoryRecord): MemoryState {
  return { ...state, records: [...state.records, record] };
}

function replaceRecord(state: MemoryState, record: MemoryRecord): MemoryState {
  return { ...state, records: state.records.map((entry) => (entry.id === record.id ? record : entry)) };
}

function withRevision(record: MemoryRecord, revision: MemoryRevision, now: number): MemoryRecord {
  return { ...record, updatedAt: now, revisions: [...record.revisions, revision] };
}

function enforceAutoBudget(state: MemoryState, workspaceId: string | null, now: number): MemoryState {
  const mine = state.records
    .filter((record) => record.auto && record.scope.workspaceId === workspaceId)
    .sort((a, b) => a.createdAt - b.createdAt);
  const excess = mine.length - MEMORY_MAX_AUTO_PER_WORKSPACE;
  if (excess <= 0) return state;

  const retired = mine.slice(0, excess);
  const retiredIds = new Set(retired.map((record) => record.id));
  const audit = [
    ...state.audit,
    ...retired.map<MemoryAuditEntry>((record) => ({
      at: now,
      action: "retention-capped",
      recordId: record.id,
      category: record.category,
      workspaceId: record.scope.workspaceId,
      contentHash: contentHash(record.content),
      note: `Auto-recorded memory kept at most ${MEMORY_MAX_AUTO_PER_WORKSPACE} records for this workspace; the oldest was retired.`,
    })),
  ];
  return {
    ...state,
    records: state.records.filter((record) => !retiredIds.has(record.id)),
    audit: capAudit(audit),
  };
}

function capAudit(audit: MemoryAuditEntry[]): MemoryAuditEntry[] {
  return audit.length > MEMORY_AUDIT_LIMIT ? audit.slice(audit.length - MEMORY_AUDIT_LIMIT) : audit;
}

/* -------------------------------------------------------------- conflicts */

export interface MemoryConflict {
  record: MemoryRecord;
  reason: string;
}

/**
 * Two records conflict when they are about the same thing and disagree about it:
 * one negates what the other asserts, or they give different figures for the
 * same subject. Resolved pairs (an explicit `supersedes` link) are left alone.
 */
export function findConflicts(state: MemoryState, candidate: MemoryRecord): MemoryConflict[] {
  const conflicts: MemoryConflict[] = [];
  for (const record of state.records) {
    if (record.id === candidate.id) continue;
    if (record.supersedes.includes(candidate.id) || candidate.supersedes.includes(record.id)) continue;
    const reason = conflictReason(record, candidate);
    if (reason) conflicts.push({ record, reason });
  }
  return conflicts;
}

export function conflictReason(a: MemoryRecord, b: MemoryRecord): string | null {
  if (a.category !== b.category) return null;
  if (a.scope.workspaceId !== b.scope.workspaceId) return null;

  const wordsA = contentWords(a.content);
  const wordsB = contentWords(b.content);
  const setB = new Set(wordsB);
  const shared = wordsA.filter((word) => setB.has(word));
  if (shared.length < CONTRADICTION_POLICY.minSharedWords) return null;

  const smaller = Math.min(wordsA.length, wordsB.length);
  if (smaller === 0 || shared.length / smaller < CONTRADICTION_POLICY.overlap) return null;

  const negatedA = NEGATION.test(a.content);
  const negatedB = NEGATION.test(b.content);
  if (negatedA !== negatedB) return "one record negates what the other asserts";

  const numbersA = numbersIn(a.content);
  const numbersB = numbersIn(b.content);
  if (numbersA.length > 0 && numbersB.length > 0 && numbersA.join("|") !== numbersB.join("|")) {
    return `different figures for the same subject (${numbersA.join(", ")} against ${numbersB.join(", ")})`;
  }

  return null;
}

/** Every unresolved conflicting pair, for the memory panel. */
export function detectConflicts(state: MemoryState): Array<{ a: MemoryRecord; b: MemoryRecord; reason: string }> {
  const pairs: Array<{ a: MemoryRecord; b: MemoryRecord; reason: string }> = [];
  for (let i = 0; i < state.records.length; i++) {
    for (let j = i + 1; j < state.records.length; j++) {
      const a = state.records[i];
      const b = state.records[j];
      if (a.supersedes.includes(b.id) || b.supersedes.includes(a.id)) continue;
      const reason = conflictReason(a, b);
      if (reason) pairs.push({ a, b, reason });
    }
  }
  return pairs;
}

/**
 * The operator decides which side to rely on. The losing record is kept and
 * marked unverified rather than deleted, so the history of the disagreement —
 * and the fact that it was decided — survives.
 */
export function resolveDispute(
  state: MemoryState,
  winnerId: string,
  loserId: string,
  note: string,
  now: number = Date.now(),
): { ok: boolean; state: MemoryState; reason?: string } {
  if (note.trim().length < 3) return { ok: false, state, reason: "a resolution needs a note explaining the decision" };
  const winner = state.records.find((record) => record.id === winnerId);
  const loser = state.records.find((record) => record.id === loserId);
  if (!winner || !loser) return { ok: false, state, reason: "both records must still exist" };

  let next = replaceRecord(state, {
    ...winner,
    status: "assumed",
    updatedAt: now,
    supersedes: [...new Set([...winner.supersedes, loserId])],
    revisions: [...winner.revisions, { at: now, action: "dispute-resolved", note }],
  });
  next = replaceRecord(next, {
    ...loser,
    status: "unverified",
    updatedAt: now,
    revisions: [
      ...loser.revisions,
      { at: now, action: "dispute-resolved", note: `Kept for the record; the operator decided against it. ${note}` },
    ],
  });
  return { ok: true, state: next };
}

/* ------------------------------------------------------------ edit / delete */

export interface MemoryEdit {
  content?: string;
  category?: MemoryCategory;
  tags?: string[];
  status?: EpistemicStatus;
  note: string;
}

export function editRecord(
  state: MemoryState,
  id: string,
  edit: MemoryEdit,
  now: number = Date.now(),
): { ok: boolean; state: MemoryState; record?: MemoryRecord; reason?: string } {
  const record = state.records.find((entry) => entry.id === id);
  if (!record) return { ok: false, state, reason: "record not found" };
  if (edit.note.trim().length < 3) return { ok: false, state, reason: "an edit needs a note explaining why" };

  const nextContent = edit.content === undefined ? undefined : normaliseContent(edit.content);
  if (nextContent !== undefined) {
    if (!nextContent) return { ok: false, state, reason: "content cannot be emptied; delete the record instead" };
    if (nextContent.length > MEMORY_MAX_CONTENT_CHARS) {
      return { ok: false, state, reason: `content is longer than ${MEMORY_MAX_CONTENT_CHARS} characters` };
    }
  }
  if (edit.status !== undefined && !OPERATOR_SETTABLE_STATUSES.includes(edit.status)) {
    return {
      ok: false,
      state,
      reason: `"${edit.status}" is produced by the code that checks or disputes a record, not set by hand`,
    };
  }

  const contentChanged = nextContent !== undefined && nextContent !== record.content;
  const statusChanged = edit.status !== undefined && edit.status !== record.status;
  const categoryChanged = edit.category !== undefined && edit.category !== record.category;
  const tagsChanged = edit.tags !== undefined && edit.tags.join("\u0000") !== record.tags.join("\u0000");
  if (!contentChanged && !statusChanged && !categoryChanged && !tagsChanged) {
    return { ok: true, state, record, reason: "nothing changed" };
  }

  const updated: MemoryRecord = {
    ...record,
    content: nextContent ?? record.content,
    status: edit.status ?? record.status,
    category: edit.category ?? record.category,
    tags: edit.tags ? [...edit.tags] : record.tags,
    updatedAt: now,
    revisions: [
      ...record.revisions,
      {
        at: now,
        action: contentChanged ? "edited" : "status",
        note: edit.note,
        ...(contentChanged ? { previousContent: record.content } : {}),
      },
    ],
  };

  return { ok: true, state: replaceRecord(state, updated), record: updated };
}

export function setRetention(
  state: MemoryState,
  id: string,
  policy: RetentionPolicy,
  note: string,
  now: number = Date.now(),
): { ok: boolean; state: MemoryState; reason?: string } {
  const record = state.records.find((entry) => entry.id === id);
  if (!record) return { ok: false, state, reason: "record not found" };
  if (note.trim().length < 3) return { ok: false, state, reason: "a retention change needs a note explaining why" };
  if (policy.mode === "expire" && typeof policy.expiresAt !== "number") {
    return { ok: false, state, reason: "an expiry date is required when the policy is expire" };
  }

  const updated = withRevision(
    { ...record, retention: { ...policy }, updatedAt: now },
    { at: now, action: "retention", note },
    now,
  );
  return { ok: true, state: replaceRecord(state, updated) };
}

export function deleteRecord(
  state: MemoryState,
  id: string,
  note: string,
  now: number = Date.now(),
): { ok: boolean; state: MemoryState; reason?: string } {
  const record = state.records.find((entry) => entry.id === id);
  if (!record) return { ok: false, state, reason: "record not found" };
  if (note.trim().length < 3) return { ok: false, state, reason: "a deletion needs a note explaining why" };

  const audit = [
    ...state.audit,
    {
      at: now,
      action: "deleted" as const,
      recordId: record.id,
      category: record.category,
      workspaceId: record.scope.workspaceId,
      contentHash: contentHash(record.content),
      note,
    },
  ];
  return {
    ok: true,
    state: { ...state, records: state.records.filter((entry) => entry.id !== id), audit: capAudit(audit) },
  };
}

export interface ClearRequest {
  /** The workspace to clear, or `null` for every workspace. */
  workspaceId: string | null;
  /** Must equal the workspace id, or `*` when clearing everything. */
  confirm: string;
  note: string;
}

/**
 * Clear-all requires the caller to repeat the scope key, so a stray call cannot
 * wipe memory. Global records (scope `null`) are only removed by a global clear.
 */
export function clearScope(
  state: MemoryState,
  request: ClearRequest,
  now: number = Date.now(),
): { ok: boolean; state: MemoryState; removed: number; reason?: string } {
  const key = request.workspaceId ?? "*";
  if (request.confirm !== key) {
    return { ok: false, state, removed: 0, reason: `confirmation must repeat "${key}" exactly` };
  }
  if (request.note.trim().length < 3) {
    return { ok: false, state, removed: 0, reason: "a clear-all needs a note explaining why" };
  }

  const doomed = state.records.filter((record) =>
    request.workspaceId === null ? true : record.scope.workspaceId === request.workspaceId,
  );
  const doomedIds = new Set(doomed.map((record) => record.id));
  const audit = [
    ...state.audit,
    ...doomed.map<MemoryAuditEntry>((record) => ({
      at: now,
      action: "cleared",
      recordId: record.id,
      category: record.category,
      workspaceId: record.scope.workspaceId,
      contentHash: contentHash(record.content),
      note: request.note,
    })),
  ];

  return {
    ok: true,
    removed: doomed.length,
    state: {
      ...state,
      records: state.records.filter((record) => !doomedIds.has(record.id)),
      audit: capAudit(audit),
    },
  };
}

/* ---------------------------------------------------------------- retention */

export function isExpired(record: MemoryRecord, now: number): boolean {
  return record.retention.mode === "expire" && typeof record.retention.expiresAt === "number" && record.retention.expiresAt <= now;
}

export function isReviewDue(record: MemoryRecord, now: number): boolean {
  if (record.retention.mode !== "review") return false;
  const last = record.lastRetrievedAt ?? record.updatedAt;
  return last < now - MEMORY_REVIEW_AFTER_MS;
}

export interface RetentionSweep {
  state: MemoryState;
  expired: MemoryAuditEntry[];
  reviewDue: string[];
}

/**
 * Remove what its own retention policy says to remove, and report what the
 * operator should look at. Expiry can delete; review can only ask.
 */
export function applyRetention(state: MemoryState, now: number = Date.now()): RetentionSweep {
  const expiredRecords = state.records.filter((record) => isExpired(record, now));
  const expiredIds = new Set(expiredRecords.map((record) => record.id));
  const expired: MemoryAuditEntry[] = expiredRecords.map((record) => ({
    at: now,
    action: "expired",
    recordId: record.id,
    category: record.category,
    workspaceId: record.scope.workspaceId,
    contentHash: contentHash(record.content),
    note: "Removed by the record's own retention policy.",
  }));
  const reviewDue = state.records.filter((record) => isReviewDue(record, now)).map((record) => record.id);

  return {
    state: {
      ...state,
      records: state.records.filter((record) => !expiredIds.has(record.id)),
      audit: capAudit([...state.audit, ...expired]),
    },
    expired,
    reviewDue,
  };
}

/* ------------------------------------------------------------------- stats */

export interface MemoryStats {
  total: number;
  byCategory: Record<MemoryCategory, number>;
  byStatus: Record<EpistemicStatus, number>;
  byOrigin: Record<MemoryOrigin, number>;
  auto: number;
  reviewDue: number;
  expired: number;
  disputes: number;
}

export function memoryStats(state: MemoryState, now: number = Date.now()): MemoryStats {
  const stats: MemoryStats = {
    total: state.records.length,
    byCategory: { episodic: 0, semantic: 0, procedural: 0, project: 0, source: 0 },
    byStatus: { verified: 0, supported: 0, inferred: 0, assumed: 0, disputed: 0, unverified: 0, unknown: 0 },
    byOrigin: { user: 0, "model-inference": 0, "external-source": 0, "legacy-import": 0 },
    auto: 0,
    reviewDue: 0,
    expired: 0,
    disputes: 0,
  };
  for (const record of state.records) {
    stats.byCategory[record.category] += 1;
    stats.byStatus[record.status] += 1;
    stats.byOrigin[record.provenance.origin] += 1;
    if (record.auto) stats.auto += 1;
    if (isReviewDue(record, now)) stats.reviewDue += 1;
    if (isExpired(record, now)) stats.expired += 1;
  }
  stats.disputes = detectConflicts(state).length;
  return stats;
}

/* -------------------------------------------------------------- migrations */

export interface MemoryMigrationReport {
  from: "current" | "legacy" | "empty";
  imported: number;
  dropped: number;
  notes: string[];
}

/**
 * Read persisted memory of any vintage without destroying it.
 *
 * - State written by this version is sanitised record by record: a record whose
 *   shape is broken is dropped with a note rather than crashing hydration.
 * - Workspace memory written before records existed is imported as
 *   `legacy-import` / `unknown`, never guessed at.
 * - Anything unrecognisable yields an empty state and a note.
 */
export function migrateMemoryState(
  raw: unknown,
  legacyWorkspaceMemory: unknown = null,
  now: number = Date.now(),
): { state: MemoryState; report: MemoryMigrationReport } {
  const notes: string[] = [];
  let state = emptyMemoryState();
  let from: MemoryMigrationReport["from"] = "empty";
  let dropped = 0;

  const container = asRecord(raw);
  if (container && Array.isArray(container.records)) {
    from = "current";
    for (const entry of container.records) {
      const record = normaliseStoredRecord(entry);
      if (record) state.records.push(record);
      else dropped += 1;
    }
    state.audit = Array.isArray(container.audit)
      ? container.audit.map(normaliseStoredAudit).filter((entry): entry is MemoryAuditEntry => entry !== null)
      : [];
    state.legacyMigratedAt = typeof container.legacyMigratedAt === "number" ? container.legacyMigratedAt : null;
    if (dropped > 0) notes.push(`${dropped} stored record(s) had an unusable shape and were dropped.`);
  } else if (raw !== undefined && raw !== null) {
    notes.push("Stored memory had an unrecognised shape; it was left untouched and an empty memory state was used.");
  }

  if (state.legacyMigratedAt === null) {
    const imported = importLegacyWorkspaceMemory(state, legacyWorkspaceMemory, now);
    state = imported.state;
    if (imported.imported > 0) {
      from = "legacy";
      notes.push(
        `${imported.imported} record(s) imported from workspace memory written before memory records existed; they are marked origin unknown.`,
      );
    }
    if (imported.skipped > 0) notes.push(`${imported.skipped} legacy entry/entries were not readable and were skipped.`);
  }

  return { state, report: { from, imported: state.records.length, dropped, notes } };
}

function importLegacyWorkspaceMemory(
  state: MemoryState,
  legacy: unknown,
  now: number,
): { state: MemoryState; imported: number; skipped: number } {
  const container = asRecord(legacy);
  if (!container) return { state: { ...state, legacyMigratedAt: now }, imported: 0, skipped: 0 };

  const next: MemoryState = { ...state, records: [...state.records], legacyMigratedAt: now };
  const existingIds = new Set(next.records.map((record) => record.id));
  let imported = 0;
  let skipped = 0;

  const add = (workspaceId: string, category: MemoryCategory, content: string, at: number, note: string): void => {
    const scope: MemoryScope = { workspaceId };
    const id = memoryRecordId(category, content, scope);
    if (existingIds.has(id)) return;
    existingIds.add(id);
    next.records.push({
      id,
      category,
      content: normaliseContent(content),
      status: "unknown",
      provenance: {
        origin: "legacy-import",
        source: { type: "none" },
        note,
      },
      scope,
      createdAt: at,
      updatedAt: at,
      lastRetrievedAt: null,
      retention: { mode: "review" },
      revisions: [{ at, action: "migrated", note }],
      tags: ["legacy"],
      supersedes: [],
      auto: false,
    });
    imported += 1;
  };

  for (const [workspaceId, value] of Object.entries(container)) {
    const memory = asRecord(value);
    if (!memory) {
      skipped += 1;
      continue;
    }
    const at = typeof memory.updatedAt === "number" && memory.updatedAt > 0 ? memory.updatedAt : now;
    const note =
      "Imported from workspace memory recorded before memory records existed. The origin was not stored with it, so it is unknown.";

    for (const entry of asArray(memory.entries)) {
      const item = asRecord(entry);
      const question = item && typeof item.q === "string" ? item.q.trim() : "";
      const answer = item && typeof item.a === "string" ? item.a.trim() : "";
      if (!question && !answer) {
        skipped += 1;
        continue;
      }
      const stamp = item && typeof item.at === "number" ? item.at : at;
      add(workspaceId, "episodic", `Q: ${question}\nA: ${answer}`, stamp, note);
    }
    for (const goal of asArray(memory.goals)) {
      if (typeof goal === "string" && goal.trim()) add(workspaceId, "project", `Goal: ${goal}`, at, note);
      else skipped += 1;
    }
    for (const concept of asArray(memory.concepts)) {
      if (typeof concept === "string" && concept.trim()) add(workspaceId, "semantic", `Concept explored: ${concept}`, at, note);
      else skipped += 1;
    }
    for (const gap of asArray(memory.gaps)) {
      if (typeof gap === "string" && gap.trim()) add(workspaceId, "semantic", `Known gap: ${gap}`, at, note);
      else skipped += 1;
    }
  }

  return { state: next, imported, skipped };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

const CATEGORY_SET = new Set<string>(["episodic", "semantic", "procedural", "project", "source"]);
const STATUS_SET = new Set<string>(["verified", "supported", "inferred", "assumed", "disputed", "unverified", "unknown"]);
const ORIGIN_SET = new Set<string>(["user", "model-inference", "external-source", "legacy-import"]);
const SOURCE_TYPE_SET = new Set<string>(["conversation", "document", "web", "knowledge", "canvas", "workflow", "none"]);

/**
 * Tolerant reader for one persisted record. Fields that are missing get safe
 * defaults; fields that are the wrong kind make the record unusable, because a
 * record with no content or no category cannot be shown or retrieved honestly.
 */
export function normaliseStoredRecord(raw: unknown): MemoryRecord | null {
  const value = asRecord(raw);
  if (!value) return null;
  const content = typeof value.content === "string" ? normaliseContent(value.content) : "";
  const category = typeof value.category === "string" && CATEGORY_SET.has(value.category) ? (value.category as MemoryCategory) : null;
  if (!content || !category) return null;

  const provenanceRecord = asRecord(value.provenance) ?? {};
  const origin: MemoryOrigin =
    typeof provenanceRecord.origin === "string" && ORIGIN_SET.has(provenanceRecord.origin)
      ? (provenanceRecord.origin as MemoryOrigin)
      : // A record with no usable origin is labelled honestly rather than given one.
        "legacy-import";
  const sourceRecord = asRecord(provenanceRecord.source) ?? {};
  const sourceType =
    typeof sourceRecord.type === "string" && SOURCE_TYPE_SET.has(sourceRecord.type)
      ? (sourceRecord.type as MemorySourceRef["type"])
      : "none";
  const source: MemorySourceRef = {
    type: sourceType,
    ...(typeof sourceRecord.id === "string" ? { id: sourceRecord.id } : {}),
    ...(typeof sourceRecord.name === "string" ? { name: sourceRecord.name } : {}),
    ...(typeof sourceRecord.locator === "string" ? { locator: sourceRecord.locator } : {}),
    ...(typeof sourceRecord.retrievedAt === "number" ? { retrievedAt: sourceRecord.retrievedAt } : {}),
  };
  const note = typeof provenanceRecord.note === "string" && provenanceRecord.note.trim() ? provenanceRecord.note.trim() : "No reason was recorded with this entry.";

  const status: EpistemicStatus =
    typeof value.status === "string" && STATUS_SET.has(value.status) ? (value.status as EpistemicStatus) : statusForOrigin(origin, source);
  const scopeRecord = asRecord(value.scope);
  const scope: MemoryScope = { workspaceId: scopeRecord && typeof scopeRecord.workspaceId === "string" ? scopeRecord.workspaceId : null };
  const retentionRecord = asRecord(value.retention);
  const retention: RetentionPolicy = {
    mode:
      retentionRecord && (retentionRecord.mode === "keep" || retentionRecord.mode === "review" || retentionRecord.mode === "expire")
        ? retentionRecord.mode
        : "keep",
    ...(retentionRecord && typeof retentionRecord.expiresAt === "number" ? { expiresAt: retentionRecord.expiresAt } : {}),
  };
  const createdAt = typeof value.createdAt === "number" ? value.createdAt : 0;
  const updatedAt = typeof value.updatedAt === "number" ? value.updatedAt : createdAt;
  const revisions: MemoryRevision[] = asArray(value.revisions)
    .map((entry) => {
      const revision = asRecord(entry);
      if (!revision || typeof revision.at !== "number" || typeof revision.note !== "string") return null;
      const action = typeof revision.action === "string" ? revision.action : "edited";
      return {
        at: revision.at,
        action: action as MemoryRevision["action"],
        note: revision.note,
        ...(typeof revision.previousContent === "string" ? { previousContent: revision.previousContent } : {}),
      };
    })
    .filter((entry): entry is MemoryRevision => entry !== null);

  return {
    id: typeof value.id === "string" && value.id ? value.id : memoryRecordId(category, content, scope),
    category,
    content,
    status,
    provenance: { origin, source, note },
    scope,
    createdAt,
    updatedAt,
    lastRetrievedAt: typeof value.lastRetrievedAt === "number" ? value.lastRetrievedAt : null,
    retention,
    revisions: revisions.length > 0 ? revisions : [{ at: createdAt, action: "migrated", note: "No revision history was stored with this entry." }],
    tags: asArray(value.tags).filter((tag): tag is string => typeof tag === "string"),
    supersedes: asArray(value.supersedes).filter((id): id is string => typeof id === "string"),
    auto: value.auto === true,
  };
}

function normaliseStoredAudit(raw: unknown): MemoryAuditEntry | null {
  const value = asRecord(raw);
  if (!value) return null;
  if (typeof value.at !== "number" || typeof value.recordId !== "string" || typeof value.contentHash !== "string") return null;
  const action =
    value.action === "deleted" || value.action === "cleared" || value.action === "expired" || value.action === "retention-capped"
      ? value.action
      : "deleted";
  return {
    at: value.at,
    action,
    recordId: value.recordId,
    category: typeof value.category === "string" && CATEGORY_SET.has(value.category) ? (value.category as MemoryCategory) : "semantic",
    workspaceId: typeof value.workspaceId === "string" ? value.workspaceId : null,
    contentHash: value.contentHash,
    note: typeof value.note === "string" ? value.note : "",
  };
}

/** Mark a record as retrieved, so review decisions reflect actual use. */
export function touchRetrieved(state: MemoryState, ids: string[], now: number = Date.now()): MemoryState {
  if (ids.length === 0) return state;
  const wanted = new Set(ids);
  return {
    ...state,
    records: state.records.map((record) => (wanted.has(record.id) ? { ...record, lastRetrievedAt: now } : record)),
  };
}
