import type { LearnerProfile, CognitiveOverride, ExplanationStyle } from "../types";

export interface AdaptedConfig {
  styleOverride?: ExplanationStyle;
  systemPromptInjections: string[];
  modePreference?: string;
  addVisuals: boolean;
  addAnalogies: boolean;
  addHistory: boolean;
  addMathematics: boolean;
  depthAdjustment: number;
  concisenessAdjustment: number;
  exampleAdjustment: number;
  skipSummary: boolean;
  simplificationLevel: number;
  prefersCaseStudies: boolean;
}

export class AutomaticTeachingAdapter {
  adapt(profile: LearnerProfile): AdaptedConfig {
    const activeOverride = profile.activeOverride;
    const prefs = profile.preferences;
    const patterns = profile.patterns;

    const injections: string[] = [];
    const base: AdaptedConfig = {
      systemPromptInjections: injections,
      addVisuals: false,
      addAnalogies: false,
      addHistory: false,
      addMathematics: false,
      depthAdjustment: prefs.depthPreference,
      concisenessAdjustment: prefs.concisenessPreference,
      exampleAdjustment: prefs.exampleFrequency,
      skipSummary: !prefs.summaryPreference,
      simplificationLevel: this.calculateSimplification(profile),
      prefersCaseStudies: prefs.prefersCaseStudies,
    };

    if (activeOverride?.explanationStyle) {
      base.styleOverride = activeOverride.explanationStyle;
    } else {
      base.styleOverride = prefs.preferredExplanationStyle;
    }

    if (activeOverride?.depthOverride) base.depthAdjustment = activeOverride.depthOverride;
    if (activeOverride?.concisenessOverride) base.concisenessAdjustment = activeOverride.concisenessOverride;
    if (activeOverride?.exampleOverride) base.exampleAdjustment = activeOverride.exampleOverride;
    if (activeOverride?.pacingOverride) {
      injections.push(this.pacingInjection(activeOverride.pacingOverride));
    } else {
      injections.push(this.pacingInjection(prefs.pacingPreference));
    }

    if (activeOverride?.addVisuals || prefs.preferredVisualType !== "table") {
      base.addVisuals = true;
    }
    if (activeOverride?.addAnalogies || prefs.prefersAnalogies) {
      base.addAnalogies = true;
      injections.push("Use analogies to connect new concepts to familiar ideas.");
    }
    if (activeOverride?.addHistory || prefs.prefersHistory) {
      base.addHistory = true;
      injections.push("Include historical context and the evolution of ideas.");
    }
    if (activeOverride?.addMathematics || prefs.prefersMathematics) {
      base.addMathematics = true;
      injections.push("Include mathematical formulations and derivations where relevant.");
    }
    if (activeOverride?.skipSummary) base.skipSummary = true;
    if (activeOverride?.simplificationLevel) {
      base.simplificationLevel = activeOverride.simplificationLevel;
    }

    if (base.styleOverride) {
      injections.push(this.styleInjection(base.styleOverride));
    }

    if (base.exampleAdjustment >= 4) {
      injections.push("Include multiple concrete examples for each concept.");
    } else if (base.exampleAdjustment <= 2) {
      injections.push("Use minimal examples — focus on core concepts.");
    }

    if (base.prefersCaseStudies) {
      injections.push("Use real-world case studies to illustrate concepts.");
    }

    const depthLabel = ["", "minimal", "basic", "moderate", "deep", "comprehensive"];
    injections.push(`Depth level: ${depthLabel[base.depthAdjustment] ?? "moderate"}.`);

    const concisenessLabel = ["", "very concise", "concise", "balanced", "detailed", "comprehensive"];
    injections.push(`Detail level: ${concisenessLabel[base.concisenessAdjustment] ?? "balanced"}.`);

    if (patterns.confusionEpisodes > patterns.totalQueries * 0.3 && patterns.totalQueries > 3) {
      injections.push("Prioritize clarity over completeness. Use simple language. Check understanding frequently.");
      base.simplificationLevel = Math.min(5, base.simplificationLevel + 1);
    }

    if (patterns.repeatedQueryRate > 0.3) {
      injections.push("The learner may need concepts explained differently. Try alternative explanations before repeating.");
    }

    base.systemPromptInjections = injections;
    return base;
  }

  createOverride(
    profile: LearnerProfile,
    overrides: Partial<CognitiveOverride>,
  ): CognitiveOverride {
    const current = profile.activeOverride ?? {};
    const merged: CognitiveOverride = { ...current, ...overrides };
    profile.activeOverride = merged;
    return merged;
  }

  clearOverride(profile: LearnerProfile): void {
    profile.activeOverride = null;
  }

  private calculateSimplification(profile: LearnerProfile): number {
    const patterns = profile.patterns;
    const ratio = patterns.simplificationRequests / Math.max(1, patterns.totalQueries);

    if (ratio > 0.4) return 4;
    if (ratio > 0.2) return 3;
    if (ratio > 0.1) return 2;
    return 1;
  }

  private pacingInjection(pacing: string): string {
    switch (pacing) {
      case "slow": return "Pace the explanation slowly. Build each concept fully before moving to the next. Check for understanding frequently.";
      case "fast": return "Move at a brisk pace. The learner can handle complexity. Do not oversimplify.";
      default: return "Maintain a steady, balanced pace. Build concepts progressively.";
    }
  }

  private styleInjection(style: ExplanationStyle): string {
    const injections: Record<ExplanationStyle, string> = {
      "visual": "Use visual descriptions, diagrams, tables, and spatial explanations. Describe concepts in terms of shapes, positions, and relationships.",
      "analogy": "Use powerful analogies as the primary explanatory tool. Connect every new concept to something familiar from everyday life.",
      "technical": "Use precise technical language. Define terms rigorously. Include specifications, formal definitions, and precise formulations.",
      "step-by-step": "Break every concept into sequential steps. Number each step. Build the explanation incrementally like a recipe.",
      "historical": "Explain concepts through their historical development. Show how understanding evolved, what problems led to discoveries, and who contributed key insights.",
      "mathematical": "Use mathematical formulations, equations, and formal notation. Derive results logically. Show the quantitative relationships.",
      "practical": "Focus on practical application. Explain how concepts are used in real work. Emphasize implementation over theory.",
      "story-based": "Frame the explanation as a narrative. Use stories, characters, and scenarios to make the concept memorable and engaging.",
      "case-study": "Teach through detailed case studies. Each case study illustrates the concept in a real-world context with specific details and outcomes.",
    };
    return injections[style] ?? "Explain clearly and progressively.";
  }
}
