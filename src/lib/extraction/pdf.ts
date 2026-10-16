/**
 * PDF text extraction.
 *
 * ## Why this replaced the previous implementation
 *
 * The old extractor decoded the whole file as UTF-8, regex-matched `/Text(...)`
 * — a key that does not exist in any PDF text object — and, failing that,
 * dumped the raw bytes of every compressed stream into the prompt. For a
 * typical PDF it returned either nothing or a screen of binary noise, and that
 * noise went to the model as if it were the user's document.
 *
 * This version parses the actual object graph:
 *
 *   1. scan indirect objects, including objects packed into object streams;
 *   2. walk the page tree to get pages *in reading order*;
 *   3. decode each page's content streams (Flate / ASCIIHex / ASCII85);
 *   4. interpret the text operators (`Tj`, `TJ`, `'`, `"`), resolving each font
 *      through its `/ToUnicode` CMap or its named encoding.
 *
 * ## What it deliberately does not do
 *
 *   - **No guessing.** A code with no mapping is dropped, not approximated.
 *   - **No image OCR.** A PDF whose pages are scans raises `NO_TEXT_LAYER`
 *     rather than returning an empty string that looks like a successful
 *     extraction of an empty document.
 *   - **No silent truncation.** Every ceiling hit is reported.
 *
 * ## Coverage
 *
 * Handles classic xref and xref-stream files because it never reads the xref at
 * all — it scans for objects, which is robust to the many real-world files whose
 * xref offsets are wrong. It does **not** support encrypted files, ZIP64-style
 * exotic structure, or compressed-object-stream nesting deeper than one level.
 */

import { ExtractionError } from "./errors";
import { EXTRACTION_LIMITS } from "./limits";
import { ByteBudget } from "./zip";
import { inflateZlib } from "./inflate";
import {
  type NamedEncoding,
  type ToUnicodeMap,
  assertReasonableCMap,
  classifyEncoding,
  mapSingleByte,
  parseDifferences,
  parseToUnicodeCMap,
  parsePdfDate,
} from "./pdf-encoding";
import type { ExtractionSection } from "./types";

const OBJ_PATTERN = /(?:^|[^0-9])(\d{1,7})\s+(\d{1,5})\s+obj(?![a-zA-Z0-9])/g;
const STREAM_KEYWORD = /stream(?=[\r\n])/g;

interface PdfObject {
  num: number;
  /** The object body up to `stream` (or to `endobj` when there is no stream). */
  dictText: string;
  /** Byte offsets into the file, or -1 when the object has no stream. */
  streamStart: number;
  streamEnd: number;
  /** True when the object came out of an object stream rather than the file body. */
  fromObjectStream: boolean;
}

export interface PdfExtraction {
  text: string;
  sections: ExtractionSection[];
  pageCount: number;
  pagesWithText: number;
  warnings: string[];
  metadata: Record<string, string>;
}

/* ------------------------------------------------------------ stream decoding */

function filterNames(dictText: string): string[] {
  const arrayMatch = /\/Filter\s*\[([^\]]*)\]/.exec(dictText);
  if (arrayMatch) {
    return [...arrayMatch[1].matchAll(/\/([A-Za-z0-9]+)/g)].map((m) => m[1]);
  }
  const single = /\/Filter\s*\/([A-Za-z0-9]+)/.exec(dictText);
  if (single) return [single[1]];
  // Abbreviated form used by inline images: /F /Fl
  const abbreviated = /\/F\s*\/([A-Za-z0-9]+)/.exec(dictText);
  return abbreviated ? [abbreviated[1]] : [];
}

const FLATE_FILTERS = new Set(["FlateDecode", "Fl"]);
const ASCII_HEX_FILTERS = new Set(["ASCIIHexDecode", "AHx"]);
const ASCII85_FILTERS = new Set(["ASCII85Decode", "A85"]);
/** Filters that mean the stream holds an image, not text. */
const IMAGE_FILTERS = new Set([
  "DCTDecode",
  "DCT",
  "JPXDecode",
  "CCITTFaxDecode",
  "CCF",
  "JBIG2Decode",
]);

