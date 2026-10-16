import type { GraphState } from "../types";
import { log } from "../logger";
import { buildCorpusFrom, type CorpusBuild } from "../../pipeline/corpus";
import { CHUNK_POLICY } from "../../pipeline/grounding";
import {
  groundedSources,
  rerankChunks,
  scoreChunks,
} from "../../pipeline/scoring";

const TOP_K = 8;

export type { CorpusBuild };

/**
 * Shared corpus builder: one part per uploaded file, plus the graph, canvas and
 * previous answer. The implementation lives in `src/pipeline/corpus.ts` so the
 * tool layer retrieves from exactly the same code.
 */
export function buildCorpus(state: GraphState): CorpusBuild {
  const lastAnswer = [...state.conversationHistory].reverse().find((message) => message.role === "assistant");
  return buildCorpusFrom({
    documentParts: state.documentParts ?? [],
    documentText: state.documentText,
    knowledgeContext: state.knowledgeContext,
    canvasContext: state.canvasContext,
    lastAnswer: lastAnswer?.content,
  });
}

/**
 * Retrieval + scoring: chunk the attached documents and the graph/canvas/history
 * context, verify every chunk against its source, score, re-rank, and derive
 * grounded sources. All deterministic, all local.
 */
export async function RetrievalNode(state: GraphState): Promise<Partial<GraphState>> {
  log("NODE", "RetrievalNode: scoring available context against the query");
  const query = state.userPrompt;
  const { corpus, sources, rejected } = buildCorpus(state);

  for (const drop of rejected) {
    log("NODE", `RetrievalNode: dropped unverifiable chunk ${drop.chunkId} (${drop.reason})`);
  }

  if (corpus.length === 0) {
    log("NODE", "RetrievalNode: no retrievable context (no docs, graph, canvas, or history)");
    state.trace.skip("retrieval", { chunks: 0, rejected: rejected.length });
    state.trace.skip("scoring", { chunks: 0 });
    return { retrievedChunks: [], groundedSources: [], evidenceSources: sources };
  }

  log("NODE", `RetrievalNode: candidate corpus = ${corpus.length} verified chunks`);

  state.trace.start("retrieval", "Retrieval");
  state.trace.start("scoring", "Scoring");
  const scored = scoreChunks(query, corpus);
  const retrieved = rerankChunks(scored, TOP_K);
  const grounded = groundedSources(retrieved);
  state.trace.end("scoring", { scored: scored.length, kept: retrieved.length, sources: grounded.length });
  state.trace.end("retrieval", {
    candidates: corpus.length,
    kept: retrieved.length,
    rejected: rejected.length,
    maxChunkChars: CHUNK_POLICY.targetChars,
  });

  log(
    "NODE",
    `RetrievalNode: ${retrieved.length} chunks kept from ${corpus.length} verified candidates; ${grounded.length} grounded sources`,
  );
  return { retrievedChunks: retrieved, groundedSources: grounded, evidenceSources: sources };
}
