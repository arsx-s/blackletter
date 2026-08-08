import type { ConfusionSignal, ConfusionSignalType, ConfusionAction, LearnerProfile, InteractionEvent } from "../types";

export class ConfusionDetector {
  private recentQueries: { query: string; timestamp: number }[] = [];
  private recentScrolls: number[] = [];
  private lastEventTime: number = Date.now();
  private queryCountSinceLastConfusion: number = 0;

  analyze(profile: LearnerProfile, events: InteractionEvent[]): ConfusionSignal[] {
    const signals: ConfusionSignal[] = [];
    const now = Date.now();

    signals.push(...this.detectRepeatedQueries(profile, events, now));
    signals.push(...this.detectLongPauses(profile, events, now));
    signals.push(...this.detectPrerequisitePattern(profile, events));
    signals.push(...this.detectSimplificationPattern(profile));

    if (signals.length > 0) {
      profile.patterns.confusionEpisodes += signals.length;
      this.queryCountSinceLastConfusion = 0;
    } else {
      this.queryCountSinceLastConfusion++;
    }

    return signals;
  }

  recordQuery(query: string): void {
    this.recentQueries.push({ query: query.toLowerCase().trim(), timestamp: Date.now() });
    if (this.recentQueries.length > 20) {
      this.recentQueries.shift();
    }
  }

  recordScroll(): void {
    this.recentScrolls.push(Date.now());
    if (this.recentScrolls.length > 50) {
      this.recentScrolls.shift();
    }
  }

  private detectRepeatedQueries(
    _profile: LearnerProfile,
    _events: InteractionEvent[],
    now: number,
  ): ConfusionSignal[] {
    const signals: ConfusionSignal[] = [];
    if (this.recentQueries.length < 2) return signals;

    const recent = this.recentQueries.slice(-6);
    const window = 5 * 60 * 1000;

    for (let i = 1; i < recent.length; i++) {
      const curr = recent[i];
      const prev = recent[i - 1];

      if (curr.timestamp - prev.timestamp > window) continue;

      const similarity = this.stringSimilarity(curr.query, prev.query);
      if (similarity > 0.7) {
        signals.push({
          type: "repeated-query",
          confidence: similarity,
          detectedAt: now,
          context: `Similar queries: "${prev.query}" → "${curr.query}"`,
          suggestedAction: similarity > 0.85 ? "try-different-approach" : "switch-explanations",
        });
      }
    }

    return signals;
  }

  private detectLongPauses(
    _profile: LearnerProfile,
    _events: InteractionEvent[],
    now: number,
  ): ConfusionSignal[] {
    const signals: ConfusionSignal[] = [];
    const pause = now - this.lastEventTime;

    const LONG_PAUSE_MS = 8_000;
    const EXTREME_PAUSE_MS = 30_000;

    if (pause > EXTREME_PAUSE_MS) {
      signals.push({
        type: "long-pause",
        confidence: Math.min(1, pause / 120_000),
        detectedAt: now,
        context: `Paused for ${Math.round(pause / 1000)}s`,
        suggestedAction: "switch-explanations",
      });
    } else if (pause > LONG_PAUSE_MS) {
      const recentActivity = this.recentScrolls.length;
      if (recentActivity > 10) {
        signals.push({
          type: "long-pause",
          confidence: 0.5,
          detectedAt: now,
          context: `Paused for ${Math.round(pause / 1000)}s with ${recentActivity} scrolls`,
          suggestedAction: "add-analogy",
        });
      }
    }

    return signals;
  }

  private detectPrerequisitePattern(
    _profile: LearnerProfile,
    events: InteractionEvent[],
  ): ConfusionSignal[] {
    const signals: ConfusionSignal[] = [];

    const recentPrereqOpenings = events.filter(
      (e) => e.type === "prerequisite-opened" && Date.now() - e.timestamp < 10 * 60 * 1000,
    );

    if (recentPrereqOpenings.length >= 2) {
      signals.push({
        type: "prerequisite-opening",
        confidence: Math.min(1, 0.4 + recentPrereqOpenings.length * 0.15),
        detectedAt: Date.now(),
        context: `Opened ${recentPrereqOpenings.length} prerequisite topics recently`,
        suggestedAction: "review-prerequisites",
      });
    }

    return signals;
  }

  private detectSimplificationPattern(profile: LearnerProfile): ConfusionSignal[] {
    const signals: ConfusionSignal[] = [];

    const totalQueries = profile.patterns.totalQueries || 1;
    const simplificationRatio = profile.patterns.simplificationRequests / totalQueries;

    if (simplificationRatio > 0.25 && this.queryCountSinceLastConfusion > 2) {
      signals.push({
        type: "simplification-request",
        confidence: Math.min(1, simplificationRatio),
        detectedAt: Date.now(),
        context: `${profile.patterns.simplificationRequests} simplification requests out of ${profile.patterns.totalQueries} total queries`,
        suggestedAction: "simplify-language",
      });
    }

    return signals;
  }

  private stringSimilarity(a: string, b: string): number {
    if (a === b) return 1;

    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;

    if (longer.length === 0) return 1;

    const editDist = this.levenshteinDistance(longer, shorter);
    return 1 - editDist / longer.length;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const cost = a[j - 1] === b[i - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost,
        );
      }
    }

    return matrix[b.length][a.length];
  }

  updateTimestamp(): void {
    this.lastEventTime = Date.now();
  }
}
