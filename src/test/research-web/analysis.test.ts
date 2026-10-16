import { describe, expect, it } from "vitest";
import {
  bindClaims,
  buildSourceRecord,
  chunkSource,
  defaultResearchPolicy,
  detectConflicts,
  markDuplicates,
  passageTextAt,
  summariseRun,
  type Extraction,
  type FetchedPage,
  type ResearchQuestion,
  type SourceRecord,
} from "../../research/web";

const POLICY = defaultResearchPolicy({ allowedHosts: ["regulator.gov", "mirror.example"] });

const REPORT = [
  "Incident report, published by the Office of Nuclear Regulation.",
  "The coolant loop B was restarted at 14:02 on 14 March 2023 by the shift team.",
  "Output was reduced to 640 megawatts for eleven hours while the loop was inspected.",
  "No injuries were reported, and the regulator did not find a breach of the licence conditions.",
].join(" ");

const COPY = REPORT;
const OTHER = [
  "A trade association summary of the same quarter.",
  "The association reports that output fell to 480 megawatts across the fleet.",
  "It also reports that the coolant loop B was never restarted during March 2023, which the association attributes to a maintenance backlog.",
].join(" ");

const QUESTION: ResearchQuestion = { question: "What happened at the reactor?", domain: "energy", jurisdiction: "UK", period: "2023", missingEvidence: "" };

function pageFor(url: string, body: string, fetchedAt = 1000): FetchedPage {
  return { requestedUrl: url, finalUrl: url, status: 200, contentType: "text/html", bytes: body.length, body, fetchedAt };
}

function source(url: string, text: string, options: { fetchedAt?: number; publishedAt?: string | null } = {}): SourceRecord {
  const extraction: Extraction = {
    title: `Document at ${url}`,
    text,
    author: null,
    publisher: null,
    publishedAt: options.publishedAt ?? null,
    canonicalUrl: null,
    sanitisedElements: 0,
    linksNotFollowed: 0,
    textTruncated: false,
  };
  return buildSourceRecord(pageFor(url, `<article><p>${text}</p></article>`, options.fetchedAt ?? 1000), extraction, "search-provider");
}

describe("source records", () => {
  it("gives the same page the same id across runs", () => {
    const first = source("https://regulator.gov/report", REPORT);
    const again = source("https://regulator.gov/report", REPORT);
    const other = source("https://regulator.gov/other", REPORT);

    expect(first.id).toBe(again.id);
    expect(first.id).not.toBe(other.id);
    expect(first.id).toMatch(/^src-[0-9a-f]+$/);
    expect(first.contentHash).toMatch(/^fnv1a32:/);
  });

  it("records what was retrieved and what was not quoted", () => {
    const record = source("https://regulator.gov/report", REPORT, { publishedAt: "2023-04-05" });
    expect(record.method).toBe("search-provider");
    expect(record.representative).toBe(true);
    expect(record.duplicates).toEqual([]);
    expect(record.publishedAt).toBe("2023-04-05");
    expect(record.text).toBe(REPORT);
    expect(record.textTruncated).toBe(false);
  });
});

describe("duplicate and republication detection", () => {
  it("groups copies of the same text and keeps one representative", () => {
    const records = markDuplicates([
      source("https://regulator.gov/report", REPORT, { fetchedAt: 1000 }),
      source("https://mirror.example/regulator/report", COPY, { fetchedAt: 2000 }),
      source("https://mirror.example/analysis", OTHER, { fetchedAt: 3000 }),
    ]);

    const [original, copy, independent] = records;
    expect(original.representative).toBe(true);
    expect(copy.representative).toBe(false);
    expect(original.duplicates).toEqual([copy.id]);
    expect(copy.duplicates).toEqual([original.id]);
    expect(independent.representative).toBe(true);
    expect(independent.duplicates).toEqual([]);
  });

  it("finds a reshuffled copy by wording overlap", () => {
    const paraphrased = `A summary. ${REPORT} Additional closing note.`;
    const records = markDuplicates([source("https://regulator.gov/report", REPORT), source("https://mirror.example/summary", paraphrased, { fetchedAt: 500 })]);
    expect(records[0].duplicates).toEqual([records[1].id]);
    expect(records[1].duplicates).toEqual([records[0].id]);
    // The earlier retrieval is the representative.
    expect(records[1].representative).toBe(true);
  });

  it("does not merge two genuinely different pages", () => {
    const records = markDuplicates([source("https://regulator.gov/report", REPORT), source("https://mirror.example/analysis", OTHER)]);
    expect(records[0].duplicates).toEqual([]);
    expect(records[1].duplicates).toEqual([]);
  });
});

