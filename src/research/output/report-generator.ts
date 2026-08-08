import type { ResearchReport, ReportType, ReportSection, ResearchDocument, ResearchMessage, ResearchSource } from "../types";
import { REPORT_TYPE_LABELS, REPORT_SECTIONS } from "../types";

let idCounter = 0;

function genId(prefix: string): string {
  idCounter++;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

export class ReportGenerator {
  generateReport(
    type: ReportType,
    title: string,
    documents: ResearchDocument[],
    messages: ResearchMessage[],
    sources: ResearchSource[],
  ): ResearchReport {
    const sections = this.generateSections(type, title, documents, messages, sources);
    const wordCount = sections.reduce((sum, s) => sum + s.content.split(/\s+/).length, 0);
    const allSourceIds = sources.map((s) => s.id);

    return {
      id: genId("rpt"),
      title,
      type,
      sections,
      sources: allSourceIds,
      generatedAt: Date.now(),
      wordCount,
    };
  }

  generateExecutiveSummary(
    documents: ResearchDocument[],
    messages: ResearchMessage[],
    sources: ResearchSource[],
  ): ResearchReport {
    return this.generateReport("executive-summary", "Executive Summary", documents, messages, sources);
  }

  generateLiteratureReview(
    documents: ResearchDocument[],
    messages: ResearchMessage[],
    sources: ResearchSource[],
  ): ResearchReport {
    return this.generateReport("literature-review", "Literature Review", documents, messages, sources);
  }

  generateAnalysis(
    documents: ResearchDocument[],
    messages: ResearchMessage[],
    sources: ResearchSource[],
  ): ResearchReport {
    return this.generateReport("analysis", "Analysis", documents, messages, sources);
  }

  private generateSections(
    type: ReportType,
    title: string,
    documents: ResearchDocument[],
    messages: ResearchMessage[],
    sources: ResearchSource[],
  ): ReportSection[] {
    const headings = REPORT_SECTIONS[type] ?? REPORT_SECTIONS["executive-summary"];

    return headings.map((heading, i) => {
      let content = this.generateSectionContent(heading, i, type, title, documents, messages, sources);

      if (heading === "References" || heading === "Sources") {
        content = this.composeReferences(sources);
      }

      return {
        heading,
        content,
        subsections: [],
        sources: sources.slice(0, 3).map((s) => s.id),
      };
    });
  }

  private generateSectionContent(
    heading: string,
    _index: number,
    type: ReportType,
    title: string,
    documents: ResearchDocument[],
    messages: ResearchMessage[],
    sources: ResearchSource[],
  ): string {
    const allContent = [
      ...documents.map((d) => d.content),
      ...messages.map((m) => m.content),
    ].join("\n\n");

    const sentences = allContent
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20);

    switch (heading) {
      case "Executive Summary":
        return this.composeExecutiveSummary(title, documents, messages, sources);
      case "Abstract":
        return this.composeAbstract(title, documents);
      case "Introduction":
        return this.composeIntroduction(title, documents);
      case "Background":
      case "Scope of Review":
        return this.composeBackground(documents, messages);
      case "Methodology":
        return this.composeMethodology(documents);
      case "Thematic Analysis":
      case "Analysis":
      case "Discussion":
        return this.composeAnalysis(documents, messages);
      case "Evidence":
        return this.composeEvidence(documents);
      case "Counterarguments":
        return this.composeCounterarguments(documents, allContent);
      case "Key Findings":
        return this.composeKeyFindings(documents);
      case "Consensus":
        return this.composeConsensus(documents);
      case "Contradictions":
      case "Gaps in Literature":
        return this.composeGaps(documents, allContent);
      case "Recommendations":
        return this.composeRecommendations(documents, messages);
      case "Technical Background":
      case "Implementation Details":
        return this.composeTechnical(documents, messages);
      case "Evaluation":
        return this.composeEvaluation(documents, allContent);
      case "Limitations":
        return this.composeLimitationsSection(documents, allContent);
      case "Situation Overview":
      case "Key Developments":
        return this.composeOverview(documents, messages);
      case "Implications":
        return this.composeImplications(documents, messages);
      case "Next Steps":
        return this.composeNextSteps(documents);
      case "Conclusion":
        return this.composeConclusion(sentences);
      case "References":
        return "";
      case "Appendices":
        return this.composeAppendices(documents);
      default:
        return `[${heading} — content generated from ${documents.length} documents and ${messages.length} research interactions]`;
    }
  }

  private composeExecutiveSummary(
    title: string,
    documents: ResearchDocument[],
    messages: ResearchMessage[],
    sources: ResearchSource[],
  ): string {
    const parts: string[] = [];
    parts.push(`This report presents a comprehensive analysis of "${title}" based on ${documents.length} documents and ${messages.length} research interactions.`);

    if (sources.length > 0) {
      const credible = sources.filter((s) => s.credibilityScore > 0.6);
      parts.push(`Analysis draws from ${sources.length} sources, including ${credible.length} with high credibility ratings.`);
    }

    const totalConcepts = new Set(documents.flatMap((d) => d.extractedConcepts)).size;
    if (totalConcepts > 0) {
      parts.push(`A total of ${totalConcepts} distinct concepts were identified and analyzed across the research corpus.`);
    }

    parts.push("This document synthesizes findings, identifies key insights, and provides actionable recommendations based on the evidence gathered.");
    return parts.join("\n\n");
  }

  private composeAbstract(_title: string, documents: ResearchDocument[]): string {
    const firstDoc = documents[0];
    if (!firstDoc) return "Abstract not available — no documents processed.";
    return firstDoc.content.split(/[.!?]+/).slice(0, 3).map((s) => s.trim() + ".").join(" ");
  }

  private composeIntroduction(title: string, _documents: ResearchDocument[]): string {
    return [
      `This report examines "${title}" through a systematic analysis of available sources and research materials.`,
      `The objective is to provide a comprehensive understanding of the topic, covering foundational concepts through advanced considerations.`,
      `Research was conducted using multiple sources to ensure breadth and depth of coverage across different perspectives and methodologies.`,
    ].join("\n\n");
  }

  private composeBackground(documents: ResearchDocument[], messages: ResearchMessage[]): string {
    const allContent = [...documents.map((d) => d.content), ...messages.map((m) => m.content)].join(" ");
    const sentences = allContent.split(/[.!?]+/).filter((s) => s.trim().length > 30);
    return sentences.slice(0, 5).map((s) => s.trim() + ".").join("\n\n");
  }

  private composeMethodology(documents: ResearchDocument[]): string {
    const parts: string[] = [];
    parts.push(`This research was conducted through analysis of ${documents.length} documents.`);

    const types = new Set(documents.map((d) => d.source.sourceType));
    parts.push(`Source types analyzed: ${Array.from(types).join(", ")}.`);

    const totalWords = documents.reduce((sum, d) => sum + d.wordCount, 0);
    parts.push(`Total corpus size: ${totalWords} words across ${documents.length} documents.`);

    return parts.join("\n\n");
  }

  private composeAnalysis(documents: ResearchDocument[], messages: ResearchMessage[]): string {
    const allContent = [...documents.map((d) => d.content), ...messages.map((m) => m.content)].join(" ");
    const sentences = allContent.split(/[.!?]+/).filter((s) => s.trim().length > 40);
    const analysisSentences = sentences.filter(
      (s) =>
        s.toLowerCase().includes("analysis") ||
        s.toLowerCase().includes("examine") ||
        s.toLowerCase().includes("evaluate") ||
        s.toLowerCase().includes("assess") ||
        s.toLowerCase().includes("therefore") ||
        s.toLowerCase().includes("consequently"),
    );
    const selected = analysisSentences.length > 0 ? analysisSentences : sentences;
    return selected.slice(0, 6).map((s) => s.trim() + ".").join("\n\n");
  }

  private composeEvidence(documents: ResearchDocument[]): string {
    const evidence: string[] = [];
    for (const doc of documents) {
      const findings = doc.source.keyFindings.slice(0, 2);
      for (const f of findings) {
        evidence.push(`**Source:** ${doc.fileName}\n${f}`);
      }
    }
    return evidence.slice(0, 6).join("\n\n");
  }

  private composeCounterarguments(documents: ResearchDocument[], _content: string): string {
    if (documents.length < 2) {
      return "Insufficient sources to identify counterarguments. Additional perspectives would strengthen the analysis.";
    }
    const differences: string[] = [];
    for (let i = 0; i < documents.length && differences.length < 3; i++) {
      for (let j = i + 1; j < documents.length && differences.length < 3; j++) {
        const aOnly = documents[i].extractedConcepts.filter(
          (c) => !documents[j].extractedConcepts.some((dc) => dc.toLowerCase() === c.toLowerCase()),
        );
        if (aOnly.length > 0) {
          differences.push(`"${documents[i].fileName}" discusses ${aOnly[0]} which is not addressed in "${documents[j].fileName}".`);
        }
      }
    }
    return differences.length > 0
      ? differences.join("\n\n")
      : "Sources are largely in agreement with no significant counterarguments identified.";
  }

  private composeKeyFindings(documents: ResearchDocument[]): string {
    const findings: string[] = [];
    for (const doc of documents) {
      for (const f of doc.source.keyFindings) {
        findings.push(`- ${f}`);
      }
    }
    return findings.slice(0, 8).join("\n");
  }

  private composeConsensus(documents: ResearchDocument[]): string {
    if (documents.length < 2) return "Based on a single source, consensus cannot be determined.";
    const allConcepts = documents.flatMap((d) => d.extractedConcepts.map((c) => c.toLowerCase()));
    const freq = new Map<string, number>();
    for (const c of allConcepts) freq.set(c, (freq.get(c) || 0) + 1);
    const shared = Array.from(freq.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1]);
    if (shared.length === 0) return "No significant consensus themes identified across sources.";
    return `There is broad agreement across sources on: ${shared.slice(0, 5).map(([c]) => c.charAt(0).toUpperCase() + c.slice(1)).join(", ")}.`;
  }

  private composeGaps(_documents: ResearchDocument[], content: string): string {
    const lower = content.toLowerCase();
    const gaps: string[] = [];
    if (lower.includes("limited")) gaps.push("Limited evidence was found in certain areas of inquiry.");
    if (lower.includes("unclear")) gaps.push("Several aspects remain unclear and require further investigation.");
    if (lower.includes("debate") || lower.includes("controvers")) gaps.push("Active debates in the literature indicate unresolved questions.");
    if (gaps.length === 0) gaps.push("No significant gaps were identified in the sources reviewed, though broader inquiry may reveal additional dimensions.");
    return gaps.join("\n\n");
  }

  private composeRecommendations(documents: ResearchDocument[], messages: ResearchMessage[]): string {
    const recs: string[] = [];
    if (documents.length < 3) recs.push("Expand source base to include additional perspectives for a more comprehensive analysis.");
    if (messages.length < 5) recs.push("Conduct deeper inquiry through structured research questions to strengthen findings.");
    recs.push("Synthesize findings into actionable insights for practical application.");
    recs.push("Document open questions and areas requiring further investigation.");
    return recs.map((r, i) => `${i + 1}. ${r}`).join("\n\n");
  }

  private composeTechnical(documents: ResearchDocument[], messages: ResearchMessage[]): string {
    const allContent = [...documents.map((d) => d.content), ...messages.map((m) => m.content)].join(" ");
    const sentences = allContent.split(/[.!?]+/).filter((s) => s.trim().length > 30);
    return sentences.slice(0, 5).map((s) => s.trim() + ".").join("\n\n");
  }

  private composeEvaluation(documents: ResearchDocument[], _content: string): string {
    if (documents.length === 0) return "No documents available for evaluation.";
    const parts: string[] = [];
    const credible = documents.filter((d) => d.source.credibilityScore > 0.6);
    parts.push(`Source evaluation: ${credible.length}/${documents.length} documents rated as highly credible.`);
    const allWords = documents.reduce((sum, d) => sum + d.wordCount, 0);
    parts.push(`Corpus size: ${allWords} words analyzed.`);
    return parts.join("\n\n");
  }

  private composeLimitationsSection(documents: ResearchDocument[], _content: string): string {
    const parts: string[] = [];
    if (documents.length < 3) parts.push("Limited number of sources constrains the breadth of analysis.");
    if (documents.every((d) => d.source.sourceType === "other")) parts.push("Source types were varied and may lack specialized authority.");
    if (parts.length === 0) parts.push("Analysis is subject to the limitations inherent in the available source materials.");
    return parts.join("\n\n");
  }

  private composeOverview(documents: ResearchDocument[], messages: ResearchMessage[]): string {
    const allContent = [...documents.map((d) => d.content), ...messages.map((m) => m.content)].join(" ");
    const sentences = allContent.split(/[.!?]+/).filter((s) => s.trim().length > 30);
    return sentences.slice(0, 4).map((s) => s.trim() + ".").join("\n\n");
  }

  private composeImplications(documents: ResearchDocument[], messages: ResearchMessage[]): string {
    const allContent = [...documents.map((d) => d.content), ...messages.map((m) => m.content)].join(" ");
    const lower = allContent.toLowerCase();
    const implications: string[] = [];
    if (lower.includes("impact") || lower.includes("effect")) implications.push("Findings have practical implications for real-world application.");
    if (lower.includes("future") || lower.includes("potential")) implications.push("Emerging developments suggest significant future impact on the field.");
    if (implications.length === 0) implications.push("Further analysis is needed to determine the full implications of the findings.");
    return implications.join("\n\n");
  }

  private composeNextSteps(_documents: ResearchDocument[]): string {
    return [
      "1. Synthesize findings into actionable recommendations",
      "2. Identify priority areas for deeper investigation",
      "3. Document unresolved questions for future research",
      "4. Apply insights to practical decision-making contexts",
    ].join("\n");
  }

  private composeConclusion(sentences: string[]): string {
    if (sentences.length === 0) return "Conclusion based on the analysis of available research materials.";
    const finalSentences = sentences.filter(
      (s) =>
        s.toLowerCase().includes("conclude") ||
        s.toLowerCase().includes("overall") ||
        s.toLowerCase().includes("in summary") ||
        s.toLowerCase().includes("therefore"),
    );
    const selected = finalSentences.length > 0 ? finalSentences : sentences.slice(-3);
    return selected.map((s) => s.charAt(0).toUpperCase() + s.slice(1) + ".").join("\n\n");
  }

  private composeAppendices(documents: ResearchDocument[]): string {
    return documents
      .map((d, i) => `**Appendix ${i + 1}: ${d.fileName}**\n- Word count: ${d.wordCount}\n- Concepts: ${d.extractedConcepts.slice(0, 5).join(", ")}\n- Summary: ${d.summary}`)
      .join("\n\n");
  }

  private composeReferences(sources: ResearchSource[]): string {
    if (sources.length === 0) return "No sources referenced.";
    return sources
      .map((s, i) => `${i + 1}. ${s.authors.length > 0 ? s.authors.join(", ") : "Unknown"} (${s.publicationDate || "n.d."}). *${s.title}*. [${s.sourceType.replace("-", " ")}]`)
      .join("\n\n");
  }
}
