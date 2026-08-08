import type { KnowledgeConfidence, KnowledgeConfidenceLevel, LearnerProfile, ExplanationStyle } from "../types";
import { CONFIDENCE_ORDER } from "../types";

export class KnowledgeConfidenceEstimator {
  recordInteraction(
    profile: LearnerProfile,
    conceptId: string,
    conceptLabel: string,
    relatedConcepts: string[] = [],
    preferredStyle?: ExplanationStyle,
  ): KnowledgeConfidence {
    const existing = profile.knowledgeState[conceptId];

    if (existing) {
      existing.timesEncountered++;
      existing.lastInteraction = Date.now();
      existing.relatedConcepts = [
        ...new Set([...existing.relatedConcepts, ...relatedConcepts]),
      ];
      if (preferredStyle) existing.preferredStyle = preferredStyle;
      existing.level = this.recalculateLevel(existing);
      return existing;
    }

    const confidence: KnowledgeConfidence = {
      conceptId,
      conceptLabel,
      level: "introduced",
      timesEncountered: 1,
      timesTested: 0,
      timesCorrect: 0,
      lastInteraction: Date.now(),
      relatedConcepts,
      preferredStyle: preferredStyle ?? null,
    };

    profile.knowledgeState[conceptId] = confidence;

    profile.progress.totalConceptsDiscovered = Object.keys(profile.knowledgeState).length;
    this.updateProgressCounts(profile);

    return confidence;
  }

  recordTestResult(
    profile: LearnerProfile,
    conceptId: string,
    correct: boolean,
  ): KnowledgeConfidence | null {
    const existing = profile.knowledgeState[conceptId];
    if (!existing) return null;

    existing.timesTested++;
    if (correct) existing.timesCorrect++;
    existing.level = this.recalculateLevel(existing);
    this.updateProgressCounts(profile);

    return existing;
  }

  getConfidence(profile: LearnerProfile, conceptId: string): KnowledgeConfidenceLevel | null {
    return profile.knowledgeState[conceptId]?.level ?? null;
  }

  getConceptsAtLevel(profile: LearnerProfile, level: KnowledgeConfidenceLevel): KnowledgeConfidence[] {
    return Object.values(profile.knowledgeState).filter((c) => c.level === level);
  }

  getRecentConcepts(profile: LearnerProfile, limit: number = 10): KnowledgeConfidence[] {
    return Object.values(profile.knowledgeState)
      .sort((a, b) => b.lastInteraction - a.lastInteraction)
      .slice(0, limit);
  }

  getWeakestConcepts(profile: LearnerProfile, limit: number = 5): KnowledgeConfidence[] {
    return Object.values(profile.knowledgeState)
      .sort((a, b) => CONFIDENCE_ORDER.indexOf(a.level) - CONFIDENCE_ORDER.indexOf(b.level))
      .slice(0, limit);
  }

  getStrongestConcepts(profile: LearnerProfile, limit: number = 5): KnowledgeConfidence[] {
    return Object.values(profile.knowledgeState)
      .sort((a, b) => CONFIDENCE_ORDER.indexOf(b.level) - CONFIDENCE_ORDER.indexOf(a.level))
      .slice(0, limit);
  }

  private recalculateLevel(confidence: KnowledgeConfidence): KnowledgeConfidenceLevel {
    const { timesEncountered, timesTested, timesCorrect } = confidence;

    if (timesEncountered <= 1) return "introduced";
    if (timesEncountered <= 3 && timesTested === 0) return "learning";
    if (timesEncountered <= 5 && timesTested > 0 && timesCorrect / Math.max(1, timesTested) < 0.7) return "learning";

    if (timesEncountered >= 4 && timesTested >= 2 && timesCorrect / Math.max(1, timesTested) >= 0.7) {
      return "comfortable";
    }

    if (timesEncountered >= 7 && timesTested >= 4 && timesCorrect / Math.max(1, timesTested) >= 0.8) {
      return "confident";
    }

    if (timesEncountered >= 12 && timesTested >= 6 && timesCorrect / Math.max(1, timesTested) >= 0.9) {
      return "mastered";
    }

    if (timesEncountered >= 2) return "learning";
    return "introduced";
  }

  private updateProgressCounts(profile: LearnerProfile): void {
    profile.progress.topicsAtComfortable = this.getConceptsAtLevel(profile, "comfortable").length;
    profile.progress.topicsAtConfident = this.getConceptsAtLevel(profile, "confident").length;
    profile.progress.topicsAtMastered = this.getConceptsAtLevel(profile, "mastered").length;
    profile.progress.topicsExplored = Object.keys(profile.knowledgeState).length;

    const maxTierScore = Object.values(profile.knowledgeState).reduce(
      (sum, c) => sum + CONFIDENCE_ORDER.indexOf(c.level),
      0,
    );
    const maxPossible = Object.keys(profile.knowledgeState).length * (CONFIDENCE_ORDER.length - 1);
    profile.progress.researchDepth = maxPossible > 0 ? maxTierScore / maxPossible : 0;
  }
}
