/**
 * Memory records: the types behind "what Blackletter remembers".
 *
 * The distinction this module exists to protect: a *conversation* is a log of
 * what was said, and a *document* is a file that was stored. A memory record is
 * a claim the system can act on later, so it must carry where it came from and
 * how much it is actually trusted. Nothing here is a model-weight update.
 *
 * Two rules are enforced by the operations in `state.ts`, not by convention:
 *
 * 1. A record's origin is recorded at creation and cannot be rewritten later.
 *    An inference that turns out to be right is promoted by *changing its
 *    epistemic status*, which appends a revision, rather than by pretending it
 *    was always user-provided.
 * 2. Deleting a record removes it from the state that retrieval reads. The audit
 *    entry left behind holds a content digest, never the content.
 */

export const MEMORY_SCHEMA_VERSION = 1;

export type MemoryCategory =
  /** What happened: a conversation turn, a completed run, a project event. */
  | "episodic"
  /** Facts, concepts, relationships, and the evidence behind them. */
  | "semantic"
  /** Approved workflows and repeatable methods. */
  | "procedural"
  /** Goals, preferences, commitments, and current status. */
  | "project"
  /** Source identity, retrieval time, provenance, verification state. */
  | "source";

export type MemoryOrigin =
  /** The operator stated it. */
  | "user"
  /** A model produced it. Never treated as fact by itself. */
  | "model-inference"
  /** It came from a retrieved document or web source. */
  | "external-source"
  /** It was already on disk before memory records existed. */
  | "legacy-import";

export type EpistemicStatus =
  /** Checked against a specific source or test. */
  | "verified"
  /** Supported by retrieved evidence. */
  | "supported"
  /** A model-generated inference from evidence. */
  | "inferred"
  /** Taken as true without being checked, usually because the operator said so. */
  | "assumed"
  /** Conflicts with another record that is still present. */
  | "disputed"
  /** Stored, never checked. */
  | "unverified"
  /** Origin or meaning is not known, typically imported legacy state. */
  | "unknown";

export type RetentionMode =
  /** Keep until the operator deletes it. */
  | "keep"
  /** Keep, and surface for review once it is old. */
  | "review"
  /** Delete once `expiresAt` passes. */
  | "expire";

export interface RetentionPolicy {
  mode: RetentionMode;
  /** Required when `mode` is `expire`. */
  expiresAt?: number;
}

/** Which workspace a record belongs to. `null` means every workspace. */
export interface MemoryScope {
  workspaceId: string | null;
}

export interface MemorySourceRef {
  type: "conversation" | "document" | "web" | "knowledge" | "canvas" | "workflow" | "none";
  /** Stable id of the source, when one exists (document id, tab id, URL). */
  id?: string;
  /** Human-readable name, e.g. the file name or the page title. */
  name?: string;
  /** Where inside the source, e.g. `p.12` or `char 400-980`. */
  locator?: string;
  /** When the source was read, for source memory. */
  retrievedAt?: number;
}

export interface MemoryProvenance {
  origin: MemoryOrigin;
  source: MemorySourceRef;
  /** Why this record exists, in the author's words. Required. */
  note: string;
}

export type MemoryRevisionAction =
  | "created"
  | "edited"
  | "corrected"
  | "status"
  | "retention"
  | "dispute"
  | "dispute-resolved"
  | "merged"
  | "migrated";

export interface MemoryRevision {
  at: number;
  action: MemoryRevisionAction;
  /** Why the change happened. Never empty. */
  note: string;
  /** The content before an edit, so a correction does not hide the history. */
  previousContent?: string;
}

export interface MemoryRecord {
  id: string;
  category: MemoryCategory;
  content: string;
  status: EpistemicStatus;
  provenance: MemoryProvenance;
  scope: MemoryScope;
  createdAt: number;
  updatedAt: number;
  /** Last time retrieval returned this record, for review decisions. */
  lastRetrievedAt: number | null;
  retention: RetentionPolicy;
  revisions: MemoryRevision[];
  tags: string[];
  /** Ids of records this one supersedes, when the operator resolved a conflict. */
  supersedes: string[];
  /**
   * True when the application recorded this without being asked (for example a
   * completed conversation turn). Auto records fall under a per-workspace cap so
   * a long-running workspace cannot grow without bound; operator records never
   * do. The panel says so next to the count.
   */
  auto: boolean;
}

/**
 * A deletion leaves this behind instead of the content: enough to answer "what
 * happened to it" without keeping what the operator asked to remove.
 */
export interface MemoryAuditEntry {
  at: number;
  action: "deleted" | "cleared" | "expired" | "retention-capped";
  recordId: string;
  category: MemoryCategory;
  workspaceId: string | null;
  contentHash: string;
  note: string;
}

export interface MemoryState {
  version: number;
  records: MemoryRecord[];
  audit: MemoryAuditEntry[];
  /** Set once legacy workspace memory has been imported, so it happens once. */
  legacyMigratedAt: number | null;
}

export const MEMORY_CATEGORIES: MemoryCategory[] = ["episodic", "semantic", "procedural", "project", "source"];

export const MEMORY_CATEGORY_LABELS: Record<MemoryCategory, string> = {
  episodic: "Episodic",
  semantic: "Semantic",
  procedural: "Procedural",
  project: "Project",
  source: "Source",
};

export const MEMORY_CATEGORY_MEANINGS: Record<MemoryCategory, string> = {
  episodic: "What happened in a conversation, project, or task.",
  semantic: "Facts, concepts, relationships, and their evidence.",
  procedural: "Approved workflows and repeatable methods.",
  project: "Goals, preferences, commitments, and current status.",
  source: "Where something came from and how far it was verified.",
};

export const MEMORY_ORIGIN_LABELS: Record<MemoryOrigin, string> = {
  user: "user-provided",
  "model-inference": "model-inferred",
  "external-source": "external source",
  "legacy-import": "legacy import",
};

export const EPISTEMIC_STATUS_LABELS: Record<EpistemicStatus, string> = {
  verified: "Verified",
  supported: "Supported",
  inferred: "Inferred",
  assumed: "Assumed",
  disputed: "Disputed",
  unverified: "Unverified",
  unknown: "Unknown",
};

export const EPISTEMIC_STATUS_MEANINGS: Record<EpistemicStatus, string> = {
  verified: "Checked against a specific source or test.",
  supported: "Supported by retrieved evidence.",
  inferred: "Produced by the model from evidence; not stated by a source.",
  assumed: "Taken as true without being checked.",
  disputed: "Conflicts with another record that is still stored.",
  unverified: "Stored but never checked.",
  unknown: "Origin or meaning is not known.",
};

/**
 * Statuses an operator may set by hand. `disputed` and `verified` are produced
 * by the code paths that actually detect a conflict or perform a check, so they
 * are not offered as free-form labels.
 */
export const OPERATOR_SETTABLE_STATUSES: EpistemicStatus[] = ["assumed", "unverified", "unknown"];

export const MEMORY_AUDIT_LIMIT = 200;
