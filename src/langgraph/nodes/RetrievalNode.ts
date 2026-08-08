import type { GraphState } from "../types";
import { log } from "../logger";
import { scoreChunks, rerankChunks, groundedSources, type RetrievedChunk } from "../../pipeline/scoring";

const CHUNK_CHARS = 700;
const CHUNK_OVERLAP = 120;
const TOP_K = 8;

/** Split a text into overlapping ~700-char windows at sentence boundaries. */
function splitChunks(idPrefix: string, source: string, sourceType: RetrievedChunk["sourceType"], text: string, positionStart: number): RetrievedChunk[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const out: RetrievedChunk[] = [];
  const sentences = clean.split(/(?<=[.!?])\s+/);
  let pos = positionStart;
  let buffer = "";
  for (const sentence of sentences) {
    buffer += (buffer ? " " : "") + sentence;
    if (buffer.length >= CHUNK_CHARS) {
      out.push({ id: `${idPrefix}-${pos}`, source, sourceType, text: buffer, position: pos++ });
      buffer = buffer.slice(-CHUNK_OVERLAP);
    }
  }
  if (buffer.trim().length > 100) {
    out.push({ id: `${idPrefix}-${pos}`, source, sourceType, text: buffer, position: pos });
  }
  return out;
}

/** Split the joined document text (multiple docs separated by `--- Name ---`) into per-doc fchunks. */
function splitDocText(docText: string): RetrievedChunk[] {
  const parts = docText.split(/^---\s+(.+?)\s+---$/m);
  const names = parts.filter((_, i) => i % 2 === 1);
  const bodies = parts.filter((_, i) => i % 2 === 0).slice(1);
  const chunks: RetrievedChunk[] = [];
  let pos = 0;
  names.forEach((name, i) => {
    const body = bodies[i] || "";
    const source = name.replace(/\.[^.]+$/, "") || name || "Document";
    const sub = splitChunks("d", source, "document", body, pos);
    chunks.push(...sub);
    pos += 100;
  });
  return chunks;
}

export function buildCorpus(state: GraphState): RetrievedChunk[] {
  const corpus: RetrievedChunk[] = [];
  let position = 0;

  if (state.documentText && state.documentText.trim()) {
    corpus.push(...splitDocText(state.documentText));
  }
  if (state.knowledgeContext && state.knowledgeContext.trim()) {
    corpus.push(...splitChunks("k", "Knowledge Graph", "knowledge", state.knowledgeContext, position));
  }
  if (state.canvasContext && state.canvasContext.trim()) {
    corpus.push(...splitChunks("c", "Research Canvas", "canvas", state.canvasContext, position));
  }
  const lastAnswer = [...state.conversationHistory].reverse().find((m) => m.role === "assistant");
  if (lastAnswer && lastAnswer.content.trim()) {
    corpus.push(...splitChunks("h", "Session History", "history", lastAnswer.content, position));
  }

  return corpus.filter((c) => c.text.trim().length > 100);
}

/**
 * Retrieval + scoring: build a corpus from doc/graph/canvas/history context,
 * score every chunk, re-rank, and derive grounded sources. All deterministic.
 */
export async function RetrievalNode(state: GraphState): Promise<Partial<GraphState>> {
  log("NODE", "RetrievalNode: scoring available context against the query");
  const query = state.userPrompt;
  const corpus = buildCorpus(state);

  if (corpus.length === 0) {
    log("NODE", "RetrievalNode: no retrievable context (no docs, graph, canvas, or history)");
    state.trace.skip("retrieval", { chunks: 0 });
    state.trace.skip("scoring", { chunks: 0 });
    return { retrievedChunks: [], groundedSources: [] };
  }

  log("NODE", `RetrievalNode: candidate corpus = ${corpus.length} chunks`);

  state.trace.start("retrieval", "Retrieval");
  state.trace.start("scoring", "Scoring");
  const scored = scoreChunks(query, corpus);
  const retrieved = rerankChunks(scored, TOP_K);
  const grounded = groundedSources(retrieved);
  state.trace.end("scoring", { scored: scored.length, kept: retrieved.length, sources: grounded.length });
  state.trace.end("retrieval", { candidates: corpus.length, kept: retrieved.length });

  log("NODE", `RetrievalNode: ${retrieved.length} chunks kept from ${corpus.length} candidates; ${grounded.length} grounded sources`);
  return { retrievedChunks: retrieved, groundedSources: grounded };
}