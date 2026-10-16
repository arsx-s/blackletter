import { digestValue } from "../../lib/hash";
import { STOP, attributeClaims, chunkInlineSource, type ClaimEvidence } from "../../pipeline/grounding";
import { canonicaliseUrl, classifySource, hostOf, type Extraction } from "./extract";
import { checkResearchUrl } from "./fetch";
import type {
  ClaimConflict,
  ClaimVerdict,
  FetchedPage,
  Passage,
  ResearchPolicy,
  ResearchQuestion,
  RetrievalMethod,
  SourceFailure,
  SourceRecord,
} from "./types";

/**
 * From fetched bytes to a defensible record: source identity, deduplication,
 * reproducible passages, claim support, and conflicts.
 *
 * The single rule here: **support is only ever counted from passages that
 * reproduce from the stored text**. A citation that cannot be re-derived from
 * what was kept is not evidence, and a page republished five times is one source
 * with five URLs, not five sources.
 */

export function buildSourceRecord(page: FetchedPage, extraction: Extraction, method: RetrievalMethod): SourceRecord {
  const canonical = canonicaliseUrl(extraction.canonicalUrl ?? page.finalUrl);
  const classification = classifySource(canonical);

  return {
    // Content-addressed on the canonical URL, so the same page fetched again
    // keeps the same identity and citations stay resolvable across runs.
    id: `src-${digestValue(["web-source", canonical]).replace(/^fnv1a32:/, "")}`,
    url: page.finalUrl,
    canonicalUrl: canonical,
    title: extraction.title,
    publisher: extraction.publisher,
    author: extraction.author,
    publishedAt: extraction.publishedAt,
    retrievedAt: page.fetchedAt,
    method,
    contentType: page.contentType,
    contentHash: digestValue(extraction.text),
    rawHash: digestValue(page.body),
    text: extraction.text,
    textTruncated: extraction.textTruncated,
    kind: classification.kind,
    kindBasis: classification.basis,
    duplicates: [],
    representative: true,
    sanitisedElements: extraction.sanitisedElements,
    linksNotFollowed: extraction.linksNotFollowed,
  };
}

/* ------------------------------------------------------------ duplication */

const SHINGLE = 5;

function shingles(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const out = new Set<string>();
  for (let i = 0; i + SHINGLE <= words.length; i++) out.add(words.slice(i, i + SHINGLE).join(" "));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const value of a) if (b.has(value)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * Mark duplicates and pick one representative per group.
 *
 * Three ways a source can be a republished copy of another: same canonical URL,
 * same extracted-text digest, or 85% shared wording. All three are reported as
 * `duplicates`, so a claim supported by five sites can be seen for what it is.
 */
export function markDuplicates(records: SourceRecord[]): SourceRecord[] {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let current = id;
    while (parent.get(current) && parent.get(current) !== current) current = parent.get(current) as string;
    return current;
  };
  const union = (a: string, b: string) => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };

  for (const record of records) parent.set(record.id, record.id);

  const byCanonical = new Map<string, string>();
  const byHash = new Map<string, string>();
  for (const record of records) {
    if (byCanonical.has(record.canonicalUrl)) union(byCanonical.get(record.canonicalUrl) as string, record.id);
    else byCanonical.set(record.canonicalUrl, record.id);

    if (byHash.has(record.contentHash)) union(byHash.get(record.contentHash) as string, record.id);
    else byHash.set(record.contentHash, record.id);
  }

  const shingleCache = new Map<string, Set<string>>();
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const a = records[i];
      const b = records[j];
      if (find(a.id) === find(b.id)) continue;
      const setA = shingleCache.get(a.id) ?? shingles(a.text);
      const setB = shingleCache.get(b.id) ?? shingles(b.text);
      shingleCache.set(a.id, setA);
      shingleCache.set(b.id, setB);
      if (jaccard(setA, setB) >= 0.85) union(a.id, b.id);
    }
  }

  const membersByRepresentative = new Map<string, SourceRecord[]>();
  for (const record of records) {
    const root = find(record.id);
    const list = membersByRepresentative.get(root) ?? [];
    list.push(record);
    membersByRepresentative.set(root, list);
  }

  for (const members of membersByRepresentative.values()) {
    // The representative is the earliest retrieved copy; ties go to the first seen.
    const representative = [...members].sort((a, b) => a.retrievedAt - b.retrievedAt)[0];
    for (const member of members) {
      member.representative = member.id === representative.id;
      member.duplicates = members.filter((other) => other.id !== member.id).map((other) => other.id);
    }
  }

  return records;
}

