import type { SubjectProfile } from "../../engine/types";
import { ProfileRegistry } from "../../engine/profiles/registry";
import type { LearningPath, TierGroup, ConceptNode, Tier, ConceptEdge } from "../types";
import { TIER_ORDER, TIER_LABELS } from "../types";
import { TopicBreakdownEngine } from "./topic-breakdown";

const CONCEPT_ID_COUNTER = new Map<string, number>();

function generateId(prefix: string): string {
  const count = (CONCEPT_ID_COUNTER.get(prefix) || 0) + 1;
  CONCEPT_ID_COUNTER.set(prefix, count);
  return `${prefix}_${count}`;
}

export class LearningPathEngine {
  private breakdownEngine = new TopicBreakdownEngine();

  generatePath(
    topic: string,
    subjectId?: string,
    depth: number = 5,
  ): LearningPath {
    const profile = subjectId
      ? ProfileRegistry.get(subjectId)
      : undefined;

    const subjectName = profile?.name ?? "General Knowledge";
    const resolvedSubjectId = profile?.id ?? "general-knowledge";
    const topicLower = topic.toLowerCase().trim();

    const concepts = this.breakdownEngine.breakdown(topicLower, profile ?? undefined);
    const tiers: TierGroup[] = [];
    const dependencies: ConceptEdge[] = [];

    for (const tier of TIER_ORDER.slice(0, depth)) {
      const tierConcepts = concepts.filter((c) => c.tier === tier);

      if (tierConcepts.length === 0) {
        const generated = this.generateConceptsForTier(
          tier, topicLower, resolvedSubjectId, profile ?? undefined,
        );
        if (generated.length > 0) {
          tiers.push({ tier, label: TIER_LABELS[tier], concepts: generated });
          const tConcepts = generated;
          for (let i = 1; i < tConcepts.length; i++) {
            dependencies.push({
              sourceId: tConcepts[i - 1].id,
              targetId: tConcepts[i].id,
              relationship: "builds-on",
              strength: 0.7,
            });
          }
        }
      } else {
        tiers.push({ tier, label: TIER_LABELS[tier], concepts: tierConcepts });
      }
    }

    for (let i = 1; i < tiers.length; i++) {
      const prevTier = tiers[i - 1];
      const currTier = tiers[i];
      for (const current of currTier.concepts) {
        const prerequisites = prevTier.concepts.slice(0, 2);
        for (const prereq of prerequisites) {
          dependencies.push({
            sourceId: prereq.id,
            targetId: current.id,
            relationship: "prerequisite",
            strength: 0.8,
          });
        }
      }
    }

    const totalMinutes = tiers.reduce(
      (sum, t) => sum + t.concepts.reduce((s, c) => s + c.estimatedMinutes, 0),
      0,
    );

    return {
      topic,
      subjectId: resolvedSubjectId,
      subjectName,
      tiers,
      dependencies,
      estimatedTotalMinutes: totalMinutes,
      createdAt: Date.now(),
    };
  }

  private generateConceptsForTier(
    tier: Tier,
    topic: string,
    subjectId: string,
    profile?: SubjectProfile,
  ): ConceptNode[] {
    const subdisciplines = profile?.subdisciplines ?? [];
    const keywords = profile?.keywords ?? [];
    const difficultyProgression = profile?.teachingPhilosophy?.difficultyProgression ?? [];

    const baseMinutes: Record<Tier, number> = {
      foundation: 3,
      core: 5,
      intermediate: 7,
      advanced: 10,
      expert: 12,
      application: 8,
      research: 15,
      future: 10,
    };

    const signal: Record<Tier, string> = {
      foundation: "foundation",
      core: "core",
      intermediate: "intermediate",
      advanced: "advanced",
      expert: "expert",
      application: "applied",
      research: "research",
      future: "future",
    };

    const nodes: ConceptNode[] = [];
    const topicWords = topic.split(/\s+/);

    const tierKeywords = keywords.filter((k) => {
      const tierMatch = profile?.teachingPhilosophy?.difficultyProgression?.some((d) =>
        d.toLowerCase().includes(signal[tier]),
      );
      return tierMatch || Math.random() > 0.5;
    });

    const used = tierKeywords.slice(0, Math.max(2, 4 - tierKeywords.length));

    for (const kw of used) {
      const id = generateId(`path_${subjectId}`);
      nodes.push({
        id,
        label: kw.charAt(0).toUpperCase() + kw.slice(1),
        description: `${kw} — a ${tier.replace("-", " ")} concept in ${profile?.name || "this subject"}`,
        subjectId,
        tier,
        keywords: [kw, ...topicWords],
        estimatedMinutes: baseMinutes[tier] || 5,
        confidence: 0.6,
      });
    }

    if (nodes.length === 0) {
      const label = `${tier.charAt(0).toUpperCase() + tier.slice(1)} ${topic.charAt(0).toUpperCase() + topic.slice(1)}`;
      nodes.push({
        id: generateId(`path_${subjectId}`),
        label,
        description: `Key ${tier} concept in ${topic}`,
        subjectId,
        tier,
        keywords: topicWords,
        estimatedMinutes: baseMinutes[tier] || 5,
        confidence: 0.5,
      });
    }

    return nodes;
  }
}
