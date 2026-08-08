import type { PipelineContext } from "./types";

export async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
  const mime = file.type;

  if (mime === "text/plain" || mime === "text/markdown" || ext === ".txt" || ext === ".md") {
    return await file.text();
  }

  if (mime === "application/pdf" || ext === ".pdf") {
    return extractPDF(await file.arrayBuffer());
  }

  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || ext === ".docx") {
    return extractDOCX(await file.arrayBuffer());
  }

  throw { code: "UNSUPPORTED_FILE", message: `Cannot extract text from "${file.name}". Supported: .txt, .md, .pdf, .docx` };
}

function extractPDF(buffer: ArrayBuffer): string {
  const text = new TextDecoder("utf-8").decode(buffer);
  const matches = text.match(/\/Text\(([^)]*)\)/g);
  if (matches) return matches.map((m) => m.replace("/Text(", "").replace(")", "")).join("\n");
  const streamMatch = text.match(/stream\n([\s\S]*?)\nendstream/g);
  if (streamMatch) return streamMatch.map((m) => m.replace("stream\n", "").replace("\nendstream", "")).join("\n");
  const clean = text.replace(/[^a-zA-Z0-9\s.,;:!?()\-'"]/g, " ").replace(/\s+/g, " ").trim();
  if (clean.length > 50) return clean;
  return "";
}

function extractDOCX(buffer: ArrayBuffer): string {
  try {
    const bytes = new Uint8Array(buffer);
    const files = parseZipEntries(buffer);
    const xml = files["word/document.xml"];
    if (!xml) return "";
    return xml
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

function parseZipEntries(buffer: ArrayBuffer): Record<string, string> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const files: Record<string, string> = {};
  const readStr = (pos: number, len: number) => new TextDecoder("utf-8").decode(bytes.slice(pos, pos + len));

  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (bytes[i] === 0x50 && bytes[i+1] === 0x4b && bytes[i+2] === 0x05 && bytes[i+3] === 0x06) {
      eocd = i; break;
    }
  }
  if (eocd < 0) return files;

  const cdOffset = view.getUint32(eocd + 16, true);
  const cdEntries = view.getUint16(eocd + 8, true);
  let pos = cdOffset;

  for (let i = 0; i < cdEntries; i++) {
    if (readStr(pos, 4) !== "PK\u0001\u0002") break;
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const compSize = view.getUint32(pos + 20, true);
    const compMethod = view.getUint16(pos + 10, true);
    const fileName = readStr(pos + 46, nameLen);
    pos += 46 + nameLen + extraLen + commentLen;
    if (fileName.endsWith("/")) continue;
    if (localOffset > bytes.length - 4) continue;
    if (!(bytes[localOffset] === 0x50 && bytes[localOffset+1] === 0x4b)) continue;
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    let raw: Uint8Array<ArrayBufferLike> = bytes.slice(dataStart, dataStart + compSize);
    if (compMethod === 8) {
      try {
        raw = inflateRaw(raw);
      } catch {
        continue;
      }
    } else if (compMethod !== 0) {
      continue;
    }
    files[fileName] = new TextDecoder("utf-8").decode(raw);
  }

  return files;
}

/* Minimal raw-DEFLATE (deflate without zlib header) inflater. */

type Huffman = Record<number, number>;
interface HuffmanState { data: Uint8Array; offset: number }

function addCode(tree: Huffman, code: number, bits: number): void {
  tree[code] = bits;
}

function readBits(t: HuffmanState, n: number): number {
  let result = 0;
  for (let i = 0; i < n; i++) {
    result |= ((t.data[t.offset >> 3] >> (t.offset & 7)) & 1) << i;
    t.offset++;
  }
  return result;
}

function buildFixedLitTree(): Huffman {
  const tree: Huffman = {};
  for (let i = 0; i <= 143; i++) addCode(tree, i, 8);
  for (let i = 144; i <= 255; i++) addCode(tree, i, 9);
  for (let i = 256; i <= 279; i++) addCode(tree, i, 7);
  for (let i = 280; i <= 287; i++) addCode(tree, i, 8);
  return tree;
}

function buildFixedDistTree(): Huffman {
  const tree: Huffman = {};
  for (let i = 0; i < 30; i++) addCode(tree, i, 5);
  return tree;
}

const CODE_LENGTHS_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

function decodeSymbols(t: HuffmanState, lengths: number[]): Huffman {
  const tree: Huffman = {};
  let maxLen = 0;
  for (const len of lengths) maxLen = Math.max(maxLen, len);
  const count = new Array(maxLen + 1).fill(0);
  for (const len of lengths) if (len > 0) count[len]++;
  const nextCode = new Array(maxLen + 1).fill(0);
  let code = 0;
  for (let bits = 1; bits <= maxLen; bits++) {
    code = (code + count[bits - 1]) << 1;
    nextCode[bits] = code;
  }
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i];
    if (len > 0) tree[nextCode[len]++] = i;
  }
  return tree;
}

function readHuffman(t: HuffmanState, tree: Huffman): number {
  let code = 0;
  for (let i = 0; i < 16; i++) {
    const bit = (t.data[t.offset >> 3] & (1 << (t.offset & 7))) !== 0 ? 1 : 0;
    t.offset++;
    code = (code << 1) | bit;
    if (tree[code] !== undefined) return tree[code];
  }
  throw new Error("Bad Huffman code");
}

