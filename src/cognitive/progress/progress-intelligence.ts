import type { LearnerProfile, ProgressSnapshot, KnowledgeConfidence } from "../types";
import { CONFIDENCE_ORDER } from "../types";

export interface ProgressReport {
  snapshot: ProgressSnapshot;
  narrative: string;
  metrics: ProgressMetrics;
  recommendations: string[];
}

export interface ProgressMetrics {
  breadthScore: number;
  depthScore: number;
  growthRate: number;
  consistencyGrade: string;
  strengthAreas: string[];
  growthAreas: string[];
  recentAcceleration: number;
}

export class ProgressIntelligence {
  generateReport(profile: LearnerProfile): ProgressReport {
    const snapshot = profile.progress;
    const metrics = this.calculateMetrics(profile);
    const narrative = this.generateNarrative(profile, metrics);
    const recommendations = this.generateRecommendations(profile, metrics);

    return { snapshot, narrative, metrics, recommendations };
  }

  calculateMetrics(profile: LearnerProfile): ProgressMetrics {
    const knowledge = Object.values(profile.knowledgeState);
    const totalConcepts = knowledge.length || 1;

    const breadthScore = Math.min(1, totalConcepts / 20);
    const depthScore = knowledge.reduce(
      (sum, c) => sum + CONFIDENCE_ORDER.indexOf(c.level),
      0,
    ) / (totalConcepts * (CONFIDENCE_ORDER.length - 1));

    const masteredCount = knowledge.filter(
      (c) => CONFIDENCE_ORDER.indexOf(c.level) >= 3,
    ).length;
    const growthRate = masteredCount / Math.max(1, totalConcepts);

    const consistencyScore = profile.patterns.studyConsistency;
    const consistencyGrade =
      consistencyScore >= 0.8 ? "Excellent"
      : consistencyScore >= 0.6 ? "Good"
      : consistencyScore >= 0.4 ? "Developing"
      : "Building";

    const strengthAreas = knowledge
      .filter((c) => CONFIDENCE_ORDER.indexOf(c.level) >= 3)
      .slice(0, 3)
      .map((c) => c.conceptLabel);

    const growthAreas = knowledge
      .filter((c) => CONFIDENCE_ORDER.indexOf(c.level) <= 1)
      .slice(0, 3)
      .map((c) => c.conceptLabel);

    const recentActivity = Object.values(profile.knowledgeState).filter(
      (c) => Date.now() - c.lastInteraction < 7 * 86_400_000,
    ).length;
    const recentAcceleration = totalConcepts > 0 ? recentActivity / totalConcepts : 0;

    return {
      breadthScore,
      depthScore,
      growthRate,
      consistencyGrade,
      strengthAreas,
      growthAreas,
      recentAcceleration,
    };
  }

  generateNarrative(profile: LearnerProfile, metrics: ProgressMetrics): string {
    const parts: string[] = [];
    const snapshot = profile.progress;
    const total = snapshot.topicsExplored;

    if (total === 0) {
      return "Your learning journey is just beginning. Every new concept you explore builds a stronger foundation.";
    }

    parts.push(`You have explored **${total} concepts** across your sessions.`);

    if (snapshot.topicsAtConfident > 0) {
      parts.push(`You are confident in **${snapshot.topicsAtConfident}** topics and have mastered **${snapshot.topicsAtMastered}**.`);
    } else if (snapshot.topicsAtComfortable > 0) {
      parts.push(`You are comfortable with **${snapshot.topicsAtComfortable}** concepts and building confidence in others.`);
    }

    if (snapshot.totalConnectionsFound > 0) {
      parts.push(`You have discovered **${snapshot.totalConnectionsFound}** relationships between concepts.`);
    }

    if (snapshot.studyStreak > 0) {
      parts.push(`You are on a **${snapshot.studyStreak}-day study streak** (best: ${snapshot.longestStreak}).`);
    }

    if (metrics.strengthAreas.length > 0) {
      parts.push(`Your strongest areas: ${metrics.strengthAreas.join(", ")}.`);
    }

    if (metrics.growthAreas.length > 0) {
      parts.push(`Growing areas: ${metrics.growthAreas.join(", ")}.`);
    }

    return parts.join(" ");
  }

  generateRecommendations(profile: LearnerProfile, metrics: ProgressMetrics): string[] {
    const recommendations: string[] = [];
    const knowledge = Object.values(profile.knowledgeState);

    const recentlyIntroduced = knowledge.filter(
      (c) => c.level === "introduced" || c.level === "learning",
    );
    if (recentlyIntroduced.length >= 3) {
      recommendations.push("Review recently introduced concepts to strengthen understanding before moving to new topics.");
    }

    if (metrics.breadthScore > 0.6 && metrics.depthScore < 0.4) {
      recommendations.push("Consider deepening understanding of existing topics before exploring new ones.");
    }

    if (profile.patterns.studyConsistency < 0.3 && profile.patterns.totalSessions > 1) {
      recommendations.push("A more consistent study schedule could accelerate your learning progress.");
    }

    if (profile.patterns.challengeCompletionRate > 0.6) {
      recommendations.push("You perform well on challenges. Consider testing yourself more frequently to solidify understanding.");
    }

    if (knowledge.length > 0 && profile.progress.totalConnectionsFound < knowledge.length * 0.5) {
      recommendations.push("Try exploring how your known concepts connect to each other for deeper insight.");
    }

    return recommendations;
  }
}
