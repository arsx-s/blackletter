import { describe, expect, it } from "vitest";
import { buildCorpus, RetrievalNode } from "../../langgraph/nodes/RetrievalNode";
import { createInitialState } from "../../langgraph/state";
import type { GraphState } from "../../langgraph/types";
import type { DocumentPart } from "../../pipeline/grounding";

/** A sentence that carries the query terms, so scoring has something to find. */
function sentence(n: number): string {
  return `Sentence ${n}: thermal conduction through the sample was measured and recorded in close detail.`;
}

function body(count: number, separator = "\n"): string {
  return Array.from({ length: count }, (_, index) => sentence(index + 1)).join(separator);
}

function stateWith(overrides: Partial<GraphState>): GraphState {
  const base = createInitialState({
    prompt: "How does thermal conduction work in this material?",
    files: [],
    history: [],
    subject: null,
    mode: null,
  });
  return Object.assign(base, overrides);
}

const PART: DocumentPart = {
  documentId: "doc-1",
  name: "Thermal Report.pdf",
  text: body(20),
};

describe("retrieval: documents are chunked from their real parts", () => {
  it("does not split a document on a separator line inside its own text", () => {
    // The old implementation recovered document boundaries by re-parsing
    // `--- name ---` markers out of the already-joined text, so this document
    // would have become two documents, the second named "Methods".
    const text = ["--- Methods ---", body(20)].join("\n");
    const part: DocumentPart = { documentId: "doc-1", name: "Thesis.pdf", text };
    const { corpus, sources, rejected } = buildCorpus(
      stateWith({ documentParts: [part], documentText: `--- Thesis.pdf ---\n${text}` }),
    );

    expect(rejected).toEqual([]);
    expect(corpus.length).toBeGreaterThan(0);
    expect(corpus.every((chunk) => chunk.source === "Thesis")).toBe(true);
    expect(corpus.some((chunk) => chunk.source === "Methods")).toBe(false);
    expect(sources.get("doc-1")).toBe(text);
  });

  it("gives every chunk a locator that reproduces its own text", () => {
    const { corpus } = buildCorpus(stateWith({ documentParts: [PART] }));

    expect(corpus.length).toBeGreaterThan(0);
    for (const chunk of corpus) {
      expect(chunk.location).toBeDefined();
      expect(PART.text.slice(chunk.location!.charStart, chunk.location!.charEnd)).toBe(chunk.text);
    }
  });

  it("registers a source that produced no chunks, so the run can say so", () => {
    const tiny: DocumentPart = { documentId: "doc-tiny", name: "Note.txt", text: "Too short." };
    const { corpus, sources } = buildCorpus(stateWith({ documentParts: [tiny] }));

    expect(corpus).toEqual([]);
    expect(sources.get("doc-tiny")).toBe("Too short.");
  });

  it("ignores the joined document text when real parts are present", () => {
    const { corpus } = buildCorpus(
      stateWith({ documentParts: [PART], documentText: "--- Ghost.md ---\nThis text is not in any part." }),
    );
    expect(corpus.length).toBeGreaterThan(0);
    expect(corpus.some((chunk) => chunk.text.includes("Ghost.md"))).toBe(false);
    expect(corpus.every((chunk) => chunk.location!.documentId === "doc-1")).toBe(true);
  });

  it("still reads a session saved before parts existed, as one unnamed source", () => {
    const { corpus } = buildCorpus(stateWith({ documentText: `--- Old.md ---\n${body(20)}` }));

    expect(corpus.length).toBeGreaterThan(0);
    expect(corpus.every((chunk) => chunk.location!.documentId === "document:joined")).toBe(true);
  });

  it("keeps the page a chunk came from, when the format exposed pages", () => {
    const pageOne = `Page one. ${body(12, " ")}`;
    const pageTwo = `Page two. ${body(12, " ")}`;
    const part: DocumentPart = {
      documentId: "doc-2",
      name: "Scanned Report.pdf",
      text: `${pageOne}\n\n${pageTwo}`,
      pageCount: 2,
      sections: [
        { label: "Page 1", text: pageOne },
        { label: "Page 2", text: pageTwo },
      ],
    };
    const { corpus } = buildCorpus(stateWith({ documentParts: [part] }));
    const pages = new Set(corpus.map((chunk) => chunk.location!.page));

    expect(pages.has(1)).toBe(true);
    expect(pages.has(2)).toBe(true);
  });
});

