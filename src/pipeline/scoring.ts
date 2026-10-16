/**
 * Local retrieval scoring, re-ranking, faithfulness, confidence and
 * hallucination detection.
 *
 * Everything here is deterministic lexical analysis — no extra model calls —
 * so every pipeline run gets groundedness metrics automatically, whether or
 * not an LLM-backed backend is present.
 *
 * ## Two honesty fixes
 *
 * **Faithfulness is attributed per chunk.** The previous implementation tested
 * each claim token with `corpus.toLowerCase().includes(token)`, a substring
 * match over every chunk concatenated. The token `age` counted as supported by
 * the word `manage`, and a supported claim could not say *which* evidence
 * supported it. Claims are now matched on whole words against individual chunks,
 * and the supporting chunk ids are returned.
 *
 * **Confidence is measured, or it is absent.** The previous implementation mixed
 * four components and, whenever a component could not be measured, substituted a
 * constant: `0.35` or `0.55` for retrieval, `0.4` or `0.55` for faithfulness.
 * Those constants then became part of a number shown to the user as a
 * confidence score. Now each component is either measured — with the value and
 * the basis recorded — or `null` with a reason, and the score is the weighted
 * mean over the components that were actually measured. When none can be
 * measured the score is `null` and the UI shows nothing rather than a fiction.
 */

import {
  STOP,
  SUPPORT_POLICY,
  attributeClaims,
  contentWords,
  type EvidenceChunk,
  type GroundingReport,
  type SourceLocation,
} from "./grounding";

export interface RetrievedChunk {
  id: string;
  source: string;
  sourceType: "document" | "knowledge" | "history" | "canvas" | "web";
  text: string;
  /**
   * Ordinal position in the candidate corpus, used only for the position prior
   * in `scoreChunks`. This is **not** a locator: it says nothing about where in
   * a document the text came from. See `location` for that.
   */
  position: number;
  /**
   * Where the text actually came from, when the chunk was produced by
   * `src/pipeline/grounding.ts`. Optional because sessions persisted before
   * locators existed are still readable.
   */
  location?: SourceLocation;
}

export interface ScoredChunk extends RetrievedChunk {
  score: number;
  relevance: number;
  coverage: number;
  sourceQuality: number;
  recency: number;
  positionBias: number;
}

export interface FaithfulnessResult {
  /** `null` when no claim could be judged. Never a substituted constant. */
  score: number | null;
  supportedClaims: string[];
  unsupportedClaims: string[];
  /** Supported over judged. `0` when nothing was judged — read `score` for that. */
  supportRatio: number;
  /** Sentences too thin to judge, so the reader can see the denominator. */
  unjudgedSentences?: string[];
  /** Per-claim attribution: which chunk ids support which sentence. */
  claims?: Array<{ claim: string; supportingChunkIds: string[]; overlap: number; supported: boolean }>;
}

export interface HallucinationResult {
  present: boolean;
  flaggedClaims: string[];
  unsupportedRatio: number;
}

export interface ConfidenceComponent {
  name: "retrieval" | "faithfulness" | "answerQuality" | "stability";
  /** `null` means not measured. */
  value: number | null;
  /** Policy weight, used only when `value` is present. */
  weight: number;
  /** What produced the value. */
  basis: string;
  /** Why the value is absent, when it is. */
  reason: string | null;
}

export interface ConfidenceBreakdown {
  retrieval: number | null;
  faithfulness: number | null;
  completeness: number | null;
  stability: number | null;
}

export interface ConfidenceResult {
  /** 0..100, or `null` when no component could be measured. */
  score: number | null;
  breakdown: ConfidenceBreakdown;
  /** One entry per component, in weight order, measured or not. */
  components: ConfidenceComponent[];
  /** Sum of the weights of the measured components. `score` is `null` iff this is 0. */
  measuredWeight: number;
}

/**
 * Weights and mappings for the confidence score.
 *
 * These are policy, not measurement: they say how much each measured signal is
 * allowed to matter and how a raw value maps onto 0..1. They are stated once and
 * shown next to the number they produce.
 */
export const CONFIDENCE_POLICY = {
  weights: { retrieval: 0.35, faithfulness: 0.3, answerQuality: 0.25, stability: 0.1 },
  /** Mean retrieval score is scaled by this before clamping to 0..1. */
  retrievalScale: 1.4,
  /** Answer length, in words, at which the length term saturates. */
  answerLengthSaturation: 280,
  /** Weight of the length term versus the quality-heuristic term, when both exist. */
  lengthWeight: 0.6,
  qualityWeight: 0.4,
  /** Each retry reduces the stability term by this much. */
  retryPenalty: 0.2,
  stabilityFloor: 0.5,
  /** Display clamp, so a measured score never reads as 0 or as certainty. */
  displayFloor: 5,
  displayCeiling: 98,
} as const;

