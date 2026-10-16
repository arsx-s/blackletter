/**
 * Evidence grounding: locators, chunk identity, verification, citations.
 *
 * ## What was wrong before this module existed
 *
 * Retrieval produced `RetrievedChunk { id, source, sourceType, text, position }`
 * where:
 *
 *   - `id` was `` `${prefix}-${counter}` `` — a position in a list. Reorder the
 *     documents, or retrieve a different set, and the same chunk got a different
 *     id. Nothing could be cited, cached, or checked after a reload.
 *   - `position` was that same counter. It *looked* like a locator and was not
 *     one: no offset into anything.
 *   - the document names were recovered by re-parsing `--- name ---` separators
 *     out of text that had already been joined, so a document containing a line
 *     like `--- Introduction ---` was silently split into two documents.
 *   - nothing connected a chunk back to the text it came from. A chunk was
 *     unverifiable, so any claim built on it was unverifiable too.
 *
 * ## What this module guarantees
 *
 *   1. **Real offsets.** Every chunk records `charStart`/`charEnd` into the
 *      document's stored text, computed by locating the chunk text in that text.
 *   2. **Verifiability.** `verifyChunk` re-slices the source text and compares.
 *      A chunk that cannot be reproduced from its source is dropped, and the
 *      drop is reported. Tests assert this, but it also runs in production.
 *   3. **Stable identity.** The id is a digest of the source, the offsets and
 *      the text, so identical evidence always has the identical id and a stored
 *      citation keeps resolving.
 *   4. **Attribution.** Support is decided per claim against individual chunks,
 *      so the report can say *which* evidence supports *which* sentence.
 *   5. **Honest absence.** When there is nothing to check, the result is `null`
 *      rather than a number conjured from a default.
 *
 * Not in scope: semantic similarity, embeddings, or any model call. Ranking is
 * lexical and deterministic, which means it can be wrong about meaning — but it
 * is never wrong about where a sentence came from.
 */

import { fnv1a32 } from "../lib/hash";

export type ChunkSource = "document" | "knowledge" | "history" | "canvas" | "web";

/* ------------------------------------------------------------- windowing */

/**
 * Chunk geometry.
 *
 * These are policy, not measurement: a ~700-character window with 120 characters
 * of overlap is large enough to hold an argument and small enough to fit several
 * chunks in a prompt. They are stated here once so tests and callers agree.
 */
export const CHUNK_POLICY = {
  /** Target characters per chunk. */
  targetChars: 700,
  /** Characters repeated at the start of the next chunk, so a split sentence is recoverable. */
  overlapChars: 120,
  /** Chunks shorter than this are dropped as noise. */
  minChars: 100,
  /** Maximum chunks taken from one document, so one huge file cannot crowd out the rest. */
  maxChunksPerSource: 200,
} as const;

/* -------------------------------------------------------------- locators */

/**
 * Where a piece of evidence lives.
 *
 * `charStart`/`charEnd` are the load-bearing fields: they are offsets into
 * `documentText`, an actual string, and they can be checked. `page` and
 * `section` are labels for a human reader and are `null` when the format did not
 * expose them — never guessed.
 */
export interface SourceLocation {
  documentId: string;
  documentName: string;
  /** 1-based, or `null` when the format has no pages. */
  page: number | null;
  /** Heading or page label, or `null`. */
  section: string | null;
  /** Inclusive offset into the document text. */
  charStart: number;
  /** Exclusive offset into the document text. */
  charEnd: number;
}

export interface EvidenceChunk {
  id: string;
  source: string;
  sourceType: ChunkSource;
  text: string;
  location: SourceLocation;
}

/**
 * A document as the pipeline holds it after extraction.
 *
 * `text` is the authoritative string: locators index into it. `sections` carry
 * the page and heading boundaries the extractor found, which is how a chunk
 * learns that it sits on page 4.
 */
export interface DocumentPart {
  documentId: string;
  name: string;
  text: string;
  sections?: Array<{ label: string; text: string }>;
  pageCount?: number | null;
}

/**
 * Content-addressed chunk id.
 *
 * The id depends on *what the evidence is*, not on where it appeared in a list.
 * Two runs over the same document produce the same id for the same span, so a
 * stored citation still resolves after a reload, and a test can assert identity
 * across reorderings.
 */
