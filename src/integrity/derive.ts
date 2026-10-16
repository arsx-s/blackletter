/**
 * Derivation: raw answer text in, validated records with provenance out.
 *
 * This module is the one place in the application where a model answer becomes
 * structured records. It calls the extractors, then treats whatever they return
 * as untrusted: each record is validated, checked back against the answer,
 * deduplicated, bounded, given a stable id and provenance, and counted. What the
 * extractors said and what the store receives are two different things, and the
 * difference is reported.
 *
 * It does not decide truth. `supported` on a record means retrieved evidence
 * contains its text; nothing here can mean more than that.
 */

import {
  extractEntities,
  extractFollowUpQuestions,
  extractNotes,
  extractTimeline,
  parseReportSections,
  suggestedFollowUpQuestions,
  type Entity,
  type ReportSection,
  type ResearchNote,
  type TimelineEvent,
} from "../lib/research";
import { digestValue } from "../lib/hash";
import { formatLocator, type SourceLocation } from "../pipeline/grounding";
import {
  appearsInAnswer,
  createIssueCollector,
  derivedId,
  DERIVED_RECORD_SCHEMA_VERSION,
  normaliseProbe,
  probeSlice,
  readField,
  readText,
  RECORD_BOUNDS,
  type IssueCollector,
} from "./schema";
import {
  INTEGRITY_SCHEMA_VERSION,
  type DerivationCounts,
  type DerivationProvenance,
  type DerivedRecordKind,
  type DerivedRecordProvenance,
} from "./types";

/** A retrieved chunk as this module needs it: text, and where it came from. */
export interface EvidenceChunk {
  id: string;
  text: string;
  location?: SourceLocation;
}

export interface DeriveContext {
  tabId: string;
  workspaceId: string;
  /** The run that produced the answer, when one exists. */
  runId: string | null;
  /** Chunks the answer was produced from, used only for support checks. */
  chunks?: ReadonlyArray<EvidenceChunk>;
  at?: number;
}

export interface DerivedFollowUp {
  question: string;
  /** `answer` = the model asked it; `app` = this application suggested it. */
  origin: "answer" | "app";
}

export interface DerivedTabRecords {
  sections: ReportSection[];
  entities: Entity[];
  timelineEvents: TimelineEvent[];
  notes: ResearchNote[];
  followUps: DerivedFollowUp[];
  provenance: DerivationProvenance;
}

export interface ValidationContext {
  at: number;
  runId: string | null;
  answerDigest: string;
  answerProbe: string;
  chunks: ReadonlyArray<EvidenceChunk>;
  collector: IssueCollector;
}

function evidenceFor(text: string, context: ValidationContext): string[] {
  const probe = probeSlice(text);
  if (!probe || context.chunks.length === 0) return [];
  const found: string[] = [];
  for (const chunk of context.chunks) {
    if (normaliseProbe(chunk.text).includes(probe)) {
      const locator = chunk.location ? formatLocator(chunk.location) : `chunk ${chunk.id}`;
      if (!found.includes(locator)) found.push(locator);
      if (found.length >= 3) break;
    }
  }
  return found;
}

function withProvenance(
  text: string,
  extractor: string,
  context: ValidationContext,
  from: "answer" | "app" = "answer",
): DerivedRecordProvenance {
  const evidence = evidenceFor(text, context);
  return {
    from,
    runId: context.runId,
    answerDigest: context.answerDigest,
    extractor: `${extractor}@${DERIVED_RECORD_SCHEMA_VERSION}`,
    at: context.at,
    evidence,
    support: evidence.length > 0 ? "supported" : "unverified",
  };
}

/* --------------------------------------------------------------- validators */

/**
 * The validators accept `unknown` on purpose: an extractor is a source of raw
 * records like any other, and the day one of them changes shape the store has to
 * refuse the record instead of persisting it.
 */

