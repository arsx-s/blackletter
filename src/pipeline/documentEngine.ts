import type { PipelineContext } from "./types";
import {
  describeExtractionError,
  extractDocument,
  EXTRACTION_LIMITS,
  SUPPORTED_LABEL,
  type DocumentFormat,
} from "../lib/extraction";
import { fnv1a32 } from "../lib/hash";
import { displayName, type DocumentPart } from "./grounding";

/**
 * Document analysis, built on `src/lib/extraction`.
 *
 * This module used to own a hand-rolled PDF/DOCX parser, a ZIP reader and a
 * DEFLATE inflater — all of which existed a second time, verbatim, in
 * `src/langgraph/nodes/DocumentNode.ts`. Both copies are gone: parsing lives in
 * `src/lib/extraction`, and the analysis below is shared by every caller.
 */

/** Extract just the text of one file. Kept for the callers that only need text. */
export async function extractTextFromFile(file: File): Promise<string> {
  const result = await extractDocument(file);
  return result.text;
}

export function detectLanguage(text: string): string {
  if (/[\u4e00-\u9fff]/.test(text)) return "zh";
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return "ja";
  if (/[\u0400-\u04ff]/.test(text)) return "ru";
  if (/[\u0600-\u06ff]/.test(text)) return "ar";
  if (/[\u00c0-\u024f]/.test(text)) return "fr";
  if (/[\u0e00-\u0e7f]/.test(text)) return "th";
  if (/[\u0900-\u097f]/.test(text)) return "hi";
  return "en";
}

function extractHeadings(text: string): string[] {
  return text
    .split("\n")
    .filter((line) => /^#{1,4}\s|^[A-Z][A-Z\s]{2,}:$|^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$/.test(line.trim()))
    .slice(0, 25);
}

function extractKeywords(text: string): string[] {
  const words = text.toLowerCase().split(/\s+/).filter((word) => word.length > 4);
  const frequency: Record<string, number> = {};
  for (const word of words) frequency[word] = (frequency[word] || 0) + 1;
  return Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);
}

function extractConcepts(keywords: string[]): string[] {
  return keywords.filter((keyword) => keyword.length > 5).slice(0, 10);
}

/** Headings that are literally objectives. Nothing is invented to fill the gap. */
const OBJECTIVE_HEADING = /\b(introduction|overview|goal|objective|purpose|aim|learning|outcome)\b/i;

export interface DocumentFileSummary {
  name: string;
  format: DocumentFormat;
  chars: number;
  pageCount?: number;
  warnings: string[];
}

export interface DocumentAnalysis {
  text: string;
  chars: number;
  words: number;
  language: string;
  headings: string[];
  keywords: string[];
  concepts: string[];
  /**
   * Objectives the document states about itself. Empty when it states none —
   * the previous implementation synthesised `"Understand <keyword>"` here,
   * which put a sentence into the record that no source actually contained.
   */
  objectives: string[];
  files: DocumentFileSummary[];
  /**
   * One entry per file, carrying its own text and section boundaries.
   *
   * `text` above is these joined with `--- name ---` separators for the reader
   * and for storage; retrieval uses these parts instead, so a document
   * containing a line like `--- Conclusions ---` cannot be mistaken for two
   * documents.
   */
  parts: DocumentPart[];
  warnings: string[];
  truncated: boolean;
}

const EMPTY_ANALYSIS: DocumentAnalysis = {
  text: "",
  chars: 0,
  words: 0,
  language: "en",
  headings: [],
  keywords: [],
  concepts: [],
  objectives: [],
  files: [],
  parts: [],
  warnings: [],
  truncated: false,
};

/**
 * A stable identity for an uploaded file.
 *
 * The pipeline only receives `File` objects, which carry no id of their own. A
 * digest of the name, size and modification time is stable across runs for the
 * same file, which is what a stored citation needs: re-attaching the same
 * document must not invalidate yesterday's locators. It is not a security
 * identity and is not treated as one.
 */
export function documentIdForFile(file: File): string {
  return `${displayName(file.name)}-${fnv1a32(`${file.name}\u0000${file.size}\u0000${file.lastModified}`)}`;
}