describe("passages", () => {
  it("chunks a source with a locator that reproduces the passage", () => {
    const record = source("https://regulator.gov/report", REPORT);
    const passages = chunkSource(record, POLICY);

    expect(passages.length).toBeGreaterThan(0);
    const [first] = passages;
    expect(first.locator).toContain("https://regulator.gov/report#chars=");
    expect(first.reproducible).toBe(true);
    expect(passageTextAt(record, first.locator)).toBe(first.text);
    expect(passageTextAt(record, "https://regulator.gov/report#chars=999999-9999999")).toBeNull();
    expect(passageTextAt(record, "no locator here")).toBeNull();
  });

  it("reports a citation url that no longer passes the policy instead of silently counting it", () => {
    const record = source("https://unapproved.example/report", REPORT);
    const passages = chunkSource(record, POLICY);
    expect(passages[0].resolves).toBe("failed");
    expect(passages[0].resolvesReason).toContain("not one of the approved hosts");
  });
});

describe("claim binding", () => {
  const build = () => {
    const records = markDuplicates([source("https://regulator.gov/report", REPORT)]);
    const passages = records.flatMap((record) => chunkSource(record, POLICY));
    return { records, passages };
  };

  it("marks a claim that the retrieved text states as supported", () => {
    const { records, passages } = build();
    const claims = bindClaims("The coolant loop B was restarted at 14:02 on 14 March 2023 by the shift team.", records, passages);

    expect(claims).toHaveLength(1);
    expect(claims[0].status).toBe("supported");
    expect(claims[0].independentSourceIds).toEqual([records[0].id]);
    expect(claims[0].overlap).toBeGreaterThan(0.45);
  });

  it("does not accept a claim whose figure the text does not contain", () => {
    const { records, passages } = build();
    const claims = bindClaims("Output was reduced to 480 megawatts for eleven hours while the loop was inspected.", records, passages);

    expect(claims[0]?.status).not.toBe("supported");
  });

  it("does not count republications as corroboration", () => {
    const records = markDuplicates([
      source("https://regulator.gov/report", REPORT),
      source("https://mirror.example/report", COPY, { fetchedAt: 2000 }),
    ]);
    const passages = records.flatMap((record) => chunkSource(record, POLICY));
    const claims = bindClaims("The coolant loop B was restarted at 14:02 on 14 March 2023 by the shift team.", records, passages);

    expect(claims[0].status).toBe("supported");
    expect(claims[0].supportingSourceIds.length).toBe(2);
    expect(claims[0].independentSourceIds.length).toBe(1);
    expect(claims[0].notes.join(" ")).toContain("not independent corroboration");
  });

  it("judges nothing when there is no synthesis", () => {
    const { records, passages } = build();
    expect(bindClaims("", records, passages)).toEqual([]);
  });

  it("returns nothing to judge when no source was retrieved", () => {
    expect(bindClaims("The coolant loop B was restarted at 14:02.", [], [])).toEqual([]);
  });
});

