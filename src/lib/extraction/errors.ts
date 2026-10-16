/**
 * Extraction errors.
 *
 * The pipeline previously communicated extraction failures two ways: a thrown
 * object literal in one code path, and an empty string meaning "nothing came
 * out" in another. Callers could not tell "this file is encrypted" from "this
 * PDF is a scan" from "the parser was defeated", and the empty-string case
 * silently produced an empty prompt.
 *
 * Every failure is now a typed error with a stable code and a message written
 * for the person holding the file.
 */

export type ExtractionErrorCode =
  /** The extension/magic bytes are not a format we parse. */
  | "UNSUPPORTED_FILE_TYPE"
  /** Larger than `EXTRACTION_LIMITS.maxFileBytes`. */
  | "FILE_TOO_LARGE"
  /** Structurally invalid for its declared format. */
  | "MALFORMED_FILE"
  /** Password-protected, or encrypted with a permissions-only password. */
  | "ENCRYPTED"
  /** Structurally valid, but carries no extractable text (scans, images). */
  | "NO_TEXT_LAYER"
  /** Parsed successfully, produced nothing usable. */
  | "EXTRACTION_EMPTY"
  /** A declared resource ceiling was hit. */
  | "EXTRACTION_LIMIT"
  /** Anything else, wrapped so callers never see a raw parser exception. */
  | "EXTRACTION_FAILED";

export class ExtractionError extends Error {
  readonly code: ExtractionErrorCode;
  readonly fileName: string | undefined;

  constructor(code: ExtractionErrorCode, message: string, fileName?: string) {
    super(message);
    this.name = "ExtractionError";
    this.code = code;
    this.fileName = fileName;
  }
}

export function isExtractionError(value: unknown): value is ExtractionError {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { name?: string }).name === "ExtractionError"
  );
}

/** Human-readable, safe to show in the UI. Never contains a stack. */
export function describeExtractionError(error: unknown, fallbackName: string): string {
  if (isExtractionError(error)) {
    return error.fileName ? `${error.message} (${error.fileName})` : error.message;
  }
  const message = error instanceof Error ? error.message : String(error);
  return `Could not read "${fallbackName}": ${message}`;
}
