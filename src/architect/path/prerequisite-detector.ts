import type { SubjectProfile } from "../../engine/types";
import { ProfileRegistry } from "../../engine/profiles/registry";
import { TopicBreakdownEngine } from "./topic-breakdown";
import type { PrerequisiteInfo, Tier, ConceptNode } from "../types";
import { TIER_ORDER } from "../types";

export class PrerequisiteDetector {
  private breakdownEngine = new TopicBreakdownEngine();

  detectPrerequisites(
    query: string,
    profile?: SubjectProfile,
    knownConcepts: string[] = [],
  ): PrerequisiteInfo[] {
    const resolvedProfile = profile ?? ProfileRegistry.getDefault();
    const classification = this.breakdownEngine.classifyQuery(query, resolvedProfile);
    const tierIndex = TIER_ORDER.indexOf(classification);

    if (tierIndex <= 0) return [];

    const prerequisites: PrerequisiteInfo[] = [];
    const seen = new Set<string>();

    const lowerKnown = knownConcepts.map((k) => k.toLowerCase());

    const lowerTiers = TIER_ORDER.slice(0, tierIndex);
    const allConcepts = this.breakdownEngine.breakdown(query, resolvedProfile);

    for (const concept of allConcepts) {
      const conceptTierIndex = TIER_ORDER.indexOf(concept.tier as Tier);
      if (conceptTierIndex >= tierIndex) continue;
      if (seen.has(concept.id)) continue;
      seen.add(concept.id);

      const isKnown = lowerKnown.some(
        (k) =>
          concept.label.toLowerCase().includes(k) ||
          concept.keywords.some((kw) => kw.toLowerCase().includes(k)),
      );

      prerequisites.push({
        conceptId: concept.id,
        conceptLabel: concept.label,
        tier: concept.tier as Tier,
        isCovered: isKnown,
        estimatedMinutes: concept.estimatedMinutes,
        briefExplanation: this.generateBriefExplanation(concept, resolvedProfile, isKnown),
      });
    }

    if (prerequisites.length === 0) {
      const generated = this.synthesizePrerequisites(classification, query, resolvedProfile);
      for (const g of generated) {
        if (!seen.has(g.conceptId)) {
          seen.add(g.conceptId);
          prerequisites.push(g);
        }
      }
    }

    return prerequisites.slice(0, 4);
  }

  private synthesizePrerequisites(
    tier: Tier,
    query: string,
    profile: SubjectProfile,
  ): PrerequisiteInfo[] {
    const tierIndex = TIER_ORDER.indexOf(tier);
    const keywords = profile.keywords;
    const subdisciplines = profile.subdisciplines;
    const difficultyProgression = profile.teachingPhilosophy.difficultyProgression;

    const prereqs: PrerequisiteInfo[] = [];
    const used = new Set<string>();

    const prereqTier = TIER_ORDER[Math.max(0, tierIndex - 2)];

    for (const kw of keywords) {
      if (prereqs.length >= 3) break;
      if (used.has(kw)) continue;
      const tierMatch = difficultyProgression.some((d, i) => {
        const dLower = d.toLowerCase();
        return dLower.includes(kw) && i < tierIndex;
      });
      if (tierMatch || prereqTier === "foundation") {
        used.add(kw);
        prereqs.push({
          conceptId: `prereq_${kw.replace(/\s+/g, "_")}`,
          conceptLabel: kw.charAt(0).toUpperCase() + kw.slice(1),
          tier: prereqTier,
          isCovered: false,
          estimatedMinutes: BASE_MINUTES[prereqTier] ?? 3,
          briefExplanation: `Understanding "${kw}" provides essential context for ${query}`,
        });
      }
    }

    return prereqs;
  }

  private generateBriefExplanation(
    concept: ConceptNode,
    profile: SubjectProfile,
    isKnown: boolean,
  ): string {
    if (isKnown) {
      return `You already have familiarity with "${concept.label}". We will reference it briefly to build on your existing understanding.`;
    }
    if (concept.tier === "foundation") {
      return `"${concept.label}" is a foundational building block. Think of it as the basic vocabulary needed before exploring deeper. We will introduce it naturally.`;
    }
    return `"${concept.label}" provides background context. We will cover what you need as we go, without assuming prior knowledge.`;
  }
}

const BASE_MINUTES: Record<string, number> = {
  foundation: 3,
  core: 5,
  intermediate: 7,
  advanced: 10,
  expert: 12,
  application: 8,
  research: 15,
  future: 10,
};