export function chunkId(sourceType: ChunkSource, source: string, location: SourceLocation, text: string): string {
  const digest = fnv1a32(
    `${sourceType}\u0000${source}\u0000${location.documentId}\u0000${location.charStart}\u0000${location.charEnd}\u0000${text}`,
  );
  return `${sourceType}-${digest}`;
}

/** Strip a file extension for display. `report.pdf` → `report`. */
export function displayName(fileName: string): string {
  const stripped = fileName.replace(/\.[A-Za-z0-9]{1,8}$/, "");
  return stripped.trim() || fileName;
}

/**
 * How many evidence entries are shown to the model, and therefore how large the
 * `[n]` namespace is.
 *
 * A citation resolves to entry *n* of this list, so the prompt builder and the
 * citation resolver must agree on it. It lives here, next to the resolver, and
 * both sides import it — a silent disagreement would mis-resolve every citation
 * beyond the shorter of the two windows.
 */
export const EVIDENCE_WINDOW = 15;

/**
 * A one-line human description of where a chunk came from.
 *
 * Page labels are omitted from the section field because "page 3, page 3" is
 * noise; a real heading is included because it tells the reader what part of the
 * document they are looking at.
 */
export function formatLocator(location: SourceLocation | undefined): string {
  if (!location) return "source unknown";
  const parts = [location.documentName];
  if (typeof location.page === "number") parts.push(`page ${location.page}`);
  if (location.section && !/^Page\s+\d+$/i.test(location.section)) parts.push(`"${location.section}"`);
  if (typeof location.charStart === "number") parts.push(`chars ${location.charStart}–${location.charEnd}`);
  return parts.join(", ");
}

/* ----------------------------------------------------------- verification */

export type VerifiableSource = Map<string, string>;

/** Build the `documentId → text` map that verification needs. */
export function sourceIndex(parts: DocumentPart[]): VerifiableSource {
  const index: VerifiableSource = new Map();
  for (const part of parts) index.set(part.documentId, part.text);
  return index;
}

export type VerificationOutcome =
  | { ok: true }
  | { ok: false; reason: "unknown-document" | "out-of-range" | "text-mismatch" };

/**
 * Reproduce a chunk's text from its source document.
 *
 * This is the check that makes a citation meaningful. If the stored document no
 * longer contains the chunk at the recorded offsets, the chunk is not evidence
 * and must not be presented as such.
 */
export function verifyChunk(sources: VerifiableSource, chunk: EvidenceChunk): VerificationOutcome {
  const text = sources.get(chunk.location.documentId);
  if (text === undefined) return { ok: false, reason: "unknown-document" };
  const { charStart, charEnd } = chunk.location;
  if (charStart < 0 || charEnd > text.length || charStart >= charEnd) {
    return { ok: false, reason: "out-of-range" };
  }
  return text.slice(charStart, charEnd) === chunk.text ? { ok: true } : { ok: false, reason: "text-mismatch" };
}

export interface VerificationReport {
  verified: EvidenceChunk[];
  rejected: Array<{ chunk: EvidenceChunk; reason: string }>;
}

/** Partition chunks into verified and rejected, with a reason for each rejection. */
export function verifyChunks(sources: VerifiableSource, chunks: EvidenceChunk[]): VerificationReport {
  const verified: EvidenceChunk[] = [];
  const rejected: Array<{ chunk: EvidenceChunk; reason: string }> = [];
  for (const chunk of chunks) {
    const outcome = verifyChunk(sources, chunk);
    if (outcome.ok) verified.push(chunk);
    else rejected.push({ chunk, reason: outcome.reason });
  }
  return { verified, rejected };
}

/* -------------------------------------------------------------- chunking */

const SENTENCE_SPLIT = /(?<=[.!?])\s+/;

interface Window {
  text: string;
  /** Offset of the window start within the text it was cut from. */
  start: number;
}

/**
 * Cut a text into overlapping windows, preferring sentence boundaries.
 *
 * Offsets are exact: `start` is where the window begins in the input, and the
 * window text is a contiguous slice of the input (whitespace normalisation is
 * applied to the *whole* input first, so the returned offsets index the
 * normalised string the caller must also hold).
 */
