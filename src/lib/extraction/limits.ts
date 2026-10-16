/**
 * Extraction limits.
 *
 * Every ceiling here exists because the corresponding input is attacker-shaped
 * or just large: a decompression bomb, a 10 000-page PDF, a DOCX with a million
 * zip entries. Exceeding a limit raises `EXTRACTION_LIMIT` with a message that
 * names the limit, so the operator learns what happened instead of seeing a
 * spinner that never resolves.
 */
export const EXTRACTION_LIMITS = {
  /** Largest file we will read at all. The UI additionally caps uploads at 10 MB. */
  maxFileBytes: 25 * 1024 * 1024,
  /** Cap on the text handed to the pipeline. Longer input is truncated, and said so. */
  maxExtractedChars: 400_000,
  /** Cap on rendered pages read from one PDF. */
  maxPages: 400,
  /** Cap on indirect objects scanned from one PDF. */
  maxPdfObjects: 50_000,
  /** Cap on any single decompressed stream. */
  maxStreamBytes: 32 * 1024 * 1024,
  /** Cap on total decompressed bytes across one file (bomb guard). */
  maxTotalDecompressedBytes: 96 * 1024 * 1024,
  /** Cap on how far a stream may expand relative to its compressed size. */
  maxCompressionRatio: 500,
  /** Cap on zip entries inspected in a DOCX. */
  maxZipEntries: 4_000,
  /** Cap on characters pulled from a single XML part, so a huge document.xml cannot stall the UI. */
  maxXmlChars: 8 * 1024 * 1024,
} as const;

/** Fraction of non-printable bytes above which a "text" file is treated as binary. */
export const MAX_NON_PRINTABLE_RATIO = 0.3;