export { STOP };

/** Content words: lowercase, longer than two characters, stopword-free. */
export function tokenize(text: string): string[] {
  return contentWords(text || "");
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function queryTerms(query: string): string[] {
  return tokenize(query).slice(0, 16);
}

/* ---------------------------------------------- evidence ↔ scored chunk */

/** Convert a grounding chunk into the retrieval layer's shape. */
export function toRetrievedChunk(chunk: EvidenceChunk, position: number): RetrievedChunk {
  return {
    id: chunk.id,
    source: chunk.source,
    sourceType: chunk.sourceType,
    text: chunk.text,
    position,
    location: chunk.location,
  };
}

/** Recover grounding chunks from persisted scored chunks that carry a locator. */
export function toEvidenceChunks(chunks: RetrievedChunk[]): EvidenceChunk[] {
  const out: EvidenceChunk[] = [];
  for (const chunk of chunks) {
    if (!chunk.location) continue;
    out.push({
      id: chunk.id,
      source: chunk.source,
      sourceType: chunk.sourceType,
      text: chunk.text,
      location: chunk.location,
    });
  }
  return out;
}

/* --------------------------------------------------------------- scoring */

function buildCorpusIdf(chunks: RetrievedChunk[], terms: Set<string>): Map<string, number> {
  const df = new Map<string, number>();
  const total = Math.max(chunks.length, 1);
  for (const chunk of chunks) {
    const present = new Set(tokenize(chunk.text));
    for (const term of present) {
      if (!terms.has(term)) continue;
      df.set(term, (df.get(term) || 0) + 1);
    }
  }
  const idf = new Map<string, number>();
  for (const term of terms) {
    const docs = df.get(term) || 0;
    idf.set(term, Math.log(1 + (total - docs + 0.5) / (docs + 0.5)) + 1);
  }
  return idf;
}

/**
 * Source-quality prior.
 *
 * A stated policy about *kinds of source*, not a measurement of this chunk's
 * content: a file the user attached outranks a note the graph assembled, and a
 * `.edu` host is treated as more reliable than a wiki mirror. Exposed so the UI
 * and tests can explain a ranking rather than assert it.
 */
export function computeSourceQuality(source: string, sourceType: RetrievedChunk["sourceType"]): number {
  const lower = source.toLowerCase();

  // Community-edited and answer-farm hosts are demoted first: a check placed
  // after the TLD bonuses would never fire for `wikipedia.org`, because the
  // `.org` rule would have matched already.
  if (/wikipedia|fandom|answers\.com|quora|reddit/.test(lower)) {
    return 0.6;
  }

  let base: number;
  if (sourceType === "document") base = 0.9;
  // A fetched page is external evidence, so it sits just below an attached
  // document and above a note the app assembled itself.
  else if (sourceType === "web") base = 0.85;
  else if (sourceType === "knowledge") base = 0.72;
  else if (sourceType === "canvas") base = 0.6;
  else base = 0.55; // history

  if (/\.(gov|mil)($|\.)/.test(lower) || /\.edu($|\.)/.test(lower)) base += 0.08;
  else if (/\.(org|ac\.)/.test(lower)) base += 0.03;

  return Math.min(1, base);
}

export function scoreChunks(query: string, chunks: RetrievedChunk[]): ScoredChunk[] {
  if (chunks.length === 0) return [];
  const terms = queryTerms(query);
  if (terms.length === 0) {
    return chunks.map((c) => ({
      ...c,
      score: 0,
      relevance: 0,
      coverage: 0,
      sourceQuality: computeSourceQuality(c.source, c.sourceType),
      recency: 0.5,
      positionBias: 0.5,
    }));
  }

  const idf = buildCorpusIdf(chunks, new Set(terms));
  let maxRelevance = 0.0001;

  const scored: ScoredChunk[] = chunks.map((chunk) => {
    const counts = new Map<string, number>();
    const words = tokenize(chunk.text);
    for (const word of words) {
      if (!terms.includes(word)) continue;
      counts.set(word, (counts.get(word) || 0) + 1);
    }
    let relevance = 0;
    for (const term of terms) {
      const tf = counts.get(term) || 0;
      if (tf > 0) relevance += (1 + Math.log(tf)) * (idf.get(term) || 1);
    }
    relevance = relevance / Math.max(words.length, 1);
    const coverage = counts.size / terms.length;
    maxRelevance = Math.max(maxRelevance, relevance);
    const sourceQuality = computeSourceQuality(chunk.source, chunk.sourceType);
    const recency = sourceQuality >= 0.8 ? 0.9 : sourceQuality >= 0.65 ? 0.6 : 0.4;
    const positionBias = 1 - (chunk.position / Math.max(chunks.length, 1)) * 0.3;
    return { ...chunk, relevance, coverage, sourceQuality, recency, positionBias, score: 0 };
  });

  return scored.map((c) => ({
    ...c,
    score: Math.min(
      1,
      0.55 * (c.relevance / maxRelevance) +
        0.25 * c.coverage +
        0.1 * c.sourceQuality +
        0.05 * c.positionBias +
        0.05 * c.recency,
    ),
  }));
}

export function rerankChunks(scored: ScoredChunk[], topK = 8): ScoredChunk[] {
  return [...scored].sort((a, b) => b.score - a.score).slice(0, topK);
}

/** Score below which a chunk is not treated as grounding a source. */
export const GROUNDING_THRESHOLD = 0.22;

export interface GroundedSource {
  name: string;
  type: RetrievedChunk["sourceType"];
  chunkCount: number;
  bestScore: number;
  averageScore: number;
  /**
   * The chunks that produced this source's grounding, so the claim is
   * checkable. Optional so sessions persisted before locators existed stay
   * readable.
   */
  chunkIds?: string[];
  /** Page numbers the grounded chunks sit on, ascending and de-duplicated. */
  pages?: number[];
  /** One locator per grounded chunk, in the same order as `chunkIds`. */
  locators?: SourceLocation[];
}

export function groundedSources(scored: ScoredChunk[], threshold = GROUNDING_THRESHOLD): GroundedSource[] {
  const bySource = new Map<string, ScoredChunk[]>();
  for (const chunk of scored) {
    if (chunk.score < threshold) continue;
    const list = bySource.get(chunk.source) || [];
    list.push(chunk);
    bySource.set(chunk.source, list);
  }

  const out: GroundedSource[] = [];
  for (const [name, chunks] of bySource) {
    const pages = [
      ...new Set(
        chunks
          .map((chunk) => chunk.location?.page)
          .filter((page): page is number => typeof page === "number"),
      ),
    ].sort((a, b) => a - b);

    out.push({
      name,
      type: chunks[0].sourceType,
      chunkCount: chunks.length,
      bestScore: Math.max(...chunks.map((c) => c.score)),
      averageScore: chunks.reduce((a, c) => a + c.score, 0) / chunks.length,
      chunkIds: chunks.map((chunk) => chunk.id),
      pages,
      locators: chunks.map((chunk) => chunk.location).filter((l): l is SourceLocation => Boolean(l)),
    });
  }

  return out.sort((a, b) => b.bestScore - a.bestScore);
}

/* ---------------------------------------------------------- faithfulness */

const NUMERIC = /\d/;
const CAPITALIZED_WORD = /[A-Z][a-z]{2,}/;

/**
 * Turn a grounding report into the faithfulness summary the UI and telemetry use.
 *
 * `score` is `null` when nothing could be judged. The old implementation returned
 * `null` in that case too, but its caller immediately replaced it with a
 * constant; now the absence propagates.
 */
export function faithfulnessFromReport(report: GroundingReport): FaithfulnessResult {
  const judged = report.supportedClaims.length + report.unsupportedClaims.length;
  const supportRatio = judged === 0 ? 0 : report.supportedClaims.length / judged;

  return {
    score: report.supportRatio === null ? null : Math.round(supportRatio * 1000) / 1000,
    supportedClaims: report.supportedClaims,
    unsupportedClaims: report.unsupportedClaims,
    supportRatio,
    unjudgedSentences: report.unjudgedSentences,
    claims: report.claims.map((claim) => ({
      claim: claim.claim,
      supportingChunkIds: claim.supportingChunkIds,
      overlap: claim.overlap,
      supported: claim.supported,
    })),
  };
}

/**
 * Judge how much of the answer the retrieved evidence supports.
 *
 * Convenience wrapper for callers that have chunks but no report. The decision
 * itself is made once, in `grounding.evaluateGrounding`, which matches whole
 * words against individual chunks and reports which chunk ids carried each
 * match.
 */
export function computeFaithfulness(answer: string, chunks: RetrievedChunk[]): FaithfulnessResult {
  if (chunks.length === 0 || !answer.trim()) {
    return {
      score: null,
      supportedClaims: [],
      unsupportedClaims: [],
      supportRatio: 0,
      unjudgedSentences: [],
      claims: [],
    };
  }
  // Matching needs only the text. Going through `evaluateGrounding` would drop
  // any chunk without a locator — including every chunk from a session persisted
  // before locators existed — and a chunk whose whereabouts are unknown is still
  // evidence for whether the answer repeats it.
  return faithfulnessFromReport(summariseClaims(answer, attributeClaims(answer, chunks)));
}

/** Assemble the report shape `faithfulnessFromReport` reads, without citations. */
function summariseClaims(
  answer: string,
  claims: ReturnType<typeof attributeClaims>,
): GroundingReport {
  const supportedClaims: string[] = [];
  const unsupportedClaims: string[] = [];
  for (const claim of claims) {
    if (claim.supported) supportedClaims.push(claim.claim);
    else if (claim.overlap < SUPPORT_POLICY.unsupported) unsupportedClaims.push(claim.claim);
  }
  const judged = new Set([...supportedClaims, ...unsupportedClaims]);
  return {
    claims,
    supportedClaims,
    unsupportedClaims,
    unjudgedSentences: answer
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0 && !judged.has(sentence)),
    supportRatio:
      supportedClaims.length + unsupportedClaims.length === 0
        ? null
        : Math.round((supportedClaims.length / (supportedClaims.length + unsupportedClaims.length)) * 1000) / 1000,
    citations: {
      markers: [],
      resolved: [],
      unresolved: [],
      citedClaimRatio: null,
      weakCitations: [],
    },
    unverifiable: [],
    withoutEvidence: [],
  };
}