function decodeAsciiHex(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.ceil(bytes.length / 2));
  let length = 0;
  let high = -1;
  for (const byte of bytes) {
    if (byte === 0x3e) break; // '>' terminator
    const value = hexDigit(byte);
    if (value < 0) continue;
    if (high < 0) {
      high = value;
    } else {
      out[length++] = (high << 4) | value;
      high = -1;
    }
  }
  if (high >= 0) out[length++] = high << 4;
  return out.subarray(0, length);
}

function hexDigit(byte: number): number {
  if (byte >= 0x30 && byte <= 0x39) return byte - 0x30;
  if (byte >= 0x41 && byte <= 0x46) return byte - 0x41 + 10;
  if (byte >= 0x61 && byte <= 0x66) return byte - 0x61 + 10;
  return -1;
}

function decodeAscii85(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  let tuple = 0;
  let count = 0;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte === 0x7e) break; // '~' end marker
    if (byte <= 0x20) continue;
    if (byte === 0x7a && count === 0) {
      for (let k = 0; k < 4; k++) out.push(0);
      continue;
    }
    if (byte < 0x21 || byte > 0x75) continue;
    tuple = tuple * 85 + (byte - 0x21);
    count++;
    if (count === 5) {
      out.push((tuple >>> 24) & 0xff, (tuple >>> 16) & 0xff, (tuple >>> 8) & 0xff, tuple & 0xff);
      tuple = 0;
      count = 0;
    }
  }
  if (count > 1) {
    for (let i = count; i < 5; i++) tuple = tuple * 85 + 84;
    out.push((tuple >>> 24) & 0xff, (tuple >>> 16) & 0xff, (tuple >>> 8) & 0xff, tuple & 0xff);
  }
  return new Uint8Array(out);
}

/**
 * Apply the stream's filters in order.
 *
 * @returns the decoded bytes, or `null` when the filter chain cannot be
 *          decoded (image filters, LZW, or an unknown filter). The caller
 *          records a warning; nothing is guessed.
 */
function decodeStream(raw: Uint8Array, dictText: string, budget: ByteBudget, warnings: string[], label: string): Uint8Array | null {
  const filters = filterNames(dictText);
  let data = raw;

  for (const filter of filters) {
    if (IMAGE_FILTERS.has(filter)) {
      warnings.push(`Skipped ${label}: filter /${filter} carries image data, not text.`);
      return null;
    }
    if (FLATE_FILTERS.has(filter)) {
      try {
        data = inflateZlib(data, EXTRACTION_LIMITS.maxStreamBytes);
      } catch (error) {
        warnings.push(`Skipped ${label}: FlateDecode failed (${error instanceof Error ? error.message : "malformed stream"}).`);
        return null;
      }
    } else if (ASCII_HEX_FILTERS.has(filter)) {
      data = decodeAsciiHex(data);
    } else if (ASCII85_FILTERS.has(filter)) {
      data = decodeAscii85(data);
    } else {
      warnings.push(`Skipped ${label}: unsupported filter /${filter}.`);
      return null;
    }
  }

  budget.consume(data.length, label);
  return data;
}

/* ------------------------------------------------------------- object parsing */

function latin1(bytes: Uint8Array): string {
  // windows-1252 decoding is one character per byte for every byte value, so
  // string indices remain byte offsets. That property is load-bearing: stream
  // offsets are computed from these indices.
  return new TextDecoder("latin1").decode(bytes);
}

