import type { ResearchSource, SourceType } from "../types";
import { SOURCE_TYPE_LABELS } from "../types";

export interface SourceCredibilityFactors {
  sourceType: SourceType;
  hasAuthors: boolean;
  hasDate: boolean;
  hasMethodology: boolean;
  hasCitations: boolean;
  isPeerReviewed: boolean;
  contentLength: number;
  hasFormalStructure: boolean;
}

export class SourceIntelligence {
  evaluateSource(source: ResearchSource): ResearchSource {
    const factors = this.analyzeFactors(source);

    return {
      ...source,
      credibilityScore: this.calculateCredibility(factors),
      authorityScore: this.calculateAuthority(factors, source),
      relevanceScore: source.relevanceScore,
    };
  }

  evaluateSources(sources: ResearchSource[]): ResearchSource[] {
    return sources.map((s) => this.evaluateSource(s));
  }

  categorizeSource(source: ResearchSource): {
    primary: SourceType;
    confidence: number;
    alternatives: { type: SourceType; confidence: number }[];
  } {
    const scores = new Map<SourceType, number>();

    for (const type of Object.keys(SOURCE_TYPE_LABELS) as SourceType[]) {
      const factors = this.analyzeFactors({ ...source, sourceType: type });
      scores.set(type, this.calculateCredibility(factors));
    }

    const sorted = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1]);

    const total = sorted.reduce((sum, [, score]) => sum + score, 0) || 1;

    return {
      primary: sorted[0][0],
      confidence: sorted[0][1] / total,
      alternatives: sorted.slice(1, 3).map(([type, score]) => ({
        type,
        confidence: score / total,
      })),
    };
  }

  summarizeSource(source: ResearchSource): string {
    const parts: string[] = [];

    parts.push(`**${source.title}**`);
    if (source.authors.length > 0) {
      parts.push(`by ${source.authors.join(", ")}`);
    }
    parts.push(`Type: ${SOURCE_TYPE_LABELS[source.sourceType]}`);

    if (source.publicationDate) {
      parts.push(`Published: ${source.publicationDate}`);
    }

    parts.push(`Credibility: ${this.scoreLabel(source.credibilityScore)}`);
    parts.push(`Authority: ${this.scoreLabel(source.authorityScore)}`);
    parts.push(`Relevance: ${this.scoreLabel(source.relevanceScore)}`);

    if (source.keyFindings.length > 0) {
      parts.push(`Key findings: ${source.keyFindings.slice(0, 3).join("; ")}`);
    }

    return parts.join(" | ");
  }

  filterByCredibility(sources: ResearchSource[], minScore: number = 0.5): ResearchSource[] {
    return sources.filter((s) => s.credibilityScore >= minScore);
  }

  sortByRelevance(sources: ResearchSource[], topic: string): ResearchSource[] {
    const lower = topic.toLowerCase();
    return [...sources].sort((a, b) => {
      const aRel = this.calculateTopicRelevance(a, lower);
      const bRel = this.calculateTopicRelevance(b, lower);
      return bRel - aRel;
    });
  }

  private analyzeFactors(source: ResearchSource): SourceCredibilityFactors {
    return {
      sourceType: source.sourceType,
      hasAuthors: source.authors.length > 0,
      hasDate: !!source.publicationDate,
      hasMethodology: !!source.methodology,
      hasCitations: source.citations.length > 0,
      isPeerReviewed: source.citations.length > 2,
      contentLength: source.keyFindings.join(" ").length,
      hasFormalStructure: source.keyFindings.length > 2,
    };
  }

  private calculateCredibility(factors: SourceCredibilityFactors): number {
    let score = 0.3;

    const typeScores: Partial<Record<SourceType, number>> = {
      "academic-paper": 0.4,
      "government-source": 0.4,
      "textbook": 0.35,
      "research-organization": 0.35,
      "legal-authority": 0.4,
      "technical-documentation": 0.3,
      "lecture-notes": 0.2,
      "book": 0.3,
      "article": 0.2,
      "news": 0.15,
      "company-documentation": 0.15,
    };

    score += typeScores[factors.sourceType] ?? 0.1;
    if (factors.hasAuthors) score += 0.1;
    if (factors.hasDate) score += 0.05;
    if (factors.hasMethodology) score += 0.15;
    if (factors.hasCitations) score += 0.1;
    if (factors.isPeerReviewed) score += 0.1;
    if (factors.hasFormalStructure) score += 0.05;

    return Math.max(0, Math.min(1, score));
  }

  private calculateAuthority(factors: SourceCredibilityFactors, source: ResearchSource): number {
    let score = 0.2;

    if (source.authors.length > 0) score += 0.2;
    if (source.authors.length > 1) score += 0.1;
    if (source.publicationDate) {
      const year = parseInt(source.publicationDate.split("-")[0]);
      const age = new Date().getFullYear() - year;
      if (age <= 2) score += 0.15;
      else if (age <= 5) score += 0.1;
      else if (age <= 10) score += 0.05;
    }
    if (factors.hasCitations) score += 0.15;
    if (factors.hasMethodology) score += 0.1;
    if (source.citations.length > 5) score += 0.1;

    return Math.max(0, Math.min(1, score));
  }

  private calculateTopicRelevance(source: ResearchSource, topicLower: string): number {
    let score = source.relevanceScore;

    const title = source.title.toLowerCase();
    const findings = source.keyFindings.join(" ").toLowerCase();

    if (title.includes(topicLower)) score += 0.3;
    if (findings.includes(topicLower)) score += 0.2;

    const topicWords = topicLower.split(/\s+/);
    for (const word of topicWords) {
      if (word.length > 3) {
        if (title.includes(word)) score += 0.1;
        if (findings.includes(word)) score += 0.05;
      }
    }

    return Math.max(0, Math.min(1, score));
  }

  private scoreLabel(score: number): string {
    if (score >= 0.8) return "Very High";
    if (score >= 0.6) return "High";
    if (score >= 0.4) return "Moderate";
    if (score >= 0.2) return "Low";
    return "Very Low";
  }
}
