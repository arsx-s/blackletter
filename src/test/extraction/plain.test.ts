import { describe, expect, it } from "vitest";
import { extractDocument, EXTRACTION_LIMITS, SUPPORTED_LABEL } from "../../lib/extraction";
import { isExtractionError } from "../../lib/extraction/errors";
import { makeFile, makeTextFile } from "./fixtures";

async function outcome(file: File) {
  try {
    const result = await extractDocument(file);
    return { ok: true as const, result };
  } catch (error) {
    if (!isExtractionError(error)) throw error;
    return { ok: false as const, code: error.code, message: error.message };
  }
}

describe("plain text extraction", () => {
  it("reads UTF-8 text", async () => {
    const result = await outcome(makeTextFile("notes.txt", "Line one\nLine two"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.text).toBe("Line one\nLine two");
    expect(result.result.format).toBe("text");
    expect(result.result.words).toBe(4);
  });

  it("strips a byte-order mark", async () => {
    const result = await outcome(makeTextFile("bom.txt", "\uFEFFContent after BOM"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.text).toBe("Content after BOM");
  });

  it("normalises CRLF line endings", async () => {
    const result = await outcome(makeTextFile("crlf.txt", "One\r\nTwo\rThree"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.text).toBe("One\nTwo\nThree");
  });

  it("preserves indentation and non-ASCII characters", async () => {
    const source = "  indented\n\u00c9l\u00e8ves — na\u00efve caf\u00e9\n\u4e2d\u6587\u6bb5\u843d";
    const result = await outcome(makeTextFile("unicode.txt", source));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.text).toBe(source);
  });
});

describe("plain text extraction: structure", () => {
  it("splits Markdown on its headings", async () => {
    const source = [
      "# Title",
      "Intro paragraph.",
      "## Section one",
      "Body of section one.",
      "## Section two",
      "Body of section two.",
    ].join("\n");
    const result = await outcome(makeTextFile("doc.md", source, "text/markdown"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.format).toBe("markdown");
    expect(result.result.sections.map((section) => section.label)).toEqual([
      "Title",
      "Section one",
      "Section two",
    ]);
  });

  it("ignores heading marks inside fenced code blocks", async () => {
    const source = ["# Real heading", "```", "# not a heading", "```", "Text."].join("\n");
    const result = await outcome(makeTextFile("code.md", source, "text/markdown"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.sections.map((section) => section.label)).toEqual(["Real heading"]);
  });

  it("reports no structure for Markdown without headings", async () => {
    const result = await outcome(makeTextFile("flat.md", "Just prose with no headings at all."));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.sections).toEqual([]);
  });

  it("keeps CSV rows intact", async () => {
    const csv = "name,value\nalpha,1\nbeta,2";
    const result = await outcome(makeTextFile("data.csv", csv, "text/csv"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.format).toBe("csv");
    expect(result.result.text).toBe(csv);
  });
});

describe("plain text extraction: refusal", () => {
  it("refuses content that is not text", async () => {
    // A disguised binary: mostly NUL and control bytes behind a .txt name.
    const bytes = new Uint8Array(512);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 8;
    const result = await outcome(makeFile("notes.txt", bytes));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("MALFORMED_FILE");
    expect(result.message).toMatch(/not text/i);
  });

  it("refuses invalid UTF-8 sequences", async () => {
    // 0xFF is never valid UTF-8, so this decodes to replacement characters.
    const bytes = new Uint8Array(200).fill(0xff);
    const result = await outcome(makeFile("broken.txt", bytes));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("MALFORMED_FILE");
  });

  it("refuses UTF-16, which would otherwise decode as interleaved NULs", async () => {
    const text = "UTF-16 text";
    const bytes = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i++) bytes[i * 2] = text.charCodeAt(i);
    const result = await outcome(makeFile("utf16.txt", bytes));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("UNSUPPORTED_FILE_TYPE");
    expect(result.message).toMatch(/UTF-16/i);
  });

  it("refuses an empty file", async () => {
    const result = await outcome(makeFile("empty.txt", new Uint8Array(0)));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("EXTRACTION_EMPTY");
  });

  it("refuses a whitespace-only file", async () => {
    const result = await outcome(makeTextFile("blank.txt", "   \n\t\n  "));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("EXTRACTION_EMPTY");
  });

  it("refuses an unsupported extension", async () => {
    const result = await outcome(makeTextFile("archive.zip.txt.bin", "readable text"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("UNSUPPORTED_FILE_TYPE");
    expect(result.message).toContain(SUPPORTED_LABEL);
  });

  it("refuses a file larger than the ceiling without reading it", async () => {
    const result = await outcome(
      makeFile("huge.txt", new Uint8Array(EXTRACTION_LIMITS.maxFileBytes + 1)),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("FILE_TOO_LARGE");
  });

  it("refuses a .pdf whose contents are plain text", async () => {
    const result = await outcome(makeTextFile("mislabelled.pdf", "This is not a PDF at all."));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("MALFORMED_FILE");
    expect(result.message).toMatch(/not a PDF/i);
  });
});

describe("plain text extraction: bounds", () => {
  it("truncates to the caller's character budget and says so", async () => {
    const long = "word ".repeat(2000);
    const result = await extractDocument(makeTextFile("long.txt", long), { maxExtractedChars: 100 });
    expect(result.text.length).toBe(100);
    expect(result.truncated).toBe(true);
    expect(result.warnings.join(" ")).toMatch(/truncated/i);
  });

  it("does not truncate text that fits", async () => {
    const result = await extractDocument(makeTextFile("short.txt", "Short body."));
    expect(result.truncated).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it("reports the character and word counts it actually produced", async () => {
    const result = await extractDocument(makeTextFile("count.txt", "alpha beta gamma"));
    expect(result.chars).toBe("alpha beta gamma".length);
    expect(result.words).toBe(3);
  });
});
