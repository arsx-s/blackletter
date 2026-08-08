import type { Microlesson, Tier, ConceptNode } from "../types";
import { TopicBreakdownEngine } from "../path/topic-breakdown";
import type { SubjectProfile } from "../../engine/types";

const MICROLESSON_TEMPLATES: Record<string, { title: string; keyPoint: string }> = {
  default: {
    title: "Understanding {concept}",
    keyPoint: "{concept} is a {tier} concept that helps you understand {topic} more deeply.",
  },
  foundation: {
    title: "The Basics of {concept}",
    keyPoint: "{concept} is a fundamental building block. Once you grasp this, more advanced ideas will make sense.",
  },
  core: {
    title: "{concept}: Core Concept",
    keyPoint: "{concept} is one of the essential ideas in {topic}. Master this to build a strong foundation.",
  },
  intermediate: {
    title: "Going Deeper: {concept}",
    keyPoint: "{concept} extends your understanding of {topic} by introducing more nuanced ideas.",
  },
  advanced: {
    title: "Advanced: {concept}",
    keyPoint: "{concept} represents a sophisticated understanding of {topic}, building on foundational knowledge.",
  },
  application: {
    title: "{concept} in Practice",
    keyPoint: "{concept} shows how {topic} concepts are applied in real-world situations.",
  },
};

export class MicrolessonGenerator {
  private breakdownEngine = new TopicBreakdownEngine();

  generate(
    query: string,
    profile?: SubjectProfile,
    currentTier?: Tier,
  ): Microlesson | null {
    const concepts = this.breakdownEngine.breakdown(query, profile);
    const tier = currentTier ?? this.breakdownEngine.classifyQuery(query, profile);

    const tierConcepts = concepts.filter((c) => c.tier === tier);
    const primaryConcept = tierConcepts[0] ?? concepts[0];

    if (!primaryConcept) return null;

    const template = MICROLESSON_TEMPLATES[tier] ?? MICROLESSON_TEMPLATES["default"];
    const subjectName = profile?.name ?? "this subject";

    const title = template.title
      .replace("{concept}", primaryConcept.label)
      .replace("{topic}", query);
    const keyPoint = template.keyPoint
      .replace("{concept}", primaryConcept.label)
      .replace("{topic}", query)
      .replace("{tier}", tier.replace("-", " "))
      .replace("{subject}", subjectName);

    const prereqs = concepts
      .filter((c) => {
        const tierOrder: Record<string, number> = {
          foundation: 0, core: 1, intermediate: 2, advanced: 3,
          expert: 4, application: 5, research: 6, future: 7,
        };
        return (tierOrder[c.tier] ?? 0) < (tierOrder[tier] ?? 0);
      })
      .slice(0, 3)
      .map((c) => c.label);

    const continuations = concepts
      .filter((c) => {
        const tierOrder: Record<string, number> = {
          foundation: 0, core: 1, intermediate: 2, advanced: 3,
          expert: 4, application: 5, research: 6, future: 7,
        };
        return (tierOrder[c.tier] ?? 0) > (tierOrder[tier] ?? 0);
      })
      .slice(0, 3)
      .map((c) => c.label);

    return {
      title,
      conceptId: primaryConcept.id,
      conceptLabel: primaryConcept.label,
      tier,
      estimatedMinutes: Math.max(2, Math.min(5, primaryConcept.estimatedMinutes)),
      keyPoint,
      prerequisiteConcepts: prereqs,
      continuationConcepts: continuations,
      teachingModeId: this.modeForTier(tier),
    };
  }

  generateMultiple(
    query: string,
    profile?: SubjectProfile,
    targetTiers?: Tier[],
  ): Microlesson[] {
    const concepts = this.breakdownEngine.breakdown(query, profile);
    const lessons: Microlesson[] = [];
    const seenTiers = new Set<string>();

    for (const concept of concepts) {
      if (targetTiers && !targetTiers.includes(concept.tier as Tier)) continue;
      if (seenTiers.has(concept.tier)) continue;
      seenTiers.add(concept.tier);

      const template = MICROLESSON_TEMPLATES[concept.tier] ?? MICROLESSON_TEMPLATES["default"];
      const subjectName = profile?.name ?? "this subject";

      const title = template.title
        .replace("{concept}", concept.label)
        .replace("{topic}", query);
      const keyPoint = template.keyPoint
        .replace("{concept}", concept.label)
        .replace("{topic}", query)
        .replace("{tier}", concept.tier.replace("-", " "))
        .replace("{subject}", subjectName);

      lessons.push({
        title,
        conceptId: concept.id,
        conceptLabel: concept.label,
        tier: concept.tier as Tier,
        estimatedMinutes: Math.max(2, Math.min(5, concept.estimatedMinutes)),
        keyPoint,
        prerequisiteConcepts: [],
        continuationConcepts: [],
        teachingModeId: this.modeForTier(concept.tier as Tier),
      });
    }

    return lessons;
  }

  private modeForTier(tier: Tier): "learn-from-scratch" | "student-study" | "industry-application" | "research-mode" | "quick-review" {
    if (tier === "foundation" || tier === "core") return "learn-from-scratch";
    if (tier === "application") return "industry-application";
    if (tier === "research") return "research-mode";
    return "student-study";
  }
}
