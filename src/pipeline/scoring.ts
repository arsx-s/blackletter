/**
 * Local retrieval scoring, re-ranking, faithfulness, confidence and
 * hallucination detection.
 *
 * Everything here is deterministic lexical analysis — no extra model calls —
 * so every pipeline run gets groundedness metrics automatically, whether or
 * not an LLM-backed backend is present.
 */

export interface RetrievedChunk {
  id: string;
  source: string;
  sourceType: "document" | "knowledge" | "history" | "canvas";
  text: string;
  position: number;
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
  score: number | null;
  supportedClaims: string[];
  unsupportedClaims: string[];
  supportRatio: number;
}

export interface HallucinationResult {
  present: boolean;
  flaggedClaims: string[];
  unsupportedRatio: number;
}

export interface ConfidenceBreakdown {
  retrieval: number;
  faithfulness: number;
  completeness: number;
  stability: number;
}

export interface ConfidenceResult {
  score: number; // 0..100
  breakdown: ConfidenceBreakdown;
}

const STOPWORDS = new Set([
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

export function tokenize(text: string): string[] {
  const tokens = (text || "").toLowerCase().split(/[^a-z0-9]+/);
  return tokens.filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function queryTerms(query: string): string[] {
  const tokens = tokenize(query);
  return tokens.slice(0, 16);
}

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

function computeSourceQuality(source: string, sourceType: RetrievedChunk["sourceType"]): number {
  const lower = source.toLowerCase();
  let base = 0.5;
  if (sourceType === "document") base = 0.9;
  else if (sourceType === "knowledge") base = 0.72;
  else if (sourceType === "canvas") base = 0.6;
  else base = 0.55; // history

  if (/\.(gov|mil)($|\.)/.test(lower) || /\.edu($|\.)/.test(lower)) base += 0.08;
  else if (/\.(org|ac\.)/.test(lower)) base += 0.03;
  else if (/wikipedia|fandom|answers\.com/.test(lower)) base = 0.6;

  return Math.min(1, base);
}

export function scoreChunks(query: string, chunks: RetrievedChunk[]): ScoredChunk[] {
  if (chunks.length === 0) return [];
  const terms = queryTerms(query);
  if (terms.length === 0) return chunks.map((c) => ({ ...c, score: 0, relevance: 0, coverage: 0, sourceQuality: computeSourceQuality(c.source, c.sourceType), recency: 0.5, positionBias: 0.5 }));

  const idf = buildCorpusIdf(chunks, new Set(terms));
  let maxRelevance = 0.0001;

  const scored: ScoredChunk[] = chunks.map((chunk) => {
    const counts = new Map<string, number>();
    let total = 0;
    for (const t of tokenize(chunk.text)) {
      if (!terms.includes(t)) continue;
      counts.set(t, (counts.get(t) || 0) + 1);
      total++;
    }
    let relevance = 0;
    for (const t of terms) {
      const tf = counts.get(t) || 0;
      if (tf > 0) relevance += (1 + Math.log(tf)) * (idf.get(t) || 1);
    }
    const chunkLen = Math.max(tokenize(chunk.text).length, 1);
    relevance = relevance / chunkLen;
    const coverage = counts.size / terms.length;
    maxRelevance = Math.max(maxRelevance, relevance);
    const sourceQuality = computeSourceQuality(chunk.source, chunk.sourceType);
    const recency = sourceQuality >= 0.8 ? 0.9 : sourceQuality >= 0.65 ? 0.6 : 0.4;
    const positionBias = 1 - (chunk.position / Math.max(chunks.length, 1)) * 0.3;
    return { ...chunk, relevance, coverage, sourceQuality, recency, positionBias, score: 0 };
  });

  return scored.map((c) => ({
    ...c,
    score: Math.min(1, 0.55 * (c.relevance / maxRelevance) + 0.25 * c.coverage + 0.1 * c.sourceQuality + 0.05 * c.positionBias + 0.05 * c.recency),
  }));
}

export function rerankChunks(scored: ScoredChunk[], topK = 8): ScoredChunk[] {
  return [...scored].sort((a, b) => b.score - a.score).slice(0, topK);
}

export interface GroundedSource {
  name: string;
  type: RetrievedChunk["sourceType"];
  chunkCount: number;
  bestScore: number;
  averageScore: number;
}

export function groundedSources(scored: ScoredChunk[], threshold = 0.22): GroundedSource[] {
  const bySource = new Map<string, ScoredChunk[]>();
  for (const chunk of scored) {
    if (chunk.score < threshold) continue;
    const list = bySource.get(chunk.source) || [];
    list.push(chunk);
    bySource.set(chunk.source, list);
  }
  const out: GroundedSource[] = [];
  for (const [name, chunks] of bySource) {
    out.push({
      name,
      type: chunks[0].sourceType,
      chunkCount: chunks.length,
      bestScore: Math.max(...chunks.map((c) => c.score)),
      averageScore: chunks.reduce((a, c) => a + c.score, 0) / chunks.length,
    });
  }
  return out.sort((a, b) => b.bestScore - a.bestScore);
}

const NUMERIC = /\d/;
const CAPITALIZED_WORD = /[A-Z][a-z]{2,}/;

function claimTokens(claim: string): string[] {
  return tokenize(claim);
}

export function computeFaithfulness(answer: string, chunks: RetrievedChunk[]): FaithfulnessResult {
  const corpus = chunks.map((c) => c.text).join("\n");
  if (!corpus.trim() || !answer.trim()) {
    return { score: null, supportedClaims: [], unsupportedClaims: [], supportRatio: 0 };
  }

  const sentences = answer
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25 && s.length < 400);

  const supportedClaims: string[] = [];
  const unsupportedClaims: string[] = [];

  for (const sentence of sentences) {
    const tokens = claimTokens(sentence);
    if (tokens.length < 4) continue;
    const inCorpus = tokens.filter((t) => corpus.toLowerCase().includes(t)).length;
    const ratio = inCorpus / tokens.length;
    const hasNumbers = NUMERIC.test(sentence);
    if (ratio >= 0.45 && (!hasNumbers || inCorpus >= 2)) {
      supportedClaims.push(sentence);
    } else if (ratio < 0.25) {
      unsupportedClaims.push(sentence);
    }
  }

  const total = supportedClaims.length + unsupportedClaims.length;
  const supportRatio = total === 0 ? 0 : supportedClaims.length / total;
  const score = total === 0 ? null : Math.round(supportRatio * 1000) / 1000;

  return { score, supportedClaims, unsupportedClaims, supportRatio };
}

export function detectHallucination(
  answer: string,
  chunks: RetrievedChunk[],
  faithfulness: FaithfulnessResult,
): HallucinationResult {
  if (!chunks.length || faithfulness.score === null) {
    return { present: false, flaggedClaims: [], unsupportedRatio: 0 };
  }

  const flaggedClaims = faithfulness.unsupportedClaims.filter((claim) => {
    const hasNumberClaim = NUMERIC.test(claim) && claim.match(/\d+/g)!.length >= 2;
    const hasNamedClaim = CAPITALIZED_WORD.test(claim) && !/^(The|In|An|A|It|This|For|By|We|They|He|She|I|You)$/.test(claim.trim().split(/\s+/)[0] || "");
    return hasNumberClaim || hasNamedClaim;
  });

  const unsupportedRatio = 1 - faithfulness.supportRatio;

  return {
    present: flaggedClaims.length > 0 && unsupportedRatio >= 0.25,
    flaggedClaims: flaggedClaims.slice(0, 5),
    unsupportedRatio,
  };
}

export function computeConfidence(
  query: string,
  scored: ScoredChunk[],
  answer: string,
  faithfulness: FaithfulnessResult,
  opts: { qualityScores?: Record<string, number>; retryCount?: number; hadDocuments?: boolean } = {},
): ConfidenceResult {
  const hasChunks = scored.length > 0;

  const topScores = scored.slice(0, 5).map((c) => c.score);
  const retrievalRaw = topScores.length ? topScores.reduce((a, b) => a + b, 0) / topScores.length : 0;
  const retrieval = hasChunks ? Math.min(1, retrievalRaw * 1.4) : opts.hadDocuments ? 0.35 : 0.55;

  const faithfulnessScore = faithfulness.score !== null ? faithfulness.score : hasChunks ? 0.4 : 0.55;

  const words = (answer || "").split(/\s+/).filter(Boolean).length;
  const completenessBase = Math.min(1, words / 280);
  const quality = opts.qualityScores || {};
  const qualityScore = Object.keys(quality).length
    ? Object.values(quality).reduce((a, b) => a + b, 0) / Object.keys(quality).length
    : 0.6;
  const completeness = Math.min(1, completenessBase * 0.6 + qualityScore * 0.4);

  const stability = Math.max(0.5, 0.95 - (opts.retryCount || 0) * 0.2);

  const score = Math.round(
    Math.max(5, Math.min(98, 100 * (0.35 * retrieval + 0.3 * faithfulnessScore + 0.25 * completeness + 0.1 * stability))),
  );

  return { score, breakdown: { retrieval, faithfulness: faithfulnessScore, completeness, stability } };
}

export function confidenceLabel(score: number): "High" | "Medium" | "Low" {
  if (score >= 75) return "High";
  if (score >= 50) return "Medium";
  return "Low";
}
