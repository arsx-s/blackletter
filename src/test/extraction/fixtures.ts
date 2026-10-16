/**
 * Fixture builders for extraction tests.
 *
 * Every fixture is generated here rather than stored as a binary blob, for two
 * reasons: the bytes are reviewable in the test that uses them, and a fixture
 * cannot silently rot into something the parser no longer accepts.
 *
 * The PDF builder deliberately writes no `xref` table. The parser does not read
 * one, which is a design decision, and the fixtures hold it to that: if the
 * parser ever grows a dependency on well-formed xref offsets, these tests will
 * fail. That is the intended signal.
 */

import { deflateSync } from "node:zlib";

/* ------------------------------------------------------------------- PDF */

export interface PdfPageSpec {
  /** Raw content-stream body. Omit to get a page with a content stream but no text. */
  content?: string;
  /** Compress the content stream with FlateDecode. */
  compress?: boolean;
  /** Extra entries for the page dictionary, e.g. a different `/Resources`. */
  pageExtra?: string;
}

export interface PdfOptions {
  pages: PdfPageSpec[];
  /** Extra indirect objects, keyed by object number. Body text, no `obj` wrapper. */
  extraObjects?: Record<number, string>;
  /** Add `/Encrypt` to the trailer. */
  encrypt?: boolean;
  /** Prefix the header with junk bytes, which real files sometimes have. */
  junkPrefix?: string;
  /** Omit the `%PDF-` header entirely. */
  omitHeader?: boolean;
  /** Report a font with no encoding mapping. */
  opaqueFont?: boolean;
  /** Replace the default font object's dictionary body entirely. */
  fontObject?: string;
  /** Replace the page's `/Font << … >>` entries, e.g. `"/F1 3 0 R /F2 7 0 R"`. */
  resourceFonts?: string;
  /** Move the catalog into a Flate-compressed object stream (PDF 1.5 style). */
  catalogInObjectStream?: boolean;
}

function contentDict(spec: PdfPageSpec, length: number): string {
  return spec.compress
    ? `<< /Length ${length} /Filter /FlateDecode >>`
    : `<< /Length ${length} >>`;
}

/**
 * Build a structurally-plausible PDF. Object numbers are allocated in the order
 * pages are declared: 1 = catalog, 2 = page tree, then three objects per page
 * (page, content, and a shared font is object 3 when only one page exists).
 */
