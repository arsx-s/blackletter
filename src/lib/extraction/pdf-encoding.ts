/**
 * PDF character encodings.
 *
 * A PDF does not store Unicode. A text-showing operator yields *codes*, and the
 * code→character mapping lives in the font resource: either a `/ToUnicode` CMap
 * embedded in the file, or one of the named single-byte encodings.
 *
 * The previous implementation skipped all of this and returned raw bytes, which
 * is why its output for anything but the simplest PDF was garbage. The rule here
 * is the opposite: if a code cannot be mapped with confidence, it is **not**
 * emitted. Returning less text is strictly better than returning wrong text,
 * because wrong text is indistinguishable from a bad model answer downstream.
 */

import { ExtractionError } from "./errors";

/* ------------------------------------------------------- named encodings */

/**
 * WinAnsiEncoding for 0x80–0x9F. Everything else follows Latin-1, which is what
 * WinAnsiEncoding is: Latin-1 with a different C1 range.
 */
const WIN_ANSI_HIGH = [
  "\u20AC", // 0x80 Euro
  "\uFFFD", // 0x81 undefined
  "\u201A", // 0x82 single low quotation mark
  "\u0192", // 0x83 florin
  "\u201E", // 0x84 double low quotation mark
  "\u2026", // 0x85 ellipsis
  "\u2020", // 0x86 dagger
  "\u2021", // 0x87 double dagger
  "\u02C6", // 0x88 circumflex
  "\u2030", // 0x89 per mille
  "\u0160", // 0x8A S caron
  "\u2039", // 0x8B single left angle quote
  "\u0152", // 0x8C OE
  "\uFFFD", // 0x8D undefined
  "\u017D", // 0x8E Z caron
  "\uFFFD", // 0x8F undefined
  "\uFFFD", // 0x90 undefined
  "\u2018", // 0x91 left single quote
  "\u2019", // 0x92 right single quote
  "\u201C", // 0x93 left double quote
  "\u201D", // 0x94 right double quote
  "\u2022", // 0x95 bullet
  "\u2013", // 0x96 en dash
  "\u2014", // 0x97 em dash
  "\u02DC", // 0x98 small tilde
  "\u2122", // 0x99 trademark
  "\u0161", // 0x9A s caron
  "\u203A", // 0x9B single right angle quote
  "\u0153", // 0x9C oe
  "\uFFFD", // 0x9D undefined
  "\u017E", // 0x9E z caron
  "\u0178", // 0x9F Y diaeresis
];

export type NamedEncoding = "WinAnsiEncoding" | "StandardEncoding" | "MacRomanEncoding" | "unknown";

export function classifyEncoding(name: string | undefined): NamedEncoding {
  if (!name) return "StandardEncoding";
  if (name === "WinAnsiEncoding") return "WinAnsiEncoding";
  if (name === "StandardEncoding") return "StandardEncoding";
  if (name === "MacRomanEncoding") return "MacRomanEncoding";
  return "unknown";
}

/**
 * Map a single-byte font code to a character, or `null` when the mapping is not
 * known with confidence.
 *
 * @param namedEncoding the font's `/Encoding`
 * @param differences   `/Differences` overrides, keyed by code
 */
export function mapSingleByte(
  code: number,
  namedEncoding: NamedEncoding,
  differences: Map<number, string>,
): string | null {
  const override = differences.get(code);
  if (override !== undefined) return override;

  // ASCII is identical in all three named encodings, so it is always safe.
  if (code >= 0x20 && code <= 0x7e) return String.fromCharCode(code);
  if (code === 0x09 || code === 0x0a || code === 0x0d) return String.fromCharCode(code);

  if (namedEncoding === "WinAnsiEncoding") {
    if (code >= 0x80 && code <= 0x9f) {
      const mapped = WIN_ANSI_HIGH[code - 0x80];
      return mapped === "\uFFFD" ? null : mapped;
    }
    if (code >= 0xa0 && code <= 0xff) return String.fromCharCode(code);
    return null;
  }

  if (namedEncoding === "StandardEncoding") {
    // StandardEncoding's high range is close enough to Latin-1 for the letters,
    // but several slots differ. Only the slots that are certain are mapped.
    if (code >= 0xa0 && code <= 0xff) return String.fromCharCode(code);
    return null;
  }

  // MacRoman and anything unnamed: no high-range mapping, and the caller is
  // told so. Guessing here would silently corrupt accented text.
  return null;
}

