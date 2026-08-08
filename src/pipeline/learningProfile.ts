import type { PipelineContext } from "./types";

export interface ProfileResult {
  style: string;
  depth: number;
  pacing: string;
  analogies: boolean;
  examples: number;
  weakConcepts: string[];
  strongConcepts: string[];
}

export async function executeLearningProfile(ctx: PipelineContext): Promise<ProfileResult | null> {
  try {
    const { LearnerProfileManager } = await import("../cognitive/profile/learner-profile");
    const manager = new LearnerProfileManager();
    const profile = manager.getProfile();

    if (profile?.preferences) {
      const weak: string[] = [];
      const strong: string[] = [];
      if (profile.knowledgeState) {
        for (const [id, state] of Object.entries(profile.knowledgeState)) {
          if (state.level === "introduced" || state.level === "learning") weak.push(state.conceptLabel);
          if (state.level === "confident" || state.level === "mastered") strong.push(state.conceptLabel);
        }
      }
      return {
        style: profile.preferences.preferredExplanationStyle || "analogy",
        depth: profile.preferences.depthPreference || 3,
        pacing: profile.preferences.pacingPreference || "normal",
        analogies: profile.preferences.prefersAnalogies ?? true,
        examples: profile.preferences.exampleFrequency || 2,
        weakConcepts: weak,
        strongConcepts: strong,
      };
    }

    return {
      style: "analogy",
      depth: 3,
      pacing: "normal",
      analogies: true,
      examples: 2,
      weakConcepts: [],
      strongConcepts: [],
    };
  } catch {
    return {
      style: "analogy",
      depth: 3,
      pacing: "normal",
      analogies: true,
      examples: 2,
      weakConcepts: [],
      strongConcepts: [],
    };
  }
}
