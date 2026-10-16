/**
 * Extraction result types.
 *
 * The point of `sections` and `warnings` is honesty about structure and about
 * what we could not read. The previous implementation returned a single string
 * and threw away every structural signal, so a PDF's page boundaries, a DOCX's
 * heading hierarchy, and a set of skipped fonts were all indistinguishable from
 * a clean extraction.
 */

export type DocumentFormat = "text" | "markdown" | "csv" | "pdf" | "docx";

export interface ExtractionSection {
  /** Human-readable boundary, e.g. `"Page 3"` or a heading. */
  label: string;
  text: string;
}

export interface ExtractionResult {
  /** The text handed to the pipeline, already truncated if necessary. */
  text: string;
  /** Structural boundaries the format actually exposed. May be empty. */
  sections: ExtractionSection[];
  format: DocumentFormat;
  chars: number;
  words: number;
  /** True when `EXTRACTION_LIMITS.maxExtractedChars` cut the text short. */
  truncated: boolean;
  /** Page count for paginated formats. */
  pageCount?: number;
  /**
   * Non-fatal observations — a skipped stream filter, a font with no Unicode
   * map, a page that produced no text. These are surfaced, not swallowed.
   */
  warnings: string[];
}
