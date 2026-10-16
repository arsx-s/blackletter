/**
 * The change set: what one completed run changed, beyond the tab's own text.
 *
 * A model answer does not only replace a report. It can create memory records
 * (through the memory layer's own provenance rules) and add nodes and edges to
 * the knowledge graph (through the derivation in `src/knowledge`). Both are
 * model-derived state, and both used to happen silently. This log makes them
 * reviewable: one entry per run, with the derivation's counts and issues, the
 * ids the graph gained, the memory outcome, and a place for the operator to
 * leave a note.
 *
 * What this log is **not**:
 *
 *   - not an audit trail. Entries can be acknowledged, and the operator can
 *     remove a memory record the run created — that removal goes through the
 *     memory layer's audited deletion, not through this file;
 *   - not evidence that anything it lists is true. It records that the
 *     application stored something and where it came from.
 *
 * The stored payload is versioned (`{ version, dropped, changes }`) and read
 * back defensively: a entry that does not have the shape this build understands
 * is counted as rejected rather than half-read.
 */

import { kvDelete, kvGet, kvPut } from "../lib/db";
import { fnv1a32 } from "../lib/hash";
import {
  INTEGRITY_SCHEMA_VERSION,
  type DerivedChangeAcknowledgement,
  type DerivedChangeMemoryEffect,
  type DerivedChangeRecord,
  type DerivedChangeKnowledgeEffect,
  type DerivationProvenance,
} from "./types";

export const MAX_DERIVED_CHANGES = 60;
const CHANGES_KEY = "integrity-changes";

export interface DerivedChangeInput {
  at?: number;
  workspaceId: string;
  tabId: string;
  tabTitle: string;
  /** The derivation that produced the tab's records for this run. */
  provenance: DerivationProvenance;
  effects: {
    knowledge: DerivedChangeKnowledgeEffect;
    memory: DerivedChangeMemoryEffect | null;
  };
}

interface StoredChanges {
  version: number;
  dropped: number;
  changes: DerivedChangeRecord[];
}

let changes: DerivedChangeRecord[] = [];
let dropped = 0;
let rejectedOnLoad = 0;
let loaded = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const cb of listeners) cb();
}