/* --------------------------------------------------------------- passages */

/**
 * Chunk one source into passages, using the pipeline's own chunker so that the
 * evidence a *report* cites and the evidence this module cites are produced
 * identically.
 */
export function chunkSource(record: SourceRecord, policy: ResearchPolicy): Passage[] {
  const { chunks } = chunkInlineSource("web", record.canonicalUrl, record.text);
  const verdict = checkResearchUrl(record.url, policy);

  return chunks.map((chunk) => {
    const start = chunk.location.charStart;
    const end = chunk.location.charEnd;
    return {
      chunkId: chunk.id,
      sourceId: record.id,
      locator: `${record.canonicalUrl}#chars=${start}-${end}`,
      text: chunk.text,
      // Reproducible by construction: `chunkInlineSource` verified the chunk
      // against the normalised text it returned, and that text is derived from
      // the stored source text, which is what makes the locator checkable.
      reproducible: record.text.length > 0 && end <= record.text.length,
      // "Resolves" here means the citation URL still passes the destination
      // policy. It is not a claim that the page is still online.
      resolves: verdict.ok ? "ok" : "failed",
      resolvesReason: verdict.ok ? undefined : verdict.reason,
    };
  });
}

/* ----------------------------------------------------------------- claims */

function contentWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return new Set(words.filter((word) => word.length > 2 && !STOP.has(word)));
}

const NEGATION_WORDS = new Set(["not", "no", "never", "none", "cannot", "denied", "refused", "without"]);

function hasNegation(text: string): boolean {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  return words.some((word) => NEGATION_WORDS.has(word));
}

function numbers(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((value) => value.replace(/,/g, ""));
}

/**
 * Bind a synthesis to retrieved passages.
 *
 * The judgement itself is `attributeClaims` from the grounding module — there is
 * exactly one place in this app that decides whether a passage supports a claim.
 * What this function adds is provenance: which *sources* those passages came
 * from, and how many of them are independent.
 */
