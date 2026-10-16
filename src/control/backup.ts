/**
 * Backup and restore over the application's own kv store.
 *
 * The procedure this implements is the one the threat model states: BlackLetter's
 * state lives in a single key/value store (`app-state` plus the stores each
 * mission added), so a backup is an export of an allowlisted set of keys, and a
 * restore is a validated write of the same keys. Two rules keep it honest:
 *
 *   - **An allowlist, both ways.** A key that is not in `BACKUP_KEYS` is never
 *     exported and never restored, even if the payload names it.
 *   - **A version check, and no partial guess.** A payload with another version
 *     is refused whole. Nothing is written until the entire payload validates,
 *     so a restore cannot half-apply.
 *
 * What this is not: a filesystem snapshot. It exports what the app stores, for
 * the operator to keep; the host-level procedure (copy the user-data directory)
 * is documented in `docs/control-plane.md` and is the one that also covers the
 * Electron shell. Restoring does not reload the running stores: the panel says
 * "reload to apply", and the reload path is the tested one.
 */

import { kvGet, kvPutMany } from "../lib/db";
import { BACKUP_KEYS, CONTROL_VERSION, type BackupPayload, type BackupSummary, type RestoreReport } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const MAX_BACKUP_CHARS = 50 * 1024 * 1024;

function validEntry(key: string, value: unknown): boolean {
  if (key === "tool-audit" || key === "web-research" || key === "observability-runs" || key === "observability-errors") {
    return Array.isArray(value);
  }
  if (!isRecord(value)) return false;
  if (key === "app-state") {
    return Number.isInteger(value.version) && Array.isArray(value.workspaces) && Array.isArray(value.tabs) &&
      Array.isArray(value.documents) && Array.isArray(value.folders) && isRecord(value.prefs);
  }
  if (key === "tasks") return Number.isInteger(value.version) && Array.isArray(value.tasks);
  if (key === "projects") return Number.isInteger(value.version) && Array.isArray(value.projects);
  if (key === "integrity-changes") return Number.isInteger(value.version) && Array.isArray(value.changes) && Number.isInteger(value.dropped);
  if (key === "control-stop") return Number.isInteger(value.version) && isRecord(value.state) && typeof value.state.engaged === "boolean";
  return false;
}

function validPayloadHeader(payload: Record<string, unknown>): boolean {
  return payload.version === CONTROL_VERSION && Number.isFinite(payload.exportedAt) &&
    isRecord(payload.entries) && Object.keys(payload.entries).every((key) => BACKUP_KEYS.includes(key));
}

/** Read every allowlisted key that has a value. Missing keys are simply absent. */
export async function exportControlState(exportedAt = Date.now()): Promise<BackupPayload> {
  const entries: Record<string, unknown> = {};
  for (const key of BACKUP_KEYS) {
    const value = await kvGet<unknown>(key).catch(() => undefined);
    if (value !== undefined) entries[key] = value;
  }
  return { version: CONTROL_VERSION, exportedAt, entries };
}

export function summariseBackup(payload: BackupPayload): BackupSummary {
  const keys = Object.keys(payload.entries).sort();
  const bytes = JSON.stringify(payload).length;
  return { keys, bytes };
}

/**
 * Validate a payload, then write it. Validation is complete before the first
 * write: an unknown key or a bad shape refuses the whole payload.
 */
export async function restoreControlState(payload: unknown): Promise<RestoreReport> {
  if (!isRecord(payload)) return { restored: [], missing: [...BACKUP_KEYS], refused: [] };
  if (payload.version !== CONTROL_VERSION) {
    return { restored: [], missing: [...BACKUP_KEYS], refused: [String(payload.version ?? "unversioned")] };
  }
  if (!isRecord(payload.entries)) return { restored: [], missing: [...BACKUP_KEYS], refused: [] };
  const payloadEntries = payload.entries;

  const refused = Object.keys(payloadEntries).filter((key) => !BACKUP_KEYS.includes(key));
  if (refused.length > 0) {
    return { restored: [], missing: [...BACKUP_KEYS], refused: refused.sort() };
  }

  const invalid = Object.entries(payloadEntries)
    .filter(([key, value]) => !validEntry(key, value))
    .map(([key]) => `invalid:${key}`);
  if (invalid.length > 0 || !Number.isFinite(payload.exportedAt)) {
    return { restored: [], missing: [...BACKUP_KEYS], refused: invalid.length ? invalid : ["invalid:exportedAt"] };
  }

  const restored = Object.keys(payloadEntries);
  const missing = BACKUP_KEYS.filter((key) => !(key in payloadEntries));
  await kvPutMany(payloadEntries);
  return { restored, missing, refused: [] };
}

/** Parse the text of a backup, without writing anything. The panel's "Restore". */
export function parseBackup(text: string): { ok: true; payload: BackupPayload } | { ok: false; reason: string } {
  if (text.length > MAX_BACKUP_CHARS) return { ok: false, reason: "the backup is larger than this build accepts" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "that is not JSON; paste the text the export produced" };
  }
  if (!isRecord(parsed)) return { ok: false, reason: "the payload must be a JSON object" };
  if (parsed.version !== CONTROL_VERSION) {
    return { ok: false, reason: `the payload is version ${String(parsed.version ?? "unknown")}; this build restores version ${CONTROL_VERSION}` };
  }
  if (!isRecord(parsed.entries)) return { ok: false, reason: "the payload has no entries object" };
  if (!validPayloadHeader(parsed)) return { ok: false, reason: "the backup header or key allowlist is invalid" };
  for (const [key, value] of Object.entries(parsed.entries)) {
    if (!validEntry(key, value)) return { ok: false, reason: `the backup entry "${key}" has an invalid shape` };
  }
  return { ok: true, payload: parsed as unknown as BackupPayload };
}
