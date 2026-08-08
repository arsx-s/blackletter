import type { ExplanationStyle, LearnerProfile, KnowledgeConfidence } from "../types";
import { CONFIDENCE_ORDER } from "../types";

export interface StyleVariant {
  style: ExplanationStyle;
  label: string;
  description: string;
  whenToUse: string;
  promptDirective: string;
}

const STYLE_VARIANTS: StyleVariant[] = [
  {
    style: "visual",
    label: "Visual Explanation",
    description: "Diagrams, tables, spatial relationships",
    whenToUse: "User engages with visual content, prefers seeing relationships",
    promptDirective: "Use visual descriptions, ASCII diagrams, tables, and spatial metaphors. Describe the concept as if drawing it.",
  },
  {
    style: "analogy",
    label: "Analogy-Based",
    description: "Familiar comparisons, mental models",
    whenToUse: "User frequently expands analogies, responds well to metaphors",
    promptDirective: "Lead with a powerful analogy from everyday life. Build the entire explanation around the analogy before introducing formal terms.",
  },
  {
    style: "technical",
    label: "Technical Deep Dive",
    description: "Precise terminology, formal definitions",
    whenToUse: "User requests depth, has high confidence in prerequisites",
    promptDirective: "Use precise technical language. Include formal definitions, specifications, and rigorous formulations. Do not oversimplify.",
  },
  {
    style: "step-by-step",
    label: "Step by Step",
    description: "Sequential, numbered, incremental",
    whenToUse: "Default for new topics, user prefers structure",
    promptDirective: "Break the concept into clear sequential steps. Number each step. Build incrementally. Each step must be fully understood before the next.",
  },
  {
    style: "historical",
    label: "Historical Journey",
    description: "Evolution of ideas, key contributors, timeline",
    whenToUse: "User opens historical context, asks about origins",
    promptDirective: "Explain through historical development. Who discovered this? What problem were they solving? How did understanding evolve? What were the key breakthroughs?",
  },
  {
    style: "mathematical",
    label: "Mathematical Formulation",
    description: "Equations, derivations, formal proofs",
    whenToUse: "User expands mathematical sections, has math background",
    promptDirective: "Use mathematical notation and formal derivations. Show the equations. Prove the results. Explain the quantitative relationships.",
  },
  {
    style: "practical",
    label: "Practical Application",
    description: "Real-world use, implementation focus",
    whenToUse: "User asks about applications, uses industry mode",
    promptDirective: "Focus on practical application. Show how this is actually used. Emphasize implementation, trade-offs, and real-world considerations.",
  },
  {
    style: "story-based",
    label: "Story-Based",
    description: "Narrative, characters, scenarios",
    whenToUse: "User engages with narrative content, prefers stories",
    promptDirective: "Frame the concept as a story. Create characters who encounter the problem the concept solves. Show the journey of discovery through narrative.",
  },
  {
    style: "case-study",
    label: "Case Study",
    description: "Real examples, specific outcomes, lessons learned",
    whenToUse: "User asks for examples, uses professional practice mode",
    promptDirective: "Teach through detailed case studies. Present a real situation, the challenges faced, the solution applied, and the outcome. Extract general principles from each case.",
  },
];

export class ExplanationVariationSelector {
  getAllVariants(): StyleVariant[] {
    return STYLE_VARIANTS;
  }

  getVariant(style: ExplanationStyle): StyleVariant | undefined {
    return STYLE_VARIANTS.find((v) => v.style === style);
  }

  selectBestStyle(
    profile: LearnerProfile,
    conceptId?: string,
    context?: {
      isNewTopic?: boolean;
      hasConfusion?: boolean;
      requestedDepth?: number;
    },
  ): ExplanationStyle {
    if (context?.hasConfusion && profile.preferences.preferredExplanationStyle !== "step-by-step") {
      return "step-by-step";
    }

    if (context?.isNewTopic) {
      return "step-by-step";
    }

    if (conceptId) {
      const knowledge = profile.knowledgeState[conceptId];
      if (knowledge?.preferredStyle) {
        const successRate = profile.explanationPrefs.styleSuccessRate[knowledge.preferredStyle] ?? 0.5;
        if (successRate > 0.4) {
          return knowledge.preferredStyle;
        }
      }
    }

    const styleSuccessEntries = Object.entries(profile.explanationPrefs.styleSuccessRate);
    if (styleSuccessEntries.length > 0) {
      const best = styleSuccessEntries.sort(([, a], [, b]) => b - a)[0];
      if (best[1] > 0.6) {
        return best[0] as ExplanationStyle;
      }
    }

    return profile.preferences.preferredExplanationStyle;
  }

  selectStyleForConfidence(
    knowledge: KnowledgeConfidence,
    profile: LearnerProfile,
  ): ExplanationStyle {
    const levelIndex = CONFIDENCE_ORDER.indexOf(knowledge.level);

    if (levelIndex <= 1) {
      return "step-by-step";
    }
    if (levelIndex === 2) {
      const preference = profile.preferences.preferredExplanationStyle;
      return preference === "step-by-step" ? "analogy" : preference;
    }
    if (levelIndex === 3) {
      return profile.preferences.prefersMathematics ? "mathematical" : "technical";
    }
    return "practical";
  }

  getStylePromptOverride(style: ExplanationStyle): string | null {
    const variant = STYLE_VARIANTS.find((v) => v.style === style);
    return variant?.promptDirective ?? null;
  }

  getStylesForConfidenceLevel(level: string): ExplanationStyle[] {
    const levelIndex = CONFIDENCE_ORDER.indexOf(level as typeof CONFIDENCE_ORDER[number]);
    if (levelIndex <= 0) return ["step-by-step", "visual", "analogy"];
    if (levelIndex <= 1) return ["analogy", "story-based", "step-by-step"];
    if (levelIndex <= 2) return ["practical", "case-study", "technical"];
    if (levelIndex <= 3) return ["technical", "mathematical", "historical"];
    return ["practical", "case-study", "technical"];
  }
}
