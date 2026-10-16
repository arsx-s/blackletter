import { describe, expect, it } from "vitest";
import { extractDocument } from "../../lib/extraction";
import { isExtractionError } from "../../lib/extraction/errors";
import { buildPdf, makeFile, type PdfOptions } from "./fixtures";

/** Extract and return the text, failing loudly if extraction refuses the file. */
async function textOf(options: PdfOptions, name = "paper.pdf"): Promise<string> {
  const result = await extractDocument(makeFile(name, buildPdf(options), "application/pdf"));
  return result.text;
}

async function capture(options: PdfOptions, name = "paper.pdf") {
  try {
    const result = await extractDocument(makeFile(name, buildPdf(options), "application/pdf"));
    return { ok: true as const, result };
  } catch (error) {
    if (!isExtractionError(error)) throw error;
    return { ok: false as const, code: error.code, message: error.message };
  }
}

const ONE_LINE = "BT /F1 12 Tf 72 720 Td (Hello BlackLetter) Tj ET";

/**
 * True when the text contains a C0 control character other than tab/newline.
 * Written as a scan rather than a regex so the intent is readable and the
 * linter does not have to be silenced.
 */
function hasControlCharacters(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) return true;
  }
  return false;
}

describe("pdf extraction: text operators", () => {
  it("reads text from an uncompressed content stream", async () => {
    await expect(textOf({ pages: [{ content: ONE_LINE }] })).resolves.toBe("Hello BlackLetter");
  });

  it("reads text from a Flate-compressed content stream", async () => {
    await expect(textOf({ pages: [{ content: ONE_LINE, compress: true }] })).resolves.toBe(
      "Hello BlackLetter",
    );
  });

  it("joins TJ array fragments and inserts a space at a wide kern gap", async () => {
    const content = "BT /F1 12 Tf 72 720 Td [(Black) -200 (Letter)] TJ ET";
    await expect(textOf({ pages: [{ content }] })).resolves.toBe("Black Letter");
  });

  it("does not insert a space for a narrow kern gap", async () => {
    const content = "BT /F1 12 Tf 72 720 Td [(Black) -10 (Letter)] TJ ET";
    await expect(textOf({ pages: [{ content }] })).resolves.toBe("BlackLetter");
  });

  it("decodes hex strings", async () => {
    const content = "BT /F1 12 Tf 72 720 Td <48656C6C6F> Tj ET";
    await expect(textOf({ pages: [{ content }] })).resolves.toBe("Hello");
  });

  it("decodes escaped parentheses, backslashes and octal codes in literal strings", async () => {
    const content = String.raw`BT /F1 12 Tf 72 720 Td (a\(b\)c\\d\101) Tj ET`;
    await expect(textOf({ pages: [{ content }] })).resolves.toBe("a(b)c\\dA");
  });

  it("separates lines on a vertical text move", async () => {
    const content = "BT /F1 12 Tf 72 720 Td (First line) Tj 0 -14 Td (Second line) Tj ET";
    await expect(textOf({ pages: [{ content }] })).resolves.toBe("First line\nSecond line");
  });

  it("treats T* and the ' operator as line breaks", async () => {
    const content = "BT /F1 12 Tf 14 TL 72 720 Td (One) Tj T* (Two) Tj T* (Three) ' ET";
    await expect(textOf({ pages: [{ content }] })).resolves.toBe("One\nTwo\nThree");
  });
});

describe("pdf extraction: character mapping", () => {
  it("uses a /ToUnicode CMap when the font provides one", async () => {
    const cmap =
      "/CIDInit /ProcSet findresource begin 12 dict begin begincmap " +
      "1 beginbfchar <41> <0041> endbfchar " +
      "2 beginbfrange <42> <43> <0042> endbfrange " +
      "endcmap end end";
    const options: PdfOptions = {
      pages: [{ content: "BT /F1 12 Tf 72 720 Td (ABC) Tj ET" }],
      fontObject: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /ToUnicode 6 0 R >>",
      extraObjects: { 6: `<< /Length ${cmap.length} >>\nstream\n${cmap}\nendstream` },
    };
    await expect(textOf(options)).resolves.toBe("ABC");
  });

  it("reads Identity-H two-byte codes through /ToUnicode", async () => {
    const cmap = "1 beginbfchar <0048> <0048> <0065> <0065> endbfchar";
    const options: PdfOptions = {
      pages: [{ content: "BT /F1 12 Tf 72 720 Td <00480065> Tj ET" }],
      fontObject:
        "<< /Type /Font /Subtype /Type0 /BaseFont /Subset+Sans /Encoding /Identity-H /ToUnicode 6 0 R >>",
      extraObjects: { 6: `<< /Length ${cmap.length} >>\nstream\n${cmap}\nendstream` },
    };
    await expect(textOf(options)).resolves.toBe("He");
  });

  it("maps the WinAnsi high range", async () => {
    // 0x93 / 0x94 are the curly double quotes; 0xD7 is 'x' (multiplication).
    const content = "BT /F1 12 Tf 72 720 Td <9361D794> Tj ET";
    await expect(textOf({ pages: [{ content }] })).resolves.toBe("\u201Ca\u00D7\u201D");
  });

  it("emits nothing rather than wrong characters when a two-byte font has no /ToUnicode", async () => {
    const content =
      "BT /F1 12 Tf 72 720 Td <00480065> Tj /F2 12 Tf 0 -14 Td (Readable) Tj ET";
    const options: PdfOptions = {
      pages: [{ content }],
      fontObject: "<< /Type /Font /Subtype /Type0 /BaseFont /Subset+Sans /Encoding /Identity-H >>",
      resourceFonts: "F1 3 0 R F2 7 0 R",
      extraObjects: {
        7: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
      },
    };
    const result = await extractDocument(makeFile("subset.pdf", buildPdf(options), "application/pdf"));

    // The undecodable run is dropped, not transliterated; the page's other text
    // is unaffected, and the skip is reported.
    expect(result.text).toBe("Readable");
    expect(result.text).not.toContain("0048");
    expect(hasControlCharacters(result.text)).toBe(false);
    expect(result.warnings.join(" ")).toMatch(/two-byte font with no \/ToUnicode/i);
  });
});

