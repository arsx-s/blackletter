/**
 * Bounded raw-DEFLATE and zlib inflater.
 *
 * Moved here from `src/pipeline/documentEngine.ts`, where it lived alongside a
 * verbatim copy in `src/langgraph/nodes/DocumentNode.ts`. Both copies are gone
 * and every caller shares this one.
 *
 * Three changes from the original:
 *
 *   1. **Output is bounded.** The original accumulated into a `number[]` that
 *      could grow until the process died, which is a decompression bomb. Every
 *      write now goes through `ByteWriter`, which throws once the caller's byte
 *      budget is exhausted.
 *   2. **Malformed back-references throw** instead of silently reading
 *      `undefined` and writing `NaN` into the output.
 *   3. **Canonical Huffman codes are keyed by (bit length, code).** The original
 *      keyed them by code value alone, which makes a 3-bit code and a 4-bit code
 *      with the same numeric value collide. That defect meant the inflater only
 *      ever produced correct output for *stored* (uncompressed) blocks — every
 *      genuinely compressed PDF stream was decoded to garbage or failed
 *      outright. There is now a round-trip test against the platform zlib for
 *      exactly this reason.
 */

import { ExtractionError } from "./errors";

interface BitReader {
  data: Uint8Array;
  offset: number;
}

/**
 * Canonical Huffman decoding table: `(bitLength << 24) | code` → symbol.
 *
 * A plain `code → symbol` map is wrong. Canonical codes are prefix-free in bit
 * terms but not in integer terms: the 3-bit code `010` and the 4-bit code
 * `0010` are both the number 2.
 */
type Huffman = Map<number, number>;

const CODE_LENGTHS_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

/** A growable output buffer with a hard ceiling. */
class ByteWriter {
  private buffer: Uint8Array;
  private length = 0;

  constructor(private readonly maxBytes: number) {
    this.buffer = new Uint8Array(Math.max(1, Math.min(maxBytes, 1 << 16)));
  }

  private ensure(extra: number): void {
    const required = this.length + extra;
    if (required > this.maxBytes) {
      throw new ExtractionError(
        "EXTRACTION_LIMIT",
        `Decompressed data exceeds the ${Math.round(this.maxBytes / (1024 * 1024))} MB budget.`,
      );
    }
    if (required <= this.buffer.length) return;
    let next = this.buffer.length;
    while (next < required) next *= 2;
    const grown = new Uint8Array(Math.min(next, this.maxBytes));
    grown.set(this.buffer.subarray(0, this.length));
    this.buffer = grown;
  }

  push(byte: number): void {
    this.ensure(1);
    this.buffer[this.length++] = byte & 0xff;
  }

  copyFromHistory(distance: number, length: number): void {
    if (distance < 1 || distance > this.length) {
      throw new ExtractionError("MALFORMED_FILE", "DEFLATE stream contains an out-of-range back-reference.");
    }
    this.ensure(length);
    for (let i = 0; i < length; i++) {
      this.buffer[this.length] = this.buffer[this.length - distance];
      this.length++;
    }
  }

  get size(): number {
    return this.length;
  }

  finish(): Uint8Array {
    return this.buffer.subarray(0, this.length);
  }
}

/** Read `count` bits, least-significant-bit first, as DEFLATE packs them. */
function readBits(reader: BitReader, count: number): number {
  let result = 0;
  for (let i = 0; i < count; i++) {
    const byte = reader.data[reader.offset >> 3];
    if (byte === undefined) {
      throw new ExtractionError("MALFORMED_FILE", "DEFLATE stream ended mid-value.");
    }
    result |= ((byte >> (reader.offset & 7)) & 1) << i;
    reader.offset++;
  }
  return result;
}