export function bindClaims(synthesis: string, sources: SourceRecord[], passages: Passage[]): ClaimVerdict[] {
  if (synthesis.trim().length === 0) return [];

  const byChunk = new Map(passages.map((passage) => [passage.chunkId, passage]));
  const bySource = new Map(sources.map((source) => [source.id, source]));
  const evidence: ClaimEvidence[] = attributeClaims(
    synthesis,
    passages.map((passage) => ({ id: passage.chunkId, text: passage.text })),
  );

  return evidence.map((item) => {
    const supporting = item.supportingChunkIds.map((id) => byChunk.get(id)).filter((p): p is Passage => Boolean(p));
    const supportingSourceIds = [...new Set(supporting.map((passage) => passage.sourceId))];
    const independentSourceIds = [
      ...new Set(
        supportingSourceIds.map((id) => {
          const source = bySource.get(id);
          if (!source) return id;
          if (source.representative) return source.id;
          // A copy stands for its group; find the representative by scanning the
          // group members that point at this one.
          const representative = sources.find((candidate) => candidate.representative && candidate.duplicates.includes(source.id));
          return representative?.id ?? source.id;
        }),
      ),
    ];

    const notes: string[] = [];
    const notReproducible = supporting.filter((passage) => !passage.reproducible);
    if (notReproducible.length > 0) {
      notes.push(`${notReproducible.length} supporting passage(s) do not reproduce from the stored text and were not counted`);
    }
    const unreliable = supporting.filter((passage) => passage.resolves !== "ok");
    if (unreliable.length > 0) {
      notes.push(`${unreliable.length} supporting passage(s) come from a URL that no longer passes the fetch policy`);
    }
    if (supportingSourceIds.length > independentSourceIds.length) {
      notes.push(
        `the supporting pages are republications of ${independentSourceIds.length} source(s), so they are not independent corroboration`,
      );
    }

    const countable = supporting.filter((passage) => passage.reproducible && passage.resolves === "ok");
    const countableSources = [...new Set(countable.map((passage) => passage.sourceId))];
    const countableIndependent = [
      ...new Set(
        countableSources.map((id) => {
          const source = bySource.get(id);
          if (!source || source.representative) return id;
          const representative = sources.find((candidate) => candidate.representative && candidate.duplicates.includes(source.id));
          return representative?.id ?? id;
        }),
      ),
    ];

    const supportedByEvidence = item.supported && countableIndependent.length > 0;
    const status: ClaimVerdict["status"] = supportedByEvidence
      ? "supported"
      : countable.length > 0 || item.overlap > 0
        ? "partial"
        : "unsupported";

    return {
      claim: item.claim,
      status,
      overlap: item.overlap,
      supportingChunkIds: item.supportingChunkIds,
      supportingSourceIds,
      independentSourceIds: countableIndependent,
      notes,
    };
  });
}

/* -------------------------------------------------------------- conflicts */

const MAX_CLAIMS_COMPARED = 24;
const STALE_YEARS = 5;

/**
 * Find claims that cannot both be true, and sources that are out of date or fall
 * outside the period the question declared. Conflicts are *reported*, never
 * resolved: picking a winner would mean inventing a reason the evidence does not
 * contain.
 */