/**
 * Extract and analyse a set of files, joining them with a separator the
 * pipeline can parse back out.
 *
 * @throws ExtractionError when a file cannot be read. Callers that want to
 *         continue with the readable files should catch per file instead.
 */
export async function analyzeDocuments(files: File[] | undefined): Promise<DocumentAnalysis> {
  if (!files || files.length === 0) return EMPTY_ANALYSIS;

  const parts: string[] = [];
  const documentParts: DocumentPart[] = [];
  const summaries: DocumentFileSummary[] = [];
  const warnings: string[] = [];
  let truncated = false;

  for (const file of files) {
    const result = await extractDocument(file);
    parts.push(`--- ${file.name} ---\n${result.text}`);
    documentParts.push({
      documentId: documentIdForFile(file),
      name: file.name,
      text: result.text,
      sections: result.sections,
      pageCount: result.pageCount ?? null,
    });
    truncated = truncated || result.truncated;
    warnings.push(...result.warnings.map((warning) => `${file.name}: ${warning}`));
    summaries.push({
      name: file.name,
      format: result.format,
      chars: result.chars,
      pageCount: result.pageCount,
      warnings: result.warnings,
    });
  }

  const fullText = parts.join("\n\n");
  const headings = extractHeadings(fullText);
  const keywords = extractKeywords(fullText);
  const concepts = extractConcepts(keywords);

  return {
    text: fullText,
    chars: fullText.length,
    words: fullText.split(/\s+/).filter(Boolean).length,
    language: detectLanguage(fullText),
    headings,
    keywords,
    concepts,
    objectives: headings.filter((heading) => OBJECTIVE_HEADING.test(heading)).slice(0, 5),
    files: summaries,
    parts: documentParts,
    warnings,
    truncated,
  };
}

/** Reduce a thrown extraction failure to a code + message pair for the UI. */
export function describeFailure(error: unknown, fileName: string): { code: string; message: string } {
  const code = (error as { code?: string })?.code;
  return {
    code: typeof code === "string" ? code : "EXTRACTION_FAILED",
    message: describeExtractionError(error, fileName),
  };
}

/** Everything the upload path needs about one accepted file. */
export interface UploadedDocumentText {
  text: string;
  /** Real page count when the format provides one; `null` otherwise. */
  pageCount: number | null;
  format: DocumentFormat;
  warnings: string[];
  truncated: boolean;
}

/**
 * Extract a file for storage.
 *
 * Unlike `extractTextFromFile`, this returns the metadata the UI can honestly
 * record — in particular a real page count for PDFs, instead of the `null` that
 * every upload used to be filed under because the old extractor never knew.
 */
export async function extractForUpload(file: File): Promise<UploadedDocumentText> {
  const result = await extractDocument(file);
  return {
    text: result.text,
    pageCount: result.pageCount ?? null,
    format: result.format,
    warnings: result.warnings,
    truncated: result.truncated,
  };
}

export interface DocumentResult {
  text: string;
  chars: number;
  words: number;
  language: string;
  headings: string[];
  keywords: string[];
  concepts: string[];
  objectives: string[];
  error: string | null;
}

/** Pipeline stage: analyse the uploaded files carried on the pipeline context. */
export async function executeDocument(ctx: PipelineContext): Promise<DocumentResult> {
  const files = ctx.input.files;
  if (!files || files.length === 0) {
    return {
      text: "",
      chars: 0,
      words: 0,
      language: "en",
      headings: [],
      keywords: [],
      concepts: [],
      objectives: [],
      error: null,
    };
  }

  const analysis = await analyzeDocuments(files);
  if (analysis.text.length === 0) {
    throw {
      code: "EXTRACTION_EMPTY",
      message: `Text extraction produced no text for the attached file(s). Supported formats: ${SUPPORTED_LABEL}.`,
    };
  }

  return {
    text: analysis.text,
    chars: analysis.chars,
    words: analysis.words,
    language: analysis.language,
    headings: analysis.headings,
    keywords: analysis.keywords,
    concepts: analysis.concepts,
    objectives: analysis.objectives,
    error: null,
  };
}

export { EXTRACTION_LIMITS };
