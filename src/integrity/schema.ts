/**
 * The schema boundary for records derived from a model answer.
 *
 * Nothing that crosses this boundary is trusted because an extractor produced
 * it. Each record is read as `unknown`, checked field by field against the bounds
 * below, checked back against the answer it claims to come from, and only then
 * given a stable id and provenance. A record that fails a check is dropped with a
 * counted issue; a record that is merely large is kept and reported. Neither case
 * is silent.
 *
 * The one thing this module cannot do is decide whether a record is *true*. It
 * decides whether the record is well-formed, whether it exists in the answer, and
 * whether retrieved evidence contains its text. Those are three different claims,
 * and the vocabulary in `types.ts` keeps them apart.
 */

import { fnv1a32 } from "../lib/hash";
import type { DerivationIssue, DerivationIssueCode, DerivedRecordKind } from "./types";

/** Bumped when a bound or a check changes, so stored records can be compared. */
export const DERIVED_RECORD_SCHEMA_VERSION = 1;

/**
 * Bounds, chosen to be generous for real answers and finite for hostile ones.
 *
 * `max` caps a *list*; a capped list keeps whole records and reports the count.
 * The per-field limits do not truncate: a record that exceeds one is kept and
 * flagged, because a truncated record is a different record and a dropped
 * section would take part of the report with it.
 */
export const RECORD_BOUNDS = {
  sections: { max: 60, titleChars: 200, contentChars: 120_000 },
  entities: { max: 120, nameChars: 120, descriptionChars: 500 },
  timeline: { max: 60, dateChars: 40, titleChars: 120, descriptionChars: 600 },
  notes: { max: 40, contentChars: 2_000 },
  followUps: { max: 6, questionChars: 240 },
  /** Answers beyond this are derived from, and flagged. */
  answerChars: 400_000,
  /** How many issues are stored verbatim; totals are always kept. */
  issueSample: 40,
} as const;

export interface IssueCollector {
  /** Bounded sample, oldest dropped. */
  issues: DerivationIssue[];
  /** Full counts, so a bounded sample cannot hide volume. */
  totals: Partial<Record<DerivationIssueCode, number>>;
  add(code: DerivationIssueCode, kind: DerivedRecordKind, detail: string): void;
}

export function createIssueCollector(limit: number = RECORD_BOUNDS.issueSample): IssueCollector {
  const issues: DerivationIssue[] = [];
  const totals: Partial<Record<DerivationIssueCode, number>> = {};
  return {
    issues,
    totals,
    add(code, kind, detail) {
      totals[code] = (totals[code] ?? 0) + 1;
      if (issues.length >= limit) return;
      issues.push({ code, kind, detail: collapseWhitespace(detail).slice(0, 160) });
    },
  };
}

/** Collapse every run of whitespace to one space and trim. */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** A lowercase, whitespace-collapsed probe used for containment checks. */
export function normaliseProbe(text: string): string {
  return collapseWhitespace(text).toLowerCase();
}

/** The first `max` characters of a record's text, for evidence matching. */
export function probeSlice(text: string, max = 80): string {
  return normaliseProbe(text).slice(0, max);
}

const ID_PREFIX: Record<DerivedRecordKind, string> = {
  section: "sec",
  entity: "ent",
  timeline: "evt",
  note: "note",
  "follow-up": "fup",
};

/**
 * A stable id: the same record derived again gets the same id, so a re-run does
 * not mint a new identity for content that has not changed, and a duplicate can
 * be recognised by its id as well as by its text.
 */
export function derivedId(kind: DerivedRecordKind, key: string): string {
  return `${ID_PREFIX[kind]}-${fnv1a32(`${kind}|${normaliseProbe(key)}`)}`;
}

/** Read a required non-empty string field; `null` when it is missing or wrong. */
export function readText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) return trimmed;
  return trimmed;
}

/** Read a field from an `unknown` record without asserting its shape. */
export function readField(record: unknown, key: string): unknown {
  if (!record || typeof record !== "object") return undefined;
  return (record as Record<string, unknown>)[key];
}

/**
 * Does the record's text actually occur in the answer it claims to come from?
 *
 * This is a *containment* check, not a truth check, and it is deliberately
 * cheap: it catches an extractor that invents or rewrites text, and it catches
 * a reference to something the answer never said. It cannot catch a sentence the
 * model itself fabricated — that is the grounding report's job.
 */
export function appearsInAnswer(answerProbe: string, text: string): boolean {
  const probe = normaliseProbe(text);
  if (!probe) return false;
  return answerProbe.includes(probe);
}