export function windows(
  text: string,
  target: number = CHUNK_POLICY.targetChars,
  overlap: number = CHUNK_POLICY.overlapChars,
): Window[] {
  if (text.length <= target) {
    return text.length > 0 ? [{ text, start: 0 }] : [];
  }

  const out: Window[] = [];
  const sentences = text.split(SENTENCE_SPLIT);
  let cursor = 0;
  let bufferStart = 0;
  let buffer = "";

  const flush = () => {
    if (buffer.length === 0) return;
    out.push({ text: buffer, start: bufferStart });
    // The next window repeats the tail of this one, so a sentence split across
    // the boundary is still present in full in at least one chunk. With no
    // overlap requested the carry is empty: carrying the whole buffer would
    // restart every window at the same offset instead of advancing.
    const carry = overlap > 0 && buffer.length > overlap ? buffer.slice(-overlap) : "";
    bufferStart = bufferStart + buffer.length - carry.length;
    buffer = carry;
  };

  for (const sentence of sentences) {
    const piece = cursor === 0 ? sentence : ` ${sentence}`;
    cursor += piece.length;
    buffer += piece;
    if (buffer.length >= target) flush();
  }

  if (buffer.trim().length > 0) {
    // Avoid emitting a tail that is only the overlap of the previous window.
    const isDuplicateTail = out.length > 0 && buffer.length <= overlap;
    if (!isDuplicateTail) out.push({ text: buffer, start: bufferStart });
  }

  return out;
}