function buildDynamicTrees(t: HuffmanState): { litTree: Huffman; distTree: Huffman; offset: number } {
  const hl = readBits(t, 5) + 257;
  const hd = readBits(t, 5) + 1;
  const hc = readBits(t, 4) + 4;
  const codeLengths = new Array(19).fill(0);
  for (let i = 0; i < hc; i++) codeLengths[CODE_LENGTHS_ORDER[i]] = readBits(t, 3);
  const codeTree = decodeSymbols(t, codeLengths);
  const lengths: number[] = [];
  while (lengths.length < hl + hd) {
    const sym = readHuffman(t, codeTree);
    if (sym < 16) {
      lengths.push(sym);
    } else if (sym === 16) {
      const prev = lengths[lengths.length - 1] || 0;
      const rep = 3 + readBits(t, 2);
      for (let i = 0; i < rep; i++) lengths.push(prev);
    } else if (sym === 17) {
      const rep = 3 + readBits(t, 3);
      for (let i = 0; i < rep; i++) lengths.push(0);
    } else if (sym === 18) {
      const rep = 11 + readBits(t, 7);
      for (let i = 0; i < rep; i++) lengths.push(0);
    }
  }
  const litLengths = lengths.slice(0, hl);
  const distLengths = lengths.slice(hl);
  return { litTree: decodeSymbols(t, litLengths), distTree: decodeSymbols(t, distLengths), offset: t.offset };
}

function decompressHuffman(t: HuffmanState, litTree: Huffman, distTree: Huffman): { data: number[]; offset: number } {
  const output: number[] = [];
  while (true) {
    const sym = readHuffman(t, litTree);
    if (sym <= 255) {
      output.push(sym);
    } else if (sym === 256) {
      break;
    } else {
      const li = sym - 257;
      const length = LENGTH_BASE[li] + readBits(t, LENGTH_EXTRA[li]);
      const di = readHuffman(t, distTree);
      const distance = DIST_BASE[di] + readBits(t, DIST_EXTRA[di]);
      for (let i = 0; i < length; i++) {
        output.push(output[output.length - distance]);
      }
    }
  }
  return { data: output, offset: t.offset };
}

function inflateRaw(data: Uint8Array): Uint8Array {
  const output: number[] = [];
  let i = 0;

  while (i < data.length) {
    const bfinal = data[i] & 1;
    const btype = (data[i] >> 1) & 3;
    i++;

    if (btype === 0) {
      if (i + 4 > data.length) break;
      const len = data[i] | (data[i + 1] << 8);
      for (let j = 0; j < len && i + 4 + j < data.length; j++) output.push(data[i + 4 + j]);
      i += 4 + len;
    } else if (btype === 1) {
      const fixedLitTree = buildFixedLitTree();
      const fixedDistTree = buildFixedDistTree();
      const result = decompressHuffman({ data, offset: i }, fixedLitTree, fixedDistTree);
      output.push(...result.data);
      i = result.offset;
    } else if (btype === 2) {
      const t: HuffmanState = { data, offset: i };
      const { litTree, distTree, offset } = buildDynamicTrees(t);
      i = offset;
      const result = decompressHuffman({ data, offset: i }, litTree, distTree);
      output.push(...result.data);
      i = result.offset;
    }

    if (bfinal) break;
  }
  return new Uint8Array(output);
}

function detectLanguage(text: string): string {
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
  return text.split("\n")
    .filter((l) => /^#{1,4}\s|^[A-Z][A-Z\s]{2,}:$|^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$/.test(l.trim()))
    .slice(0, 25);
}

function extractKeywords(text: string): string[] {
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
  const freq: Record<string, number> = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k]) => k);
}

function extractConcepts(keywords: string[]): string[] {
  return keywords.filter((k) => k.length > 5).slice(0, 10);
}

function extractObjectives(headings: string[], keywords: string[]): string[] {
  const obj: string[] = [];
  for (const h of headings) {
    if (/\b(introduction|overview|goal|objective|purpose|aim|learning|outcome)\b/i.test(h)) {
      obj.push(h);
    }
  }
  if (obj.length === 0) {
    obj.push(`Understand ${keywords.slice(0, 3).join(", ")}`);
  }
  return obj.slice(0, 5);
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

export async function executeDocument(ctx: PipelineContext): Promise<DocumentResult> {
  const files = ctx.input.files;
  if (!files || files.length === 0) {
    return { text: "", chars: 0, words: 0, language: "en", headings: [], keywords: [], concepts: [], objectives: [], error: null };
  }

  const texts: string[] = [];
  for (const file of files) {
    const extracted = await extractTextFromFile(file);
    if (extracted.length === 0) {
      throw { code: "EXTRACTION_EMPTY", message: `Text extraction returned 0 characters for "${file.name}". The file may be empty or use an unsupported format.` };
    }
    texts.push(`--- ${file.name} ---\n${extracted}`);
  }

  const fullText = texts.join("\n\n");
  const chars = fullText.length;
  const words = fullText.split(/\s+/).filter(Boolean).length;
  const language = detectLanguage(fullText);
  const headings = extractHeadings(fullText);
  const keywords = extractKeywords(fullText);
  const concepts = extractConcepts(keywords);
  const objectives = extractObjectives(headings, keywords);

  return {
    text: fullText,
    chars,
    words,
    language,
    headings,
    keywords,
    concepts,
    objectives,
    error: null,
  };
}
