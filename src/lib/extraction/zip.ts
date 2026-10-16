/**
 * Hardened ZIP reader, used for DOCX.
 *
 * Derived from the reader that lived in `src/pipeline/documentEngine.ts`
 * (and its duplicate in `src/langgraph/nodes/DocumentNode.ts`), with the
 * guards that were missing:
 *
 *   - the declared uncompressed size is checked against a budget **before**
 *     allocating, so a zip bomb fails fast rather than after the fact;
 *   - the compression ratio is bounded;
 *   - entry names are rejected if they escape the archive (`..`, absolute
 *     paths, backslashes), because a DOCX is a file a user was handed;
 *   - CRC-agnostic but structure-strict: a truncated or inconsistent archive
 *     raises `MALFORMED_FILE` instead of returning a partial map that looks
 *     like a successful extraction.
 *
 * The reader deliberately does not implement the ZIP64 extensions. A DOCX over
 * 4 GB is not a case worth optimising for, and pretending to support it would
 * mean silently truncating instead of failing.
 */

import { inflateZlib } from "./inflate";
import { ExtractionError } from "./errors";
import { EXTRACTION_LIMITS } from "./limits";

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const SIGNATURES = {
  localFile: 0x04034b50,
  centralFile: 0x02014b50,
  endOfCentralDirectory: 0x06054b50,
  zip64EndOfCentralDirectoryLocator: 0x07064b50,
};

function readUint16(view: DataView, offset: number): number {
  if (offset + 2 > view.byteLength) throw new ExtractionError("MALFORMED_FILE", "Archive header is truncated.");
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number): number {
  if (offset + 4 > view.byteLength) throw new ExtractionError("MALFORMED_FILE", "Archive header is truncated.");
  return view.getUint32(offset, true);
}

function decodeName(bytes: Uint8Array): string {
  // UTF-8 is the common case. Names that are not valid UTF-8 still decode;
  // replacement characters in a name are harmless and are not a security
  // boundary. Path traversal is checked separately, on the decoded string.
  return new TextDecoder("utf-8").decode(bytes);
}

function assertSafeName(name: string): void {
  const normalised = name.replace(/\\/g, "/");
  if (normalised.startsWith("/") || /^[a-zA-Z]:/.test(normalised) || normalised.split("/").includes("..")) {
    throw new ExtractionError("MALFORMED_FILE", `Archive contains an entry with an unsafe path: "${name}".`);
  }
}

function findEndOfCentralDirectory(view: DataView): number {
  const minOffset = Math.max(0, view.byteLength - 65_557);
  for (let i = view.byteLength - 22; i >= minOffset; i--) {
    if (readUint32(view, i) === SIGNATURES.endOfCentralDirectory) return i;
  }
  return -1;
}

/**
 * Read every entry from a ZIP/DOCX archive.
 *
 * @throws ExtractionError with code `MALFORMED_FILE` or `EXTRACTION_LIMIT`.
 */
export function readZipEntries(buffer: ArrayBuffer): Map<string, ZipEntry> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  if (bytes.length < 22) {
    throw new ExtractionError("MALFORMED_FILE", "Archive is too small to be a ZIP container.");
  }

  const eocd = findEndOfCentralDirectory(view);
  if (eocd < 0) {
    throw new ExtractionError("MALFORMED_FILE", "Archive has no end-of-central-directory record.");
  }

  if (readUint32(view, eocd - 20) === SIGNATURES.zip64EndOfCentralDirectoryLocator && eocd >= 20) {
    throw new ExtractionError(
      "UNSUPPORTED_FILE_TYPE",
      "Archive uses ZIP64, which this reader does not support.",
    );
  }

  const entryCount = readUint16(view, eocd + 8);
  if (entryCount > EXTRACTION_LIMITS.maxZipEntries) {
    throw new ExtractionError(
      "EXTRACTION_LIMIT",
      `Archive declares ${entryCount} entries, above the ${EXTRACTION_LIMITS.maxZipEntries} entry limit.`,
    );
  }

  const centralOffset = readUint32(view, eocd + 16);
  if (centralOffset >= bytes.length) {
    throw new ExtractionError("MALFORMED_FILE", "Archive central directory offset is outside the file.");
  }

  const entries = new Map<string, ZipEntry>();
  const decompressedBudget = new ByteBudget(EXTRACTION_LIMITS.maxTotalDecompressedBytes);
  let position = centralOffset;

  for (let i = 0; i < entryCount; i++) {
    if (readUint32(view, position) !== SIGNATURES.centralFile) {
      throw new ExtractionError("MALFORMED_FILE", `Archive central directory ended early at entry ${i}.`);
    }

    const compressionMethod = readUint16(view, position + 10);
    const compressedSize = readUint32(view, position + 20);
    const uncompressedSize = readUint32(view, position + 24);
    const nameLength = readUint16(view, position + 28);
    const extraLength = readUint16(view, position + 30);
    const commentLength = readUint16(view, position + 32);
    const localOffset = readUint32(view, position + 42);
    const name = decodeName(bytes.subarray(position + 46, position + 46 + nameLength));
    position += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith("/")) continue;
    assertSafeName(name);

    if (uncompressedSize > EXTRACTION_LIMITS.maxStreamBytes) {
      throw new ExtractionError(
        "EXTRACTION_LIMIT",
        `Archive entry "${name}" declares ${uncompressedSize} bytes, above the per-entry limit.`,
      );
    }
    if (compressedSize > 0 && uncompressedSize / compressedSize > EXTRACTION_LIMITS.maxCompressionRatio) {
      throw new ExtractionError(
        "EXTRACTION_LIMIT",
        `Archive entry "${name}" has a compression ratio of ${Math.round(uncompressedSize / compressedSize)}:1.`,
      );
    }

    if (localOffset + 30 > bytes.length) {
      throw new ExtractionError("MALFORMED_FILE", `Archive entry "${name}" points outside the file.`);
    }
    if (readUint32(view, localOffset) !== SIGNATURES.localFile) {
      throw new ExtractionError("MALFORMED_FILE", `Archive entry "${name}" has no local header.`);
    }

    const localNameLength = readUint16(view, localOffset + 26);
    const localExtraLength = readUint16(view, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart + compressedSize > bytes.length) {
      throw new ExtractionError("MALFORMED_FILE", `Archive entry "${name}" is truncated.`);
    }

    const raw = bytes.subarray(dataStart, dataStart + compressedSize);
    let data: Uint8Array;
    if (compressionMethod === 0) {
      data = raw;
    } else if (compressionMethod === 8) {
      data = inflateZlib(raw, Math.min(EXTRACTION_LIMITS.maxStreamBytes, Math.max(uncompressedSize, 1)));
    } else {
      throw new ExtractionError(
        "UNSUPPORTED_FILE_TYPE",
        `Archive entry "${name}" uses compression method ${compressionMethod}, which is not supported.`,
      );
    }

    decompressedBudget.consume(data.length, `archive entry "${name}"`);
    entries.set(name, { name, data });
  }

  if (entries.size === 0) {
    throw new ExtractionError("MALFORMED_FILE", "Archive contains no files.");
  }

  return entries;
}

/** Tracks a shared byte budget across several decodes. */
export class ByteBudget {
  private used = 0;

  constructor(private readonly limit: number) {}

  consume(amount: number, subject: string): void {
    this.used += amount;
    if (this.used > this.limit) {
      throw new ExtractionError(
        "EXTRACTION_LIMIT",
        `Total decompressed size exceeded the ${Math.round(this.limit / (1024 * 1024))} MB budget while reading ${subject}.`,
      );
    }
  }

  get spent(): number {
    return this.used;
  }
}