/* --------------------------------------------------------------- glyph names */

/** Glyph names that are not simply the character itself. */
const GLYPH_NAMES: Record<string, string> = {
  space: " ",
  exclam: "!",
  quotedbl: '"',
  numbersign: "#",
  dollar: "$",
  percent: "%",
  ampersand: "&",
  quotesingle: "'",
  parenleft: "(",
  parenright: ")",
  asterisk: "*",
  plus: "+",
  comma: ",",
  hyphen: "-",
  period: ".",
  slash: "/",
  colon: ":",
  semicolon: ";",
  less: "<",
  equal: "=",
  greater: ">",
  question: "?",
  at: "@",
  bracketleft: "[",
  backslash: "\\",
  bracketright: "]",
  asciicircum: "^",
  underscore: "_",
  grave: "`",
  braceleft: "{",
  bar: "|",
  braceright: "}",
  asciitilde: "~",
  nbspace: "\u00A0",
  endash: "\u2013",
  emdash: "\u2014",
  quotesinglbase: "\u201A",
  quotedblbase: "\u201E",
  quotedblleft: "\u201C",
  quotedblright: "\u201D",
  quoteleft: "\u2018",
  quoteright: "\u2019",
  guilsinglleft: "\u2039",
  guilsinglright: "\u203A",
  guillemotleft: "\u00AB",
  guillemotright: "\u00BB",
  bullet: "\u2022",
  ellipsis: "\u2026",
  dagger: "\u2020",
  daggerdbl: "\u2021",
  perthousand: "\u2030",
  fraction: "\u2044",
  florin: "\u0192",
  section: "\u00A7",
  paragraph: "\u00B6",
  degree: "\u00B0",
  plusminus: "\u00B1",
  multiply: "\u00D7",
  divide: "\u00F7",
  minus: "\u2212",
  lessequal: "\u2264",
  greaterequal: "\u2265",
  notequal: "\u2260",
  approxequal: "\u2248",
  infinity: "\u221E",
  integral: "\u222B",
  summation: "\u2211",
  radical: "\u221A",
  partialdiff: "\u2202",
  product: "\u220F",
  lozenge: "\u25CA",
  periodcentered: "\u00B7",
  germandbls: "\u00DF",
  ae: "\u00E6",
  oe: "\u0153",
  oslash: "\u00F8",
  AE: "\u00C6",
  OE: "\u0152",
  Oslash: "\u00D8",
  fi: "\uFB01",
  fl: "\uFB02",
  ff: "\uFB00",
  ffi: "\uFB03",
  ffl: "\uFB04",
  Delta: "\u0394",
  Omega: "\u03A9",
  mu: "\u03BC",
  pi: "\u03C0",
  sigma: "\u03C3",
  tau: "\u03C4",
  phi: "\u03C6",
  omega: "\u03C9",
  alpha: "\u03B1",
  beta: "\u03B2",
  gamma: "\u03B3",
  delta: "\u03B4",
  epsilon: "\u03B5",
  lambda: "\u03BB",
  theta: "\u03B8",
  euro: "\u20AC",
  trademark: "\u2122",
  copyright: "\u00A9",
  registered: "\u00AE",
  arrowleft: "\u2190",
  arrowup: "\u2191",
  arrowright: "\u2192",
  arrowdown: "\u2193",
  arrowboth: "\u2194",
  lessmuch: "\u226A",
  greaterequal2: "\u2265",
};

/** Resolve a glyph name to a character, or `null` if it is not recognised. */
export function glyphNameToChar(name: string): string | null {
  if (name.length === 1) return name;

  if (name.startsWith("uni") && name.length >= 7) {
    const code = Number.parseInt(name.slice(3, 7), 16);
    return Number.isFinite(code) ? safeCodePoint(code) : null;
  }
  if (name.length >= 2 && name[0] === "u") {
    const hex = name.slice(1);
    if (/^[0-9A-Fa-f]{4,6}$/.test(hex)) {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? safeCodePoint(code) : null;
    }
  }
  return GLYPH_NAMES[name] ?? null;
}

function safeCodePoint(code: number): string | null {
  if (code < 0 || code > 0x10ffff) return null;
  if (code >= 0xd800 && code <= 0xdfff) return null;
  try {
    return String.fromCodePoint(code);
  } catch {
    return null;
  }
}

