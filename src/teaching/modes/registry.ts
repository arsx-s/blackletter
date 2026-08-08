import type { TeachingMode, TeachingModeId } from "../types";
import { learnFromScratchMode } from "./learn-from-scratch";
import { studentStudyMode } from "./student-study";
import { deepUnderstandingMode } from "./deep-understanding";
import { examPreparationMode } from "./exam-preparation";
import { interviewPreparationMode } from "./interview-preparation";
import { researchMode } from "./research-mode";
import { industryApplicationMode } from "./industry-application";
import { professionalPracticeMode } from "./professional-practice";
import { executiveSummaryMode } from "./executive-summary";
import { quickReviewMode } from "./quick-review";

const ALL_TEACHING_MODES: TeachingMode[] = [
  learnFromScratchMode,
  studentStudyMode,
  deepUnderstandingMode,
  examPreparationMode,
  interviewPreparationMode,
  researchMode,
  industryApplicationMode,
  professionalPracticeMode,
  executiveSummaryMode,
  quickReviewMode,
];

const modeMap = new Map<TeachingModeId, TeachingMode>();

for (const mode of ALL_TEACHING_MODES) {
  modeMap.set(mode.id, mode);
}

export class TeachingModeRegistry {
  static getAll(): TeachingMode[] {
    return ALL_TEACHING_MODES;
  }

  static get(id: TeachingModeId): TeachingMode | undefined {
    return modeMap.get(id);
  }

  static getDefault(): TeachingMode {
    return studentStudyMode;
  }
}
