/**
 * Document text extraction — one entry point for every supported format.
 *
 * Format detection is by **content**, not by extension or MIME type, because
 * both of those come from the user and are routinely wrong: a `.pdf` that is
 * really a text file, a `.docx` that is really an encrypted OLE container, a
 * `.txt` that is really a JPEG. Sniffing the bytes first means the parser is
 * only ever handed input it can actually understand, and a mismatch is reported
 * as a mismatch instead of as a parse failure.
 */

import { ExtractionError, isExtractionError } from "./errors";
import { EXTRACTION_LIMITS } from "./limits";
import { extractPdfText } from "./pdf";
import { extractDocxText, looksLikeOleCompoundFile } from "./docx";
import { extractPlainText } from "./plain";
import type { DocumentFormat, ExtractionResult, ExtractionSection } from "./types";

export { ExtractionError, isExtractionError, describeExtractionError } from "./errors";
export type { ExtractionErrorCode } from "./errors";
export { EXTRACTION_LIMITS } from "./limits";
export type { DocumentFormat, ExtractionResult, ExtractionSection } from "./types";

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const ZIP_EMPTY_MAGIC = [0x50, 0x4b, 0x05, 0x06];

function startsWith(bytes: Uint8Array, magic: number[], offset = 0): boolean {
  if (bytes.length < offset + magic.length) return false;
  return magic.every((byte, index) => bytes[offset + index] === byte);
}

export type DetectedFormat = "pdf" | "zip" | "ole" | "text";

/** Sniff the real container from the first bytes. */
export function detectContainer(bytes: Uint8Array): DetectedFormat {
  if (looksLikeOleCompoundFile(bytes)) return "ole";
  if (startsWith(bytes, ZIP_MAGIC) || startsWith(bytes, ZIP_EMPTY_MAGIC)) return "zip";

  // The PDF header is allowed to appear after up to 1024 bytes of junk.
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 1024)));
  if (head.includes("%PDF-")) return "pdf";

  return "text";
}

function formatFromExtension(name: string): DocumentFormat {
  const lower = name.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) return "csv";
  return "text";
}

/** Extensions we claim to support. Anything else is refused up front. */
const SUPPORTED_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".tsv",
  ".json",
  ".log",
  ".pdf",
  ".docx",
]);

export const SUPPORTED_LABEL = "TXT · MD · CSV · JSON · LOG · PDF · DOCX";

export interface ExtractOptions {
  maxExtractedChars?: number;
}

function truncate(
  text: string,
  sections: ExtractionSection[],
  max: number,
): { text: string; sections: ExtractionSection[]; truncated: boolean } {
  if (text.length <= max) return { text, sections, truncated: false };

  const kept = text.slice(0, max);
  const keptSections: ExtractionSection[] = [];
  let used = 0;
  for (const section of sections) {
    if (used >= max) break;
    const remaining = max - used;
    keptSections.push({
      label: section.label,
      text: section.text.length <= remaining ? section.text : section.text.slice(0, remaining),
    });
    used += section.text.length + 2;
  }

  return { text: kept, sections: keptSections, truncated: true };
}

/**
 * Extract text from a user-provided file.
 *
 * @throws ExtractionError with a stable code; never throws a raw parser error.
 */
export async function extractDocument(file: File, options: ExtractOptions = {}): Promise<ExtractionResult> {
  const maxChars = options.maxExtractedChars ?? EXTRACTION_LIMITS.maxExtractedChars;

  if (file.size > EXTRACTION_LIMITS.maxFileBytes) {
    throw new ExtractionError(
      "FILE_TOO_LARGE",
      `File is ${Math.round(file.size / (1024 * 1024))} MB, above the ${Math.round(EXTRACTION_LIMITS.maxFileBytes / (1024 * 1024))} MB limit.`,
      file.name,
    );
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) {
    throw new ExtractionError("EXTRACTION_EMPTY", "File is empty.", file.name);
  }

  const container = detectContainer(bytes);
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

  // A file whose extension names a container it does not contain is a mismatch,
  // not a text file. Falling through to the plain-text reader would put the
  // raw structure of the mislabelled file into the prompt.
  if (extension === ".pdf" && container !== "pdf") {
    throw new ExtractionError(
      "MALFORMED_FILE",
      `"${file.name}" has a .pdf extension but its contents are not a PDF.`,
      file.name,
    );
  }
  if (extension === ".docx" && container !== "zip" && container !== "ole") {
    throw new ExtractionError(
      "MALFORMED_FILE",
      `"${file.name}" has a .docx extension but its contents are not a Word package.`,
      file.name,
    );
  }

  let text: string;
  let sections: ExtractionSection[];
  let format: DocumentFormat;
  const warnings: string[] = [];
  let pageCount: number | undefined;

  try {
    if (container === "pdf") {
      const result = extractPdfText(buffer, file.name);
      text = result.text;
      sections = result.sections;
      warnings.push(...result.warnings);
      format = "pdf";
      pageCount = result.pageCount;
    } else if (container === "ole") {
      // Handled by the DOCX reader so the error message can be specific.
      extractDocxText(buffer, file.name);
      throw new ExtractionError("MALFORMED_FILE", "Unreachable.", file.name);
    } else if (container === "zip") {
      const result = extractDocxText(buffer, file.name);
      text = result.text;
      sections = result.sections;
      warnings.push(...result.warnings);
      format = "docx";
    } else {
      if (extension && !SUPPORTED_EXTENSIONS.has(extension)) {
        throw new ExtractionError(
          "UNSUPPORTED_FILE_TYPE",
          `Cannot extract text from "${file.name}". Supported: ${SUPPORTED_LABEL}.`,
          file.name,
        );
      }
      const result = extractPlainText(bytes, formatFromExtension(file.name), file.name);
      text = result.text;
      sections = result.sections;
      warnings.push(...result.warnings);
      format = result.format;
    }
  } catch (error) {
    if (isExtractionError(error)) throw error;
    throw new ExtractionError(
      "EXTRACTION_FAILED",
      `Could not read "${file.name}": ${error instanceof Error ? error.message : "unknown parser failure"}.`,
      file.name,
    );
  }

  const capped = truncate(text, sections, maxChars);
  if (capped.truncated) {
    warnings.push(
      `Text was truncated at ${maxChars.toLocaleString()} characters to stay within the pipeline budget.`,
    );
  }

  return {
    text: capped.text,
    sections: capped.sections,
    format,
    chars: capped.text.length,
    words: capped.text.split(/\s+/).filter(Boolean).length,
    truncated: capped.truncated,
    pageCount,
    warnings,
  };
}
