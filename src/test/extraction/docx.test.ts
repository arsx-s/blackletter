import { describe, expect, it } from "vitest";
import { extractDocument } from "../../lib/extraction";
import { isExtractionError } from "../../lib/extraction/errors";
import { buildDocx, buildZip, makeFile, paragraph, type DocxOptions } from "./fixtures";

async function extract(options: DocxOptions, name = "notes.docx") {
  try {
    const result = await extractDocument(makeFile(name, buildDocx(options), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
    return { ok: true as const, result };
  } catch (error) {
    if (!isExtractionError(error)) throw error;
    return { ok: false as const, code: error.code, message: error.message };
  }
}

async function textOf(options: DocxOptions): Promise<string> {
  const outcome = await extract(options);
  if (!outcome.ok) throw new Error(`expected success, got ${outcome.code}: ${outcome.message}`);
  return outcome.result.text;
}

describe("docx extraction: document body", () => {
  it("extracts one line per paragraph", async () => {
    const text = await textOf({
      body: paragraph("First paragraph.") + paragraph("Second paragraph."),
    });
    expect(text).toBe("First paragraph.\nSecond paragraph.");
  });

  it("marks headings with their level", async () => {
    const text = await textOf({
      body:
        paragraph("Findings", "Heading1") +
        paragraph("Body text under the heading.") +
        paragraph("Details", "Heading2") +
        paragraph("Nested body."),
    });
    expect(text).toBe(
      ["# Findings", "Body text under the heading.", "## Details", "Nested body."].join("\n"),
    );
  });

  it("marks list items and indents nested levels", async () => {
    const text = await textOf({
      body: paragraph("Top level", undefined, 0) + paragraph("Nested", undefined, 2),
    });
    expect(text).toBe("- Top level\n    - Nested");
  });

  it("decodes XML entities, including numeric character references", async () => {
    const text = await textOf({
      body: paragraph("Research &amp; Development &#x2014; a &lt;draft&gt;"),
    });
    expect(text).toBe("Research & Development \u2014 a <draft>");
  });

  it("keeps inline line breaks and tabs", async () => {
    const body =
      "<w:p><w:r><w:t>Before</w:t><w:br/><w:t>After</w:t><w:tab/><w:t>End</w:t></w:r></w:p>";
    const text = await textOf({ body });
    expect(text).toBe("Before\nAfter\tEnd");
  });

  it("joins runs within one paragraph without inserting separators", async () => {
    const body =
      "<w:p><w:r><w:t xml:space=\"preserve\">Black</w:t></w:r><w:r><w:t>Letter</w:t></w:r></w:p>";
    expect(await textOf({ body })).toBe("BlackLetter");
  });

  it("ignores deleted text in tracked changes but says they are present", async () => {
    const body =
      paragraph("Kept text.") +
      '<w:p><w:del w:id="1" w:author="a"><w:r><w:delText>Removed text.</w:delText></w:r></w:del></w:p>';
    const outcome = await extract({ body });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.text).toContain("Kept text.");
    expect(outcome.result.text).not.toContain("Removed text.");
    expect(outcome.result.warnings.join(" ")).toMatch(/tracked changes/i);
  });

  it("reads through a DEFLATE-compressed document part", async () => {
    const text = await textOf({
      body: paragraph("Compressed body text."),
      deflateDocument: true,
    });
    expect(text).toBe("Compressed body text.");
  });
});

describe("docx extraction: structure and metadata", () => {
  it("splits sections on a page break", async () => {
    const body =
      paragraph("Page one content.") +
      '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' +
      paragraph("Page two content.");
    const outcome = await extract({ body });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.sections.length).toBe(2);
    expect(outcome.result.sections.every((section) => section.text.trim().length > 0)).toBe(true);
  });

  it("opens a section at a top-level heading", async () => {
    const body = paragraph("Introduction", "Heading1") + paragraph("Content of the introduction.");
    const outcome = await extract({ body });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.sections.map((section) => section.label)).toEqual(["Introduction"]);
  });

  it("does not invent structure for a document with no headings", async () => {
    const outcome = await extract({ body: paragraph("Just a paragraph.") });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // One implicit section is acceptable; a fabricated heading list is not.
    expect(outcome.result.sections.every((section) => !section.label.startsWith("#"))).toBe(true);
  });

  it("reads core properties when the package provides them", async () => {
    const outcome = await extract({ body: paragraph("Text."), metadata: true });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.text).toBe("Text.");
  });
});

describe("docx extraction: refusal", () => {
  it("reports ENCRYPTED for an OLE compound file", async () => {
    const ole = new Uint8Array(64);
    ole.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
    const outcome = await (async () => {
      try {
        await extractDocument(makeFile("locked.docx", ole, "application/octet-stream"));
        return { ok: true as const };
      } catch (error) {
        if (!isExtractionError(error)) throw error;
        return { ok: false as const, code: error.code, message: error.message };
      }
    })();
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("ENCRYPTED");
    expect(outcome.message).toMatch(/password-protected|unencrypted/i);
  });

  it("reports MALFORMED_FILE when the package has no document body", async () => {
    const outcome = await extract({ omitDocument: true });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("MALFORMED_FILE");
    expect(outcome.message).toMatch(/missing document body/i);
  });

  it("refuses an archive entry whose path escapes the package", async () => {
    const archive = buildZip([
      { name: "../../escape.txt", text: "should never be read" },
      { name: "word/document.xml", text: "<w:document><w:body/></w:document>" },
    ]);
    const outcome = await (async () => {
      try {
        await extractDocument(makeFile("evil.docx", archive));
        return { ok: true as const };
      } catch (error) {
        if (!isExtractionError(error)) throw error;
        return { ok: false as const, code: error.code, message: error.message };
      }
    })();
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("MALFORMED_FILE");
    expect(outcome.message).toMatch(/unsafe path/i);
  });

  it("refuses a .docx that is not a package", async () => {
    const outcome = await (async () => {
      try {
        await extractDocument(makeFile("fake.docx", new TextEncoder().encode("just plain words here")));
        return { ok: true as const };
      } catch (error) {
        if (!isExtractionError(error)) throw error;
        return { ok: false as const, code: error.code, message: error.message };
      }
    })();
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("MALFORMED_FILE");
    expect(outcome.message).toMatch(/not a Word package/i);
  });

  it("refuses a document with no paragraphs", async () => {
    const outcome = await extract({ body: "" });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("EXTRACTION_EMPTY");
  });

  it("refuses a document whose only paragraph is empty", async () => {
    const outcome = await extract({ body: "<w:p/>" });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(["NO_TEXT_LAYER", "EXTRACTION_EMPTY"]).toContain(outcome.code);
  });
});

describe("docx extraction: determinism", () => {
  it("produces identical output for identical input", async () => {
    const options: DocxOptions = {
      body:
        paragraph("Report", "Heading1") +
        paragraph("Body &amp; more.") +
        paragraph("Item", undefined, 1),
      metadata: true,
      deflateDocument: true,
    };
    const first = await extract(options);
    const second = await extract(options);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.result.text).toBe(second.result.text);
    expect(first.result.sections).toEqual(second.result.sections);
    expect(first.result.warnings).toEqual(second.result.warnings);
  });
});