export function validateSectionRecord(raw: unknown, context: ValidationContext): ReportSection | null {
  const rawTitle = readField(raw, "title");
  const title = readText(rawTitle, RECORD_BOUNDS.sections.titleChars);
  if (title === null) {
    context.collector.add("malformed-record", "section", "a section without a usable title was dropped");
    return null;
  }

  if (typeof rawTitle === "string" && rawTitle.trim().length > RECORD_BOUNDS.sections.titleChars) {
    context.collector.add("oversized-record", "section", `a section title of ${rawTitle.trim().length} characters was kept`);
  }

  const rawContent = readField(raw, "content");
  if (rawContent !== undefined && typeof rawContent !== "string") {
    context.collector.add("malformed-record", "section", "a section with a non-string body was dropped");
    return null;
  }
  const content = typeof rawContent === "string" ? rawContent : "";
  if (content.length > RECORD_BOUNDS.sections.contentChars) {
    context.collector.add("oversized-record", "section", `a section body of ${content.length} characters was kept`);
  }
  // The body must be text the answer actually contains. A section is a slice of
  // the answer, so a body that does not occur in it is a rewritten record, not a
  // section — and dropping it would take part of the report with it if it were
  // kept.
  if (content.trim() && !appearsInAnswer(context.answerProbe, content)) {
    context.collector.add("fabricated-reference", "section", "a section body that does not occur in the answer was dropped");
    return null;
  }

  // The title is checked, but differently: an answer with no `##` headings is
  // rendered under the application's own "Overview" label, and refusing that
  // would delete a legitimate section. A title the answer does not contain is
  // kept and marked as the application's, and said so in the issue log.
  const titleFromAnswer = appearsInAnswer(context.answerProbe, title);
  if (!titleFromAnswer) {
    context.collector.add("app-supplied", "section", `the title "${title.slice(0, 60)}" does not occur in the answer; it is an application label`);
  }

  return {
    id: derivedId("section", title),
    title,
    content,
    provenance: withProvenance(title, "sections", context, titleFromAnswer ? "answer" : "app"),
  };
}

export function validateEntityRecord(raw: unknown, context: ValidationContext): Entity | null {
  const name = readText(readField(raw, "name"), RECORD_BOUNDS.entities.nameChars);
  if (name === null) {
    context.collector.add("malformed-record", "entity", "an entity without a usable name was dropped");
    return null;
  }
  if (!appearsInAnswer(context.answerProbe, name)) {
    context.collector.add("fabricated-reference", "entity", `"${name.slice(0, 60)}" does not occur in the answer`);
    return null;
  }
  const type = readField(raw, "type");
  const allowed = ["person", "organization", "concept", "location", "event"];
  const kind = typeof type === "string" && allowed.includes(type) ? (type as Entity["type"]) : "concept";
  if (typeof type === "string" && !allowed.includes(type)) {
    context.collector.add("malformed-record", "entity", `unknown entity type "${type.slice(0, 24)}" was read as a concept`);
  }
  const description = readText(readField(raw, "description"), RECORD_BOUNDS.entities.descriptionChars) ?? "";
  return {
    id: derivedId("entity", name),
    type: kind,
    name,
    description,
    provenance: withProvenance(name, "entities", context),
  };
}

export function validateTimelineRecord(raw: unknown, context: ValidationContext): TimelineEvent | null {
  const date = readText(readField(raw, "date"), RECORD_BOUNDS.timeline.dateChars);
  const description = readText(readField(raw, "description"), RECORD_BOUNDS.timeline.descriptionChars);
  if (date === null || description === null) {
    context.collector.add("malformed-record", "timeline", "a timeline entry without a usable date or description was dropped");
    return null;
  }
  if (!appearsInAnswer(context.answerProbe, description)) {
    context.collector.add("fabricated-reference", "timeline", `a timeline entry quoting text the answer does not contain was dropped`);
    return null;
  }
  const title = readText(readField(raw, "title"), RECORD_BOUNDS.timeline.titleChars) ?? description.slice(0, RECORD_BOUNDS.timeline.titleChars);
  return {
    id: derivedId("timeline", `${date}|${description}`),
    date,
    title,
    description,
    provenance: withProvenance(description, "timeline", context),
  };
}

