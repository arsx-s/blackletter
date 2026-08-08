import type { LearnerProfile, InteractionEvent, InteractionPatterns, ExplanationStyle, LearningPreferences } from "../types";
import type { TeachingModeId } from "../../teaching/types";
import { defaultPreferences, defaultPatterns } from "../types";

export class LearningPatternDetector {
  recordEvent(profile: LearnerProfile, event: InteractionEvent): void {
    profile.updatedAt = Date.now();

    switch (event.type) {
      case "query-submitted":
        profile.patterns.totalQueries++;
        this.trackActiveHour(profile, event.timestamp);
        break;
      case "explanation-expanded":
        this.recordStyleEngagement(profile, event.metadata?.style as string | undefined);
        break;
      case "visualization-viewed":
        this.recordVisualEngagement(profile, event.metadata?.visualType as string | undefined);
        profile.patterns.visualizationEngagementRate = this.calculateRate(
          profile.patterns.visualizationEngagementRate,
          1,
        );
        break;
      case "example-expanded":
        profile.patterns.exampleExpansionRate = this.calculateRate(
          profile.patterns.exampleExpansionRate,
          1,
        );
        break;
      case "summary-skipped":
        profile.patterns.summarySkipRate = this.calculateRate(
          profile.patterns.summarySkipRate,
          1,
        );
        break;
      case "challenge-completed":
        profile.patterns.challengeCompletionRate = this.calculateRate(
          profile.patterns.challengeCompletionRate,
          1,
        );
        break;
      case "challenge-skipped":
        profile.patterns.challengeCompletionRate = this.calculateRate(
          profile.patterns.challengeCompletionRate,
          0,
        );
        break;
      case "simplification-requested":
        profile.patterns.simplificationRequests++;
        break;
      case "depth-requested":
        profile.patterns.depthRequests++;
        break;
      case "prerequisite-opened":
        profile.patterns.prerequisiteOpenRate = this.calculateRate(
          profile.patterns.prerequisiteOpenRate,
          1,
        );
        break;
      case "mode-changed":
        this.recordModeUsage(profile, event.metadata?.modeId as string | undefined);
        break;
    }
  }

  analyzeAndAdapt(profile: LearnerProfile): void {
    const prefs = profile.preferences;
    const patterns = profile.patterns;

    prefs.preferredExplanationStyle = this.inferPreferredStyle(patterns, profile.explanationPrefs);
    prefs.preferredVisualType = this.inferPreferredVisual(patterns);
    prefs.depthPreference = this.inferDepthPreference(patterns);
    prefs.concisenessPreference = this.inferConcisenessPreference(patterns);
    prefs.exampleFrequency = this.inferExampleFrequency(patterns);
    prefs.challengeFrequency = this.inferChallengeFrequency(patterns);
    prefs.summaryPreference = this.inferSummaryPreference(patterns);
    prefs.pacingPreference = this.inferPacing(patterns);
    prefs.prefersHistory = this.inferHistoryPreference(patterns);
    prefs.prefersMathematics = this.inferMathPreference(patterns);
    prefs.prefersAnalogies = this.inferAnalogyPreference(patterns);
    prefs.prefersCaseStudies = this.inferCaseStudyPreference(patterns);

    profile.progress.studyConsistency = patterns.studyConsistency;
  }

  private trackActiveHour(profile: LearnerProfile, timestamp: number): void {
    const hour = new Date(timestamp).getHours();
    const existing = profile.patterns.activeHours;
    if (!existing.includes(hour)) {
      existing.push(hour);
    }
  }

  private recordStyleEngagement(profile: LearnerProfile, style: string | undefined): void {
    if (!style) return;
    const list = profile.patterns.topExplanationStyles;
    const existing = list.find((s) => s.style === style);
    if (existing) {
      existing.count++;
    } else {
      list.push({ style: style as ExplanationStyle, count: 1 });
    }
  }

  private recordVisualEngagement(profile: LearnerProfile, visualType: string | undefined): void {
    if (!visualType) return;
    const list = profile.patterns.topVisualTypes;
    const existing = list.find((v) => v.type === visualType);
    if (existing) {
      existing.count++;
    } else {
      list.push({ type: visualType, count: 1 });
    }
  }

  private recordModeUsage(profile: LearnerProfile, modeId: string | undefined): void {
    if (!modeId) return;
    const list = profile.patterns.preferredModes;
    const existing = list.find((m) => m.modeId === modeId);
    if (existing) {
      existing.count++;
    } else {
      list.push({ modeId: modeId as TeachingModeId, count: 1 });
    }
  }

  private calculateRate(current: number, latest: number): number {
    return Math.round((current * 0.7 + latest * 0.3) * 100) / 100;
  }

