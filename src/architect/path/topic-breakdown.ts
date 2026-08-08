import type { SubjectProfile } from "../../engine/types";
import type { ConceptNode, Tier } from "../types";
import { TIER_ORDER } from "../types";

const BASE_MINUTES: Record<Tier, number> = {
  foundation: 3,
  core: 5,
  intermediate: 7,
  advanced: 10,
  expert: 12,
  application: 8,
  research: 15,
  future: 10,
};

const TIER_SIGNAL_WORDS: Record<Tier, string[]> = {
  foundation: ["basic", "introduction", "fundamental", "beginner", "what is", "overview", "simple", "start", "first"],
  core: ["core", "main", "key", "essential", "important", "primary", "central", "critical"],
  intermediate: ["intermediate", "advanced beginner", "beyond basics", "deeper", "practical"],
  advanced: ["advanced", "complex", "deep", "sophisticated", "expert", "nuanced", "advanced topic"],
  expert: ["expert", "specialized", "cutting-edge", "frontier", "state-of-the-art", "professional"],
  application: ["application", "real world", "practical", "implementation", "use case", "example", "project"],
  research: ["research", "paper", "study", "literature", "theory", "academic", "publication"],
  future: ["future", "emerging", "trend", "next generation", "upcoming", "direction", "roadmap"],
};

const CONCEPT_ID_COUNTER = new Map<string, number>();

function generateId(prefix: string): string {
  const count = (CONCEPT_ID_COUNTER.get(prefix) || 0) + 1;
  CONCEPT_ID_COUNTER.set(prefix, count);
  return `${prefix}_${count}`;
}

function extractTopic(query: string): string {
  const clean = query
    .replace(/^(what|how|why|when|where|can you|please|explain|teach|tell me about|help me understand|i want to learn|what is|what are|how does|why does)\s+/i, "")
    .replace(/[?.!]+$/, "")
    .trim();
  return clean || query;
}

export class TopicBreakdownEngine {
  breakdown(
    query: string,
    profile?: SubjectProfile,
  ): ConceptNode[] {
    const topic = extractTopic(query);
    const topicWords = topic.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

    if (topicWords.length === 0) {
      return this.generateDefaultNodes(query, profile);
    }

    const signalScores = this.scoreTierSignals(query, topic);

    const concepts: ConceptNode[] = [];
    const keywords = profile?.keywords ?? [];
    const subdisciplines = profile?.subdisciplines ?? [];
    const difficultyProgression = profile?.teachingPhilosophy?.difficultyProgression ?? [];

    const allTerms = [
      ...keywords.map((k) => ({ term: k, weight: 2 })),
      ...subdisciplines.map((s) => ({ term: s, weight: 1.5 })),
      ...topicWords.map((w) => ({ term: w, weight: 1 })),
    ];

    const usedTerms = new Set<string>();
    const maxPerTier = 3;

    for (const tier of TIER_ORDER) {
      const tierScore = signalScores.get(tier) ?? 0;
      let tierConcepts = 0;

      for (const { term, weight } of allTerms) {
        if (tierConcepts >= maxPerTier) break;
        if (usedTerms.has(term)) continue;

        const matchesTier = this.termMatchesTier(term, tier, difficultyProgression);
        const signalBoost = matchesTier ? 2 : 0;
        const effectiveScore = tierScore + signalBoost + weight * 0.5;

        if (effectiveScore > 1.5 || matchesTier) {
          const id = generateId(`topic`);
          concepts.push({
            id,
            label: this.formatLabel(term),
            description: `${this.formatLabel(term)} — a ${tier.replace("-", " ")} concept`,
            subjectId: profile?.id ?? "general-knowledge",
            tier,
            keywords: [term, ...topicWords],
            estimatedMinutes: BASE_MINUTES[tier],
            confidence: Math.min(1, effectiveScore / 10),
          });
          usedTerms.add(term);
          tierConcepts++;
        }
      }

      if (tierConcepts === 0) {
        const genericLabel = `${tier.charAt(0).toUpperCase() + tier.slice(1)} ${topic.charAt(0).toUpperCase() + topic.slice(1)}`;
        concepts.push({
          id: generateId(`topic`),
          label: genericLabel,
          description: `Core ${tier} aspect of ${topic}`,
          subjectId: profile?.id ?? "general-knowledge",
          tier,
          keywords: [topic, ...topicWords],
          estimatedMinutes: BASE_MINUTES[tier],
          confidence: 0.4,
        });
      }
    }

    return concepts;
  }

  classifyQuery(query: string, profile?: SubjectProfile): Tier {
    const signalScores = this.scoreTierSignals(query, profile?.teachingPhilosophy?.difficultyProgression);
    let bestTier: Tier = "core";
    let bestScore = 0;

    for (const tier of TIER_ORDER) {
      const score = signalScores.get(tier) ?? 0;
      if (score > bestScore) {
        bestScore = score;
        bestTier = tier;
      }
    }

    return bestTier;
  }

  private scoreTierSignals(
    query: string,
    _topicWords?: string | string[],
  ): Map<Tier, number> {
    const lower = query.toLowerCase();
    const scores = new Map<Tier, number>();

    for (const tier of TIER_ORDER) {
      const signals = TIER_SIGNAL_WORDS[tier];
      let score = 0;
      for (const signal of signals) {
        if (lower.includes(signal)) {
          score += signal.length / lower.length * 10;
          const words = lower.split(/\s+/);
          const signalWords = signal.split(/\s+/);
          const matchCount = signalWords.filter((sw) => words.includes(sw)).length;
          if (matchCount > 0) score += (matchCount / signalWords.length) * 5;
        }
      }
      scores.set(tier, score);
    }

    return scores;
  }

  private termMatchesTier(term: string, tier: Tier, difficultyProgression: string[]): boolean {
    if (difficultyProgression.length === 0) return false;
    const lower = term.toLowerCase();
    const tierSignal = tier.replace("-", " ");
    return difficultyProgression.some((d) => {
      const dl = d.toLowerCase();
      return dl.includes(lower) || lower.includes(dl) || dl.includes(tierSignal);
    });
  }

  private generateDefaultNodes(query: string, profile?: SubjectProfile): ConceptNode[] {
    const topic = extractTopic(query);
    const subjectId = profile?.id ?? "general-knowledge";
    return TIER_ORDER.map((tier) => ({
      id: generateId(`topic`),
      label: `${tier.charAt(0).toUpperCase() + tier.slice(1)} ${topic.charAt(0).toUpperCase() + topic.slice(1)}`,
      description: `${tier.replace("-", " ")} aspects of ${topic}${profile ? ` in ${profile.name}` : ""}`,
      subjectId,
      tier,
      keywords: [topic],
      estimatedMinutes: BASE_MINUTES[tier],
      confidence: 0.3,
    }));
  }

  private formatLabel(term: string): string {
    return term
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
}