/** Build the canonical decoding table from per-symbol code lengths. */
function decodeSymbols(lengths: number[]): Huffman {
  const tree: Huffman = new Map();
  let maxLen = 0;
  for (const length of lengths) if (length > maxLen) maxLen = length;
  if (maxLen === 0 || maxLen > 15) {
    throw new ExtractionError("MALFORMED_FILE", "DEFLATE stream declares an invalid code length.");
  }

  const count = new Array(maxLen + 1).fill(0);
  for (const length of lengths) if (length > 0) count[length]++;

  const nextCode = new Array(maxLen + 1).fill(0);
  let code = 0;
  for (let bits = 1; bits <= maxLen; bits++) {
    code = (code + count[bits - 1]) << 1;
    nextCode[bits] = code;
  }

  for (let symbol = 0; symbol < lengths.length; symbol++) {
    const length = lengths[symbol];
    if (length > 0) tree.set((length << 24) | nextCode[length]++, symbol);
  }
  return tree;
}

let fixedLitCache: Huffman | null = null;
let fixedDistCache: Huffman | null = null;

function fixedLitTree(): Huffman {
  if (!fixedLitCache) {
    const lengths = new Array<number>(288);
    for (let i = 0; i <= 143; i++) lengths[i] = 8;
    for (let i = 144; i <= 255; i++) lengths[i] = 9;
    for (let i = 256; i <= 279; i++) lengths[i] = 7;
    for (let i = 280; i <= 287; i++) lengths[i] = 8;
    fixedLitCache = decodeSymbols(lengths);
  }
  return fixedLitCache;
}

function fixedDistTree(): Huffman {
  if (!fixedDistCache) fixedDistCache = decodeSymbols(new Array<number>(30).fill(5));
  return fixedDistCache;
}

/** Read one Huffman code, most-significant-bit first. */
function readHuffman(reader: BitReader, tree: Huffman): number {
  let code = 0;
  for (let length = 1; length <= 15; length++) {
    const byte = reader.data[reader.offset >> 3];
    if (byte === undefined) {
      throw new ExtractionError("MALFORMED_FILE", "DEFLATE stream ended inside a Huffman code.");
    }
    code = (code << 1) | ((byte >> (reader.offset & 7)) & 1);
    reader.offset++;
    const symbol = tree.get((length << 24) | code);
    if (symbol !== undefined) return symbol;
  }
  throw new ExtractionError("MALFORMED_FILE", "DEFLATE stream contains an invalid Huffman code.");
}

function dynamicTrees(reader: BitReader): { litTree: Huffman; distTree: Huffman } {
  const literals = readBits(reader, 5) + 257;
  const distances = readBits(reader, 5) + 1;
  const codeLengths = readBits(reader, 4) + 4;

  if (literals > 286 || distances > 30) {
    throw new ExtractionError("MALFORMED_FILE", "DEFLATE stream declares too many Huffman symbols.");
  }

  const codeLengthValues = new Array<number>(19).fill(0);
  for (let i = 0; i < codeLengths; i++) {
    codeLengthValues[CODE_LENGTHS_ORDER[i]] = readBits(reader, 3);
  }
  const codeTree = decodeSymbols(codeLengthValues);

  const lengths: number[] = [];
  const expected = literals + distances;
  while (lengths.length < expected) {
    const symbol = readHuffman(reader, codeTree);
    if (symbol < 16) {
      lengths.push(symbol);
    } else if (symbol === 16) {
      const previous = lengths[lengths.length - 1];
      if (previous === undefined) {
        throw new ExtractionError("MALFORMED_FILE", "DEFLATE stream repeats a code length before defining one.");
      }
      const repeat = 3 + readBits(reader, 2);
      for (let i = 0; i < repeat && lengths.length < expected; i++) lengths.push(previous);
    } else if (symbol === 17) {
      const repeat = 3 + readBits(reader, 3);
      for (let i = 0; i < repeat && lengths.length < expected; i++) lengths.push(0);
    } else if (symbol === 18) {
      const repeat = 11 + readBits(reader, 7);
      for (let i = 0; i < repeat && lengths.length < expected; i++) lengths.push(0);
    } else {
      throw new ExtractionError("MALFORMED_FILE", "DEFLATE stream references an undefined code-length symbol.");
    }
  }

  return {
    litTree: decodeSymbols(lengths.slice(0, literals)),
    distTree: decodeSymbols(lengths.slice(literals)),
  };
}

