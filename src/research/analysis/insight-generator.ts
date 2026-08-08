import type { Insight, ResearchDocument, ResearchMessage, OpenQuestion, ResearchSource } from "../types";

let idCounter = 0;

function genId(prefix: string): string {
  idCounter++;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

export class InsightGenerator {
  generateAll(
    documents: ResearchDocument[],
    messages: ResearchMessage[],
    openQuestions: OpenQuestion[],
    sources: ResearchSource[],
  ): Insight[] {
    const insights: Insight[] = [];

    insights.push(...this.generateKeyInsights(documents, messages));
    insights.push(...this.generatePatterns(documents, messages));
    insights.push(...this.generateRelationships(documents, messages));
    insights.push(...this.generateConclusions(documents, messages, openQuestions));
    insights.push(...this.generateRecommendations(documents, messages, sources));

    return insights;
  }

  summary(insights: Insight[]): string {
    const byType = new Map<string, Insight[]>();
    for (const ins of insights) {
      const arr = byType.get(ins.type) ?? [];
      arr.push(ins);
      byType.set(ins.type, arr);
    }

    const parts: string[] = [];
    if (byType.has("key-insight")) {
      parts.push(`**Key Insights:** ${byType.get("key-insight")!.slice(0, 3).map((i) => i.title).join("; ")}`);
    }
    if (byType.has("pattern")) {
      parts.push(`**Patterns:** ${byType.get("pattern")!.slice(0, 2).map((i) => i.description).join("; ")}`);
    }
    if (byType.has("recommendation")) {
      parts.push(`**Recommendations:** ${byType.get("recommendation")!.slice(0, 2).map((i) => i.title).join("; ")}`);
    }

    return parts.join("\n\n");
  }

  private generateKeyInsights(
    documents: ResearchDocument[],
    messages: ResearchMessage[],
  ): Insight[] {
    const insights: Insight[] = [];
    const allContent = [
      ...documents.map((d) => ({ content: d.content, id: d.id, concepts: d.extractedConcepts, sourceId: d.source.id })),
      ...messages.map((m) => ({ content: m.content, id: m.id, concepts: m.conceptIds, sourceId: "" })),
    ];

    for (const item of allContent) {
      const keySentences = this.extractInsightSentences(item.content);
      for (const sent of keySentences.slice(0, 2)) {
        insights.push({
          id: genId("ins"),
          type: "key-insight",
          title: this.truncate(sent, 80),
          description: sent,
          evidence: [sent],
          linkedConceptIds: item.concepts?.slice(0, 3).map(
            (c: string) => c.startsWith("concept_") ? c : `concept_${c.replace(/\s+/g, "_")}`,
          ) ?? [],
          linkedSourceIds: item.sourceId ? [item.sourceId] : [],
          linkedDocumentIds: item.id ? [item.id] : [],
          confidence: 0.7,
          createdAt: Date.now(),
        });
      }
    }

    return insights.slice(0, 8);
  }

  private generatePatterns(
    documents: ResearchDocument[],
    messages: ResearchMessage[],
  ): Insight[] {
    const patterns: Insight[] = [];
    const allConcepts = new Map<string, number>();

    for (const doc of documents) {
      for (const c of doc.extractedConcepts) {
        const key = c.toLowerCase();
        allConcepts.set(key, (allConcepts.get(key) || 0) + 1);
      }
    }

    const repeated = Array.from(allConcepts.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1]);

    for (const [concept, count] of repeated.slice(0, 3)) {
      patterns.push({
        id: genId("ins"),
        type: "pattern",
        title: `Repeated emphasis on "${concept}"`,
        description: `"${concept}" appears across ${count} sources, suggesting it is a recurring theme in this research area.`,
        evidence: [`Found in ${count} separate documents`],
        linkedConceptIds: [`concept_${concept.replace(/\s+/g, "_")}`],
        linkedSourceIds: [],
        linkedDocumentIds: [],
        confidence: 0.6,
        createdAt: Date.now(),
      });
    }

    return patterns;
  }

  private generateRelationships(
    documents: ResearchDocument[],
    _messages: ResearchMessage[],
  ): Insight[] {
    const relationships: Insight[] = [];

    if (documents.length < 2) return relationships;

    for (let i = 0; i < documents.length && relationships.length < 3; i++) {
      for (let j = i + 1; j < documents.length && relationships.length < 3; j++) {
        const shared = documents[i].extractedConcepts.filter((c) =>
          documents[j].extractedConcepts.some(
            (dc) => dc.toLowerCase() === c.toLowerCase(),
          ),
        );

        if (shared.length >= 2) {
          relationships.push({
            id: genId("ins"),
            type: "relationship",
            title: `Connection between "${documents[i].fileName}" and "${documents[j].fileName}"`,
            description: `Both documents discuss ${shared.slice(0, 4).join(", ")}, suggesting a shared conceptual framework.`,
            evidence: [`${shared.length} common concepts identified`],
            linkedConceptIds: shared.slice(0, 3).map(
              (c) => `concept_${c.replace(/\s+/g, "_")}`,
            ),
            linkedSourceIds: [documents[i].source.id, documents[j].source.id],
            linkedDocumentIds: [documents[i].id, documents[j].id],
            confidence: 0.65,
            createdAt: Date.now(),
          });
        }
      }
    }

    return relationships;
  }

  private generateConclusions(
    documents: ResearchDocument[],
    messages: ResearchMessage[],
    openQuestions: OpenQuestion[],
  ): Insight[] {
    const conclusions: Insight[] = [];
    const allContent = [...documents.map((d) => d.content), ...messages.map((m) => m.content)].join("\n");

    const finalSentences = this.extractFinalSentences(allContent);
    for (const sent of finalSentences.slice(0, 3)) {
      conclusions.push({
        id: genId("ins"),
        type: "conclusion",
        title: this.truncate(sent, 80),
        description: sent,
        evidence: [sent],
        linkedConceptIds: [],
        linkedSourceIds: [],
        linkedDocumentIds: [],
        confidence: 0.6,
        createdAt: Date.now(),
      });
    }

    const unresolvedCount = openQuestions.filter((q) => !q.isResolved).length;
    if (unresolvedCount > 0) {
      conclusions.push({
        id: genId("ins"),
        type: "conclusion",
        title: `${unresolvedCount} open questions remain`,
        description: `Despite progress in understanding, ${unresolvedCount} questions remain unanswered, indicating areas for further investigation.`,
        evidence: [`${unresolvedCount} unresolved questions documented`],
        linkedConceptIds: openQuestions.slice(0, 3).flatMap((q) => q.linkedConceptIds),
        linkedSourceIds: [],
        linkedDocumentIds: [],
        confidence: 0.9,
        createdAt: Date.now(),
      });
    }

    return conclusions;
  }

  private generateRecommendations(
    documents: ResearchDocument[],
    messages: ResearchMessage[],
    sources: ResearchSource[],
  ): Insight[] {
    const recommendations: Insight[] = [];

    if (documents.length === 1) {
      recommendations.push({
        id: genId("ins"),
        type: "recommendation",
        title: "Seek additional sources for broader perspective",
        description: "Current research is based on a single document. Consulting additional sources would strengthen understanding and reveal alternative viewpoints.",
        evidence: [`Only ${documents.length} document analyzed`],
        linkedConceptIds: [],
        linkedSourceIds: sources.slice(0, 2).map((s) => s.id),
        linkedDocumentIds: documents.map((d) => d.id),
        confidence: 0.8,
        createdAt: Date.now(),
      });
    }

    const totalMessages = messages.length;
    if (totalMessages > 3) {
      recommendations.push({
        id: genId("ins"),
        type: "recommendation",
        title: "Consolidate findings into a structured report",
        description: `With ${totalMessages} exchanges and ${documents.length} documents, sufficient material exists to generate a comprehensive research report.`,
        evidence: [`${totalMessages} research interactions conducted`],
        linkedConceptIds: [],
        linkedSourceIds: [],
        linkedDocumentIds: [],
        confidence: 0.7,
        createdAt: Date.now(),
      });
    }

    return recommendations;
  }

  private extractInsightSentences(content: string): string[] {
    const sentences = content
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 30 && s.length < 300);

    return sentences.filter(
      (s) =>
        s.toLowerCase().includes("key") ||
        s.toLowerCase().includes("insight") ||
        s.toLowerCase().includes("important") ||
        s.toLowerCase().includes("significant") ||
        s.toLowerCase().includes("critical") ||
        s.toLowerCase().includes("fundamental"),
    ).slice(0, 5);
  }

  private extractFinalSentences(content: string): string[] {
    const sentences = content
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 40);

    return sentences.slice(-5).reverse();
  }

  private truncate(text: string, maxLen: number): string {
    return text.length > maxLen ? text.slice(0, maxLen - 3) + "..." : text;
  }
}
