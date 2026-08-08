import type { ProgressionState, ConceptNode, Tier, LearningEvent } from "../types";
import { TIER_ORDER, TIER_LABELS } from "../types";

export class ProgressionTracker {
  recordEvent(
    progress: Map<string, ProgressionState>,
    concepts: ConceptNode[],
    event: LearningEvent,
  ): ProgressionState[] {
    const updated: ProgressionState[] = [];

    for (const concept of concepts) {
      const existing = progress.get(concept.id);
      if (existing) {
        existing.timesEncountered++;
        existing.lastEncountered = event.timestamp;
        existing.status = existing.timesEncountered >= 3 ? "explored" : existing.status;
        existing.status = existing.timesEncountered >= 5 ? "understood" : existing.status;
        updated.push({ ...existing });
      } else {
        const state: ProgressionState = {
          conceptId: concept.id,
          status: "encountered",
          timesEncountered: 1,
          lastEncountered: event.timestamp,
          notes: [],
        };
        progress.set(concept.id, state);
        updated.push(state);
      }
    }

    return updated;
  }

  generateProgressionNarrative(
    progress: ProgressionState[],
    concepts: ConceptNode[],
    currentTier: Tier,
  ): string {
    const explored = progress.filter((p) => p.status !== "encountered");
    const mastered = progress.filter((p) => p.status === "mastered");
    const tierProgress = TIER_ORDER.indexOf(currentTier);

    if (explored.length === 0) {
      return "";
    }

    const parts: string[] = [];

    if (mastered.length >= 2) {
      parts.push(`You have built a solid understanding of ${mastered.length} key concepts.`);
    }

    const currentTierConcepts = concepts.filter((c) => TIER_ORDER.indexOf(c.tier as Tier) <= tierProgress);
    const completedCount = currentTierConcepts.filter(
      (c) => progress.find((p) => p.conceptId === c.id && p.status !== "encountered"),
    ).length;

    if (currentTierConcepts.length > 0 && completedCount > 0) {
      const pct = Math.round((completedCount / currentTierConcepts.length) * 100);
      parts.push(`You have covered ${pct}% of the ${TIER_LABELS[currentTier] || currentTier} concepts for this topic.`);
    }

    if (parts.length === 0) {
      parts.push(`You are building your understanding of ${TIER_LABELS[currentTier]?.toLowerCase() || currentTier} concepts.`);
    }

    return parts.join(" ");
  }

  suggestNextTier(currentTier: Tier, progress: ProgressionState[], concepts: ConceptNode[]): Tier | null {
    const currentIndex = TIER_ORDER.indexOf(currentTier);
    if (currentIndex >= TIER_ORDER.length - 1) return null;

    const currentConcepts = concepts.filter((c) => c.tier === currentTier);
    const currentProgress = currentConcepts.filter(
      (c) => progress.find((p) => p.conceptId === c.id && (p.status === "explored" || p.status === "understood" || p.status === "mastered")),
    );

    if (currentConcepts.length > 0 && currentProgress.length >= currentConcepts.length * 0.5) {
      return TIER_ORDER[currentIndex + 1];
    }

    return null;
  }

  getWeakestAreas(progress: ProgressionState[], concepts: ConceptNode[]): ConceptNode[] {
    const weakConceptIds = progress
      .filter((p) => p.status === "encountered" && p.timesEncountered >= 2)
      .map((p) => p.conceptId);

    return concepts.filter((c) => weakConceptIds.includes(c.id));
  }
}