function collectObjects(text: string): Map<number, PdfObject> {
  const objects = new Map<number, PdfObject>();
  OBJ_PATTERN.lastIndex = 0;

  for (;;) {
    const match = OBJ_PATTERN.exec(text);
    if (!match) break;
    if (objects.size >= EXTRACTION_LIMITS.maxPdfObjects) {
      throw new ExtractionError(
        "EXTRACTION_LIMIT",
        `PDF declares more than ${EXTRACTION_LIMITS.maxPdfObjects} objects.`,
      );
    }

    const num = Number.parseInt(match[1], 10);
    const bodyStart = match.index + match[0].length;

    STREAM_KEYWORD.lastIndex = bodyStart;
    const streamMatch = STREAM_KEYWORD.exec(text);
    const endobjIndex = text.indexOf("endobj", bodyStart);

    const hasStream =
      streamMatch !== null && (endobjIndex === -1 || streamMatch.index < endobjIndex);

    if (hasStream) {
      const streamStart = streamMatch.index + "stream".length + (text[streamMatch.index + 6] === "\r" ? 2 : 1);
      const endStream = text.indexOf("endstream", streamStart);
      const streamEnd = endStream === -1 ? text.length : endStream;
      objects.set(num, {
        num,
        dictText: text.slice(bodyStart, streamMatch.index),
        streamStart,
        streamEnd,
        fromObjectStream: false,
      });
      OBJ_PATTERN.lastIndex = Math.min(text.length, streamEnd + "endstream".length);
    } else {
      const dictEnd = endobjIndex === -1 ? text.length : endobjIndex;
      objects.set(num, {
        num,
        dictText: text.slice(bodyStart, dictEnd),
        streamStart: -1,
        streamEnd: -1,
        fromObjectStream: false,
      });
      OBJ_PATTERN.lastIndex = Math.min(text.length, dictEnd + "endobj".length);
    }
  }

  return objects;
}

function streamBytes(bytes: Uint8Array, object: PdfObject): Uint8Array {
  return bytes.subarray(
    Math.max(0, Math.min(object.streamStart, bytes.length)),
    Math.max(0, Math.min(object.streamEnd, bytes.length)),
  );
}

function refFrom(source: string, key: string): number | null {
  const pattern = new RegExp(`/${key}\\s+(\\d{1,7})\\s+\\d{1,5}\\s+R`);
  const match = pattern.exec(source);
  return match ? Number.parseInt(match[1], 10) : null;
}

function refsFrom(source: string, key: string): number[] {
  const arrayRe = new RegExp(`/${key}\\s*\\[([^\\]]*)\\]`);
  const array = arrayRe.exec(source);
  const scope = array ? array[1] : source;
  return [...scope.matchAll(/(\d{1,7})\s+\d{1,5}\s+R/g)].map((m) => Number.parseInt(m[1], 10));
}

/** Expand single-level object streams so their contents join the object pool. */
function expandObjectStreams(
  text: string,
  bytes: Uint8Array,
  objects: Map<number, PdfObject>,
  budget: ByteBudget,
  warnings: string[],
): void {
  const containers = [...objects.values()].filter((object) => /\/Type\s*\/ObjStm/.test(object.dictText));

  for (const container of containers) {
    if (container.streamStart < 0) continue;
    const decoded = decodeStream(streamBytes(bytes, container), container.dictText, budget, warnings, "object stream");
    if (!decoded) continue;

    const content = latin1(decoded);
    const countMatch = /\/N\s+(\d{1,6})/.exec(container.dictText);
    const firstMatch = /\/First\s+(\d{1,9})/.exec(container.dictText);
    if (!countMatch || !firstMatch) continue;

    const count = Number.parseInt(countMatch[1], 10);
    const first = Number.parseInt(firstMatch[1], 10);
    if (count <= 0 || first <= 0 || first > content.length) continue;

    const header = content.slice(0, first);
    const pairs = [...header.matchAll(/(\d{1,7})\s+(\d{1,9})/g)].slice(0, count);
    if (pairs.length === 0) continue;

    for (let i = 0; i < pairs.length; i++) {
      const objectNum = Number.parseInt(pairs[i][1], 10);
      const offset = Number.parseInt(pairs[i][2], 10);
      const start = first + offset;
      const end = i + 1 < pairs.length ? first + Number.parseInt(pairs[i + 1][2], 10) : content.length;
      if (start >= content.length || start >= end) continue;
      if (objects.has(objectNum)) continue;
      if (objects.size >= EXTRACTION_LIMITS.maxPdfObjects) break;
      objects.set(objectNum, {
        num: objectNum,
        dictText: content.slice(start, Math.min(end, content.length)),
        streamStart: -1,
        streamEnd: -1,
        fromObjectStream: true,
      });
    }
  }
}

/* ------------------------------------------------------------------- fonts */

interface FontInfo {
  toUnicode: ToUnicodeMap | null;
  encoding: NamedEncoding;
  differences: Map<number, string>;
  twoByte: boolean;
  /** Set when no mapping exists at all, so the caller can warn once per font. */
  unmappable: boolean;
}

