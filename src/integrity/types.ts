/**
 * Integrity types: the vocabulary shared by the derivation boundary, the change
 * set, and the panels that show them (Mission 10).
 *
 * Three ideas live here and nowhere else:
 *
 *   1. **Provenance per record.** Every record derived from a model answer
 *      carries where it came from, which extractor produced it, a digest of the
 *      answer it was derived from, and — when one could be found — the locators
 *      of the retrieved evidence that contains its text. A record with no
 *      evidence says `unverified`; it never says `verified`, because nothing in
 *      the derivation path checks a record against the world.
 *
 *   2. **Support is not verification.** `supported` means "retrieved evidence
 *      contains this text". `verified` is reserved for a different kind of check
 *      (a chunk reproduced from its source, a test, a measurement) and is not
 *      produced here.
 *
 *   3. **Issues are data.** A malformed record, a fabricated reference, a
 *      duplicate, an oversized value or a capped list is reported as a counted
 *      issue rather than silently dropped or silently kept.
 */

export const INTEGRITY_SCHEMA_VERSION = 1;

/** Which derived list an issue concerns. */
export type DerivedRecordKind = "section" | "entity" | "timeline" | "note" | "follow-up";

/**
 * How far a derived record can be trusted, using Mission 4's vocabulary without
 * adding words to it:
 *
 * - `supported` — retrieved evidence contains the record's text;
 * - `unverified` — nothing checked it. This includes every record derived when
 *   there was no retrieved evidence at all.
 *
 * The other statuses (`inferred`, `assumed`, `disputed`, `unknown`, `verified`)
 * belong to memory records, which are written by the memory layer, not here.
 */
export type RecordSupport = "supported" | "unverified";

export interface DerivedRecordProvenance {
  /** `answer` = the model's own text; `app` = text this application supplied. */
  from: "answer" | "app";
  runId: string | null;
  /** Digest of the answer this record was derived from. */
  answerDigest: string;
  /** Which extractor and schema version produced the record, e.g. `sections@1`. */
  extractor: string;
  at: number;
  /** Locators of retrieved chunks that contain this record's key text. */
  evidence: string[];
  support: RecordSupport;
}

export type DerivationIssueCode =
  | "malformed-record"
  | "fabricated-reference"
  | "app-supplied"
  | "duplicate-merged"
  | "type-conflict"
  | "oversized-record"
  | "list-capped"
  | "id-collision"
  | "answer-too-large";

export interface DerivationIssue {
  code: DerivationIssueCode;
  kind: DerivedRecordKind;
  /** One bounded line. Never contains the record's whole text. */
  detail: string;
}

export interface DerivationCounts {
  sections: number;
  entities: number;
  timeline: number;
  notes: number;
  followUps: number;
  /** Records kept after validation. */
  kept: number;
  /** Records dropped because they failed validation. */
  dropped: number;
  /** Records merged into an earlier duplicate. */
  merged: number;
  supported: number;
  unverified: number;
}

/**
 * The provenance of one derivation run: what it produced, what it refused, and
 * what it could not check. Stored on the tab so a report can still say where its
 * sections came from after a reload.
 */
export interface DerivationProvenance {
  version: number;
  runId: string | null;
  tabId: string;
  workspaceId: string;
  answerDigest: string;
  answerChars: number;
  at: number;
  counts: DerivationCounts;
  /** Bounded sample of issues; `issueTotals` keeps the full counts. */
  issues: DerivationIssue[];
  issueTotals: Partial<Record<DerivationIssueCode, number>>;
}

/* ------------------------------------------------------------------ changes */

export type DerivedChangeEffectKind = "tab-records" | "knowledge" | "memory";

export interface DerivedChangeKnowledgeEffect {
  nodesAdded: string[];
  edgesAdded: string[];
}

export interface DerivedChangeMemoryEffect {
  outcome: "created" | "duplicate" | "conflict" | "rejected";
  recordId: string | null;
  detail?: string;
}

export interface DerivedChangeAcknowledgement {
  at: number;
  note: string;
}

/**
 * One reviewable change set: everything one completed run changed in this
 * workspace beyond the tab's own text, with the derivation's issues attached.
 *
 * The set is a review queue, not an audit trail — an acknowledgement is a note
 * the operator leaves, and removing a memory record it created goes through the
 * memory layer's audited deletion, not through this entry.
 */
export interface DerivedChangeRecord {
  id: string;
  at: number;
  workspaceId: string;
  tabId: string;
  tabTitle: string;
  runId: string | null;
  answerDigest: string;
  answerChars: number;
  counts: DerivationCounts;
  issues: DerivationIssue[];
  issueTotals: Partial<Record<DerivationIssueCode, number>>;
  effects: {
    knowledge: DerivedChangeKnowledgeEffect;
    memory: DerivedChangeMemoryEffect | null;
  };
  acknowledgements: DerivedChangeAcknowledgement[];
}
