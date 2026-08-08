import type { GraphState, LearnerProfile } from "../types";
import { log } from "../logger";

export async function LearningProfileNode(state: GraphState): Promise<Partial<GraphState>> {
  log("NODE", "LearningProfileNode: loading learner profile");
  try {
    const { LearnerProfileManager } = await import("../../cognitive/profile/learner-profile");
    const manager = new LearnerProfileManager();
    const profile = manager.getProfile();
    if (profile?.preferences) {
      const weak: string[] = [];
      const strong: string[] = [];
      if (profile.knowledgeState) {
        for (const [id, st] of Object.entries(profile.knowledgeState)) {
          if (st.level === "introduced" || st.level === "learning") weak.push(st.conceptLabel);
          if (st.level === "confident" || st.level === "mastered") strong.push(st.conceptLabel);
        }
      }
      const result: LearnerProfile = {
        style: profile.preferences.preferredExplanationStyle || "analogy",
        depth: profile.preferences.depthPreference || 3,
        pacing: profile.preferences.pacingPreference || "normal",
        analogies: profile.preferences.prefersAnalogies ?? true,
        examples: profile.preferences.exampleFrequency || 2,
        weakConcepts: weak,
        strongConcepts: strong,
      };
      log("NODE", `LearningProfileNode: loaded profile (style=${result.style}, depth=${result.depth})`);
      return { learnerProfile: result };
    }
  } catch {
    log("NODE", "LearningProfileNode: no saved profile, using defaults");
  }
  return {
    learnerProfile: {
      style: "analogy", depth: 3, pacing: "normal",
      analogies: true, examples: 2,
      weakConcepts: [], strongConcepts: [],
    },
  };
}