describe("retrieval: assembled context is chunked too", () => {
  it("indexes knowledge, canvas and history against the text it can verify", () => {
    const state = stateWith({
      knowledgeContext: body(20),
      canvasContext: body(20),
      conversationHistory: [{ role: "assistant", content: body(20) }],
    });
    const { corpus, sources } = buildCorpus(state);

    expect(new Set(corpus.map((chunk) => chunk.sourceType))).toEqual(
      new Set(["knowledge", "canvas", "history"]),
    );
    for (const chunk of corpus) {
      const key = `${chunk.sourceType}:${chunk.source}`;
      const source = sources.get(key);
      expect(source).toBeDefined();
      expect(source!.slice(chunk.location!.charStart, chunk.location!.charEnd)).toBe(chunk.text);
    }
    expect(sources.has("knowledge:Knowledge Graph")).toBe(true);
    expect(sources.has("canvas:Research Canvas")).toBe(true);
    expect(sources.has("history:Session History")).toBe(true);
  });

  it("takes the last assistant message, not the user's question", () => {
    const question = "This is the user question and it must not become evidence. ".repeat(4);
    const state = stateWith({
      conversationHistory: [
        { role: "user", content: question },
        { role: "assistant", content: `Answer. ${body(20, " ")}` },
      ],
    });
    const { corpus } = buildCorpus(state);

    expect(corpus.length).toBeGreaterThan(0);
    expect(corpus.every((chunk) => chunk.sourceType === "history")).toBe(true);
    expect(corpus.some((chunk) => chunk.text.includes("must not become evidence"))).toBe(false);
  });

  it("returns an empty corpus when nothing at all is available", () => {
    const { corpus, sources, rejected } = buildCorpus(stateWith({}));
    expect(corpus).toEqual([]);
    expect(sources.size).toBe(0);
    expect(rejected).toEqual([]);
  });
});

describe("RetrievalNode", () => {
  it("scores, re-ranks and grounds, and records the stage", async () => {
    const state = stateWith({ documentParts: [PART], userPrompt: "thermal conduction" });
    const result = await RetrievalNode(state);

    const chunks = result.retrievedChunks ?? [];
    const grounded = result.groundedSources ?? [];

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.length).toBeLessThanOrEqual(8);
    expect(chunks.every((chunk) => chunk.score >= 0 && chunk.score <= 1)).toBe(true);
    expect(grounded.length).toBeGreaterThan(0);

    const ids = new Set(chunks.map((chunk) => chunk.id));
    for (const source of grounded) {
      expect(source.chunkIds?.length).toBeGreaterThan(0);
      for (const id of source.chunkIds ?? []) expect(ids.has(id)).toBe(true);
    }

    expect(state.trace.stages.find((stage) => stage.id === "retrieval")?.status).toBe("success");
    expect(state.trace.stages.find((stage) => stage.id === "scoring")?.status).toBe("success");
  });

  it("hands the evidence index to the next stage for verification", async () => {
    const state = stateWith({ documentParts: [PART] });
    const result = await RetrievalNode(state);
    expect(result.evidenceSources?.get("doc-1")).toBe(PART.text);
  });

  it("skips cleanly rather than failing when there is no context", async () => {
    const state = stateWith({});
    const result = await RetrievalNode(state);

    expect(result.retrievedChunks).toEqual([]);
    expect(result.groundedSources).toEqual([]);
    expect(state.trace.stages.find((stage) => stage.id === "retrieval")?.status).toBe("skipped");
  });

  it("is deterministic apart from the chunk positions it assigns", async () => {
    const first = await RetrievalNode(stateWith({ documentParts: [PART] }));
    const second = await RetrievalNode(stateWith({ documentParts: [PART] }));

    expect(first.retrievedChunks?.map((chunk) => chunk.id)).toEqual(
      second.retrievedChunks?.map((chunk) => chunk.id),
    );
    expect(first.retrievedChunks?.map((chunk) => chunk.score)).toEqual(
      second.retrievedChunks?.map((chunk) => chunk.score),
    );
  });
});