/**
 * `attributeClaims` and `SUPPORT_POLICY` come from `grounding.ts`, which owns the
 * attribution policy: which words count, how much overlap counts as support, and
 * which chunk carried the match. `grounding.ts` does not import this module, so
 * the dependency runs one way.
 */

export function detectHallucination(
  answer: string,
  chunks: RetrievedChunk[],
  faithfulness: FaithfulnessResult,
): HallucinationResult {
  if (!chunks.length || faithfulness.score === null) {
    return { present: false, flaggedClaims: [], unsupportedRatio: 0 };
  }

  const flaggedClaims = faithfulness.unsupportedClaims.filter((claim) => {
    const numbers = claim.match(/\d+/g);
    const hasNumberClaim = NUMERIC.test(claim) && (numbers?.length ?? 0) >= 2;
    const hasNamedClaim =
      CAPITALIZED_WORD.test(claim) &&
      !/^(The|In|An|A|It|This|For|By|We|They|He|She|I|You)$/.test(claim.trim().split(/\s+/)[0] || "");
    return hasNumberClaim || hasNamedClaim;
  });

  const unsupportedRatio = 1 - faithfulness.supportRatio;

  return {
    present: flaggedClaims.length > 0 && unsupportedRatio >= 0.25,
    flaggedClaims: flaggedClaims.slice(0, 5),
    unsupportedRatio,
  };
}

