/**
 * DOCX text extraction.
 *
 * DOCX is a ZIP of XML parts. The previous implementation stripped every tag
 * with `/<[^>]+>/g` and collapsed all whitespace, which:
 *
 *   - merged every paragraph into one unbroken line, so heading structure and
 *     lists were lost before the pipeline ever saw them;
 *   - left entity references and `w:instrText` field codes in the text;
 *   - returned an empty string on any failure, which the pipeline could not
 *     distinguish from an empty document.
 *
 * This version walks the document body and preserves what the format actually
 * encodes: paragraph boundaries, heading levels, list markers, tabs, explicit
 * line breaks, and page breaks.
 *
 * Known limitation, stated rather than hidden: table cell boundaries are not
 * reconstructed. Cell paragraphs come through as ordinary paragraphs, so a
 * table's columns are not aligned in the extracted text.
 */

import { ExtractionError } from "./errors";
import { EXTRACTION_LIMITS } from "./limits";
import { readZipEntries } from "./zip";
import type { ExtractionSection } from "./types";

export interface DocxExtraction {
  text: string;
  sections: ExtractionSection[];
  headings: string[];
  warnings: string[];
  metadata: Record<string, string>;
}

/** OLE compound-file magic, which is what an encrypted OOXML file looks like. */
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

export function looksLikeOleCompoundFile(bytes: Uint8Array): boolean {
  if (bytes.length < OLE_MAGIC.length) return false;
  return OLE_MAGIC.every((byte, index) => bytes[index] === byte);
}