/** Parse a PDF date string (`D:YYYYMMDD…`) into a stable ISO date, or `null`. */
export function parsePdfDate(value: string): string | null {
  const match = /^D?:?(\d{4})(\d{2})?(\d{2})?/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const y = Number(year);
  if (y < 1000 || y > 9999) return null;
  const m = month ? Number(month) : 1;
  const d = day ? Number(day) : 1;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/* ---------------------------------------------------------------- ToUnicode */

export interface ToUnicodeMap {
  /** Single-byte lookups. */
  single: Map<number, string>;
  /** Multi-byte lookups, keyed by the concatenated codes. */
  multi: Map<string, string>;
}

/**
 * Parse a `/ToUnicode` CMap stream.
 *
 * Supports both `beginbfchar` and `beginbfrange`, including the array form of
 * `bfrange`. This is the mapping that makes text extraction actually correct for
 * subsetted fonts, which is the norm in files produced by Word and LaTeX.
 */
export function parseToUnicodeCMap(source: string): ToUnicodeMap {
  const single = new Map<number, string>();
  const multi = new Map<string, string>();

  const bfchar = /beginbfchar([\s\S]*?)endbfchar/g;
  for (const block of source.matchAll(bfchar)) {
    for (const pair of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const key = pair[1];
      const value = hexToChar(pair[2]);
      if (value === null) continue;
      if (key.length <= 2) single.set(Number.parseInt(key, 16), value);
      else multi.set(key.toLowerCase(), value);
    }
  }

  const bfrange = /beginbfrange([\s\S]*?)endbfrange/g;
  for (const block of source.matchAll(bfrange)) {
    // Two shapes: `<lo> <hi> <dst>` and `<lo> <hi> [<d1> <d2> …]`
    const tripleRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    for (const triple of block[1].matchAll(tripleRe)) {
      const lo = Number.parseInt(triple[1], 16);
      const hi = Number.parseInt(triple[2], 16);
      const startValue = Number.parseInt(triple[3], 16);
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || !Number.isFinite(startValue)) continue;
      const span = Math.min(hi - lo, 65_535);
      for (let i = 0; i <= span; i++) {
        const mapped = safeCodePoint(startValue + i);
        if (mapped === null) continue;
        store(single, multi, triple[1], lo + i, mapped);
      }
    }

    const arrayRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([^\]]*)\]/g;
    for (const entry of block[1].matchAll(arrayRe)) {
      const lo = Number.parseInt(entry[1], 16);
      const destinations = [...entry[3].matchAll(/<([0-9A-Fa-f]+)>/g)];
      for (let i = 0; i < destinations.length; i++) {
        const mapped = hexToChar(destinations[i][1]);
        if (mapped === null) continue;
        store(single, multi, entry[1], lo + i, mapped);
      }
    }
  }

  return { single, multi };
}

function store(
  single: Map<number, string>,
  multi: Map<string, string>,
  keyHex: string,
  code: number,
  value: string,
): void {
  if (keyHex.length <= 2) single.set(code, value);
  else multi.set(code.toString(16).padStart(keyHex.length, "0").toLowerCase(), value);
}

function hexToChar(hex: string): string | null {
  if (hex.length === 0 || hex.length % 4 !== 0) {
    // A single 2-digit value is a byte, not a character, and cannot be decoded
    // without more context. Anything else here is malformed.
    return null;
  }
  let out = "";
  for (let i = 0; i < hex.length; i += 4) {
    const code = Number.parseInt(hex.slice(i, i + 4), 16);
    if (!Number.isFinite(code)) return null;
    const char = safeCodePoint(code);
    if (char === null) return null;
    out += char;
  }
  return out;
}

/** Read a `/Differences` array into a code→character map. */
export function parseDifferences(tokens: string[]): Map<number, string> {
  const map = new Map<number, string>();
  let code = -1;
  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      code = Number.parseInt(token, 10);
      continue;
    }
    if (!token.startsWith("/")) continue;
    const name = token.slice(1);
    if (code < 0) continue;
    const char = glyphNameToChar(name);
    if (char !== null) map.set(code, char);
    code++;
  }
  return map;
}

/** Guard against a CMap so large that parsing it would stall the tab. */
export function assertReasonableCMap(source: string): void {
  if (source.length > 4 * 1024 * 1024) {
    throw new ExtractionError("EXTRACTION_LIMIT", "Font Unicode map is unreasonably large.");
  }
}