/* ------------------------------------------------------------ confidence */

export interface ConfidenceOptions {
  qualityScores?: Record<string, number>;
  retryCount?: number;
  /** Retained for callers that still pass it; no longer substitutes a value. */
  hadDocuments?: boolean;
}

/**
 * Combine the measurable signals into one confidence score.
 *
 * Each component below reports either a value with its basis, or `null` with a
 * reason. The score is the policy-weighted mean of the measured components only,
 * renormalised by their total weight. With nothing measured, the score is `null`.
 */
export function computeConfidence(
  _query: string,
  scored: ScoredChunk[],
  answer: string,
  faithfulness: FaithfulnessResult,
  opts: ConfidenceOptions = {},
): ConfidenceResult {
  const components: ConfidenceComponent[] = [];

  // --- retrieval ---------------------------------------------------------
  const top = scored.slice(0, 5).map((chunk) => chunk.score);
  if (top.length > 0) {
    const mean = top.reduce((a, b) => a + b, 0) / top.length;
    components.push({
      name: "retrieval",
      value: Math.min(1, mean * CONFIDENCE_POLICY.retrievalScale),
      weight: CONFIDENCE_POLICY.weights.retrieval,
      basis: `mean score of the top ${top.length} retrieved chunk(s), scaled by ${CONFIDENCE_POLICY.retrievalScale}`,
      reason: null,
    });
  } else {
    components.push({
      name: "retrieval",
      value: null,
      weight: CONFIDENCE_POLICY.weights.retrieval,
      basis: "top retrieved chunk scores",
      reason: opts.hadDocuments
        ? "documents were attached but no chunk cleared retrieval"
        : "no evidence was retrieved for this run",
    });
  }

  // --- faithfulness -----------------------------------------------------
  if (faithfulness.score !== null) {
    components.push({
      name: "faithfulness",
      value: faithfulness.score,
      weight: CONFIDENCE_POLICY.weights.faithfulness,
      basis: `supported ${faithfulness.supportedClaims.length} of ${faithfulness.supportedClaims.length + faithfulness.unsupportedClaims.length} judged claim(s)`,
      reason: null,
    });
  } else {
    components.push({
      name: "faithfulness",
      value: null,
      weight: CONFIDENCE_POLICY.weights.faithfulness,
      basis: "claim-by-claim comparison against retrieved evidence",
      reason: "no claim in the answer could be matched against evidence",
    });
  }

  // --- answer quality ---------------------------------------------------
  const words = (answer || "").split(/\s+/).filter(Boolean).length;
  const lengthTerm = Math.min(1, words / CONFIDENCE_POLICY.answerLengthSaturation);
  const qualityValues = Object.values(opts.qualityScores ?? {});
  const qualityTerm = qualityValues.length > 0
    ? qualityValues.reduce((a, b) => a + b, 0) / qualityValues.length
    : null;

  if (words > 0) {
    const value = qualityTerm === null
      ? lengthTerm
      : lengthTerm * CONFIDENCE_POLICY.lengthWeight + qualityTerm * CONFIDENCE_POLICY.qualityWeight;
    components.push({
      name: "answerQuality",
      value: Math.min(1, value),
      weight: CONFIDENCE_POLICY.weights.answerQuality,
      basis: qualityTerm === null
        ? `answer length only: ${words} word(s), saturating at ${CONFIDENCE_POLICY.answerLengthSaturation}`
        : `${words} word(s) and the mean of ${qualityValues.length} quality heuristic(s)`,
      reason: null,
    });
  } else {
    components.push({
      name: "answerQuality",
      value: null,
      weight: CONFIDENCE_POLICY.weights.answerQuality,
      basis: "answer length and quality heuristics",
      reason: "the answer is empty",
    });
  }

  // --- stability --------------------------------------------------------
  // Derived entirely from the observed retry count under a stated curve.
  const retries = Math.max(0, opts.retryCount ?? 0);
  components.push({
    name: "stability",
    value: words > 0
      ? Math.max(CONFIDENCE_POLICY.stabilityFloor, 1 - retries * CONFIDENCE_POLICY.retryPenalty)
      : null,
    weight: CONFIDENCE_POLICY.weights.stability,
    basis: `${retries} generation attempt(s) beyond the first`,
    reason: words > 0 ? null : "no generation completed",
  });

  const measured = components.filter((component) => component.value !== null);
  const measuredWeight = measured.reduce((sum, component) => sum + component.weight, 0);

  const breakdown: ConfidenceBreakdown = {
    retrieval: components.find((c) => c.name === "retrieval")?.value ?? null,
    faithfulness: components.find((c) => c.name === "faithfulness")?.value ?? null,
    completeness: components.find((c) => c.name === "answerQuality")?.value ?? null,
    stability: components.find((c) => c.name === "stability")?.value ?? null,
  };

  if (measuredWeight === 0) {
    return { score: null, breakdown, components, measuredWeight: 0 };
  }

  const weighted = measured.reduce((sum, component) => sum + component.weight * (component.value ?? 0), 0) / measuredWeight;
  const score = Math.round(
    Math.max(CONFIDENCE_POLICY.displayFloor, Math.min(CONFIDENCE_POLICY.displayCeiling, weighted * 100)),
  );

  return { score, breakdown, components, measuredWeight };
}

export function confidenceLabel(score: number): "High" | "Medium" | "Low" {
  if (score >= 75) return "High";
  if (score >= 50) return "Medium";
  return "Low";
}

/**
 * Label a confidence result that may be absent.
 *
 * A run with nothing measurable has no band, and saying "Low" would be a claim
 * about the answer that the run did not establish.
 */
export function confidenceLabelOrNull(score: number | null | undefined): "High" | "Medium" | "Low" | null {
  return typeof score === "number" && Number.isFinite(score) ? confidenceLabel(score) : null;
}
