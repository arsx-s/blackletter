import type { GraphState } from "../types";
import { log, logError } from "../logger";
import { analyzeDocuments, describeFailure } from "../../pipeline/documentEngine";

/**
 * Document ingestion stage.
 *
 * This node used to carry its own copy of the file parser — a third copy of the
 * PDF/DOCX/ZIP code, already diverged from the other two (it did not inflate
 * DEFLATE streams at all, and it reported different error codes). Parsing now
 * lives in exactly one place, `src/lib/extraction`, reached through
 * `analyzeDocuments`.
 *
 * Failures are reported with their real cause. The old code replaced every
 * distinct failure with the same sentence, so an encrypted PDF, a scan, and a
 * genuinely corrupt file were indistinguishable to the person holding it.
 */
export async function DocumentNode(state: GraphState): Promise<Partial<GraphState>> {
  log("NODE", "DocumentNode: extracting text from documents");
  const files = state.uploadedDocuments;
  if (!files || files.length === 0) {
    return { documentText: "", documentChars: 0, documentWords: 0 };
  }

  let analysis;
  try {
    analysis = await analyzeDocuments(files);
  } catch (error) {
    const failure = describeFailure(error, files[0]?.name ?? "document");
    logError("NODE", `DocumentNode: ${failure.code} — ${failure.message}`);
    return { error: failure.message, errorCode: failure.code };
  }

  if (analysis.text.trim().length === 0) {
    const message = `Text extraction produced no text for the attached file(s).`;
    logError("NODE", `DocumentNode: ${message}`);
    return { error: message, errorCode: "EXTRACTION_EMPTY" };
  }

  for (const warning of analysis.warnings) {
    log("NODE", `DocumentNode: ${warning}`);
  }
  for (const file of analysis.files) {
    log("NODE", `DocumentNode: ${file.name} → ${file.format}, ${file.chars} chars`);
  }
  log("NODE", `DocumentNode: extracted ${analysis.chars} chars, ${analysis.words} words, language=${analysis.language}`);

  return {
    documentText: analysis.text,
    documentChars: analysis.chars,
    documentWords: analysis.words,
    documentLanguage: analysis.language,
    documentHeadings: analysis.headings,
    documentKeywords: analysis.keywords,
    documentConcepts: analysis.concepts,
    documentObjectives: analysis.objectives,
    documentParts: analysis.parts,
    documentError: null,
  };
}
