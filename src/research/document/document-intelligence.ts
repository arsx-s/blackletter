import type {
  ResearchDocument,
  ResearchSource,
  DocumentComparison,
  SourceType,
} from "../types";
import { SOURCE_TYPE_LABELS } from "../types";

let idCounter = 0;
function genId(prefix: string): string {
  idCounter++;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

export class DocumentIntelligence {
  processDocument(
    fileName: string,
    fileType: string,
    content: string,
    sourceOverrides?: Partial<ResearchSource>,
  ): ResearchDocument {
    const wordCount = content.split(/\s+/).filter((w) => w.length > 0).length;
    const concepts = this.extractConcepts(content);
    const entities = this.extractEntities(content);
    const summary = this.generateSummary(content);

    const source: ResearchSource = {
      id: genId("src"),
      title: fileName.replace(/\.[^/.]+$/, ""),
      authors: [],
      sourceType: this.inferSourceType(fileName, fileType, content),
      publicationDate: new Date().toISOString().split("T")[0],
      credibilityScore: 0.5,
      authorityScore: 0.5,
      relevanceScore: 0.7,
      keyFindings: this.extractKeyFindings(content),
      citations: [],
      ...sourceOverrides,
    };

    return {
      id: genId("doc"),
      fileName,
      fileType,
      content,
      extractedConcepts: concepts,
      extractedEntities: entities,
      summary,
      source,
      addedAt: Date.now(),
      wordCount,
      language: this.detectLanguage(content),
    };
  }

  compareDocuments(docs: ResearchDocument[]): DocumentComparison[] {
    if (docs.length < 2) return [];

    const comparisons: DocumentComparison[] = [];

    for (let i = 0; i < docs.length; i++) {
      for (let j = i + 1; j < docs.length; j++) {
        const a = docs[i];
        const b = docs[j];

        const sharedConcepts = a.extractedConcepts.filter((c) =>
          b.extractedConcepts.some((bc) => bc.toLowerCase() === c.toLowerCase()),
        );

        const aOnly = a.extractedConcepts.filter(
          (c) => !b.extractedConcepts.some((bc) => bc.toLowerCase() === c.toLowerCase()),
        );
        const bOnly = b.extractedConcepts.filter(
          (c) => !a.extractedConcepts.some((ac) => ac.toLowerCase() === c.toLowerCase()),
        );

        comparisons.push({
          documentIds: [a.id, b.id],
          agreements: sharedConcepts.map(
            (c) => `Both documents discuss "${c}"`,
          ),
          contradictions: this.findContradictions(a, b),
          mergedConcepts: [...new Set([...a.extractedConcepts, ...b.extractedConcepts])],
          missingInformation: [
            ...aOnly.map((c) => `"${c}" appears in "${a.fileName}" but not in "${b.fileName}"`),
            ...bOnly.map((c) => `"${c}" appears in "${b.fileName}" but not in "${a.fileName}"`),
          ],
          highlightSections: this.findHighlightSections(a, b),
          synthesisSummary: this.synthesizePair(a, b, sharedConcepts),
        });
      }
    }

    return comparisons;
  }

  searchDocuments(docs: ResearchDocument[], query: string): ResearchDocument[] {
    const lower = query.toLowerCase();
    return docs.filter(
      (d) =>
        d.content.toLowerCase().includes(lower) ||
        d.fileName.toLowerCase().includes(lower) ||
        d.extractedConcepts.some((c) => c.toLowerCase().includes(lower)) ||
        d.extractedEntities.some((e) => e.toLowerCase().includes(lower)),
    ).sort((a, b) => {
      const aScore = this.relevanceScore(a, lower);
      const bScore = this.relevanceScore(b, lower);
      return bScore - aScore;
    });
  }

  generateCitation(doc: ResearchDocument, style: "apa" | "mla" | "chicago" = "apa"): string {
    const source = doc.source;
    const author = source.authors.length > 0 ? source.authors.join(", ") : "Unknown";
    const year = source.publicationDate ? source.publicationDate.split("-")[0] : "n.d.";
    const title = source.title;

    switch (style) {
      case "apa":
        return `${author} (${year}). *${title}*.`;
      case "mla":
        return `${author}. "${title}." ${year}.`;
      case "chicago":
        return `${author}. "${title}." ${year}.`;
      default:
        return `${title} (${author}, ${year})`;
    }
  }

  private relevanceScore(doc: ResearchDocument, queryLower: string): number {
    let score = 0;
    const contentLower = doc.content.toLowerCase();
    const count = (contentLower.match(new RegExp(queryLower, "g")) || []).length;
    score += count * 2;
    if (doc.fileName.toLowerCase().includes(queryLower)) score += 10;
    if (doc.extractedConcepts.some((c) => c.toLowerCase().includes(queryLower))) score += 5;
    if (doc.extractedEntities.some((e) => e.toLowerCase().includes(queryLower))) score += 3;
    return score;
  }

  private extractConcepts(content: string): string[] {
    const stopWords = new Set([
      "the", "a", "an", "this", "that", "these", "those", "it", "its",
      "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
      "by", "from", "as", "is", "was", "are", "were", "be", "been",
      "being", "have", "has", "had", "do", "does", "did", "will", "would",
      "can", "could", "shall", "should", "may", "might", "must",
      "about", "into", "through", "during", "before", "after",
      "above", "below", "between", "under", "again", "further",
      "then", "once", "here", "there", "when", "where", "why", "how",
      "all", "each", "every", "both", "few", "more", "most", "other",
      "some", "such", "no", "nor", "not", "only", "own", "same", "so",
      "than", "too", "very", "just", "because", "also", "if", "then", "else",
    ]);

    const words = content
      .toLowerCase()
      .replace(/[^a-z\s-]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopWords.has(w));

    const freq = new Map<string, number>();
    for (const word of words) {
      freq.set(word, (freq.get(word) || 0) + 1);
    }

    const minFreq = Math.max(2, Math.ceil(words.length / 200));
    return Array.from(freq.entries())
      .filter(([, count]) => count >= minFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word.charAt(0).toUpperCase() + word.slice(1));
  }

  private extractEntities(content: string): string[] {
    const patterns = [
      /[A-Z][a-z]+ [A-Z][a-z]+/g,
      /[A-Z]{2,}/g,
    ];

    const entities = new Set<string>();
    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach((m) => {
          if (m.length > 2 && m.length < 50) entities.add(m);
        });
      }
    }

    return Array.from(entities).slice(0, 15);
  }

  private generateSummary(content: string): string {
    const sentences = content
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20);

    if (sentences.length === 0) return content.slice(0, 200);

    const first = sentences[0];
    const middle = sentences[Math.floor(sentences.length / 2)];
    const last = sentences[sentences.length - 1];

    const summary = [first, middle, last]
      .filter((s) => s && s.length > 10)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1) + ".")
      .join(" ");

    return summary.length > 500 ? summary.slice(0, 497) + "..." : summary;
  }

  private inferSourceType(fileName: string, fileType: string, _content: string): SourceType {
    const name = fileName.toLowerCase();

    if (name.includes("paper") || name.includes("journal") || name.includes("article")) return "academic-paper";
    if (name.includes("textbook") || name.includes("book")) return "textbook";
    if (name.includes("lecture") || name.includes("slides") || name.includes("notes")) return "lecture-notes";
    if (name.includes("report") || name.includes("gov") || name.includes("government")) return "government-source";
    if (name.includes("doc") || name.includes("manual") || name.includes("spec")) return "technical-documentation";
    if (name.includes("news") || name.includes("article")) return "news";

    if (fileType === "application/pdf") return "academic-paper";
    if (fileType === "text/plain") return "article";

    return "other";
  }

  private extractKeyFindings(content: string): string[] {
    const sentences = content
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 30 && s.length < 200);

    const findings = sentences.filter(
      (s) =>
        s.toLowerCase().includes("found") ||
        s.toLowerCase().includes("shows") ||
        s.toLowerCase().includes("demonstrates") ||
        s.toLowerCase().includes("conclude") ||
        s.toLowerCase().includes("result") ||
        s.toLowerCase().includes("therefore") ||
        s.toLowerCase().includes("significant"),
    );

    return findings.length > 0
      ? findings.slice(0, 5).map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      : sentences.slice(0, 3).map((s) => s.charAt(0).toUpperCase() + s.slice(1));
  }

  private detectLanguage(content: string): string {
    const englishIndicators = ["the", "and", "is", "are", "was", "were", "have", "has"];
    const words = content.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
    const englishCount = words.filter((w) => englishIndicators.includes(w)).length;
    return englishCount > words.length * 0.02 ? "en" : "unknown";
  }

  private findContradictions(a: ResearchDocument, b: ResearchDocument): string[] {
    const contradictions: string[] = [];
    const negations = ["not", "never", "no", "cannot", "does not", "is not", "are not"];

    for (const concept of a.extractedConcepts) {
      const aSentences = this.sentencesContaining(a.content, concept);
      const bSentences = this.sentencesContaining(b.content, concept);

      for (const aSent of aSentences) {
        for (const bSent of bSentences) {
          const aPositive = !negations.some((n) => aSent.toLowerCase().includes(n));
          const bPositive = !negations.some((n) => bSent.toLowerCase().includes(n));
          if (aPositive !== bPositive) {
            contradictions.push(
              `"${a.fileName}" and "${b.fileName}" may disagree on "${concept}"`,
            );
          }
        }
      }
    }

    return contradictions.slice(0, 5);
  }

  private sentencesContaining(content: string, term: string): string[] {
    const lower = term.toLowerCase();
    return content
      .split(/[.!?]+/)
      .filter((s) => s.toLowerCase().includes(lower))
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  private findHighlightSections(
    a: ResearchDocument,
    b: ResearchDocument,
  ): { documentId: string; section: string; relevance: number }[] {
    const sections: { documentId: string; section: string; relevance: number }[] = [];

    const shared = a.extractedConcepts.filter((c) =>
      b.extractedConcepts.some((bc) => bc.toLowerCase() === c.toLowerCase()),
    );

    for (const concept of shared) {
      const aSentences = this.sentencesContaining(a.content, concept);
      const bSentences = this.sentencesContaining(b.content, concept);

      for (const sent of aSentences.slice(0, 1)) {
        sections.push({ documentId: a.id, section: sent, relevance: 0.8 });
      }
      for (const sent of bSentences.slice(0, 1)) {
        sections.push({ documentId: b.id, section: sent, relevance: 0.8 });
      }
    }

    return sections.slice(0, 8);
  }

  private synthesizePair(a: ResearchDocument, b: ResearchDocument, shared: string[]): string {
    const aUnique = a.extractedConcepts.length - shared.length;
    const bUnique = b.extractedConcepts.length - shared.length;

    let synthesis = `"${a.fileName}" and "${b.fileName}" share ${shared.length} common concepts. `;
    synthesis += `${a.fileName} introduces ${aUnique} unique concepts, while ${b.fileName} contributes ${bUnique} unique concepts. `;

    if (shared.length > 0) {
      synthesis += `Key shared themes include: ${shared.slice(0, 5).join(", ")}. `;
    }

    synthesis += `Together, they cover ${aUnique + bUnique + shared.length} distinct concepts across both documents.`;
    return synthesis;
  }
}
