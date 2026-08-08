import type { SmartContinuation, Tier } from "../types";
import { TIER_LABELS } from "../types";

export class SmartContinuationGenerator {
  generate(
    query: string,
    currentTier: Tier,
    subjectId: string,
    hasVisualContent: boolean,
    nextTier: Tier | null,
  ): SmartContinuation[] {
    const continuations: SmartContinuation[] = [];

    continuations.push({
      label: "Continue Learning",
      description: `Go deeper into ${TIER_LABELS[currentTier]?.toLowerCase() || currentTier} concepts`,
      icon: "arrow-right",
      action: {
        type: "teach",
        payload: { query: `Tell me more about ${query}`, subjectId },
      },
    });

    if (!hasVisualContent) {
      continuations.push({
        label: "See Visual Explanation",
        description: "Understand through diagrams and visual thinking",
        icon: "image",
        action: {
          type: "visual",
          payload: { query: `Explain ${query} with visual diagrams and illustrations`, subjectId },
        },
      });
    }

    continuations.push({
      label: "Practice Problems",
      description: "Test your understanding with exercises",
      icon: "code",
      action: {
        type: "switch-mode",
        payload: { modeId: "exam-preparation", query: `Practice problems for ${query}`, subjectId },
      },
    });

    if (nextTier) {
      continuations.push({
        label: `Move to ${TIER_LABELS[nextTier]}`,
        description: `Advance to ${TIER_LABELS[nextTier]?.toLowerCase()} concepts`,
        icon: "trending-up",
        action: {
          type: "teach",
          payload: { query: `Next: ${TIER_LABELS[nextTier]} concepts in ${query}`, tier: nextTier, subjectId },
        },
      });
    }

    continuations.push({
      label: "Challenge Yourself",
      description: "A deeper question to test genuine understanding",
      icon: "zap",
      action: {
        type: "switch-mode",
        payload: { modeId: "interview-preparation", query: `Challenging questions about ${query}`, subjectId },
      },
    });

    continuations.push({
      label: "Real World Applications",
      description: "How this is used in practice",
      icon: "briefcase",
      action: {
        type: "switch-mode",
        payload: { modeId: "industry-application", query: `Real world applications of ${query}`, subjectId },
      },
    });

    continuations.push({
      label: "Research Further",
      description: "Academic research and current developments",
      icon: "microscope",
      action: {
        type: "switch-mode",
        payload: { modeId: "research-mode", query: `Research and developments in ${query}`, subjectId },
      },
    });

    return continuations;
  }
}