const PARAGRAPH_PATTERN = /<w:p(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/w:p>)/g;

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9A-Fa-f]+);/g, (_m, hex: string) => safeChar(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => safeChar(Number.parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function safeChar(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  if (code >= 0xd800 && code <= 0xdfff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

interface Paragraph {
  text: string;
  headingLevel: number | null;
  listMarker: string | null;
  pageBreakBefore: boolean;
}

const HEADING_LEVELS: Record<string, number> = {
  Title: 1,
  Heading1: 1,
  Heading2: 2,
  Heading3: 3,
  Heading4: 4,
  Heading5: 5,
  Heading6: 6,
  Subtitle: 2,
};

function readParagraph(inner: string): Paragraph {
  const styleMatch = /<w:pStyle\s+w:val="([^"]+)"/.exec(inner);
  const style = styleMatch?.[1];
  const headingLevel = style ? (HEADING_LEVELS[style] ?? (/^Heading(\d)$/.exec(style)?.[1] ? Number(/^Heading(\d)$/.exec(style)![1]) : null)) : null;

  const isList = /<w:numPr\b/.test(inner);
  const listLevel = /<w:ilvl\s+w:val="(\d+)"/.exec(inner);
  const indent = listLevel ? "  ".repeat(Math.min(Number(listLevel[1]), 3)) : "";
  const listMarker = isList ? `${indent}- ` : null;

  const pageBreakBefore = /<w:br\s+w:type="page"\s*\/?>|<w:pageBreakBefore\s*\/?>/.test(inner);

  // Runs and inline content, in document order.
  let text = "";
  const contentPattern = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>|<w:br\s+w:type="page"\s*\/>|<w:cr\s*\/>|<w:noBreakHyphen\s*\/>/g;
  for (const match of inner.matchAll(contentPattern)) {
    const token = match[0];
    // `match[1] !== undefined` is the reliable test for a text run: `<w:tab/>`
    // also begins with `<w:t`, and testing the prefix alone silently dropped
    // every tab.
    if (match[1] !== undefined) {
      text += decodeXml(match[1]);
    } else if (token.startsWith("<w:tab")) {
      text += "\t";
    } else if (token.includes('w:type="page"')) {
      text += "\n";
    } else if (token.startsWith("<w:br") || token.startsWith("<w:cr")) {
      text += "\n";
    } else if (token.startsWith("<w:noBreakHyphen")) {
      text += "-";
    }
  }

  return {
    // Collapse runs of spaces, but keep tabs, which are meaningful in lists.
    text: text.replace(/ {2,}/g, " ").replace(/\t{2,}/g, "\t").trim(),
    headingLevel,
    listMarker,
    pageBreakBefore,
  };
}

function parseDocumentXml(xml: string): Paragraph[] {
  if (xml.length > EXTRACTION_LIMITS.maxXmlChars) {
    throw new ExtractionError(
      "EXTRACTION_LIMIT",
      `Document body exceeds the ${Math.round(EXTRACTION_LIMITS.maxXmlChars / (1024 * 1024))} MB XML budget.`,
    );
  }

  const bodyStart = xml.indexOf("<w:body");
  const body = bodyStart >= 0 ? xml.slice(bodyStart) : xml;

  const paragraphs: Paragraph[] = [];
  PARAGRAPH_PATTERN.lastIndex = 0;
  for (const match of body.matchAll(PARAGRAPH_PATTERN)) {
    paragraphs.push(readParagraph(match[1] ?? ""));
  }
  return paragraphs;
}

/**
 * Extract text from a DOCX.
 *
 * @throws ExtractionError `ENCRYPTED`, `MALFORMED_FILE`, `UNSUPPORTED_FILE_TYPE`.
 */
export function extractDocxText(buffer: ArrayBuffer, fileName?: string): DocxExtraction {
  const bytes = new Uint8Array(buffer);

  if (looksLikeOleCompoundFile(bytes)) {
    throw new ExtractionError(
      "ENCRYPTED",
      "This file is a password-protected or legacy Word document. Open it in Word or LibreOffice and save it as an unencrypted .docx.",
      fileName,
    );
  }

  const entries = readZipEntries(buffer);
  const documentXml = entries.get("word/document.xml");
  const contentTypes = entries.get("Content_Types.xml") ?? entries.get("[Content_Types].xml");

  if (!documentXml) {
    const flavour = contentTypes
      ? /wordprocessingml/.test(new TextDecoder("utf-8").decode(contentTypes.data))
        ? "a Word package with a missing document body"
        : "a different Office format (the package is not WordprocessingML)"
      : "not an Office document";
    throw new ExtractionError("MALFORMED_FILE", `This .docx file is ${flavour}.`, fileName);
  }

  const warnings: string[] = [];
  const xml = new TextDecoder("utf-8").decode(documentXml.data);
  const paragraphs = parseDocumentXml(xml);

  if (paragraphs.length === 0) {
    throw new ExtractionError("EXTRACTION_EMPTY", "This .docx file contains no paragraphs.", fileName);
  }

  const headings: string[] = [];
  const sections: ExtractionSection[] = [];
  const lines: string[] = [];
  let pageNumber = 1;

  // A label plus a line buffer rather than a nullable section object: the
  // buffer cannot be narrowed into uselessness by the closures below, and an
  // empty section is simply never flushed.
  let sectionLabel: string | null = null;
  let sectionLines: string[] = [];

  const openSection = (label: string) => {
    flushSection();
    sectionLabel = label;
    sectionLines = [];
  };

  const flushSection = () => {
    if (sectionLabel !== null && sectionLines.join("").trim().length > 0) {
      sections.push({ label: sectionLabel, text: sectionLines.join("\n") });
    }
    sectionLines = [];
  };

  for (const paragraph of paragraphs) {
    if (paragraph.pageBreakBefore) {
      pageNumber++;
      openSection(`Page ${pageNumber}`);
    }

    if (paragraph.headingLevel !== null && paragraph.text.length > 0) {
      headings.push(paragraph.text);
      if (paragraph.headingLevel <= 2) openSection(paragraph.text);
    }

    const hashes = paragraph.headingLevel !== null ? "#".repeat(Math.min(paragraph.headingLevel, 6)) + " " : "";
    const line = paragraph.listMarker !== null
      ? `${paragraph.listMarker}${paragraph.text}`
      : `${hashes}${paragraph.text}`;

    lines.push(line);
    if (sectionLabel === null) sectionLabel = `Page ${pageNumber}`;
    sectionLines.push(line);
  }

  flushSection();

  const text = lines.join("\n").replace(/\n{4,}/g, "\n\n\n").trim();
  if (text.length === 0) {
    throw new ExtractionError(
      "NO_TEXT_LAYER",
      "This .docx file contains no text — it may consist only of images or embedded objects.",
      fileName,
    );
  }

  // Tracked changes leave both the deleted and inserted runs in document.xml.
  // Detecting the markers is cheap; reporting them is the honest thing to do.
  if (/<w:del\b/.test(xml)) {
    warnings.push("Document contains tracked changes; deleted text may be included.");
  }
  if (/<w:instrText\b/.test(xml)) {
    warnings.push("Document contains field codes, which are not evaluated.");
  }

  return {
    text,
    sections,
    headings: headings.slice(0, 60),
    warnings,
    metadata: readCoreProperties(entries),
  };
}

function readCoreProperties(entries: Map<string, { data: Uint8Array }>): Record<string, string> {
  const metadata: Record<string, string> = {};
  const core = entries.get("docProps/core.xml");
  if (!core) return metadata;
  const xml = new TextDecoder("utf-8").decode(core.data);
  const pick = (tag: string): string | undefined => {
    const match = new RegExp(`<(?:dc|cp|dcterms):${tag}[^>]*>([\\s\\S]*?)</(?:dc|cp|dcterms):${tag}>`).exec(xml);
    return match ? decodeXml(match[1].trim()) : undefined;
  };
  const title = pick("title");
  const creator = pick("creator");
  const created = pick("created");
  const modified = pick("modified");
  if (title) metadata.title = title;
  if (creator) metadata.author = creator;
  if (created) metadata.created = created;
  if (modified) metadata.modified = modified;
  return metadata;
}
