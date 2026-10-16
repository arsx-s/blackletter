import { describe, expect, it } from "vitest";
import {
  DERIVED_RECORD_SCHEMA_VERSION,
  INTEGRITY_SCHEMA_VERSION,
  RECORD_BOUNDS,
  createIssueCollector,
  dedupeById,
  deriveTabRecords,
  normaliseProbe,
  safeExtract,
  validateEntityRecord,
  validateFollowUp,
  validateNoteRecord,
  validateSectionRecord,
  type DeriveExtractors,
  type ValidationContext,
} from "../../integrity";
import { digestValue } from "../../lib/hash";
import { formatLocator, type SourceLocation } from "../../pipeline/grounding";

/**
 * The derivation boundary is the only place an answer becomes records, so these
 * tests are about what it refuses, not only what it produces: a malformed record,
 * a reference the answer does not contain, a duplicate, a list over its cap and a
 * parser that throws are all cases where the store must stay correct.
 *
 * The extractor seam is used to produce raw shapes a real answer cannot, and it
 * only exists in a test build — see `deriveTabRecords`.
 */

const ANSWER = [
  "## Coolant Loop Overview",
  "",
  "The **Coolant Loop** was isolated in 2019 after a pressure drop was recorded at Wolfe Creek Institute.",
  "",
  "## Findings",
  "",
  "The impeller showed fatigue cracking consistent with cavitation and erosion of the leading edges.",
  "",
  "What caused the pressure drop?",
].join("\n");

const IMPELLER_TEXT = "The impeller showed fatigue cracking consistent with cavitation and erosion of the leading edges.";

const LOCATION: SourceLocation = {
  documentId: "d1",
  documentName: "incident-report.pdf",
  page: 3,
  section: null,
  charStart: 100,
  charEnd: 200,
};

function contextFor(answer: string, chunks: ValidationContext["chunks"] = []): { context: ValidationContext; totals: ValidationContext["collector"]["totals"] } {
  const collector = createIssueCollector();
  return {
    context: {
      at: 1000,
      runId: "run-1",
      answerDigest: digestValue({ v: DERIVED_RECORD_SCHEMA_VERSION, text: answer }),
      answerProbe: normaliseProbe(answer),
      chunks,
      collector,
    },
    totals: collector.totals,
  };
}

const DERIVE_CONTEXT = { tabId: "tab-1", workspaceId: "w1", runId: "run-1", at: 1000 };