export function validateNoteRecord(raw: unknown, context: ValidationContext): ResearchNote | null {
  const content = readText(readField(raw, "content"), RECORD_BOUNDS.notes.contentChars);
  if (content === null) {
    context.collector.add("malformed-record", "note", "a note without usable content was dropped");
    return null;
  }
  if (!appearsInAnswer(context.answerProbe, content)) {
    context.collector.add("fabricated-reference", "note", "a note quoting text the answer does not contain was dropped");
    return null;
  }
  const type = readField(raw, "type");
  const allowed = ["fact", "idea", "question", "definition", "quote", "number"];
  const kind = typeof type === "string" && allowed.includes(type) ? (type as ResearchNote["type"]) : "fact";
  return {
    id: derivedId("note", content),
    type: kind,
    content,
    provenance: withProvenance(content, "notes", context),
  };
}

export function validateFollowUp(raw: unknown, context: ValidationContext): string | null {
  if (typeof raw !== "string") {
    context.collector.add("malformed-record", "follow-up", `a follow-up question arrived as ${typeof raw} and was dropped`);
    return null;
  }
  const question = readText(raw, RECORD_BOUNDS.followUps.questionChars);
  if (question === null) return null;
  if (!appearsInAnswer(context.answerProbe, question)) {
    context.collector.add("fabricated-reference", "follow-up", "a follow-up question the answer does not contain was dropped");
    return null;
  }
  return question;
}

/* ------------------------------------------------------------- the boundary */

export interface DedupeResult<T> {
  kept: T[];
  merged: number;
}

/**
 * The raw extractors, as a set of named inputs.
 *
 * They are read as untrusted: each may return any type, and one that throws is a
 * reported parser failure rather than a crash (see `safeExtract`).
 */
export interface DeriveExtractors {
  sections: (answer: string) => unknown;
  entities: (answer: string) => unknown;
  timeline: (answer: string) => unknown;
  notes: (answer: string) => unknown;
  followUps: (answer: string) => unknown;
}

const DEFAULT_EXTRACTORS: DeriveExtractors = {
  sections: (answer) => parseReportSections(answer),
  entities: (answer) => extractEntities(answer),
  timeline: (answer) => extractTimeline(answer),
  notes: (answer) => extractNotes(answer),
  followUps: (answer) => extractFollowUpQuestions(answer),
};

function isTestBuild(): boolean {
  const env = (import.meta as { env?: { MODE?: string } }).env;
  return env?.MODE === "test";
}

/**
 * Run one extractor and return a list, whatever it produced.
 *
 * A non-array return and a thrown error are both recorded as parser failures with
 * the list empty — an extractor is not trusted to be either total or well-typed,
 * and a bad answer must not take the derivation down with it.
 */
export function safeExtract(
  extract: (answer: string) => unknown,
  answer: string,
  kind: DerivedRecordKind,
  collector: IssueCollector,
): unknown[] {
  let produced: unknown;
  try {
    produced = extract(answer);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    collector.add("malformed-record", kind, `the ${kind} extractor failed: ${message.slice(0, 80)}`);
    return [];
  }
  if (Array.isArray(produced)) return produced;
  collector.add("malformed-record", kind, `the ${kind} extractor returned ${typeof produced} instead of a list`);
  return [];
}

/**
 * Keep the first record per key and count the rest.
 *
 * "First" is the extractor's order, which is answer order, so a merge is
 * deterministic and does not depend on iteration order of anything else.
 */
function dedupe<T>(records: T[], keyOf: (record: T) => string): DedupeResult<T> {
  const seen = new Map<string, T>();
  let merged = 0;
  for (const record of records) {
    const key = keyOf(record);
    if (seen.has(key)) {
      merged++;
      continue;
    }
    seen.set(key, record);
  }
  return { kept: Array.from(seen.values()), merged };
}

/**
 * Refuse a second record with an id already used in this derivation.
 *
 * Ids are derived from the record's content, so this can only fire on a 32-bit
 * FNV-1a collision, which is not reachable by writing a test answer. It stays
 * because the alternative — two records with one id in the store — would break
 * React keys and any future look-up by id, and a defensive branch that reports
 * itself is cheaper than a corrupted list. Exported so the branch can be tested
 * with crafted ids.
 */
export function dedupeById<T extends { id: string }>(
  records: T[],
  kind: DerivedRecordKind,
  collector: IssueCollector,
): T[] {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const record of records) {
    if (seen.has(record.id)) {
      collector.add("id-collision", kind, `two derived records share the id ${record.id}; the second was refused`);
      continue;
    }
    seen.add(record.id);
    kept.push(record);
  }
  return kept;
}