/** Normalise a text the way chunking does, so offsets stay valid. */
export function normaliseForChunking(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Normalise a text while recording where each normalised character came from.
 *
 * Chunking works on a whitespace-collapsed copy so windows fall on word
 * boundaries, but a locator has to index the text as it is *stored*, because
 * that is the string a verifier re-slices. Collapsing changes lengths, so the
 * only correct way to translate an offset is to remember the mapping.
 *
 * `map[i]` is the index of normalised character `i` in the original text, and
 * `map[normalised.length]` is the length of the original, so a window
 * `[start, start + length)` maps to `[map[start], map[start + length])`.
 *
 * A run of whitespace collapses to a single space mapped to the *first*
 * whitespace character of the run, and leading/trailing whitespace collapses to
 * nothing at all.
 */
export function normaliseWithMap(text: string): { normalised: string; map: number[] } {
  let normalised = "";
  const map: number[] = [];
  let index = 0;
  let pendingSpaceAt = -1;

  while (index < text.length) {
    const char = text[index];
    if (/\s/.test(char)) {
      if (normalised.length > 0 && pendingSpaceAt < 0) pendingSpaceAt = index;
      index++;
      continue;
    }
    if (pendingSpaceAt >= 0) {
      normalised += " ";
      map.push(pendingSpaceAt);
      pendingSpaceAt = -1;
    }
    normalised += char;
    map.push(index);
    index++;
  }

  map.push(text.length);
  return { normalised, map };
}

/**
 * Chunk one document part into verifiable evidence.
 *
 * Every chunk's text is a literal slice of the part's stored text, and its
 * locator is the pair of offsets that produced that slice. The slice is then
 * re-derived and compared before the chunk is returned, so a chunk that cannot
 * be reproduced from its source never reaches the pipeline.
 */
export function chunkDocumentPart(
  part: DocumentPart,
  options: { targetChars?: number; overlapChars?: number } = {},
): { chunks: EvidenceChunk[]; rejected: Array<{ chunk: EvidenceChunk; reason: string }> } {
  const { normalised, map } = normaliseWithMap(part.text);
  if (normalised.length === 0) return { chunks: [], rejected: [] };

  const source = displayName(part.name);
  const cuts = windows(
    normalised,
    options.targetChars ?? CHUNK_POLICY.targetChars,
    options.overlapChars ?? CHUNK_POLICY.overlapChars,
  );
  const chunks: EvidenceChunk[] = [];

  for (const cut of cuts) {
    if (cut.text.trim().length < CHUNK_POLICY.minChars) continue;
    if (chunks.length >= CHUNK_POLICY.maxChunksPerSource) break;

    const windowEnd = Math.min(cut.start + cut.text.length, normalised.length);
    let body = part.text.slice(map[cut.start], map[windowEnd]);

    // The window boundary can sit on the collapsed space that follows it. Trim
    // the outer whitespace, moving `charStart` with the leading edge: counting
    // the leading whitespace into `charStart` while leaving it in the body would
    // shift `charEnd` past the text and invalidate the chunk.
    const leading = body.length - body.trimStart().length;
    body = body.trim();
    const charStart = map[cut.start] + leading;
    const charEnd = charStart + body.length;

    if (body.length < CHUNK_POLICY.minChars) continue;

    const location: SourceLocation = {
      documentId: part.documentId,
      documentName: part.name,
      page: pageForOffset(part, charStart),
      section: sectionForOffset(part, charStart),
      charStart,
      charEnd,
    };

    chunks.push({
      id: chunkId("document", source, location, body),
      source,
      sourceType: "document",
      text: body,
      location,
    });
  }

  const report = verifyChunks(new Map([[part.documentId, part.text]]), chunks);
  return { chunks: report.verified, rejected: report.rejected };
}

/**
 * Which page an offset falls on, from the extractor's section labels.
 *
 * Returns `null` rather than a guess when the sections do not carry page labels,
 * which is the case for every non-paginated format.
 */
function pageForOffset(part: DocumentPart, offset: number): number | null {
  if (!part.sections || part.sections.length === 0) return null;
  let searchFrom = 0;
  for (const section of part.sections) {
    const label = section.label.trim();
    const isPage = /^Page\s+\d+$/i.test(label);
    const start = section.text.length > 0 ? part.text.indexOf(section.text, searchFrom) : -1;
    if (start >= 0) searchFrom = start;
    if (isPage && start >= 0 && offset >= start) {
      const parsed = Number(/^Page\s+(\d+)$/i.exec(label)?.[1]);
      if (Number.isFinite(parsed)) {
        // Keep the last page whose body starts at or before the offset.
        const next = part.sections[part.sections.indexOf(section) + 1];
        const nextStart =
          next && next.text.length > 0 ? part.text.indexOf(next.text, searchFrom) : -1;
        if (nextStart < 0 || offset < nextStart) return parsed;
      }
    }
  }
  return null;
}

/** Which heading or page label an offset falls under, from the extractor's sections. */
function sectionForOffset(part: DocumentPart, offset: number): string | null {
  if (!part.sections || part.sections.length === 0) return null;
  let label: string | null = null;
  let cursor = 0;
  for (const section of part.sections) {
    const found = section.text.length > 0 ? part.text.indexOf(section.text, cursor) : -1;
    if (found >= 0) cursor = found;
    const start = found >= 0 ? found : cursor;
    if (offset >= start) label = section.label;
    else break;
  }
  return label;
}

/**
 * Chunk a non-document source (knowledge context, canvas, history).
 *
 * These have no stable identity of their own, so their "document id" is the
 * source name and their locators point into the *normalised* context string —
 * returned alongside the chunks so the caller can index it for verification.
 * That is honest: the locator resolves within the run that produced it, and the
 * id is still content-addressed, so two identical runs agree.
 */
export function chunkInlineSource(
  sourceType: Exclude<ChunkSource, "document">,
  source: string,
  text: string,
): { chunks: EvidenceChunk[]; normalisedText: string } {
  const normalised = normaliseForChunking(text);
  if (normalised.length === 0) return { chunks: [], normalisedText: "" };
  const id = `${sourceType}:${source}`;

  const chunks: EvidenceChunk[] = [];
  for (const cut of windows(normalised)) {
    if (cut.text.trim().length < CHUNK_POLICY.minChars) continue;
    if (chunks.length >= CHUNK_POLICY.maxChunksPerSource) break;

    const leading = cut.text.length - cut.text.trimStart().length;
    const body = cut.text.trim();
    const charStart = cut.start + leading;
    const charEnd = charStart + body.length;

    const location: SourceLocation = {
      documentId: id,
      documentName: source,
      page: null,
      section: null,
      charStart,
      charEnd,
    };

    chunks.push({
      id: chunkId(sourceType, source, location, body),
      source,
      sourceType,
      text: body,
      location,
    });
  }

  // Same guarantee as documents: a chunk that does not reproduce from the
  // normalised string the caller receives is not evidence.
  const report = verifyChunks(new Map([[id, normalised]]), chunks);
  return { chunks: report.verified, normalisedText: normalised };
}

/* ------------------------------------------------------------ citations */

export interface CitationMarker {
  /** The literal text, e.g. `[2]` or `[1,3]`. */
  marker: string;
  /** Every reference inside the marker, in order. */
  references: number[];
  /** Offset of the marker in the answer. */
  charStart: number;
}

const CITATION_PATTERN = /\[(\d{1,2}(?:\s*[,-]\s*\d{1,2})*)\]/g;

/** Find `[n]`-style citation markers, including `[1,3]` and `[2-4]` ranges. */
export function extractCitationMarkers(answer: string): CitationMarker[] {
  const markers: CitationMarker[] = [];
  for (const match of answer.matchAll(CITATION_PATTERN)) {
    const references: number[] = [];
    for (const part of match[1].split(/\s*,\s*/)) {
      const range = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(part.trim());
      if (range) {
        const from = Number(range[1]);
        const to = Number(range[2]);
        if (to >= from && to - from <= 20) {
          for (let value = from; value <= to; value++) references.push(value);
          continue;
        }
      }
      const single = Number(part.trim());
      if (Number.isFinite(single)) references.push(single);
    }
    if (references.length === 0) continue;
    markers.push({ marker: match[0], references, charStart: match.index });
  }
  return markers;
}

export interface ResolvedCitation {
  marker: string;
  reference: number;
  chunkId: string;
  source: string;
  location: SourceLocation;
  /** The chunk's retrieval score, or `null` when the chunk was not scored. */
  score: number | null;
  /** True when the cited chunk also cleared the grounding threshold. */
  grounded: boolean;
}

export interface CitationReport {
  markers: CitationMarker[];
  resolved: ResolvedCitation[];
  unresolved: Array<{ marker: string; reference: number; reason: "no-such-evidence" }>;
  /** Claims carrying at least one resolvable citation, over all judged claims. */
  citedClaimRatio: number | null;
  /**
   * Citations that resolve to a real chunk which did not clear the grounding
   * threshold — a citation that looks like support but is not.
   */
  weakCitations: ResolvedCitation[];
}

/**
 * Resolve the answer's `[n]` markers against the evidence list given to the model.
 *
 * `references` outside the list are reported as unresolved rather than dropped.
 * A marker that points at nothing is a defect in the answer, and the report says
 * so instead of rendering an empty footnote.
 */
export function resolveCitations(
  answer: string,
  evidence: Array<{ chunk: EvidenceChunk; score?: number | null }>,
  groundingThreshold = 0.22,
): CitationReport {
  const markers = extractCitationMarkers(answer);
  const resolved: ResolvedCitation[] = [];
  const unresolved: Array<{ marker: string; reference: number; reason: "no-such-evidence" }> = [];

  for (const marker of markers) {
    for (const reference of marker.references) {
      const entry = evidence[reference - 1];
      if (!entry) {
        unresolved.push({ marker: marker.marker, reference, reason: "no-such-evidence" });
        continue;
      }
      const score = entry.score ?? null;
      resolved.push({
        marker: marker.marker,
        reference,
        chunkId: entry.chunk.id,
        source: entry.chunk.source,
        location: entry.chunk.location,
        score,
        grounded: score === null ? true : score >= groundingThreshold,
      });
    }
  }

  const judged = sentencesWithCitations(answer, markers);
  const citedClaimRatio = judged.total === 0 ? null : judged.cited / judged.total;

  return {
    markers,
    resolved,
    unresolved,
    citedClaimRatio,
    weakCitations: resolved.filter((citation) => !citation.grounded),
  };
}

/** Count sentences that carry a citation marker, over all sentences worth judging. */
function sentencesWithCitations(answer: string, markers: CitationMarker[]): { cited: number; total: number } {
  const spans: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const sentence of answer.split(SENTENCE_SPLIT)) {
    const start = answer.indexOf(sentence, cursor);
    const end = start + sentence.length;
    cursor = end;
    if (sentence.trim().length < 25) continue;
    spans.push({ start, end });
  }
  const cited = spans.filter((span) =>
    markers.some((marker) => marker.charStart >= span.start && marker.charStart < span.end),
  ).length;
  return { cited, total: spans.length };
}