function inflateHuffman(reader: BitReader, litTree: Huffman, distTree: Huffman, out: ByteWriter): void {
  for (;;) {
    const symbol = readHuffman(reader, litTree);
    if (symbol < 256) {
      out.push(symbol);
      continue;
    }
    if (symbol === 256) return;

    const lengthIndex = symbol - 257;
    if (lengthIndex >= LENGTH_BASE.length) {
      throw new ExtractionError("MALFORMED_FILE", "DEFLATE stream references an undefined length code.");
    }
    const length = LENGTH_BASE[lengthIndex] + readBits(reader, LENGTH_EXTRA[lengthIndex]);

    const distanceSymbol = readHuffman(reader, distTree);
    if (distanceSymbol >= DIST_BASE.length) {
      throw new ExtractionError("MALFORMED_FILE", "DEFLATE stream references an undefined distance code.");
    }
    const distance = DIST_BASE[distanceSymbol] + readBits(reader, DIST_EXTRA[distanceSymbol]);
    out.copyFromHistory(distance, length);
  }
}

/**
 * Inflate a raw DEFLATE stream.
 *
 * @param data raw bytes, starting at the first block header
 * @param maxBytes hard ceiling on output; exceeding it throws `EXTRACTION_LIMIT`
 */
export function inflateRaw(data: Uint8Array, maxBytes: number): Uint8Array {
  const out = new ByteWriter(maxBytes);
  const reader: BitReader = { data, offset: 0 };

  for (;;) {
    if (reader.offset >> 3 >= data.length) {
      throw new ExtractionError("MALFORMED_FILE", "DEFLATE stream ended before its final block.");
    }
    const header = data[reader.offset >> 3];
    const bitOffset = reader.offset & 7;
    const bfinal = (header >> bitOffset) & 1;
    const btype = (header >> (bitOffset + 1)) & 3;
    reader.offset += 3;

    if (btype === 0) {
      // Stored block: skip to the next byte boundary, then read LEN/NLEN.
      reader.offset = (reader.offset + 7) & ~7;
      const start = reader.offset >> 3;
      if (start + 4 > data.length) {
        throw new ExtractionError("MALFORMED_FILE", "DEFLATE stored block header is truncated.");
      }
      const len = data[start] | (data[start + 1] << 8);
      const nlen = data[start + 2] | (data[start + 3] << 8);
      if ((len ^ 0xffff) !== nlen) {
        throw new ExtractionError("MALFORMED_FILE", "DEFLATE stored block length check failed.");
      }
      const bodyStart = start + 4;
      if (bodyStart + len > data.length) {
        throw new ExtractionError("MALFORMED_FILE", "DEFLATE stored block is truncated.");
      }
      for (let i = 0; i < len; i++) out.push(data[bodyStart + i]);
      reader.offset = (bodyStart + len) << 3;
    } else if (btype === 1) {
      inflateHuffman(reader, fixedLitTree(), fixedDistTree(), out);
    } else if (btype === 2) {
      const { litTree, distTree } = dynamicTrees(reader);
      inflateHuffman(reader, litTree, distTree, out);
    } else {
      throw new ExtractionError("MALFORMED_FILE", "DEFLATE stream declares a reserved block type.");
    }

    if (bfinal) break;
  }

  return out.finish();
}

/**
 * Inflate a zlib stream, which is what PDF `FlateDecode` and ZIP actually store:
 * a 2-byte header followed by raw DEFLATE.
 */
export function inflateZlib(data: Uint8Array, maxBytes: number): Uint8Array {
  if (data.length < 2) {
    throw new ExtractionError("MALFORMED_FILE", "Compressed stream is too short to be zlib data.");
  }
  const cmf = data[0];
  const flg = data[1];
  if ((cmf & 0x0f) !== 8) {
    throw new ExtractionError("MALFORMED_FILE", "Unsupported compression method in zlib stream.");
  }
  if (((cmf << 8) | flg) % 31 !== 0) {
    throw new ExtractionError("MALFORMED_FILE", "zlib header checksum is invalid.");
  }
  if (flg & 0x20) {
    // A preset dictionary is legal but rare, and we cannot reconstruct it.
    throw new ExtractionError("MALFORMED_FILE", "zlib stream requires a preset dictionary, which is not supported.");
  }
  return inflateRaw(data.subarray(2), maxBytes);
}
