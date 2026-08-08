import type { TeachingModeId } from "../teaching/types";

export type KnowledgeConfidenceLevel =
  | "introduced"
  | "learning"
  | "comfortable"
  | "confident"
  | "mastered";

export const CONFIDENCE_ORDER: KnowledgeConfidenceLevel[] = [
  "introduced", "learning", "comfortable", "confident", "mastered",
];

export type ExplanationStyle =
  | "visual"
  | "analogy"
  | "technical"
  | "step-by-step"
  | "historical"
  | "mathematical"
  | "practical"
  | "story-based"
  | "case-study";

export type ConfusionSignalType =
  | "repeated-query"
  | "repeated-scroll"
  | "long-pause"
  | "prerequisite-opening"
  | "simplification-request"
  | "multiple-document-refs";

export type ConfusionAction =
  | "switch-explanations"
  | "simplify-language"
  | "add-analogy"
  | "show-visual"
  | "review-prerequisites"
  | "try-different-approach";

export interface LearningPreferences {
  preferredExplanationStyle: ExplanationStyle;
  preferredVisualType: string;
  depthPreference: number;
  concisenessPreference: number;
  exampleFrequency: number;
  prefersHistory: boolean;
  prefersMathematics: boolean;
  prefersAnalogies: boolean;
  prefersCaseStudies: boolean;
  challengeFrequency: number;
  summaryPreference: boolean;
  pacingPreference: "slow" | "moderate" | "fast";
}

export function defaultPreferences(): LearningPreferences {
  return {
    preferredExplanationStyle: "step-by-step",
    preferredVisualType: "table",
    depthPreference: 3,
    concisenessPreference: 3,
    exampleFrequency: 3,
    prefersHistory: false,
    prefersMathematics: false,
    prefersAnalogies: true,
    prefersCaseStudies: false,
    challengeFrequency: 3,
    summaryPreference: true,
    pacingPreference: "moderate",
  };
}

export interface InteractionPatterns {
  totalSessions: number;
  totalQueries: number;
  averageReadingTimeMs: number;
  exampleExpansionRate: number;
  visualizationEngagementRate: number;
  challengeCompletionRate: number;
  summarySkipRate: number;
  topExplanationStyles: { style: ExplanationStyle; count: number }[];
  topVisualTypes: { type: string; count: number }[];
  depthRequests: number;
  simplificationRequests: number;
  confusionEpisodes: number;
  repeatedQueryRate: number;
  prerequisiteOpenRate: number;
  activeHours: number[];
  averageSessionLength: number;
  studyConsistency: number;
  preferredModes: { modeId: TeachingModeId; count: number }[];
}

export function defaultPatterns(): InteractionPatterns {
  return {
    totalSessions: 0,
    totalQueries: 0,
    averageReadingTimeMs: 0,
    exampleExpansionRate: 0.5,
    visualizationEngagementRate: 0.5,
    challengeCompletionRate: 0,
    summarySkipRate: 0,
    topExplanationStyles: [],
    topVisualTypes: [],
    depthRequests: 0,
    simplificationRequests: 0,
    confusionEpisodes: 0,
    repeatedQueryRate: 0,
    prerequisiteOpenRate: 0,
    activeHours: [],
    averageSessionLength: 0,
    studyConsistency: 0,
    preferredModes: [],
  };
}

export interface ExplanationPreferences {
  recentlyUsedStyles: ExplanationStyle[];
  styleSuccessRate: Record<string, number>;
  preferredSections: string[];
  skippedSections: string[];
}

export function defaultExplanationPreferences(): ExplanationPreferences {
  return {
    recentlyUsedStyles: ["step-by-step"],
    styleSuccessRate: {},
    preferredSections: [],
    skippedSections: [],
  };
}

export interface KnowledgeConfidence {
  conceptId: string;
  conceptLabel: string;
  level: KnowledgeConfidenceLevel;
  timesEncountered: number;
  timesTested: number;
  timesCorrect: number;
  lastInteraction: number;
  relatedConcepts: string[];
  preferredStyle: ExplanationStyle | null;
}

export interface ConfusionSignal {
  type: ConfusionSignalType;
  confidence: number;
  detectedAt: number;
  context: string;
  suggestedAction: ConfusionAction;
}

export interface InteractionEvent {
  type: InteractionEventType;
  timestamp: number;
  metadata: Record<string, unknown>;
}

export type InteractionEventType =
  | "query-submitted"
  | "explanation-expanded"
  | "visualization-viewed"
  | "summary-skipped"
  | "example-expanded"
  | "challenge-completed"
  | "challenge-skipped"
  | "prerequisite-opened"
  | "simplification-requested"
  | "depth-requested"
  | "mode-changed"
  | "document-opened"
  | "long-pause"
  | "repeated-query"
  | "scroll-pattern"
  | "bookmark-created";

export interface ProgressSnapshot {
  topicsExplored: number;
  topicsAtComfortable: number;
  topicsAtConfident: number;
  topicsAtMastered: number;
  totalConceptsDiscovered: number;
  totalConnectionsFound: number;
  researchDepth: number;
  studyStreak: number;
  longestStreak: number;
  totalStudyMinutes: number;
  consistencyScore: number;
  studyConsistency: number;
}

export interface CognitiveOverride {
  explanationStyle?: ExplanationStyle;
  depthOverride?: number;
  concisenessOverride?: number;
  exampleOverride?: number;
  pacingOverride?: "slow" | "moderate" | "fast";
  addVisuals?: boolean;
  addAnalogies?: boolean;
  addHistory?: boolean;
  addMathematics?: boolean;
  skipSummary?: boolean;
  simplificationLevel?: number;
}

export interface LearnerProfile {
  id: string;
  createdAt: number;
  updatedAt: number;
  preferences: LearningPreferences;
  patterns: InteractionPatterns;
  explanationPrefs: ExplanationPreferences;
  knowledgeState: Record<string, KnowledgeConfidence>;
  progress: ProgressSnapshot;
  activeOverride: CognitiveOverride | null;
}

export function createLearnerProfile(): LearnerProfile {
  const now = Date.now();
  return {
    id: `learner_${now}`,
    createdAt: now,
    updatedAt: now,
    preferences: defaultPreferences(),
    patterns: defaultPatterns(),
    explanationPrefs: defaultExplanationPreferences(),
    knowledgeState: {},
    progress: {
      topicsExplored: 0,
      topicsAtComfortable: 0,
      topicsAtConfident: 0,
      topicsAtMastered: 0,
      totalConceptsDiscovered: 0,
      totalConnectionsFound: 0,
      researchDepth: 0,
      studyStreak: 0,
      longestStreak: 0,
      totalStudyMinutes: 0,
      consistencyScore: 0,
      studyConsistency: 0,
    },
    activeOverride: null,
  };
}