  private inferPreferredStyle(
    patterns: InteractionPatterns,
    explanationPrefs: import("../types").ExplanationPreferences,
  ): ExplanationStyle {
    const fromHistory = patterns.topExplanationStyles
      .sort((a, b) => b.count - a.count);

    if (fromHistory.length > 0) {
      return fromHistory[0].style;
    }

    const styleScores = Object.entries(explanationPrefs.styleSuccessRate)
      .sort(([, a], [, b]) => b - a);
    if (styleScores.length > 0) {
      return styleScores[0][0] as ExplanationStyle;
    }

    return "step-by-step";
  }

  private inferPreferredVisual(patterns: InteractionPatterns): string {
    const sorted = patterns.topVisualTypes.sort((a, b) => b.count - a.count);
    return sorted.length > 0 ? sorted[0].type : "table";
  }

  private inferDepthPreference(patterns: InteractionPatterns): number {
    const totalEvents = patterns.totalQueries || 1;
    const depthRatio = patterns.depthRequests / totalEvents;
    const simplificationRatio = patterns.simplificationRequests / totalEvents;

    if (depthRatio > simplificationRatio + 0.1) return 4;
    if (simplificationRatio > depthRatio + 0.1) return 2;
    return 3;
  }

  private inferConcisenessPreference(patterns: InteractionPatterns): number {
    if (patterns.summarySkipRate > 0.6) return 2;
    if (patterns.summarySkipRate > 0.3) return 3;
    return 4;
  }

  private inferExampleFrequency(patterns: InteractionPatterns): number {
    if (patterns.exampleExpansionRate > 0.7) return 5;
    if (patterns.exampleExpansionRate > 0.5) return 4;
    if (patterns.exampleExpansionRate > 0.3) return 3;
    return 2;
  }

  private inferChallengeFrequency(patterns: InteractionPatterns): number {
    if (patterns.challengeCompletionRate > 0.6) return 4;
    if (patterns.challengeCompletionRate > 0.3) return 3;
    return 2;
  }

  private inferSummaryPreference(patterns: InteractionPatterns): boolean {
    return patterns.summarySkipRate < 0.4;
  }

  private inferPacing(patterns: InteractionPatterns): "slow" | "moderate" | "fast" {
    const simplificationRatio = patterns.simplificationRequests / (patterns.totalQueries || 1);
    const depthRatio = patterns.depthRequests / (patterns.totalQueries || 1);

    if (simplificationRatio > 0.3) return "slow";
    if (depthRatio > 0.3) return "fast";
    return "moderate";
  }

  private inferHistoryPreference(patterns: InteractionPatterns): boolean {
    return patterns.topExplanationStyles.some(
      (s) => s.style === "historical" && s.count > 2,
    );
  }

  private inferMathPreference(patterns: InteractionPatterns): boolean {
    return patterns.topExplanationStyles.some(
      (s) => s.style === "mathematical" && s.count > 2,
    );
  }

  private inferAnalogyPreference(patterns: InteractionPatterns): boolean {
    const analogyCount = patterns.topExplanationStyles.find(
      (s) => s.style === "analogy",
    )?.count ?? 0;
    const total = patterns.topExplanationStyles.reduce((s, e) => s + e.count, 0) || 1;
    return analogyCount / total > 0.15;
  }

  private inferCaseStudyPreference(patterns: InteractionPatterns): boolean {
    return patterns.topExplanationStyles.some(
      (s) => (s.style === "case-study" || s.style === "practical") && s.count > 2,
    );
  }

  updateReadingTime(profile: LearnerProfile, timeMs: number): void {
    const prev = profile.patterns.averageReadingTimeMs;
    const total = profile.patterns.totalQueries;
    if (total <= 1) {
      profile.patterns.averageReadingTimeMs = timeMs;
    } else {
      profile.patterns.averageReadingTimeMs = Math.round(
        (prev * (total - 1) + timeMs) / total,
      );
    }
  }

  recordStyleSuccess(profile: LearnerProfile, style: ExplanationStyle, succeeded: boolean): void {
    const key = style;
    const current = profile.explanationPrefs.styleSuccessRate[key] ?? 0.5;
    profile.explanationPrefs.styleSuccessRate[key] = succeeded
      ? Math.min(1, current + 0.1)
      : Math.max(0, current - 0.1);

    if (!profile.explanationPrefs.recentlyUsedStyles.includes(style)) {
      profile.explanationPrefs.recentlyUsedStyles.unshift(style);
      if (profile.explanationPrefs.recentlyUsedStyles.length > 5) {
        profile.explanationPrefs.recentlyUsedStyles.pop();
      }
    }
  }
}
