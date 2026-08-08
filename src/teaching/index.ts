export { TeachingEngine } from "./engine";
export { TeachingModeRegistry } from "./modes/registry";
export { ResponseStructureBuilder } from "./pipeline/response-structure";
export { VisualThinkingEngine } from "./pipeline/visual-engine";

export type {
  TeachingMode,
  TeachingModeId,
  TeachingInstructions,
  TeachingRequest,
  TeachingResponse,
  TeachingChunk,
  VisualPreferences,
  VisualType,
  UnderstandingCheckConfig,
  ResponseStructureConfig,
} from "./types";

export { DEFAULT_SECTIONS } from "./types";

// Individual mode exports for direct access
export { learnFromScratchMode } from "./modes/learn-from-scratch";
export { studentStudyMode } from "./modes/student-study";
export { deepUnderstandingMode } from "./modes/deep-understanding";
export { examPreparationMode } from "./modes/exam-preparation";
export { interviewPreparationMode } from "./modes/interview-preparation";
export { researchMode } from "./modes/research-mode";
export { industryApplicationMode } from "./modes/industry-application";
export { professionalPracticeMode } from "./modes/professional-practice";
export { executiveSummaryMode } from "./modes/executive-summary";
export { quickReviewMode } from "./modes/quick-review";