describe("derivation boundary", () => {
  it("derives sections, entities, timeline entries, notes and the answer's own question, each with provenance", () => {
    const records = deriveTabRecords(ANSWER, DERIVE_CONTEXT);
    const digest = digestValue({ v: DERIVED_RECORD_SCHEMA_VERSION, text: ANSWER });

    expect(records.sections.map((section) => section.title)).toEqual(["Coolant Loop Overview", "Findings"]);
    expect(records.entities.map((entity) => entity.name)).toEqual(["Coolant Loop", "Wolfe Creek Institute"]);
    expect(records.timelineEvents.map((event) => event.date)).toEqual(["2019"]);
    expect(records.notes.length).toBe(2);
    expect(records.followUps).toEqual([{ question: "What caused the pressure drop?", origin: "answer" }]);

    for (const record of [...records.sections, ...records.entities, ...records.timelineEvents, ...records.notes]) {
      expect(record.provenance?.from).toBe("answer");
      expect(record.provenance?.runId).toBe("run-1");
      expect(record.provenance?.answerDigest).toBe(digest);
      expect(record.provenance?.extractor).toMatch(/@1$/);
      // No chunks were passed, so nothing could be matched. Unverified, never
      // "verified" — the boundary cannot verify anything.
      expect(record.provenance?.support).toBe("unverified");
      expect(record.provenance?.evidence).toEqual([]);
    }

    expect(records.provenance.version).toBe(INTEGRITY_SCHEMA_VERSION);
    expect(records.provenance.answerDigest).toBe(digest);
    expect(records.provenance.answerChars).toBe(ANSWER.length);
    expect(records.provenance.issues).toEqual([]);
    expect(records.provenance.counts).toMatchObject({ sections: 2, entities: 2, timeline: 1, notes: 2, followUps: 1, dropped: 0, merged: 0 });
  });

  it("labels a record as supported only when a retrieved chunk contains its text", () => {
    const records = deriveTabRecords(ANSWER, {
      ...DERIVE_CONTEXT,
      chunks: [{ id: "chunk-1", text: IMPELLER_TEXT, location: LOCATION }],
    });

    const supported = records.notes.find((note) => note.content.includes("impeller"));
    expect(supported?.provenance?.support).toBe("supported");
    expect(supported?.provenance?.evidence).toEqual([formatLocator(LOCATION)]);

    const unsupported = records.notes.find((note) => note.content.includes("Coolant Loop"));
    expect(unsupported?.provenance?.support).toBe("unverified");
    expect(unsupported?.provenance?.evidence).toEqual([]);

    expect(records.provenance.counts.supported).toBe(1);
    expect(records.provenance.counts.unverified).toBe(records.provenance.counts.kept - 1);
  });

  it("uses a chunk id as the locator when a chunk has no source location", () => {
    const records = deriveTabRecords(ANSWER, {
      ...DERIVE_CONTEXT,
      chunks: [{ id: "chunk-1", text: IMPELLER_TEXT }],
    });
    const note = records.notes.find((entry) => entry.content.includes("impeller"));
    expect(note?.provenance?.evidence).toEqual(["chunk chunk-1"]);
  });

  it("is deterministic: the same answer yields the same ids and the same digest", () => {
    const first = deriveTabRecords(ANSWER, DERIVE_CONTEXT);
    const second = deriveTabRecords(ANSWER, { ...DERIVE_CONTEXT, at: 9999 });
    expect(second.sections.map((section) => section.id)).toEqual(first.sections.map((section) => section.id));
    expect(second.entities.map((entity) => entity.id)).toEqual(first.entities.map((entity) => entity.id));
    expect(second.provenance.answerDigest).toBe(first.provenance.answerDigest);

    const ids = [...first.sections, ...first.entities, ...first.timelineEvents, ...first.notes].map((record) => record.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("marks the application's own section label instead of deleting the section", () => {
    // A plain answer with no `##` heading is rendered under the app's "Overview".
    const plain = "The reactor was shut down for inspection and the loop was drained before reopening.";
    const records = deriveTabRecords(plain, DERIVE_CONTEXT);

    expect(records.sections).toHaveLength(1);
    expect(records.sections[0].title).toBe("Overview");
    expect(records.sections[0].provenance?.from).toBe("app");
    expect(records.provenance.issueTotals["app-supplied"]).toBe(1);
    expect(records.provenance.counts.dropped).toBe(0);
  });

  it("suggests follow-ups as the application's, never as the answer's", () => {
    const statement = "## Summary\n\nThe loop was drained and the impeller was replaced before the restart.";
    const records = deriveTabRecords(statement, DERIVE_CONTEXT);
    expect(records.followUps.length).toBe(5);
    expect(records.followUps.every((followUp) => followUp.origin === "app")).toBe(true);
  });
});

describe("record validation", () => {
  it("refuses a record whose required fields are missing or the wrong type", () => {
    const { context, totals } = contextFor(ANSWER);

    expect(validateSectionRecord({}, context)).toBeNull();
    expect(validateSectionRecord({ title: 42, content: "x" }, context)).toBeNull();
    expect(validateEntityRecord({ type: "person" }, context)).toBeNull();
    expect(validateNoteRecord({ content: 12 }, context)).toBeNull();
    expect(validateFollowUp(7, context)).toBeNull();

    expect(totals["malformed-record"]).toBe(5);
  });

  it("refuses a record whose text the answer does not contain", () => {
    const { context, totals } = contextFor("The report describes a pump, a valve and a gauge.");

    expect(validateEntityRecord({ name: "Fabricated Holdings", type: "organization", description: "" }, context)).toBeNull();
    expect(validateNoteRecord({ type: "fact", content: "A sentence that appears nowhere." }, context)).toBeNull();
    expect(
      validateSectionRecord({ title: "Overview", content: "A paragraph the answer never contained." }, context),
    ).toBeNull();
    expect(totals["fabricated-reference"]).toBe(3);
  });

  it("reads an unknown entity type as a concept and says so", () => {
    const { context, totals } = contextFor(ANSWER);
    const entity = validateEntityRecord({ name: "Coolant Loop", type: "species", description: "" }, context);
    expect(entity?.type).toBe("concept");
    expect(totals["malformed-record"]).toBe(1);
  });

  it("keeps an oversized title whole and reports it", () => {
    const longTitle = `Summary ${"x".repeat(RECORD_BOUNDS.sections.titleChars + 40)}`;
    const { context, totals } = contextFor(`## ${longTitle}\n\nBody text.`);
    const section = validateSectionRecord({ title: longTitle, content: "Body text." }, context);
    expect(section?.title).toHaveLength(longTitle.length);
    expect(totals["oversized-record"]).toBe(1);
  });
});

describe("extractor failures and caps", () => {
  const empty: DeriveExtractors = {
    sections: () => [],
    entities: () => [],
    timeline: () => [],
    notes: () => [],
    followUps: () => [],
  };

  it("reports a parser that throws or returns a non-list without taking the derivation down", () => {
    const records = deriveTabRecords(ANSWER, DERIVE_CONTEXT, {
      ...empty,
      timeline: () => "not a list",
      notes: () => {
        throw new Error("parser exploded");
      },
      followUps: () => [17, "What caused the pressure drop?"],
    });

    expect(records.timelineEvents).toEqual([]);
    expect(records.notes).toEqual([]);
    expect(records.followUps).toEqual([{ question: "What caused the pressure drop?", origin: "answer" }]);
    expect(records.provenance.issueTotals["malformed-record"]).toBe(3);
    expect(records.provenance.issues.some((issue) => issue.detail.includes("parser exploded"))).toBe(true);
  });

  it("merges case and whitespace duplicates and counts them once", () => {
    const records = deriveTabRecords(ANSWER, DERIVE_CONTEXT, {
      ...empty,
      entities: () => [
        { name: "Coolant Loop", type: "person", description: "" },
        { name: "coolant   loop", type: "concept", description: "" },
      ],
    });

    expect(records.entities).toHaveLength(1);
    expect(records.entities[0].name).toBe("Coolant Loop");
    expect(records.entities[0].type).toBe("person");
    expect(records.provenance.issueTotals["duplicate-merged"]).toBe(1);
    expect(records.provenance.counts.merged).toBe(1);
  });

  it("keeps the first type when the same subject arrives as two types, and reports the conflict", () => {
    const records = deriveTabRecords(ANSWER, DERIVE_CONTEXT, {
      ...empty,
      entities: () => [
        { name: "Coolant Loop", type: "person", description: "" },
        { name: "Coolant Loop", type: "organization", description: "" },
      ],
    });

    expect(records.entities).toHaveLength(1);
    expect(records.entities[0].type).toBe("person");
    expect(records.provenance.issueTotals["type-conflict"]).toBe(1);
    expect(records.provenance.issueTotals["duplicate-merged"]).toBe(1);
    const conflict = records.provenance.issues.find((issue) => issue.code === "type-conflict");
    expect(conflict?.detail).toMatch(/person and organization/);
  });

  it("caps a runaway list, keeps the first records and reports the cap", () => {
    const names = Array.from({ length: RECORD_BOUNDS.entities.max + 10 }, (_, index) => `Cap Entity ${index}`);
    const answer = names.join(". ");
    const records = deriveTabRecords(
      answer,
      { ...DERIVE_CONTEXT, at: undefined },
      { ...empty, entities: () => names.map((name) => ({ name, type: "concept", description: "" })) },
    );

    expect(records.entities).toHaveLength(RECORD_BOUNDS.entities.max);
    expect(records.entities[0].name).toBe("Cap Entity 0");
    expect(records.provenance.issueTotals["list-capped"]).toBe(1);
    expect(records.provenance.counts.entities).toBe(RECORD_BOUNDS.entities.max);
  });

  it("flags an answer beyond the size bound and derives from it anyway", () => {
    const huge = "A".repeat(RECORD_BOUNDS.answerChars + 1);
    const records = deriveTabRecords(huge, DERIVE_CONTEXT, empty);
    expect(records.provenance.issueTotals["answer-too-large"]).toBe(1);
    expect(records.provenance.answerChars).toBe(huge.length);
  });

  it("refuses a second record with an id already used", () => {
    const collector = createIssueCollector();
    const kept = dedupeById(
      [
        { id: "sec-abc123", label: "first" },
        { id: "sec-abc123", label: "second" },
      ],
      "section",
      collector,
    );
    expect(kept).toEqual([{ id: "sec-abc123", label: "first" }]);
    expect(collector.totals["id-collision"]).toBe(1);
  });

  it("treats a throwing extractor inside safeExtract as an empty list with one issue", () => {
    const collector = createIssueCollector();
    const result = safeExtract(
      () => {
        throw new Error("boom");
      },
      "answer",
      "note",
      collector,
    );
    expect(result).toEqual([]);
    expect(collector.totals["malformed-record"]).toBe(1);
    expect(collector.issues[0].detail).toContain("boom");
  });
});
