import { describe, expect, it } from "vitest";
import {
  CHUNK_POLICY,
  chunkDocumentPart,
  chunkId,
  chunkInlineSource,
  displayName,
  formatLocator,
  normaliseWithMap,
  sourceIndex,
  verifyChunk,
  verifyChunks,
  windows,
  type DocumentPart,
  type EvidenceChunk,
} from "../../pipeline/grounding";

/** One realistic sentence, long enough that four of them clear the chunk floor. */
function sentence(n: number): string {
  return `Sentence number ${n} describes the thermal behaviour of the sample in close detail.`;
}

/** A document of `count` sentences joined by `separator`. */
function documentText(count: number, separator = "\n"): string {
  return Array.from({ length: count }, (_, index) => sentence(index + 1)).join(separator);
}

function part(text: string, name = "Report.pdf", documentId = "doc-1"): DocumentPart {
  return { documentId, name, text };
}

function chunkOf(text: string, overrides: Partial<EvidenceChunk["location"]> = {}): EvidenceChunk {
  return {
    id: "document-test",
    source: "test",
    sourceType: "document",
    text,
    location: {
      documentId: "doc-1",
      documentName: "Report.pdf",
      page: null,
      section: null,
      charStart: 0,
      charEnd: text.length,
      ...overrides,
    },
  };
}

describe("grounding: offsets are real", () => {
  it("produces chunks whose text is a literal slice of the source document", () => {
    const text = documentText(24);
    const { chunks, rejected } = chunkDocumentPart(part(text));

    expect(rejected).toEqual([]);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(text.slice(chunk.location.charStart, chunk.location.charEnd)).toBe(chunk.text);
    }
  });

  it("keeps the locator exact when the document contains runs of whitespace", () => {
    // Double spaces, tabs and blank lines all collapse in the normalised copy the
    // windowing runs on. A locator computed from the normalised copy without a
    // translation map would point at the wrong characters here.
    const text = [
      "Overview      of the method",
      "",
      "The sample was heated\t\tto equilibrium and held there for a period of time.",
      "",
      "Measurements    were    recorded    continuously    and    later    reviewed    in    full.",
      "A second paragraph continues the description with enough words to exceed the floor.",
    ].join("\n\n");
    const { chunks, rejected } = chunkDocumentPart(part(text));

    expect(rejected).toEqual([]);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(text.slice(chunk.location.charStart, chunk.location.charEnd)).toBe(chunk.text);
      expect(chunk.text).toContain("sample");
    }
  });

  it("advances monotonically and never escapes the document", () => {
    const text = documentText(40);
    const { chunks } = chunkDocumentPart(part(text));

    let previousStart = -1;
    for (const chunk of chunks) {
      expect(chunk.location.charStart).toBeGreaterThan(previousStart);
      expect(chunk.location.charEnd).toBeGreaterThan(chunk.location.charStart);
      expect(chunk.location.charEnd).toBeLessThanOrEqual(text.length);
      previousStart = chunk.location.charStart;
    }
  });

  it("rejects a chunk that cannot be reproduced from its source", () => {
    const text = documentText(4);
    const tampered: EvidenceChunk = { ...chunkOf("something else entirely"), location: { ...chunkOf("x").location, charEnd: 22 } };
    const report = verifyChunks(sourceIndex([part(text)]), [tampered]);

    expect(report.verified).toEqual([]);
    expect(report.rejected[0]?.reason).toBe("text-mismatch");
  });

  it("distinguishes an unknown document from an out-of-range locator", () => {
    const sources = sourceIndex([part("short text")]);
    expect(verifyChunk(sources, chunkOf("short", { documentId: "missing", charEnd: 5 }))).toEqual({
      ok: false,
      reason: "unknown-document",
    });
    expect(verifyChunk(sources, chunkOf("short", { charEnd: 500 }))).toEqual({
      ok: false,
      reason: "out-of-range",
    });
    expect(verifyChunk(sources, chunkOf("short"))).toEqual({ ok: true });
  });
});

