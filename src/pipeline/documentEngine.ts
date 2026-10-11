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

async function extractDOCX(buffer: ArrayBuffer): Promise<string> {
  try {
    const files = await parseZipEntries(buffer);
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

async function parseZipEntries(buffer: ArrayBuffer): Promise<Record<string, string>> {
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
        raw = await inflateRaw(raw);
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

/* Decompress DOCX ZIP entries off the JavaScript parsing path using the browser's native inflater. */

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser does not support document decompression");
  }
  const input = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const stream = new Blob([input]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const output = new Uint8Array(await new Response(stream).arrayBuffer());
  if (output.byteLength > 25 * 1024 * 1024) throw new Error("Document expands beyond the supported size");
  return output;
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
