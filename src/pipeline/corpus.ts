/**
 * The one corpus builder.
 *
 * This used to live in `RetrievalNode`, which meant the pipeline could chunk
 * documents but a tool could not without building a second, subtly different
 * corpus. It moved here so the graph and the tool layer retrieve from the same
 * implementation, using the same chunker, the same verifier and the same ids.
 *
 * The input is a narrow structural subset of the graph state, so the pipeline
 * passes its state straight through and a tool passes workspace documents.
 */

import {
  chunkDocumentPart,
  chunkInlineSource,
  type DocumentPart,
  type EvidenceChunk,
  type VerifiableSource,
} from "./grounding";
import { toRetrievedChunk, type RetrievedChunk } from "./scoring";

export interface CorpusInput {
  /** One part per attached file. Preferred: it carries real document boundaries. */
  documentParts?: DocumentPart[];
  /** Joined document text, for sessions persisted before parts existed. */
  documentText?: string;
  knowledgeContext?: string;
  canvasContext?: string;
  /** The most recent assistant message, if there was one. */
  lastAnswer?: string;
}

export interface CorpusBuild {
  /** Every verified candidate, before ranking. */
  corpus: RetrievedChunk[];
  /**
   * `documentId → text` for the strings the locators index. Passed on so the
   * evaluation stage can reproduce each chunk from its source.
   */
  sources: VerifiableSource;
  /** Chunks dropped because they did not reproduce from their source. */
  rejected: Array<{ chunkId: string; reason: string }>;
}

/**
 * Build the retrieval corpus from verified evidence.
 *
 * Three defects this replaces:
 *
 *   1. Document boundaries were recovered by re-parsing `--- name ---`
 *      separators out of the already-joined document text. A document that
 *      itself contained a line like `--- Methods ---` was split into two
 *      documents with the wrong names. The pipeline now carries one part per
 *      file (`state.documentParts`) and never re-parses.
 *   2. Chunk ids were `d-0`, `d-100`, ... — a position in a list. Retrieving a
 *      different set of chunks renamed every chunk. Ids are now content
 *      addressed, so a stored citation still resolves.
 *   3. Chunks were never checked against the text they claimed to come from.
 *      Every chunk here is reproduced from its source before it is returned.
 */
export function buildCorpusFrom(input: CorpusInput): CorpusBuild {
  const corpus: RetrievedChunk[] = [];
  const sources: VerifiableSource = new Map();
  const rejected: Array<{ chunkId: string; reason: string }> = [];
  let position = 0;

  const accept = (chunk: EvidenceChunk) => {
    corpus.push(toRetrievedChunk(chunk, position));
    position++;
  };

  const parts = input.documentParts ?? [];
  for (const part of parts) {
    if (!part.text || part.text.trim().length === 0) continue;
    sources.set(part.documentId, part.text);
    const { chunks, rejected: dropped } = chunkDocumentPart(part);
    for (const chunk of chunks) accept(chunk);
    for (const drop of dropped) rejected.push({ chunkId: drop.chunk.id, reason: drop.reason });
  }

  // A document whose text is present without parts (a session persisted before
  // `documentParts` existed) still contributes, as a single unnamed part. That
  // keeps old sessions working while new ones get real locators.
  if (parts.length === 0 && input.documentText && input.documentText.trim().length > 0) {
    const { chunks } = chunkDocumentPart({
      documentId: "document:joined",
      name: "Attached documents",
      text: input.documentText,
    });
    for (const chunk of chunks) accept(chunk);
  }

  const inline = [
    { type: "knowledge" as const, name: "Knowledge Graph", text: input.knowledgeContext ?? "" },
    { type: "canvas" as const, name: "Research Canvas", text: input.canvasContext ?? "" },
  ];
  for (const source of inline) {
    if (!source.text || source.text.trim().length === 0) continue;
    const { chunks, normalisedText } = chunkInlineSource(source.type, source.name, source.text);
    if (normalisedText.length > 0) sources.set(`${source.type}:${source.name}`, normalisedText);
    for (const chunk of chunks) accept(chunk);
  }

  if (input.lastAnswer && input.lastAnswer.trim().length > 0) {
    const { chunks, normalisedText } = chunkInlineSource("history", "Session History", input.lastAnswer);
    if (normalisedText.length > 0) sources.set("history:Session History", normalisedText);
    for (const chunk of chunks) accept(chunk);
  }

  return { corpus, sources, rejected };
}
