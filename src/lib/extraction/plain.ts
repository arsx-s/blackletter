/**
 * Plain-text-family extraction: `.txt`, `.md`, `.csv`, `.json`, `.log`, and
 * anything else whose bytes are genuinely text.
 *
 * The important addition here is the **binary refusal**. A `.txt` that is
 * really a compiled binary, a truncated archive, or a UTF-16 file read as UTF-8
 * used to be returned as-is and then interpolated straight into the model
 * prompt. Rejecting it with `MALFORMED_FILE` is both more honest and more
 * useful: the operator learns the file is not what its extension claims.
 */

import { ExtractionError } from "./errors";
import { EXTRACTION_LIMITS, MAX_NON_PRINTABLE_RATIO } from "./limits";
import type { ExtractionSection, DocumentFormat } from "./types";

export interface PlainExtraction {
  text: string;
  sections: ExtractionSection[];
  format: DocumentFormat;
  warnings: string[];
}

/** Strip a UTF-8 BOM and normalise line endings without touching content. */
function normalise(raw: string): string {
  return raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function nonPrintableRatio(raw: string): number {
  if (raw.length === 0) return 0;
  const sample = raw.length > 100_000 ? raw.slice(0, 100_000) : raw;
  let suspicious = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    // Control characters other than tab/newline/return, plus the replacement
    // character (which means the bytes were not valid UTF-8), plus NUL.
    if (code === 0xfffd) suspicious++;
    else if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) suspicious++;
    else if (code === 0x7f) suspicious++;
  }
  return suspicious / sample.length;
}

/** Heuristic: UTF-16 text decoded as UTF-8 looks like alternating NUL bytes. */
function looksUtf16(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const evenNuls = bytes[0] === 0 && bytes[2] === 0;
  const oddNuls = bytes[1] === 0 && bytes[3] === 0;
  return (evenNuls || oddNuls) && bytes[0] !== 0x3c && bytes[0] !== 0x7b;
}

export function extractPlainText(
  bytes: Uint8Array,
  format: DocumentFormat,
  fileName?: string,
): PlainExtraction {
  if (bytes.length > EXTRACTION_LIMITS.maxFileBytes) {
    throw new ExtractionError(
      "FILE_TOO_LARGE",
      `File is ${Math.round(bytes.length / (1024 * 1024))} MB, above the ${Math.round(EXTRACTION_LIMITS.maxFileBytes / (1024 * 1024))} MB limit.`,
      fileName,
    );
  }

  if (looksUtf16(bytes)) {
    throw new ExtractionError(
      "UNSUPPORTED_FILE_TYPE",
      "File appears to be UTF-16 encoded, which is not supported. Re-save it as UTF-8.",
      fileName,
    );
  }

  // `fatal: false` so invalid sequences become U+FFFD, which the ratio check
  // below then catches rather than letting silently mangled text through.
  const text = normalise(new TextDecoder("utf-8").decode(bytes));

  if (text.trim().length === 0) {
    throw new ExtractionError("EXTRACTION_EMPTY", "File contains no text.", fileName);
  }

  const ratio = nonPrintableRatio(text);
  if (ratio > MAX_NON_PRINTABLE_RATIO) {
    throw new ExtractionError(
      "MALFORMED_FILE",
      `File is not text: ${Math.round(ratio * 100)}% of its bytes are non-printable. Rename it with its real extension or convert it.`,
      fileName,
    );
  }

  const warnings: string[] = [];
  if (ratio > 0.02) {
    warnings.push(`${Math.round(ratio * 100)}% of the file is non-printable characters.`);
  }

  const sections = format === "markdown" ? markdownSections(text) : [];
  return { text, sections, format, warnings };
}

/**
 * Split Markdown on its ATX headings so the pipeline sees the author's own
 * structure rather than a flat wall of text.
 */
function markdownSections(text: string): ExtractionSection[] {
  const lines = text.split("\n");
  const sections: ExtractionSection[] = [];
  let current: ExtractionSection | null = null;
  let inFence = false;

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const heading = inFence ? null : /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      if (current && current.text.trim().length > 0) sections.push(current);
      current = { label: heading[2].trim() || "Untitled section", text: "" };
      continue;
    }
    if (!current) current = { label: "Preamble", text: "" };
    current.text += (current.text ? "\n" : "") + line;
  }

  if (current && current.text.trim().length > 0) sections.push(current);

  // A document with no headings at all should not pretend to have structure.
  if (sections.length === 1 && sections[0].label === "Preamble") return [];
  return sections.map((section) => ({ ...section, text: section.text.trim() }));
}