/**
 * Derive the tab's records from one answer.
 *
 * Everything written by this function either came from the answer, or is an
 * application suggestion labelled as one. There is no third case.
 *
 * `extractors` exists so the boundary itself can be tested with crafted raw
 * records (malformed shapes, duplicates, caps) instead of hoping an answer
 * produces them. It is honoured only in a test build; the production bundle
 * always uses the real extractors, and a guard checks that this function has no
 * other caller-supplied way in.
 */
export function deriveTabRecords(answer: string, context: DeriveContext, extractors?: DeriveExtractors): DerivedTabRecords {
  const source = extractors && isTestBuild() ? extractors : DEFAULT_EXTRACTORS;
  const at = context.at ?? Date.now();
  const collector = createIssueCollector();
  const answerDigest = digestValue({ v: DERIVED_RECORD_SCHEMA_VERSION, text: answer });
  const answerProbe = normaliseProbe(answer);
  const validation: ValidationContext = {
    at,
    runId: context.runId,
    answerDigest,
    answerProbe,
    chunks: context.chunks ?? [],
    collector,
  };

  if (answer.length > RECORD_BOUNDS.answerChars) {
    collector.add(
      "answer-too-large",
      "section",
      `the answer is ${answer.length} characters; records were derived and kept whole`,
    );
  }

  /* sections ---------------------------------------------------------------- */
  const rawSections = safeExtract(source.sections, answer, "section", collector);
  const sectionRecords: ReportSection[] = [];
  for (const raw of rawSections) {
    const section = validateSectionRecord(raw, validation);
    if (section) sectionRecords.push(section);
  }
  const sectionDedupe = dedupe(sectionRecords, (section) => normaliseProbe(section.title));
  if (sectionDedupe.merged > 0) {
    collector.add("duplicate-merged", "section", `${sectionDedupe.merged} duplicate section title(s) were merged`);
  }
  const sectionsCapped = sectionDedupe.kept.slice(0, RECORD_BOUNDS.sections.max);
  if (sectionDedupe.kept.length > sectionsCapped.length) {
    collector.add("list-capped", "section", `${sectionDedupe.kept.length} sections were derived; the first ${sectionsCapped.length} were kept`);
  }

  /* entities ---------------------------------------------------------------- */
  const rawEntities = safeExtract(source.entities, answer, "entity", collector);
  const entityRecords: Entity[] = [];
  const entityTypes = new Map<string, Entity["type"]>();
  for (const raw of rawEntities) {
    const entity = validateEntityRecord(raw, validation);
    if (entity) {
      const key = normaliseProbe(entity.name);
      const first = entityTypes.get(key);
      if (first !== undefined && first !== entity.type) {
        collector.add("type-conflict", "entity", `"${entity.name.slice(0, 60)}" arrived as both ${first} and ${entity.type}`);
      } else if (first === undefined) {
        entityTypes.set(key, entity.type);
      }
      entityRecords.push(entity);
    }
  }
  const entityDedupe = dedupe(entityRecords, (entity) => normaliseProbe(entity.name));
  if (entityDedupe.merged > 0) {
    collector.add("duplicate-merged", "entity", `${entityDedupe.merged} duplicate entity name(s) were merged`);
  }
  const entitiesCapped = entityDedupe.kept.slice(0, RECORD_BOUNDS.entities.max);
  if (entityDedupe.kept.length > entitiesCapped.length) {
    collector.add("list-capped", "entity", `${entityDedupe.kept.length} entities were derived; the first ${entitiesCapped.length} were kept`);
  }

  /* timeline ---------------------------------------------------------------- */
  const rawTimeline = safeExtract(source.timeline, answer, "timeline", collector);
  const timelineRecords: TimelineEvent[] = [];
  for (const raw of rawTimeline) {
    const event = validateTimelineRecord(raw, validation);
    if (event) timelineRecords.push(event);
  }
  const timelineDedupe = dedupe(
    timelineRecords,
    (event) => `${event.date}|${normaliseProbe(event.description).slice(0, 120)}`,
  );
  if (timelineDedupe.merged > 0) {
    collector.add("duplicate-merged", "timeline", `${timelineDedupe.merged} duplicate timeline entry(ies) were merged`);
  }
  const timelineCapped = timelineDedupe.kept.slice(0, RECORD_BOUNDS.timeline.max);
  if (timelineDedupe.kept.length > timelineCapped.length) {
    collector.add("list-capped", "timeline", `${timelineDedupe.kept.length} timeline entries were derived; the first ${timelineCapped.length} were kept`);
  }

  /* notes ------------------------------------------------------------------- */
  const rawNotes = safeExtract(source.notes, answer, "note", collector);
  const noteRecords: ResearchNote[] = [];
  for (const raw of rawNotes) {
    const note = validateNoteRecord(raw, validation);
    if (note) noteRecords.push(note);
  }
  const noteDedupe = dedupe(noteRecords, (note) => normaliseProbe(note.content));
  if (noteDedupe.merged > 0) {
    collector.add("duplicate-merged", "note", `${noteDedupe.merged} duplicate note(s) were merged`);
  }
  const notesCapped = noteDedupe.kept.slice(0, RECORD_BOUNDS.notes.max);
  if (noteDedupe.kept.length > notesCapped.length) {
    collector.add("list-capped", "note", `${noteDedupe.kept.length} notes were derived; the first ${notesCapped.length} were kept`);
  }

  /* follow-ups -------------------------------------------------------------- */
  const rawFollowUps = safeExtract(source.followUps, answer, "follow-up", collector);
  const asked = rawFollowUps
    .map((question) => validateFollowUp(question, validation))
    .filter((question): question is string => question !== null);
  const followUps: DerivedFollowUp[] =
    asked.length > 0
      ? asked.slice(0, RECORD_BOUNDS.followUps.max).map((question) => ({ question, origin: "answer" as const }))
      : suggestedFollowUpQuestions()
          .slice(0, RECORD_BOUNDS.followUps.max)
          .map((question) => ({ question, origin: "app" as const }));

  /* ids --------------------------------------------------------------------- */
  // The last check: no two records may share an id. Reachable only through a hash
  // collision, but a list with one id twice is a corrupted list, not a cosmetic
  // problem.
  const sectionsFinal = dedupeById(sectionsCapped, "section", collector);
  const entitiesFinal = dedupeById(entitiesCapped, "entity", collector);
  const timelineFinal = dedupeById(timelineCapped, "timeline", collector);
  const notesFinal = dedupeById(notesCapped, "note", collector);

  /* counts ------------------------------------------------------------------ */
  const all = [...sectionsFinal, ...entitiesFinal, ...timelineFinal, ...notesFinal];
  const supported = all.filter((record) => record.provenance?.support === "supported").length;
  const idRefused =
    sectionsCapped.length - sectionsFinal.length +
    (entitiesCapped.length - entitiesFinal.length) +
    (timelineCapped.length - timelineFinal.length) +
    (notesCapped.length - notesFinal.length);
  const dropped =
    rawSections.length - sectionRecords.length +
    (rawEntities.length - entityRecords.length) +
    (rawTimeline.length - timelineRecords.length) +
    (rawNotes.length - noteRecords.length) +
    (rawFollowUps.length - asked.length) +
    idRefused;
  const counts: DerivationCounts = {
    sections: sectionsFinal.length,
    entities: entitiesFinal.length,
    timeline: timelineFinal.length,
    notes: notesFinal.length,
    followUps: followUps.length,
    kept: all.length + followUps.length,
    dropped,
    merged: sectionDedupe.merged + entityDedupe.merged + timelineDedupe.merged + noteDedupe.merged,
    supported,
    unverified: all.length - supported + followUps.length,
  };

  const provenance: DerivationProvenance = {
    version: INTEGRITY_SCHEMA_VERSION,
    runId: context.runId,
    tabId: context.tabId,
    workspaceId: context.workspaceId,
    answerDigest,
    answerChars: answer.length,
    at,
    counts,
    issues: collector.issues,
    issueTotals: collector.totals,
  };

  return { sections: sectionsFinal, entities: entitiesFinal, timelineEvents: timelineFinal, notes: notesFinal, followUps, provenance };
}