describe("conflicts", () => {
  it("reports two claims with the same terms and different figures", () => {
    const conflicts = detectConflicts(
      [
        { claim: "Output was reduced to 640 megawatts for eleven hours.", status: "supported", overlap: 1, supportingChunkIds: [], supportingSourceIds: ["a"], independentSourceIds: ["a"], notes: [] },
        { claim: "Output was reduced to 480 megawatts for eleven hours.", status: "supported", overlap: 1, supportingChunkIds: [], supportingSourceIds: ["b"], independentSourceIds: ["b"], notes: [] },
      ],
      [],
      QUESTION,
      1_000_000,
    );

    expect(conflicts.some((conflict) => conflict.kind === "contradiction" && conflict.reason.includes("different figures"))).toBe(true);
  });

  it("reports a negated claim against its positive twin", () => {
    const conflicts = detectConflicts(
      [
        { claim: "The coolant loop B was restarted during March 2023.", status: "supported", overlap: 1, supportingChunkIds: [], supportingSourceIds: ["a"], independentSourceIds: ["a"], notes: [] },
        { claim: "The coolant loop B was never restarted during March 2023.", status: "supported", overlap: 1, supportingChunkIds: [], supportingSourceIds: ["b"], independentSourceIds: ["b"], notes: [] },
      ],
      [],
      QUESTION,
      1_000_000,
    );

    expect(conflicts.some((conflict) => conflict.kind === "contradiction" && conflict.reason.includes("negated"))).toBe(true);
  });

  it("does not invent a conflict between two claims that agree", () => {
    const conflicts = detectConflicts(
      [
        { claim: "Output was reduced to 640 megawatts.", status: "supported", overlap: 1, supportingChunkIds: [], supportingSourceIds: ["a"], independentSourceIds: ["a"], notes: [] },
        { claim: "Output was reduced to 640 megawatts.", status: "supported", overlap: 1, supportingChunkIds: [], supportingSourceIds: ["b"], independentSourceIds: ["b"], notes: [] },
      ],
      [],
      QUESTION,
      1_000_000,
    );
    expect(conflicts).toEqual([]);
  });

  it("flags a cited source published outside the declared period, and a stale one", () => {
    const cited = source("https://regulator.gov/report", REPORT, { publishedAt: "2015-06-01" });
    const claim = {
      claim: "The regulator published a report.",
      status: "supported" as const,
      overlap: 1,
      supportingChunkIds: [],
      supportingSourceIds: [cited.id],
      independentSourceIds: [cited.id],
      notes: [],
    };

    const conflicts = detectConflicts([claim], [cited], QUESTION, new Date("2024-01-01T00:00:00Z").getTime());
    expect(conflicts.some((conflict) => conflict.kind === "date-mismatch")).toBe(true);

    const withoutPeriod = detectConflicts([claim], [cited], { ...QUESTION, period: "" }, new Date("2024-01-01T00:00:00Z").getTime());
    expect(withoutPeriod.some((conflict) => conflict.kind === "stale-source")).toBe(true);
    expect(withoutPeriod.some((conflict) => conflict.kind === "date-mismatch")).toBe(false);
  });

  it("ignores a stale source that no claim rests on", () => {
    const uncited = source("https://regulator.gov/old", REPORT, { publishedAt: "2001-01-01" });
    const conflicts = detectConflicts([], [uncited], { ...QUESTION, period: "" }, Date.now());
    expect(conflicts).toEqual([]);
  });
});

describe("run summary", () => {
  it("says nothing was retrieved when no provider is configured", () => {
    const { summary, insufficientEvidence } = summariseRun({
      question: QUESTION,
      sources: [],
      failures: [],
      claims: [],
      conflicts: [],
      providerUnavailable: "no search provider is configured",
    });

    expect(summary).toContain("Nothing was searched or fetched");
    expect(insufficientEvidence).toBe(true);
  });

  it("counts independent sources, stated dates and unclassifiable pages", () => {
    const dated = source("https://regulator.gov/report", REPORT, { publishedAt: "2023-04-05" });
    const undated = source("https://whatsthis.example/page", OTHER);
    const { summary, insufficientEvidence } = summariseRun({
      question: QUESTION,
      sources: markDuplicates([dated, undated]),
      failures: [],
      claims: [],
      conflicts: [],
    });

    expect(summary).toContain("2 page(s) were retrieved from 2 host(s)");
    expect(summary).toContain("1 of 2 source(s) stated a publication date");
    expect(summary).toContain("kind labels are a heuristic");
    expect(insufficientEvidence).toBe(false);
  });

  it("says a run with no supported claim does not establish an answer", () => {
    const { summary, insufficientEvidence } = summariseRun({
      question: QUESTION,
      sources: [source("https://regulator.gov/report", REPORT)],
      failures: [],
      claims: [
        { claim: "A claim nothing supports.", status: "unsupported", overlap: 0, supportingChunkIds: [], supportingSourceIds: [], independentSourceIds: [], notes: [] },
      ],
      conflicts: [],
    });

    expect(summary).toContain("1 unsupported by any retrieved passage");
    expect(insufficientEvidence).toBe(true);
  });
});