describe("pdf extraction: structure", () => {
  it("reports page boundaries as sections", async () => {
    const result = await extractDocument(
      makeFile(
        "two.pdf",
        buildPdf({
          pages: [
            { content: "BT /F1 12 Tf 72 720 Td (Page one body) Tj ET" },
            { content: "BT /F1 12 Tf 72 720 Td (Page two body) Tj ET" },
          ],
        }),
        "application/pdf",
      ),
    );
    expect(result.pageCount).toBe(2);
    expect(result.sections.map((section) => section.label)).toEqual(["Page 1", "Page 2"]);
    expect(result.text).toContain("Page one body");
    expect(result.text).toContain("Page two body");
  });

  it("expands objects held in a compressed object stream", async () => {
    await expect(
      textOf({ pages: [{ content: ONE_LINE, compress: true }], catalogInObjectStream: true }),
    ).resolves.toBe("Hello BlackLetter");
  });

  it("tolerates junk bytes before the %PDF- header", async () => {
    await expect(
      textOf({ pages: [{ content: ONE_LINE }], junkPrefix: "\u0000\u0001\u0002garbage" }),
    ).resolves.toBe("Hello BlackLetter");
  });
});

describe("pdf extraction: refusal", () => {
  it("refuses an encrypted PDF with ENCRYPTED", async () => {
    const outcome = await capture({ pages: [{ content: ONE_LINE }], encrypt: true });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("ENCRYPTED");
    expect(outcome.message).toMatch(/encrypted/i);
  });

  it("reports NO_TEXT_LAYER for an image-only page instead of returning an empty string", async () => {
    const content = "q 100 0 0 100 72 620 cm /Im0 Do Q";
    const outcome = await capture({ pages: [{ content }] });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("NO_TEXT_LAYER");
  });

  it("refuses a file with no PDF header", async () => {
    const outcome = await capture({ pages: [{ content: ONE_LINE }], omitHeader: true }, "fake.pdf");
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(["MALFORMED_FILE", "NO_TEXT_LAYER"]).toContain(outcome.code);
  });

  it("refuses a truncated PDF rather than emitting whatever bytes are present", async () => {
    const bytes = buildPdf({ pages: [{ content: ONE_LINE }] }).subarray(0, 60);
    const outcome = await extractDocument(makeFile("cut.pdf", bytes, "application/pdf")).then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    expect(outcome.ok).toBe(false);
  });
});

describe("pdf extraction: no binary noise", () => {
  it("never returns compressed stream bytes as text", async () => {
    // A large, highly compressible content stream. If the parser fell back to
    // dumping raw stream bytes, the result would be full of control characters.
    const filler = Array.from({ length: 200 }, (_, i) => `(Filler line ${i}) Tj T*`).join(" ");
    const content = `BT /F1 12 Tf 72 720 Td ${filler} ET`;
    const result = await extractDocument(
      makeFile("big.pdf", buildPdf({ pages: [{ content, compress: true }] }), "application/pdf"),
    );

    expect(result.text).toContain("Filler line 0");
    expect(result.text).toContain("Filler line 199");
    // No NULs, no C0 control characters other than tab/newline.
    expect(hasControlCharacters(result.text)).toBe(false);
    // And no stream plumbing.
    expect(result.text).not.toContain("endstream");
    expect(result.text).not.toContain("FlateDecode");
  });
});

describe("pdf extraction: determinism", () => {
  it("produces identical output for identical input", async () => {
    const options: PdfOptions = {
      pages: [
        { content: ONE_LINE, compress: true },
        { content: "BT /F1 12 Tf 72 720 Td (Second) Tj ET", compress: true },
      ],
    };
    const first = await extractDocument(makeFile("same.pdf", buildPdf(options), "application/pdf"));
    const second = await extractDocument(makeFile("same.pdf", buildPdf(options), "application/pdf"));
    expect(first.text).toBe(second.text);
    expect(first.sections).toEqual(second.sections);
  });
});