/* ------------------------------------------------------------- support */

export interface ClaimEvidence {
  claim: string;
  /** Chunks whose content words overlap the claim, best first. */
  supportingChunkIds: string[];
  /** Share of the claim's content words present in the best supporting chunk. */
  overlap: number;
  /** True when `overlap` cleared the support threshold. */
  supported: boolean;
}

/** Support thresholds, stated once. Policy, not measurement. */
export const SUPPORT_POLICY = {
  /** Minimum content words in a sentence before it can be judged at all. */
  minContentWords: 4,
  /** Overlap at or above which a claim counts as supported. */
  supported: 0.45,
  /** Overlap below which a claim counts as unsupported rather than unjudged. */
  unsupported: 0.25,
  /**
   * A claim that states a number is only supported by a chunk containing that
   * number.
   *
   * Numbers are the tokens most likely to be invented and the least likely to be
   * caught by word overlap: `"reached 900 degrees"` and `"reached 90 degrees"`
   * share every content word. Numeric tokens are excluded from the content-word
   * set (they are too short to be meaningful there), so this is the check that
   * keeps them honest.
   */
  numericTokenRequired: true,
  /** A claim containing more than this many digits is treated as numeric. */
  maxNumericTokens: 8,
} as const;

const WORD = /[a-z0-9]+/g;