export function buildPdf(options: PdfOptions): Uint8Array {
  const chunks: string[] = [];
  if (options.junkPrefix) chunks.push(options.junkPrefix);
  if (!options.omitHeader) chunks.push("%PDF-1.4\n");

  // Object 1: catalog. Object 2: page tree. Object 3: font.
  const pageObjectNumbers: number[] = [];
  let next = 4;
  for (let i = 0; i < options.pages.length; i++) {
    pageObjectNumbers.push(next);
    next += 2; // page + content
  }

  if (!options.catalogInObjectStream) {
    chunks.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  } else {
    // A catalog living inside a compressed object stream, which is how PDF 1.5+
    // files are usually written. Object 1 exists only inside the stream.
    const payload = `<< /Type /Catalog /Pages 2 0 R >>`;
    const header = `1 0 `;
    const combined = new TextEncoder().encode(header + payload);
    const compressed = deflateSync(combined);
    chunks.push(
      `90 0 obj\n<< /Type /ObjStm /N 1 /First ${header.length} /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n${latin1FromBytes(compressed)}\nendstream\nendobj\n`,
    );
  }
  chunks.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjectNumbers.map((n) => `${n} 0 R`).join(" ")}] /Count ${options.pages.length} >>\nendobj\n`,
  );

  const fontObject = options.fontObject
    ? `3 0 obj\n${options.fontObject}\nendobj\n`
    : options.opaqueFont
      ? `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /UnknownSans >>\nendobj\n`
      : `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`;
  chunks.push(fontObject);

  options.pages.forEach((spec, index) => {
    const pageNumber = pageObjectNumbers[index];
    const contentNumber = pageNumber + 1;
    const body = spec.content ?? "";
    const raw = new TextEncoder().encode(body);
    const encoded = spec.compress ? deflateSync(raw) : raw;
    const encodedText = latin1FromBytes(encoded);

    const fontEntries = options.resourceFonts ?? "F1 3 0 R";
    chunks.push(
      `${pageNumber} 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << ${fontEntries.replace(/([A-Za-z0-9]+) (\d+ 0 R)/g, "/$1 $2")} >> >> /Contents ${contentNumber} 0 R${spec.pageExtra ?? ""} >>\nendobj\n`,
    );
    chunks.push(
      `${contentNumber} 0 obj\n${contentDict(spec, encoded.length)}\nstream\n${encodedText}\nendstream\nendobj\n`,
    );
  });

  for (const [num, body] of Object.entries(options.extraObjects ?? {})) {
    chunks.push(`${num} 0 obj\n${body}\nendobj\n`);
  }

  const encryptEntry = options.encrypt ? " /Encrypt 99 0 R" : "";
  chunks.push(`trailer\n<< /Size ${next} /Root 1 0 R${encryptEntry} >>\nstartxref\n0\n%%EOF\n`);

  return latin1ToBytes(chunks.join(""));
}

/** Byte-preserving latin1 conversion, so binary stream data survives a round trip. */
export function latin1ToBytes(value: string): Uint8Array {
  const out = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) out[i] = value.charCodeAt(i) & 0xff;
  return out;
}

export function latin1FromBytes(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

/* ------------------------------------------------------------------ DOCX */

interface ZipEntrySpec {
  name: string;
  /** Text content; encoded as UTF-8. */
  text: string;
  /** Compress with DEFLATE instead of storing. */
  deflate?: boolean;
}

/**
 * Write a ZIP archive using the **stored** compression method.
 *
 * Stored entries keep this builder readable and make the tests exercise the
 * reader's structural checks rather than its decompression. A separate test
 * covers DEFLATE directly, and one fixture uses a deflated entry so the DOCX
 * path is verified with real compression too.
 */
export function buildZip(entries: ZipEntrySpec[]): Uint8Array {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const rawBytes = encoder.encode(entry.text);
    // For a deflated entry the *local header* must describe the compressed
    // payload, and the central directory the uncompressed size, which is what
    // the reader checks its budget against.
    const dataBytes = entry.deflate ? new Uint8Array(deflateSync(rawBytes)) : rawBytes;
    const method = entry.deflate ? 8 : 0;

    const local = new Uint8Array(30 + nameBytes.length + dataBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, method, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, 0, true); // crc is not verified by the reader
    localView.setUint32(18, dataBytes.length, true);
    localView.setUint32(22, rawBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(dataBytes, 30 + nameBytes.length);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, method, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, 0, true);
    centralView.setUint32(20, dataBytes.length, true);
    centralView.setUint32(24, rawBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    localChunks.push(local);
    centralChunks.push(central);
    offset += local.length;
  }

  const centralSize = centralChunks.reduce((total, chunk) => total + chunk.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  const total =
    localChunks.reduce((sum, chunk) => sum + chunk.length, 0) + centralSize + end.length;
  const out = new Uint8Array(total);
  let position = 0;
  for (const chunk of localChunks) {
    out.set(chunk, position);
    position += chunk.length;
  }
  for (const chunk of centralChunks) {
    out.set(chunk, position);
    position += chunk.length;
  }
  out.set(end, position);
  return out;
}

export interface DocxOptions {
  /** The `word/document.xml` body, without the XML declaration. */
  body?: string;
  /** Omit `word/document.xml`, to exercise the malformed-package path. */
  omitDocument?: boolean;
  /** Include `docProps/core.xml` metadata. */
  metadata?: boolean;
  /** DEFLATE-compress `word/document.xml`, as real writers do. */
  deflateDocument?: boolean;
  /** Extra entries, for exercising the reader's structural checks. */
  extraEntries?: ZipEntrySpec[];
}

const WORD_NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

export function buildDocx(options: DocxOptions = {}): Uint8Array {
  const entries: ZipEntrySpec[] = [
    {
      name: "[Content_Types].xml",
      text:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        "<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>" +
        "</Types>",
    },
    { name: "_rels/.rels", text: '<?xml version="1.0"?><Relationships/>' },
  ];

  if (!options.omitDocument) {
    entries.push({
      name: "word/document.xml",
      text:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        `<w:document ${WORD_NS}><w:body>${options.body ?? ""}</w:body></w:document>`,
      deflate: options.deflateDocument,
    });
  }

  if (options.metadata) {
    entries.push({
      name: "docProps/core.xml",
      text:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
        'xmlns:dc="http://purl.org/dc/elements/1.1/">' +
        "<dc:title>Thermal Conduction Report</dc:title>" +
        "<dc:creator>A. Researcher</dc:creator>" +
        "</cp:coreProperties>",
    });
  }

  return buildZip(entries);
}

export function paragraph(text: string, style?: string, listLevel?: number): string {
  const properties: string[] = [];
  if (style) properties.push(`<w:pStyle w:val="${style}"/>`);
  if (listLevel !== undefined) {
    properties.push(`<w:numPr><w:ilvl w:val="${listLevel}"/><w:numId w:val="1"/></w:numPr>`);
  }
  const pPr = properties.length > 0 ? `<w:pPr>${properties.join("")}</w:pPr>` : "";
  return `<w:p>${pPr}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

/* ------------------------------------------------------------------ files */

export function makeFile(name: string, bytes: Uint8Array, type = ""): File {
  // A fresh buffer: `bytes` may be a view onto a larger allocation.
  return new File([new Uint8Array(bytes)], name, { type });
}

export function makeTextFile(name: string, text: string, type = "text/plain"): File {
  return new File([text], name, { type });
}
