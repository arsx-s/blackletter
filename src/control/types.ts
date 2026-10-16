/**
 * The control plane's vocabulary.
 *
 * Deliberately small. The pack asks for a control plane that is "small and
 * auditable", so this module holds the shape of two things and nothing else: the
 * global stop, and the backup envelope. Everything else in `src/control` is a
 * function over these.
 */

export const CONTROL_VERSION = 1;

/** The kv key the stop state is persisted under. */
export const STOP_KEY = "control-stop";

export interface StopState {
  engaged: boolean;
  /** Redacted before it is stored; safe to show. */
  reason: string;
  by: "operator" | "system";
  /** When the stop was engaged; `null` while it is idle. */
  at: number | null;
  /** When it was last released, for the record. */
  releasedAt?: number;
}

export function idleStopState(): StopState {
  return { engaged: false, reason: "", by: "operator", at: null };
}

export interface InFlightEntry {
  id: string;
  /** What is running, in the operator's words (e.g. "a chat run"). */
  label: string;
  /** Called when the stop engages. Must abort the underlying work. */
  abort: () => void;
}

export interface StopReport {
  state: StopState;
  /** Live tasks that were paused by the stop. */
  pausedTaskIds: string[];
  /** Tasks whose grants were cleared, so they cannot resume with old authority. */
  revokedTaskIds: string[];
  /** Tasks the stop could not pause, with the machine's own reason. */
  refused: Array<{ taskId: string; reason: string }>;
  /** Registered in-flight operations the stop aborted. */
  abortedInFlight: number;
}

/* ------------------------------------------------------------------ backup */

/**
 * The keys a backup covers. An allowlist, not a discovery: a key that is not
 * named here is never exported, and a key the reader does not recognise is never
 * restored. The list is the app's own stores; nothing else shares the database.
 */
export const BACKUP_KEYS: readonly string[] = [
  "app-state",
  "tasks",
  "projects",
  "tool-audit",
  "integrity-changes",
  "web-research",
  "observability-runs",
  "observability-errors",
  STOP_KEY,
];

export interface BackupPayload {
  version: number;
  exportedAt: number;
  entries: Record<string, unknown>;
}

export interface BackupSummary {
  keys: string[];
  bytes: number;
}

export interface RestoreReport {
  restored: string[];
  /** Allowlisted keys that were absent from the payload and were left alone. */
  missing: string[];
  /** Keys in the payload that are not allowlisted; refused, counted, not written. */
  refused: string[];
}