/** Content words: lowercase, length > 2, stopword-free. Word-boundary matched. */
function contentWords(text: string): string[] {
  const words: string[] = [];
  for (const match of text.toLowerCase().matchAll(WORD)) {
    const word = match[0];
    if (word.length > 2 && !STOP.has(word)) words.push(word);
  }
  return words;
}

/**
 * Stopwords, duplicated deliberately rather than imported from `scoring.ts`.
 *
 * `scoring.ts` imports *this* module, so importing back would create a cycle.
 * A test asserts the two lists stay identical, which is the part that matters:
 * silently drifting stopword sets would make retrieval and verification
 * disagree about what a content word is.
 */
export const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "than", "so", "for",
  "of", "to", "in", "on", "at", "by", "with", "from", "as", "is", "are",
  "was", "were", "be", "been", "being", "have", "has", "had", "do", "does",
  "did", "will", "would", "can", "could", "should", "may", "might", "must",
  "not", "no", "yes", "this", "that", "these", "those", "it", "its", "i",
  "you", "he", "she", "we", "they", "what", "which", "who", "whom", "how",
  "when", "where", "why", "about", "into", "over", "under", "between",
  "through", "during", "before", "after", "above", "below", "again", "further",
  "once", "here", "there", "all", "any", "both", "each", "few", "more", "most",
  "other", "some", "such", "only", "own", "same", "too", "very", "just", "also",
  "like", "want", "need", "tell", "please", "explain", "know", "get", "make",
  "how", "many", "much", "does", "via", "using", "use",
]);

export { contentWords };

/**
 * Decide, per claim, which chunks support it.
 *
 * Takes only what it needs — an id and the text — so it can be called with
 * grounding chunks, retrieval chunks, or anything else that has both.
 *
 * Matching is on whole words against individual chunks. The previous
 * implementation asked `corpus.toLowerCase().includes(token)`, a substring test
 * over every chunk concatenated: the token `age` was "supported" by the word
 * `manage`, and the answer was attributed to the corpus as a whole rather than
 * to any particular piece of evidence.
 *
 * A claim that states a number takes an extra step: the number must appear in the
 * chunk. Word overlap alone cannot tell `900` from `90`.
 */
