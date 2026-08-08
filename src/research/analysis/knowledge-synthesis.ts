import type { ResearchDocument, ResearchSource, ResearchMessage, Insight } from "../types";

export interface SynthesisResult {
  topic: string;
  consensus: string[];
  differences: string[];
  limitations: string[];
  strengths: string[];
  weaknesses: string[];
  futureResearch: string[];
  confidenceScore: number;
}

let idCounter = 0;

function genId(prefix: string): string {
  idCounter++;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

export class KnowledgeSynthesisEngine {
  synthesize(
    documents: ResearchDocument[],
    messages: ResearchMessage[],
    topic: string,
  ): SynthesisResult {
    const allContent = [
      ...documents.map((d) => d.content),
      ...messages.map((m) => m.content),
    ].join("\n");

    const concepts = this.extractCommonConcepts(documents);
    const thesisStatements = this.extractThesisStatements(allContent);

    return {
      topic,
      consensus: this.findConsensus(concepts, thesisStatements),
      differences: this.findDifferences(documents, allContent),
      limitations: this.findLimitations(allContent),
      strengths: this.findStrengths(documents),
      weaknesses: this.findWeaknesses(documents, allContent),
      futureResearch: this.suggestFutureResearch(concepts, allContent),
      confidenceScore: this.calculateConfidence(documents, concepts),
    };
  }

  compareViewpoints(
    sources: { source: ResearchSource; documents: ResearchDocument[] }[],
  ): {
    agreements: string[];
    disagreements: string[];
    mergedView: string;
  } {
    const agreements: string[] = [];
    const disagreements: string[] = [];

    if (sources.length < 2) {
      const first = sources[0];
      return {
        agreements: first ? first.documents.flatMap((d) => d.extractedConcepts).slice(0, 5).map((c) => `Discusses "${c}"`) : [],
        disagreements: [],
        mergedView: first ? `Analysis based on ${first.source.title}` : "Insufficient sources for comparison",
      };
    }

    const allConceptSets = sources.map((s) =>
      new Set(s.documents.flatMap((d) => d.extractedConcepts.map((c) => c.toLowerCase()))),
    );

    const base = allConceptSets[0];
    for (const concept of base) {
      const presentInAll = allConceptSets.every((set) => set.has(concept));
      if (presentInAll) {
        agreements.push(`All sources agree on the importance of "${concept}"`);
      }
    }

    for (let i = 1; i < allConceptSets.length; i++) {
      for (const concept of allConceptSets[i]) {
        if (!base.has(concept)) {
          disagreements.push(
            `Source ${i + 1} discusses "${concept}" not found in primary source`,
          );
        }
      }
    }

    const allConcepts = new Set(
      sources.flatMap((s) => s.documents.flatMap((d) => d.extractedConcepts)),
    );

    const mergedView = `Across ${sources.length} sources, ${allConcepts.size} distinct concepts were discussed. ${
      agreements.length > 0
        ? `${agreements.length} points of agreement found.`
        : "Sources offer complementary perspectives."
    } ${disagreements.length > 0 ? `${disagreements.length} differences identified.` : ""}`;

    return { agreements, disagreements, mergedView };
  }

  extractInsights(
    documents: ResearchDocument[],
    messages: ResearchMessage[],
  ): Insight[] {
    const insights: Insight[] = [];
    const allContent = [
      ...documents.map((d) => d.content),
      ...messages.map((m) => m.content),
    ].join("\n");

    const keySentences = this.extractKeySentences(allContent);
    for (const sent of keySentences.slice(0, 5)) {
      const sourceDoc = documents.find(
        (d) => d.content.includes(sent),
      );

      insights.push({
        id: genId("ins"),
        type: "key-insight",
        title: sent.slice(0, 80) + (sent.length > 80 ? "..." : ""),
        description: sent,
        evidence: [sent],
        linkedConceptIds: sourceDoc?.extractedConcepts?.slice(0, 3).map(
          (c) => `concept_${c.replace(/\s+/g, "_")}`,
        ) ?? [],
        linkedSourceIds: sourceDoc ? [sourceDoc.source.id] : [],
        linkedDocumentIds: sourceDoc ? [sourceDoc.id] : [],
        confidence: 0.7,
        createdAt: Date.now(),
      });
    }

    return insights;
  }

  private extractCommonConcepts(documents: ResearchDocument[]): string[] {
    if (documents.length === 0) return [];

    const conceptCounts = new Map<string, number>();
    for (const doc of documents) {
      const seen = new Set(doc.extractedConcepts.map((c) => c.toLowerCase()));
      for (const concept of seen) {
        conceptCounts.set(concept, (conceptCounts.get(concept) || 0) + 1);
      }
    }

    return Array.from(conceptCounts.entries())
      .filter(([, count]) => count >= Math.max(2, documents.length * 0.5))
      .sort((a, b) => b[1] - a[1])
      .map(([concept]) => concept.charAt(0).toUpperCase() + concept.slice(1));
  }

  private extractThesisStatements(content: string): string[] {
    const sentences = content
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 50 && s.length < 300);

    return sentences.filter(
      (s) =>
        s.toLowerCase().includes("argue") ||
        s.toLowerCase().includes("contend") ||
        s.toLowerCase().includes("propose") ||
        s.toLowerCase().includes("suggest") ||
        s.toLowerCase().includes("demonstrate") ||
        s.toLowerCase().includes("show that") ||
        s.toLowerCase().includes("we find"),
    ).slice(0, 8);
  }

  private findConsensus(concepts: string[], thesisStatements: string[]): string[] {
    const consensus: string[] = [];

    if (concepts.length > 0) {
      consensus.push(
        `There is broad agreement across sources on the importance of: ${concepts.slice(0, 5).join(", ")}.`,
      );
    }

    const repeatedThemes = this.findRepeatedPhrases(thesisStatements.join(" "), 3);
    for (const theme of repeatedThemes.slice(0, 3)) {
      consensus.push(
        `Multiple sources converge on the idea that ${theme.toLowerCase()}.`,
      );
    }

    if (consensus.length === 0) {
      consensus.push("Sources generally agree on the fundamental principles of this topic.");
    }

    return consensus;
  }

  private findDifferences(documents: ResearchDocument[], _content: string): string[] {
    const differences: string[] = [];

    if (documents.length < 2) {
      return ["Only one source available for analysis — differences cannot be determined."];
    }

    for (let i = 0; i < documents.length; i++) {
      for (let j = i + 1; j < documents.length; j++) {
        const a = new Set(documents[i].extractedConcepts.map((c) => c.toLowerCase()));
        const b = new Set(documents[j].extractedConcepts.map((c) => c.toLowerCase()));

        const onlyA = documents[i].extractedConcepts.filter((c) => !b.has(c.toLowerCase()));
        const onlyB = documents[j].extractedConcepts.filter((c) => !a.has(c.toLowerCase()));

        if (onlyA.length > 0) {
          differences.push(
            `"${documents[i].fileName}" emphasizes ${onlyA.slice(0, 3).join(", ")} which are not addressed in "${documents[j].fileName}".`,
          );
        }
        if (onlyB.length > 0) {
          differences.push(
            `"${documents[j].fileName}" covers ${onlyB.slice(0, 3).join(", ")} not found in "${documents[i].fileName}".`,
          );
        }
      }
    }

    return differences.slice(0, 5);
  }

  private findLimitations(content: string): string[] {
    const limitations: string[] = [];
    const lower = content.toLowerCase();

    const patterns = [
      /limit(?:ation|ed|s)\b.*?\./gi,
      /drawback.*?\./gi,
      /caveat.*?\./gi,
      /does not address.*?\./gi,
      /fails? to.*?\./gi,
      /not yet understood.*?\./gi,
      /remains unclear.*?\./gi,
    ];

    for (const pattern of patterns) {
      const matches = lower.match(pattern);
      if (matches) {
        limitations.push(
          matches[0].charAt(0).toUpperCase() + matches[0].slice(1),
        );
      }
    }

    return limitations.slice(0, 5);
  }

  private findStrengths(documents: ResearchDocument[]): string[] {
    const strengths: string[] = [];

    if (documents.length > 1) {
      strengths.push(`Analysis draws from ${documents.length} distinct sources providing multiple perspectives.`);
    }

    const totalWords = documents.reduce((sum, d) => sum + d.wordCount, 0);
    if (totalWords > 1000) {
      strengths.push(`Substantial corpus of ${totalWords} words analyzed.`);
    }

    const allConcepts = new Set(documents.flatMap((d) => d.extractedConcepts));
    strengths.push(`${allConcepts.size} distinct concepts identified across sources.`);

    return strengths;
  }

  private findWeaknesses(documents: ResearchDocument[], content: string): string[] {
    const weaknesses: string[] = [];

    if (documents.length === 1) {
      weaknesses.push("Analysis is based on a single source, limiting cross-validation.");
    }

    if (content.length < 500) {
      weaknesses.push("Limited content available for comprehensive synthesis.");
    }

    return weaknesses;
  }

  private suggestFutureResearch(concepts: string[], content: string): string[] {
    const suggestions: string[] = [];
    const lower = content.toLowerCase();

    const gaps = [
      { pattern: /limited research/i, suggestion: "Areas with limited research warrant further investigation." },
      { pattern: /unexplored/i, suggestion: "Unexplored dimensions of this topic present research opportunities." },
      { pattern: /further study needed/i, suggestion: "Further study is needed to validate initial findings." },
      { pattern: /open question/i, suggestion: "Open questions in the field should be prioritized for investigation." },
    ];

    for (const gap of gaps) {
      if (lower.match(gap.pattern)) {
        suggestions.push(gap.suggestion);
      }
    }

    if (concepts.length > 1) {
      suggestions.push(
        `Investigate the relationship between ${concepts.slice(0, 3).join(", ")} in greater depth.`,
      );
    }

    if (suggestions.length === 0) {
      suggestions.push("Broader cross-disciplinary connections could reveal new insights.");
    }

    return suggestions.slice(0, 4);
  }

  private calculateConfidence(documents: ResearchDocument[], concepts: string[]): number {
    let confidence = 0.3;

    if (documents.length >= 2) confidence += 0.2;
    if (documents.length >= 3) confidence += 0.1;
    if (concepts.length >= 5) confidence += 0.15;
    if (documents.some((d) => d.wordCount > 1000)) confidence += 0.1;
    if (documents.every((d) => d.source.credibilityScore > 0.6)) confidence += 0.15;

    return Math.min(1, confidence);
  }

  private findRepeatedPhrases(text: string, minCount: number): string[] {
    const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    const phrases = new Map<string, number>();

    for (let i = 0; i < words.length - 2; i++) {
      const phrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
    }

    return Array.from(phrases.entries())
      .filter(([, count]) => count >= minCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([phrase]) => phrase);
  }

  private extractKeySentences(content: string): string[] {
    const sentences = content
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 40 && s.length < 300);

    return sentences.filter(
      (s) =>
        s.toLowerCase().includes("key") ||
        s.toLowerCase().includes("important") ||
        s.toLowerCase().includes("significant") ||
        s.toLowerCase().includes("fundamental") ||
        s.toLowerCase().includes("critical") ||
        s.toLowerCase().includes("essential"),
    ).slice(0, 10);
  }
}