export function subscribeDerivedChanges(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Newest first. */
export function derivedChanges(): readonly DerivedChangeRecord[] {
  return changes;
}

export function derivedChangesDroppedCount(): number {
  return dropped;
}

/** Entries read from storage that did not have a usable shape. */
export function derivedChangesRejectedOnLoad(): number {
  return rejectedOnLoad;
}

function makeId(seed: string, taken: Set<string>): string {
  let id = `chg-${fnv1a32(seed)}`;
  let salt = 0;
  while (taken.has(id)) {
    salt += 1;
    id = `chg-${fnv1a32(`${seed}|${salt}`)}`;
  }
  return id;
}

function persist(): void {
  const payload: StoredChanges = { version: INTEGRITY_SCHEMA_VERSION, dropped, changes };
  void kvPut(CHANGES_KEY, payload).catch(() => undefined);
}

export function recordDerivedChange(input: DerivedChangeInput): DerivedChangeRecord {
  const at = input.at ?? Date.now();
  const seed = `${input.workspaceId}|${input.tabId}|${input.provenance.answerDigest}|${at}`;
  const id = makeId(seed, new Set(changes.map((change) => change.id)));
  const record: DerivedChangeRecord = {
    id,
    at,
    workspaceId: input.workspaceId,
    tabId: input.tabId,
    tabTitle: input.tabTitle,
    runId: input.provenance.runId,
    answerDigest: input.provenance.answerDigest,
    answerChars: input.provenance.answerChars,
    counts: { ...input.provenance.counts },
    issues: input.provenance.issues.map((issue) => ({ ...issue })),
    issueTotals: { ...input.provenance.issueTotals },
    effects: {
      knowledge: {
        nodesAdded: [...input.effects.knowledge.nodesAdded],
        edgesAdded: [...input.effects.knowledge.edgesAdded],
      },
      memory: input.effects.memory ? { ...input.effects.memory } : null,
    },
    acknowledgements: [],
  };
  changes = [record, ...changes];
  if (changes.length > MAX_DERIVED_CHANGES) {
    const removed = changes.length - MAX_DERIVED_CHANGES;
    changes = changes.slice(0, MAX_DERIVED_CHANGES);
    dropped += removed;
  }
  persist();
  notify();
  return record;
}

export function acknowledgeDerivedChange(id: string, note: string): boolean {
  const change = changes.find((entry) => entry.id === id);
  if (!change) return false;
  const acknowledgement: DerivedChangeAcknowledgement = { at: Date.now(), note: note.trim().slice(0, 240) };
  change.acknowledgements = [...change.acknowledgements, acknowledgement];
  persist();
  notify();
  return true;
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

/**
 * Read one stored entry. Anything missing a digest, an id or a workspace is
 * refused; optional sections are repaired to their empty form rather than
 * guessed at.
 */
function readStoredChange(value: unknown): DerivedChangeRecord | null {
  if (!isRecordLike(value)) return null;
  const id = value.id;
  const answerDigest = value.answerDigest;
  const workspaceId = value.workspaceId;
  if (typeof id !== "string" || !id) return null;
  if (typeof answerDigest !== "string" || !answerDigest) return null;
  if (typeof workspaceId !== "string") return null;

  const effects = isRecordLike(value.effects) ? value.effects : {};
  const knowledge = isRecordLike(effects.knowledge) ? effects.knowledge : {};
  const memory = isRecordLike(effects.memory) ? effects.memory : null;
  const counts = isRecordLike(value.counts) ? value.counts : {};

  const numberOr = (input: unknown): number => (typeof input === "number" && Number.isFinite(input) ? input : 0);

  return {
    id,
    at: numberOr(value.at),
    workspaceId,
    tabId: typeof value.tabId === "string" ? value.tabId : "",
    tabTitle: typeof value.tabTitle === "string" ? value.tabTitle : "",
    runId: typeof value.runId === "string" ? value.runId : null,
    answerDigest,
    answerChars: numberOr(value.answerChars),
    counts: {
      sections: numberOr(counts.sections),
      entities: numberOr(counts.entities),
      timeline: numberOr(counts.timeline),
      notes: numberOr(counts.notes),
      followUps: numberOr(counts.followUps),
      kept: numberOr(counts.kept),
      dropped: numberOr(counts.dropped),
      merged: numberOr(counts.merged),
      supported: numberOr(counts.supported),
      unverified: numberOr(counts.unverified),
    },
    issues: Array.isArray(value.issues)
      ? value.issues.filter(isRecordLike).map((issue) => ({
          code: (typeof issue.code === "string" ? issue.code : "malformed-record") as DerivedChangeRecord["issues"][number]["code"],
          kind: (typeof issue.kind === "string" ? issue.kind : "section") as DerivedChangeRecord["issues"][number]["kind"],
          detail: typeof issue.detail === "string" ? issue.detail : "",
        }))
      : [],
    issueTotals: isRecordLike(value.issueTotals) ? { ...(value.issueTotals as DerivedChangeRecord["issueTotals"]) } : {},
    effects: {
      knowledge: {
        nodesAdded: Array.isArray(knowledge.nodesAdded) ? knowledge.nodesAdded.filter((entry): entry is string => typeof entry === "string") : [],
        edgesAdded: Array.isArray(knowledge.edgesAdded) ? knowledge.edgesAdded.filter((entry): entry is string => typeof entry === "string") : [],
      },
      memory: memory
        ? {
            outcome: (typeof memory.outcome === "string" ? memory.outcome : "rejected") as DerivedChangeMemoryEffect["outcome"],
            recordId: typeof memory.recordId === "string" ? memory.recordId : null,
            detail: typeof memory.detail === "string" ? memory.detail : undefined,
          }
        : null,
    },
    acknowledgements: Array.isArray(value.acknowledgements)
      ? value.acknowledgements.filter(isRecordLike).map((acknowledgement) => ({
          at: numberOr(acknowledgement.at),
          note: typeof acknowledgement.note === "string" ? acknowledgement.note : "",
        }))
      : [],
  };
}

export async function loadDerivedChanges(): Promise<void> {
  if (loaded) return;
  loaded = true;
  const stored = await kvGet<StoredChanges>(CHANGES_KEY);
  if (isRecordLike(stored) && Array.isArray(stored.changes)) {
    if (stored.version !== INTEGRITY_SCHEMA_VERSION) {
      // A payload written by another version is counted and left alone rather
      // than half-read. The log is a review queue; a wrong guess here would put
      // records the operator never saw in front of them.
      rejectedOnLoad = stored.changes.length;
      notify();
      return;
    }
    const read: DerivedChangeRecord[] = [];
    let rejected = 0;
    for (const value of stored.changes) {
      const change = readStoredChange(value);
      if (change) read.push(change);
      else rejected += 1;
    }

    // Merge, never replace: a change recorded while the read was in flight (a run
    // finishing as the panel mounts) is newer than anything on disk, and
    // clobbering it would hide exactly the change the operator is looking for.
    // In-memory entries win for the same id.
    const byId = new Map<string, DerivedChangeRecord>();
    for (const change of [...read, ...changes]) byId.set(change.id, change);
    changes = [...byId.values()].sort((a, b) => b.at - a.at).slice(0, MAX_DERIVED_CHANGES);
    dropped = typeof stored.dropped === "number" && stored.dropped > 0 ? stored.dropped : 0;
    rejectedOnLoad = rejected;
  }
  notify();
}

export async function clearDerivedChanges(): Promise<void> {
  changes = [];
  dropped = 0;
  rejectedOnLoad = 0;
  await kvDelete(CHANGES_KEY);
  notify();
}

/** Test seam: forget everything, including the persisted copy. */
export function resetDerivedChangesForTests(): void {
  changes = [];
  dropped = 0;
  rejectedOnLoad = 0;
  loaded = false;
  void kvDelete(CHANGES_KEY).catch(() => undefined);
}