describe("grounding: identity is content addressed", () => {
  it("gives the same chunk the same id on every run", () => {
    const text = documentText(20);
    const first = chunkDocumentPart(part(text));
    const second = chunkDocumentPart(part(text));

    expect(first.chunks.map((chunk) => chunk.id)).toEqual(second.chunks.map((chunk) => chunk.id));
    expect(first.chunks.map((chunk) => chunk.location)).toEqual(second.chunks.map((chunk) => chunk.location));
  });

  it("does not depend on the order chunks were produced in", () => {
    const location = chunkOf("x").location;
    expect(chunkId("document", "a", location, "text")).toBe(chunkId("document", "a", location, "text"));
  });

  it("changes the id when the span, the source or the text changes", () => {
    const base = chunkOf("hello world").location;
    const id = chunkId("document", "Report", base, "hello world");

    expect(chunkId("document", "Report", { ...base, charStart: 1 }, "hello world")).not.toBe(id);
    expect(chunkId("document", "Report", base, "hello worlds")).not.toBe(id);
    expect(chunkId("knowledge", "Report", base, "hello world")).not.toBe(id);
    expect(id.startsWith("document-")).toBe(true);
  });

  it("carries the source type into the id so two types cannot collide", () => {
    const location = chunkOf("same text").location;
    expect(chunkId("document", "s", location, "same text")).not.toBe(
      chunkId("canvas", "s", location, "same text"),
    );
  });
});

describe("grounding: windowing policy", () => {
  it("returns the whole text as one window when it already fits", () => {
    expect(windows("A short document.")).toEqual([{ text: "A short document.", start: 0 }]);
  });

  it("returns nothing for an empty text", () => {
    expect(windows("")).toEqual([]);
  });

  it("repeats a tail so a sentence split across a boundary stays whole somewhere", () => {
    const text = documentText(30, " ");
    const cuts = windows(text, 400, 120);
    expect(cuts.length).toBeGreaterThan(1);
    for (let i = 1; i < cuts.length; i++) {
      // Each window begins with the tail of the one before it.
      expect(cuts[i].start).toBeLessThan(cuts[i - 1].start + cuts[i - 1].text.length);
    }
  });

  it("drops a final window that is nothing but the previous window's overlap", () => {
    const text = `${documentText(9, " ")} tail`;
    const cuts = windows(text, 200, 150);
    const last = cuts[cuts.length - 1];
    expect(last.text.trim().length).toBeGreaterThan(0);
    expect(last.text).not.toBe(cuts[cuts.length - 2]?.text);
  });
});

describe("grounding: normalisation map", () => {
  it("maps every normalised character back to its original position", () => {
    const text = "alpha   beta\n\ngamma";
    const { normalised, map } = normaliseWithMap(text);

    expect(normalised).toBe("alpha beta gamma");
    for (let index = 0; index < normalised.length; index++) {
      const source = text[map[index]];
      // A collapsed run maps to the first whitespace character of the run, so
      // the character there is *some* whitespace, not necessarily a space.
      if (/\s/.test(normalised[index])) expect(/\s/.test(source)).toBe(true);
      else expect(source).toBe(normalised[index]);
    }
    expect(map[normalised.length]).toBe(text.length);
  });

  it("collapses a leading and trailing whitespace run to nothing", () => {
    const { normalised, map } = normaliseWithMap("\n\n  content here \t\n");
    expect(normalised).toBe("content here");
    expect(map[0]).toBe(4);
  });
});

describe("grounding: chunk geometry policy", () => {
  it("drops a document shorter than the usable floor and says nothing was produced", () => {
    const { chunks } = chunkDocumentPart(part("Too short to be useful."));
    expect(chunks).toEqual([]);
    expect(CHUNK_POLICY.minChars).toBeGreaterThan(20);
  });

  it("caps how much one source can contribute", () => {
    const text = documentText(4000, " ");
    const { chunks } = chunkDocumentPart(part(text));
    expect(chunks.length).toBe(CHUNK_POLICY.maxChunksPerSource);
  });

  it("honours caller-supplied window sizes", () => {
    const text = documentText(40, " ");
    const wide = chunkDocumentPart(part(text), { targetChars: 2000, overlapChars: 0 });
    const narrow = chunkDocumentPart(part(text), { targetChars: 300, overlapChars: 0 });
    expect(wide.chunks.length).toBeLessThan(narrow.chunks.length);
    // Zero overlap must advance monotonically, not restart at the same offset.
    const starts = wide.chunks.map((chunk) => chunk.location.charStart);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(new Set(starts).size).toBe(starts.length);
  });

  it("verifies every chunk across a range of document shapes", () => {
    // A window boundary can land on a whitespace run, and the run can be a tab,
    // a newline or several spaces. Any of them being miscounted by one makes
    // the locator point one character past the chunk's own text.
    const shapes: Array<[string, string, string]> = [
      ["single spaces", " ", " "],
      ["newlines", "\n", "\n"],
      ["blank lines", "\n\n", "\n\n"],
      ["tabs and double spaces", "\t", "  "],
      ["mixed", "\n\n", "  "],
    ];

    for (const [label, sentenceSeparator, blockSeparator] of shapes) {
      const blocks = Array.from({ length: 6 }, (_, block) =>
        Array.from({ length: 6 }, (_, index) => sentence(block * 6 + index + 1)).join(sentenceSeparator),
      );
      const text = blocks.join(blockSeparator);
      const { chunks, rejected } = chunkDocumentPart(part(text));

      expect(rejected, label).toEqual([]);
      expect(chunks.length, label).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(text.slice(chunk.location.charStart, chunk.location.charEnd), label).toBe(chunk.text);
        expect(/^\s|\s$/.test(chunk.text), label).toBe(false);
      }
    }
  });
});