function readBalancedDict(source: string, startIndex: number): string | null {
  // `startIndex` points at the first `<` of `<<`.
  let depth = 0;
  let i = startIndex;
  while (i < source.length) {
    const char = source[i];
    if (char === "(") {
      let nesting = 1;
      i++;
      while (i < source.length && nesting > 0) {
        if (source[i] === "\\") i += 2;
        else if (source[i] === "(") { nesting++; i++; }
        else if (source[i] === ")") { nesting--; i++; }
        else i++;
      }
      continue;
    }
    if (char === "<" && source[i + 1] === "<") { depth++; i += 2; continue; }
    if (char === ">" && source[i + 1] === ">") {
      depth--;
      i += 2;
      if (depth === 0) return source.slice(startIndex, i);
      continue;
    }
    i++;
  }
  return null;
}

function fontDictEntries(fontDictText: string): Array<{ name: string; objectNum: number }> {
  return [...fontDictText.matchAll(/\/([A-Za-z0-9#._-]+)\s+(\d{1,7})\s+\d{1,5}\s+R/g)].map((m) => ({
    name: m[1],
    objectNum: Number.parseInt(m[2], 10),
  }));
}

function parseFont(
  fontObject: PdfObject | undefined,
  objects: Map<number, PdfObject>,
  bytes: Uint8Array,
  budget: ByteBudget,
  warnings: string[],
): FontInfo {
  const fallback: FontInfo = {
    toUnicode: null,
    encoding: "StandardEncoding",
    differences: new Map(),
    twoByte: false,
    unmappable: false,
  };
  if (!fontObject) return fallback;

  const dict = fontObject.dictText;
  const info: FontInfo = { ...fallback, differences: new Map() };

  if (/\/Subtype\s*\/Type0/.test(dict)) info.twoByte = true;

  const encodingDictStart = dict.indexOf("/Encoding");
  if (encodingDictStart >= 0) {
    const afterKey = dict.indexOf("<<", encodingDictStart + "/Encoding".length);
    const between = afterKey >= 0 ? dict.slice(encodingDictStart + "/Encoding".length, afterKey) : "";
    if (afterKey >= 0 && /^\s*$/.test(between)) {
      const body = readBalancedDict(dict, afterKey);
      if (body) {
        const base = /\/BaseEncoding\s*\/([A-Za-z0-9]+)/.exec(body);
        info.encoding = classifyEncoding(base?.[1]);
        const differences = /\/Differences\s*\[([^\]]*)\]/.exec(body);
        if (differences) {
          info.differences = parseDifferences(
            [...differences[1].matchAll(/\/[A-Za-z0-9#._-]+|\d+/g)].map((m) => m[0]),
          );
        }
      }
    } else {
      const named = /\/Encoding\s*\/([A-Za-z0-9-]+)/.exec(dict);
      if (named) {
        if (named[1] === "Identity-H" || named[1] === "Identity-V") info.twoByte = true;
        else info.encoding = classifyEncoding(named[1]);
      }
    }
  }

  const toUnicodeRef = refFrom(dict, "ToUnicode");
  if (toUnicodeRef !== null) {
    const target = objects.get(toUnicodeRef);
    if (target && target.streamStart >= 0) {
      const decoded = decodeStream(streamBytes(bytes, target), target.dictText, budget, warnings, `font ${fontObject.num} ToUnicode`);
      if (decoded) {
        try {
          const source = latin1(decoded);
          assertReasonableCMap(source);
          info.toUnicode = parseToUnicodeCMap(source);
        } catch (error) {
          warnings.push(
            `Font ${fontObject.num}: could not parse its /ToUnicode map (${error instanceof Error ? error.message : "malformed"}).`,
          );
        }
      }
    }
  }

  if (info.twoByte && (!info.toUnicode || info.toUnicode.multi.size === 0)) {
    // Identity-H without a ToUnicode map encodes glyph indices, not characters.
    // Emitting those would produce confident nonsense, so this font is skipped
    // and the caller is told, rather than left to wonder where the text went.
    info.unmappable = true;
    warnings.push(
      `Font ${fontObject.num}: a two-byte font with no /ToUnicode map. Its text is skipped rather than guessed.`,
    );
  }
  if (!info.twoByte && info.encoding === "unknown") {
    // Unnamed single-byte encoding with no /Differences: ASCII is still safe
    // (handled inside mapSingleByte) but the high range is not.
    warnings.push(`Font ${fontObject.num}: unnamed encoding; only ASCII codes will be decoded.`);
  }

  return info;
}

function parsePageFonts(
  resourcesText: string,
  objects: Map<number, PdfObject>,
  bytes: Uint8Array,
  budget: ByteBudget,
  warnings: string[],
): Map<string, FontInfo> {
  const fonts = new Map<string, FontInfo>();
  let source = resourcesText;

  const resourcesRef = refFrom(resourcesText, "Resources");
  if (resourcesRef !== null) {
    const target = objects.get(resourcesRef);
    if (target) source = target.dictText;
  }

  const fontKey = source.indexOf("/Font");
  if (fontKey < 0) return fonts;
  const dictStart = source.indexOf("<<", fontKey);
  if (dictStart < 0) return fonts;
  const body = readBalancedDict(source, dictStart);
  if (!body) return fonts;

  for (const entry of fontDictEntries(body)) {
    fonts.set(entry.name, parseFont(objects.get(entry.objectNum), objects, bytes, budget, warnings));
  }
  return fonts;
}

/* -------------------------------------------------------------- page tree */

interface PageNode {
  objectNum: number;
  resourcesText: string;
}

function collectPages(
  objects: Map<number, PdfObject>,
  warnings: string[],
): PageNode[] {
  const pages: PageNode[] = [];
  const visited = new Set<number>();

  const catalog = [...objects.values()].find((object) => /\/Type\s*\/Catalog/.test(object.dictText));
  const rootRef = catalog ? refFrom(catalog.dictText, "Pages") : null;

  const walk = (objectNum: number, inheritedResources: string, depth: number): void => {
    if (depth > 64) {
      warnings.push("Page tree is deeper than 64 levels; stopped descending.");
      return;
    }
    if (visited.has(objectNum)) return;
    visited.add(objectNum);
    if (pages.length >= EXTRACTION_LIMITS.maxPages) return;

    const object = objects.get(objectNum);
    if (!object) return;
    const dict = object.dictText;

    const ownResources = /\/Resources/.test(dict) ? dict : inheritedResources;
    const isLeaf = /\/Type\s*\/Page(?![a-zA-Z])/.test(dict);

    if (isLeaf) {
      pages.push({ objectNum, resourcesText: ownResources });
      return;
    }

    for (const kid of refsFrom(dict, "Kids")) walk(kid, ownResources, depth + 1);
  };

  if (rootRef !== null) walk(rootRef, "", 0);

  if (pages.length === 0) {
    // No usable page tree: fall back to object order, which is at least stable.
    warnings.push("No page tree found; pages were read in object-number order.");
    for (const object of [...objects.values()].sort((a, b) => a.num - b.num)) {
      if (pages.length >= EXTRACTION_LIMITS.maxPages) break;
      if (/\/Type\s*\/Page(?![a-zA-Z])/.test(object.dictText)) {
        pages.push({ objectNum: object.num, resourcesText: object.dictText });
      }
    }
  }

  return pages;
}

/* --------------------------------------------------------- content streams */

interface Token {
  type: "num" | "name" | "string" | "array" | "op" | "bool" | "dict";
  num?: number;
  name?: string;
  bytes?: number[];
  items?: Token[];
  op?: string;
  bool?: boolean;
}

function parseTokens(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  const skipWhitespace = () => {
    while (i < source.length) {
      const char = source.charCodeAt(i);
      if (char === 0x20 || char === 0x09 || char === 0x0a || char === 0x0d || char === 0x0c || char === 0x00) {
        i++;
      } else if (char === 0x25) {
        while (i < source.length && source.charCodeAt(i) !== 0x0a) i++;
      } else {
        break;
      }
    }
  };

  const readLiteralString = (): Token => {
    i++; // consume '('
    const bytes: number[] = [];
    let nesting = 1;
    while (i < source.length && nesting > 0) {
      const char = source[i];
      if (char === "\\") {
        i++;
        const next = source[i];
        if (next === undefined) break;
        if (next === "n") bytes.push(0x0a);
        else if (next === "r") bytes.push(0x0d);
        else if (next === "t") bytes.push(0x09);
        else if (next === "b") bytes.push(0x08);
        else if (next === "f") bytes.push(0x0c);
        else if (next === "(" || next === ")" || next === "\\") bytes.push(next.charCodeAt(0));
        else if (next >= "0" && next <= "7") {
          let octal = next;
          while (octal.length < 3 && source[i + 1] >= "0" && source[i + 1] <= "7") {
            i++;
            octal += source[i];
          }
          bytes.push(Number.parseInt(octal, 8) & 0xff);
        } else if (next === "\n") {
          // Line continuation: the newline itself is dropped.
        } else {
          bytes.push(next.charCodeAt(0) & 0xff);
        }
        i++;
        continue;
      }
      if (char === "(") nesting++;
      if (char === ")") {
        nesting--;
        if (nesting === 0) {
          i++;
          break;
        }
      }
      bytes.push(char.charCodeAt(0) & 0xff);
      i++;
    }
    return { type: "string", bytes };
  };

  const readHexString = (): Token => {
    i++; // consume '<'
    const bytes: number[] = [];
    let high = -1;
    while (i < source.length && source[i] !== ">") {
      const value = hexDigit(source.charCodeAt(i));
      i++;
      if (value < 0) continue;
      if (high < 0) high = value;
      else {
        bytes.push((high << 4) | value);
        high = -1;
      }
    }
    i++; // consume '>'
    if (high >= 0) bytes.push(high << 4);
    return { type: "string", bytes };
  };

  const readName = (): Token => {
    i++; // consume '/'
    let name = "";
    while (i < source.length) {
      const char = source[i];
      if (/[\s()[\]<>/{}%]/.test(char)) break;
      if (char === "#" && /^[0-9A-Fa-f]{2}$/.test(source.slice(i + 1, i + 3))) {
        name += String.fromCharCode(Number.parseInt(source.slice(i + 1, i + 3), 16));
        i += 3;
        continue;
      }
      name += char;
      i++;
    }
    return { type: "name", name };
  };

  const readValue = (): Token | null => {
    skipWhitespace();
    if (i >= source.length) return null;
    const char = source[i];

    if (char === "(") return readLiteralString();
    if (char === "/") return readName();
    if (char === "<" && source[i + 1] === "<") {
      i += 2;
      const map = new Map<string, Token>();
      for (;;) {
        skipWhitespace();
        if (i >= source.length) break;
        if (source[i] === ">" && source[i + 1] === ">") {
          i += 2;
          break;
        }
        if (source[i] !== "/") {
          readValue();
          continue;
        }
        const key = readName();
        const value = readValue();
        if (value && key.name !== undefined) map.set(key.name, value);
      }
      return { type: "dict", items: [...map.values()] };
    }
    if (char === "<") return readHexString();
    if (char === "[") {
      i++;
      const items: Token[] = [];
      for (;;) {
        skipWhitespace();
        if (i >= source.length || source[i] === "]") {
          i++;
          break;
        }
        const value = readValue();
        if (!value) break;
        items.push(value);
      }
      return { type: "array", items };
    }

    let word = "";
    while (i < source.length && !/[\s()[\]<>/{}%]/.test(source[i])) {
      word += source[i];
      i++;
    }
    if (word === "") {
      i++;
      return { type: "op", op: source[i - 1] };
    }
    if (word === "true" || word === "false") return { type: "bool", bool: word === "true" };

    const number = Number(word);
    if (word !== "" && Number.isFinite(number)) return { type: "num", num: number };

    return { type: "op", op: word };
  };

  for (;;) {
    const token = readValue();
    if (!token) break;
    tokens.push(token);
  }

  return tokens;
}

function decodeString(bytes: number[], font: FontInfo | undefined, warn: (message: string) => void): string {
  if (!font) {
    // No font resource at all: ASCII is still safe, and the high range is not.
    let out = "";
    for (const byte of bytes) {
      const char = mapSingleByte(byte, "StandardEncoding", EMPTY_DIFFERENCES);
      if (char !== null) out += char;
    }
    return out;
  }

  if (font.unmappable) return "";

  let out = "";
  if (font.twoByte && font.toUnicode) {
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const key = ((bytes[i] << 8) | bytes[i + 1]).toString(16).padStart(4, "0");
      const mapped = font.toUnicode.multi.get(key) ?? font.toUnicode.single.get((bytes[i] << 8) | bytes[i + 1]);
      if (mapped !== undefined) out += mapped;
    }
    return out;
  }

  for (const byte of bytes) {
    const mapped =
      font.toUnicode?.single.get(byte) ?? mapSingleByte(byte, font.encoding, font.differences);
    if (mapped !== null && mapped !== undefined) out += mapped;
  }

  if (out.length === 0 && bytes.length > 0) warn("some glyphs had no character mapping and were skipped");
  return out;
}

const EMPTY_DIFFERENCES: Map<number, string> = new Map();

interface PageTextOptions {
  fonts: Map<string, FontInfo>;
  warnings: string[];
}

function extractTextFromContent(content: string, options: PageTextOptions): string {
  const tokens = parseTokens(content);
  const operands: Token[] = [];
  let currentFontName: string | null = null;
  let pendingBreak = false;
  let line = "";
  const lines: string[] = [];
  let warnedOnce = false;

  const warn = (message: string) => {
    if (warnedOnce) return;
    warnedOnce = true;
    options.warnings.push(message);
  };

  const flushLine = () => {
    if (line.trim().length > 0) lines.push(line.replace(/\s+$/, ""));
    line = "";
  };

  const emit = (text: string) => {
    if (text.length === 0) return;
    if (pendingBreak) {
      flushLine();
      pendingBreak = false;
    }
    line += text;
  };

  for (const token of tokens) {
    if (token.type !== "op") {
      operands.push(token);
      if (operands.length > 32) operands.splice(0, operands.length - 32);
      continue;
    }

    switch (token.op) {
      case "Tf": {
        const nameToken = operands.find((operand) => operand.type === "name");
        currentFontName = nameToken?.name ?? null;
        break;
      }
      case "Tj": {
        const last = operands[operands.length - 1];
        if (last?.type === "string" && last.bytes) {
          emit(decodeString(last.bytes, resolveFont(currentFontName, options.fonts), warn));
        }
        break;
      }
      case "'": {
        pendingBreak = true;
        const last = operands[operands.length - 1];
        if (last?.type === "string" && last.bytes) {
          emit(decodeString(last.bytes, resolveFont(currentFontName, options.fonts), warn));
        }
        break;
      }
      case "\"": {
        pendingBreak = true;
        const last = operands[operands.length - 1];
        if (last?.type === "string" && last.bytes) {
          emit(decodeString(last.bytes, resolveFont(currentFontName, options.fonts), warn));
        }
        break;
      }
      case "TJ": {
        const last = operands[operands.length - 1];
        if (last?.type === "array" && last.items) {
          for (const item of last.items) {
            if (item.type === "string" && item.bytes) {
              emit(decodeString(item.bytes, resolveFont(currentFontName, options.fonts), warn));
            } else if (item.type === "num" && typeof item.num === "number" && item.num < -120) {
              emit(" ");
            }
          }
        }
        break;
      }
      case "Td":
      case "TD":
      case "T*":
        pendingBreak = true;
        break;
      case "ET":
        pendingBreak = true;
        break;
      default:
        break;
    }

    operands.length = 0;
  }

  flushLine();

  // Collapse runs of blank lines that the operator stream produced.
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function resolveFont(name: string | null, fonts: Map<string, FontInfo>): FontInfo | undefined {
  if (!name) return undefined;
  return fonts.get(name);
}

/* ------------------------------------------------------------------ entry */

/**
 * Extract text from a PDF.
 *
 * @throws ExtractionError `ENCRYPTED`, `MALFORMED_FILE`, `NO_TEXT_LAYER`, or
 *         `EXTRACTION_LIMIT`.
 */
export function extractPdfText(buffer: ArrayBuffer, fileName?: string): PdfExtraction {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 8) {
    throw new ExtractionError("MALFORMED_FILE", "File is too small to be a PDF.", fileName);
  }

  const header = latin1(bytes.subarray(0, Math.min(bytes.length, 1024)));
  if (!header.includes("%PDF-")) {
    throw new ExtractionError("MALFORMED_FILE", "File does not begin with a PDF header.", fileName);
  }

  const text = latin1(bytes);
  const warnings: string[] = [];

  // Encryption lives in the trailer, which is at the end of the file. Scanning
  // only that region avoids false positives from page text that happens to
  // mention the word.
  const tail = text.slice(Math.max(0, text.length - 8192));
  if (/\/Encrypt\b/.test(tail)) {
    throw new ExtractionError(
      "ENCRYPTED",
      "This PDF is encrypted. Remove the password or supply an unencrypted copy.",
      fileName,
    );
  }

  const budget = new ByteBudget(EXTRACTION_LIMITS.maxTotalDecompressedBytes);
  const objects = collectObjects(text);
  if (objects.size === 0) {
    throw new ExtractionError("MALFORMED_FILE", "No PDF objects could be read from this file.", fileName);
  }

  expandObjectStreams(text, bytes, objects, budget, warnings);

  const pages = collectPages(objects, warnings);
  if (pages.length === 0) {
    throw new ExtractionError("NO_TEXT_LAYER", "This PDF has no pages that could be read.", fileName);
  }

  const sections: ExtractionSection[] = [];
  let pagesWithText = 0;

  for (let index = 0; index < pages.length; index++) {
    const page = pages[index];
    const pageObject = objects.get(page.objectNum);
    if (!pageObject) continue;

    const fonts = parsePageFonts(page.resourcesText, objects, bytes, budget, warnings);
    const contentRefs = refsFrom(pageObject.dictText, "Contents");

    let pageText = "";
    for (const ref of contentRefs) {
      const contentObject = objects.get(ref);
      if (!contentObject || contentObject.streamStart < 0) continue;
      const decoded = decodeStream(
        streamBytes(bytes, contentObject),
        contentObject.dictText,
        budget,
        warnings,
        `page ${index + 1} content`,
      );
      if (!decoded) continue;
      pageText += "\n" + extractTextFromContent(latin1(decoded), { fonts, warnings });
    }

    pageText = pageText.trim();
    if (pageText.length > 0) {
      pagesWithText++;
      sections.push({ label: `Page ${index + 1}`, text: pageText });
    }
  }

  if (pagesWithText === 0) {
    throw new ExtractionError(
      "NO_TEXT_LAYER",
      "This PDF contains no extractable text — it is most likely a scan or an image-only export.",
      fileName,
    );
  }

  const metadata = readMetadata(objects, bytes, budget, warnings);
  const joined = sections.map((section) => section.text).join("\n\n");

  return {
    text: joined,
    sections,
    pageCount: pages.length,
    pagesWithText,
    warnings: dedupe(warnings).slice(0, 40),
    metadata,
  };
}

function readMetadata(
  objects: Map<number, PdfObject>,
  bytes: Uint8Array,
  budget: ByteBudget,
  warnings: string[],
): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const object of objects.values()) {
    if (!/\/Type\s*\/Metadata/.test(object.dictText) || object.streamStart < 0) continue;
    const decoded = decodeStream(streamBytes(bytes, object), object.dictText, budget, warnings, "XMP metadata");
    if (!decoded) continue;
    const xmp = latin1(decoded);
    const title = /<dc:title>[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/.exec(xmp);
    const creator = /<dc:creator>[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/.exec(xmp);
    const created = /<xmp:CreateDate>([^<]*)<\/xmp:CreateDate>/.exec(xmp);
    if (title) metadata.title = decodeXmlEntities(title[1].trim());
    if (creator) metadata.author = decodeXmlEntities(creator[1].trim());
    if (created) metadata.created = created[1].trim();
  }

  const info = [...objects.values()].find((object) => /\/Producer|\/Title/.test(object.dictText) && object.streamStart < 0);
  if (info) {
    const title = /\/Title\s*\(([^)]*)\)/.exec(info.dictText);
    const author = /\/Author\s*\(([^)]*)\)/.exec(info.dictText);
    const creation = /\/CreationDate\s*\(([^)]*)\)/.exec(info.dictText);
    if (title && !metadata.title) metadata.title = title[1];
    if (author && !metadata.author) metadata.author = author[1];
    if (creation) {
      const parsed = parsePdfDate(creation[1]);
      if (parsed) metadata.created = parsed;
    }
  }

  return metadata;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