export function detectConflicts(
  claims: ClaimVerdict[],
  sources: SourceRecord[],
  question: ResearchQuestion,
  now: number,
): ClaimConflict[] {
  const conflicts: ClaimConflict[] = [];
  const considered = claims.filter((claim) => claim.status !== "unsupported").slice(0, MAX_CLAIMS_COMPARED);
  const words = considered.map((claim) => contentWords(claim.claim));

  for (let i = 0; i < considered.length; i++) {
    for (let j = i + 1; j < considered.length; j++) {
      const shared = [...words[i]].filter((word) => words[j].has(word));
      const smaller = Math.min(words[i].size, words[j].size);
      if (smaller === 0 || shared.length / smaller < 0.6) continue;

      const negationFlip = hasNegation(considered[i].claim) !== hasNegation(considered[j].claim);
      const numbersDiffer =
        numbers(considered[i].claim).length > 0 &&
        numbers(considered[j].claim).length > 0 &&
        numbers(considered[i].claim).join("|") !== numbers(considered[j].claim).join("|");

      if (negationFlip || numbersDiffer) {
        conflicts.push({
          kind: "contradiction",
          claimA: considered[i].claim,
          claimB: considered[j].claim,
          reason: negationFlip
            ? `both claims cover the same terms (${shared.slice(0, 4).join(", ")}) but one is negated`
            : `both claims cover the same terms (${shared.slice(0, 4).join(", ")}) but state different figures`,
        });
      }
    }
  }

  const citedSources = new Set(claims.flatMap((claim) => claim.independentSourceIds));
  const periodYears = (question.period.match(/\b(1[6-9]\d{2}|20\d{2})\b/g) ?? []).map(Number);

  for (const source of sources) {
    if (!citedSources.has(source.id) || !source.publishedAt) continue;
    const published = new Date(source.publishedAt);
    if (Number.isNaN(published.getTime())) continue;

    if (periodYears.length > 0) {
      const year = published.getFullYear();
      const [low, high] = [Math.min(...periodYears), Math.max(...periodYears)];
      if (year < low || year > high) {
        conflicts.push({
          kind: "date-mismatch",
          claimA: `source: ${source.title}`,
          claimB: "",
          reason: `published ${year}, outside the period the question declared (${question.period})`,
        });
        continue;
      }
    }

    const ageYears = (now - published.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (ageYears > STALE_YEARS) {
      conflicts.push({
        kind: "stale-source",
        claimA: `source: ${source.title}`,
        claimB: "",
        reason: `published ${published.getUTCFullYear()}, more than ${STALE_YEARS} years before this run; check whether it has been superseded`,
      });
    }
  }

  return conflicts;
}

/* --------------------------------------------------------------- summary */

export interface RunSummary {
  summary: string;
  insufficientEvidence: boolean;
}

/**
 * One honest paragraph about a run. It leads with what was retrieved, then what
 * could not be established, and never describes a search that did not happen.
 */
export function summariseRun(input: {
  question: ResearchQuestion;
  sources: SourceRecord[];
  failures: SourceFailure[];
  claims: ClaimVerdict[];
  conflicts: ClaimConflict[];
  providerUnavailable?: string;
}): RunSummary {
  const { question, sources, failures, claims, conflicts, providerUnavailable } = input;
  const sentences: string[] = [];

  if (providerUnavailable) {
    sentences.push(`Nothing was searched or fetched: ${providerUnavailable}.`);
  } else if (sources.length === 0) {
    sentences.push("No page was retrieved, so there is no evidence to bind any claim to.");
  } else {
    const hosts = [...new Set(sources.map((source) => hostOf(source.url) ?? source.url))];
    const groups = sources.filter((source) => source.representative).length;
    sentences.push(
      `${sources.length} page(s) were retrieved from ${hosts.length} host(s); they represent ${groups} independent source(s) after duplicate and republication detection.`,
    );
  }

  if (sources.length > 0) {
    const unclassified = sources.filter((source) => source.kind === "unknown").length;
    const dated = sources.filter((source) => source.publishedAt).length;
    sentences.push(
      `${dated} of ${sources.length} source(s) stated a publication date, and ${unclassified} could not be classified by the domain heuristic — kind labels are a heuristic, not a verification.`,
    );
  }

  if (claims.length > 0) {
    const supported = claims.filter((claim) => claim.status === "supported").length;
    const partial = claims.filter((claim) => claim.status === "partial").length;
    const unsupported = claims.filter((claim) => claim.status === "unsupported").length;
    const singleSourced = claims.filter((claim) => claim.status === "supported" && claim.independentSourceIds.length === 1).length;
    sentences.push(
      `Of ${claims.length} sentence(s) checked against the retrieved text: ${supported} supported (${singleSourced} by a single independent source), ${partial} only partly matched, ${unsupported} unsupported by any retrieved passage.`,
    );
  }

  if (failures.length > 0) {
    sentences.push(`${failures.length} URL(s) were refused or failed, and are listed with their reasons.`);
  }
  if (conflicts.length > 0) {
    sentences.push(`${conflicts.length} conflict(s) were found between sources; they are shown unresolved.`);
  }
  if (question.missingEvidence.trim().length > 0) {
    sentences.push(`Stated as still missing: ${question.missingEvidence.trim()}`);
  }

  const insufficientEvidence =
    Boolean(providerUnavailable) ||
    sources.length === 0 ||
    (claims.length > 0 && claims.every((claim) => claim.status === "unsupported"));

  if (insufficientEvidence) sentences.push("This run does not establish an answer with evidence.");

  return { summary: sentences.join(" "), insufficientEvidence };
}

/** Re-derive decoded text from a locator, so a reader can check a citation. */
export function passageTextAt(source: SourceRecord, locator: string): string | null {
  const match = locator.match(/#chars=(\d+)-(\d+)$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > source.text.length || start >= end) return null;
  return source.text.slice(start, end);
}