describe("grounding: labels come from the extractor", () => {
  it("reports the page a chunk sits on, from the section boundaries", () => {
    const pageOne = `Page one body. ${documentText(14, " ")}`;
    const pageTwo = `Page two body. ${documentText(14, " ")}`;
    const text = `${pageOne}\n\n${pageTwo}`;
    const withSections: DocumentPart = {
      ...part(text),
      pageCount: 2,
      sections: [
        { label: "Page 1", text: pageOne },
        { label: "Page 2", text: pageTwo },
      ],
    };

    const { chunks } = chunkDocumentPart(withSections);
    const pages = new Set(chunks.map((chunk) => chunk.location.page));

    expect(pages.has(1)).toBe(true);
    expect(pages.has(2)).toBe(true);
    expect(chunks.every((chunk) => chunk.location.page !== null)).toBe(true);
  });

  it("reports no page when the format has no pages", () => {
    const { chunks } = chunkDocumentPart(part(documentText(20)));
    expect(chunks.every((chunk) => chunk.location.page === null)).toBe(true);
  });

  it("does not invent a page number when the sections cannot be located", () => {
    const withBogusSections: DocumentPart = {
      ...part(documentText(20)),
      sections: [{ label: "Page 7", text: "text that is not in the document at all" }],
    };
    const { chunks } = chunkDocumentPart(withBogusSections);
    expect(chunks.every((chunk) => chunk.location.page === null)).toBe(true);
  });

  it("names the section a chunk falls under", () => {
    const introduction = `Introduction. ${documentText(12, " ")}`;
    const methods = `Methods used here. ${documentText(12, " ")}`;
    const text = `${introduction}\n${methods}`;
    const withSections: DocumentPart = {
      ...part(text),
      sections: [
        { label: "Introduction", text: introduction },
        { label: "Methods", text: methods },
      ],
    };
    const { chunks } = chunkDocumentPart(withSections);

    const labels = new Set(chunks.map((chunk) => chunk.location.section));
    expect(labels.has("Introduction")).toBe(true);
    expect(labels.has("Methods")).toBe(true);
  });
});

describe("grounding: inline sources", () => {
  it("returns the normalised text its locators index", () => {
    const source = "Knowledge   context \n\n with runs of whitespace in it.";
    const { chunks, normalisedText } = chunkInlineSource("knowledge", "Knowledge Graph", source);
    expect(normalisedText).toBe("Knowledge context with runs of whitespace in it.");
    // Below the usable floor, so no chunk — and the caller can still index it.
    expect(chunks).toEqual([]);
  });

  it("produces verifiable chunks for a long context", () => {
    const { chunks, normalisedText } = chunkInlineSource("canvas", "Research Canvas", documentText(24, "\n"));
    expect(chunks.length).toBeGreaterThan(0);
    const report = verifyChunks(new Map([["canvas:Research Canvas", normalisedText]]), chunks);
    expect(report.rejected).toEqual([]);
    expect(report.verified.length).toBe(chunks.length);
  });
});

describe("grounding: locator presentation", () => {
  it("names the file, the page and the character span", () => {
    expect(
      formatLocator({
        documentId: "d",
        documentName: "Report.pdf",
        page: 3,
        section: null,
        charStart: 100,
        charEnd: 400,
      }),
    ).toBe("Report.pdf, page 3, chars 100\u2013400");
  });

  it("does not repeat a page label as a section", () => {
    expect(
      formatLocator({
        documentId: "d",
        documentName: "Report.pdf",
        page: 2,
        section: "Page 2",
        charStart: 0,
        charEnd: 10,
      }),
    ).toBe("Report.pdf, page 2, chars 0\u201310");
  });

  it("says so when there is no locator rather than guessing", () => {
    expect(formatLocator(undefined)).toBe("source unknown");
  });

  it("strips a file extension for display and leaves a nameless file alone", () => {
    expect(displayName("thermal-report.pdf")).toBe("thermal-report");
    expect(displayName("...")).toBe("...");
  });
});
