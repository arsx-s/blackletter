export { CognitiveEngine } from "./engine";
export { LearnerProfileManager } from "./profile/learner-profile";
export { KnowledgeConfidenceEstimator } from "./profile/knowledge-confidence";
export { LearningPatternDetector } from "./observation/pattern-detector";
export { ConfusionDetector } from "./observation/confusion-detector";
export { AutomaticTeachingAdapter, type AdaptedConfig } from "./adaptation/teaching-adapter";
export { ExplanationVariationSelector } from "./adaptation/explanation-selector";
export { ProgressIntelligence, type ProgressReport, type ProgressMetrics } from "./progress/progress-intelligence";
export { CognitiveSmartContinuations, type CognitiveNextStep } from "./progress/smart-continuations";

export type {
  LearnerProfile,
  LearningPreferences,
  InteractionPatterns,
  ExplanationPreferences,
  KnowledgeConfidence,
  KnowledgeConfidenceLevel,
  ConfusionSignal,
  ConfusionSignalType,
  ConfusionAction,
  InteractionEvent,
  InteractionEventType,
  ExplanationStyle,
  CognitiveOverride,
  ProgressSnapshot,
} from "./types";

export {
  CONFIDENCE_ORDER,
  defaultPreferences,
  defaultPatterns,
  createLearnerProfile,
} from "./types";