export function attributeClaims(
  answer: string,
  chunks: Array<{ id: string; text: string }>,
): ClaimEvidence[] {
  const prepared = chunks.map((chunk) => ({
    id: chunk.id,
    words: new Set(contentWords(chunk.text)),
    haystack: chunk.text.toLowerCase(),
  }));
  const out: ClaimEvidence[] = [];

  for (const sentence of answer.split(SENTENCE_SPLIT)) {
    const claim = sentence.trim();
    if (claim.length < 25 || claim.length > 400) continue;

    // Citation markers are stripped before judging. `[1]` is a pointer to the
    // evidence, not a claim about a quantity: leaving it in would make every
    // cited sentence "numeric" and demand that the literal number 1 appear in
    // the chunk it cites.
    const body = claim.replace(CITATION_PATTERN, " ");
    const words = contentWords(body);
    if (words.length < SUPPORT_POLICY.minContentWords) continue;

    const scored = prepared
      .map((chunk) => {
        let matches = 0;
        for (const word of words) if (chunk.words.has(word)) matches++;
        return { id: chunk.id, matches, overlap: matches / words.length, haystack: chunk.haystack };
      })
      .filter((entry) => entry.matches > 0)
      .sort((a, b) => b.matches - a.matches || (a.id < b.id ? -1 : 1));

    const best = scored[0];
    const overlap = best?.overlap ?? 0;

    let numericOk = true;
    if (SUPPORT_POLICY.numericTokenRequired) {
      const numericTokens = (body.match(/\d[\d.,]*/g) ?? []).slice(0, SUPPORT_POLICY.maxNumericTokens);
      if (numericTokens.length > 0) {
        numericOk = numericTokens.some((token) => best?.haystack.includes(token) ?? false);
      }
    }

    out.push({
      claim,
      supportingChunkIds: scored.slice(0, 3).map((entry) => entry.id),
      overlap: Math.round(overlap * 1000) / 1000,
      supported: overlap >= SUPPORT_POLICY.supported && numericOk,
    });
  }

  return out;
}

/* -------------------------------------------------------------- report */

export interface GroundingReport {
  claims: ClaimEvidence[];
  supportedClaims: string[];
  unsupportedClaims: string[];
  /** Sentences too short or too thin to judge: not counted as either. */
  unjudgedSentences: string[];
  /** `null` when no claim could be judged. Never a fabricated ratio. */
  supportRatio: number | null;
  citations: CitationReport;
  /** Chunks that could not be reproduced from their source text. */
  unverifiable: Array<{ chunkId: string; reason: string }>;
  /**
   * Sources that produced no verified evidence, with the reason. Empty when
   * every supplied source contributed at least one chunk.
   */
  withoutEvidence: Array<{ documentId: string; reason: string }>;
}

/**
 * The single place a grounding judgement is made.
 *
 * `EvaluationNode` and the UI both read this, so the number shown to the user is
 * the number that was computed, with the evidence that produced it attached.
 */
export function evaluateGrounding(
  answer: string,
  chunks: EvidenceChunk[],
  options: { scores?: Map<string, number>; sources?: VerifiableSource; groundingThreshold?: number } = {},
): GroundingReport {
  const claims = attributeClaims(answer, chunks);

  const supportedClaims: string[] = [];
  const unsupportedClaims: string[] = [];
  for (const claim of claims) {
    if (claim.supported) supportedClaims.push(claim.claim);
    else if (claim.overlap < SUPPORT_POLICY.unsupported) unsupportedClaims.push(claim.claim);
  }

  const judged = supportedClaims.length + unsupportedClaims.length;
  const supportRatio = judged === 0 ? null : Math.round((supportedClaims.length / judged) * 1000) / 1000;

  const evidence = chunks.map((chunk) => ({ chunk, score: options.scores?.get(chunk.id) ?? null }));
  const citations = resolveCitations(answer, evidence, options.groundingThreshold ?? 0.22);

  const unverifiable: Array<{ chunkId: string; reason: string }> = [];
  if (options.sources) {
    const report = verifyChunks(options.sources, chunks);
    for (const rejection of report.rejected) {
      unverifiable.push({ chunkId: rejection.chunk.id, reason: rejection.reason });
    }
  }

  const judgedText = new Set([...supportedClaims, ...unsupportedClaims]);
  const unjudgedSentences = answer
    .split(SENTENCE_SPLIT)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0 && !judgedText.has(sentence));

  // Sources that were handed to chunking and contributed nothing. Reported so a
  // reader can see that, say, the attached PDF produced no usable evidence,
  // rather than inferring it from an empty evidence list.
  const contributing = new Set(chunks.map((chunk) => chunk.location.documentId));
  const withoutEvidence = options.sources
    ? [...options.sources.keys()]
        .filter((documentId) => !contributing.has(documentId))
        .map((documentId) => ({ documentId, reason: "no chunk of usable length was produced" }))
    : [];

  return {
    claims,
    supportedClaims,
    unsupportedClaims,
    unjudgedSentences,
    supportRatio,
    citations,
    unverifiable,
    withoutEvidence,
  };
}
