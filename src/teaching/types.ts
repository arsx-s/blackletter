import type { SubjectProfile, SubjectClassification } from "../engine/types";

export type TeachingModeId =
  | "learn-from-scratch"
  | "student-study"
  | "deep-understanding"
  | "exam-preparation"
  | "interview-preparation"
  | "research-mode"
  | "industry-application"
  | "professional-practice"
  | "executive-summary"
  | "quick-review";

export type VisualType =
  | "table"
  | "comparison"
  | "ascii-diagram"
  | "process-flow"
  | "decision-tree"
  | "concept-map"
  | "timeline";

export interface TeachingInstructions {
  role: string;
  openingDirective: string;
  corePrinciples: string[];
  reasoningApproach: string;
  knowledgeAssumptions: string;
  languageStyle: string;
  depthLevel: number;
  pacing: string;
  focusAreas: string[];
  prohibitions: string[];
  exampleStyle: string;
}

export interface ResponseStructureConfig {
  includeSections: string[];
  ordered: boolean;
  showHeadings: "always" | "when-helpful" | "never";
  headingLevel: "h2" | "h3" | "bold";
  sectionGuidelines: Partial<Record<string, string>>;
}

export const DEFAULT_SECTIONS = [
  "Overview",
  "Core Idea",
  "Intuition",
  "Step-by-Step Explanation",
  "Worked Example",
  "Visual Description",
  "Real World Application",
  "Common Mistakes",
  "Memory Technique",
  "Challenge Question",
  "Summary",
] as const;

export interface VisualPreferences {
  enabled: boolean;
  preferredTypes: VisualType[];
  frequency: "always" | "when-useful" | "never";
  guidelines: string;
}

export interface UnderstandingCheckConfig {
  enabled: boolean;
  questionStyle: string;
  frequency: "every-response" | "when-appropriate";
  guidelines: string;
}

export interface TeachingMode {
  id: TeachingModeId;
  name: string;
  description: string;
  icon: string;
  instructions: TeachingInstructions;
  responseStructure: ResponseStructureConfig;
  visualPreferences: VisualPreferences;
  understandingCheck: UnderstandingCheckConfig;
}

export interface TeachingRequest {
  query: string;
  modeId: TeachingModeId;
  subjectProfile?: SubjectProfile;
  subjectClassification?: SubjectClassification;
  documents?: string[];
  previousMessages?: { role: string; content: string }[];
}

export interface TeachingResponse {
  query: string;
  modeId: TeachingModeId;
  subjectName: string;
  subjectId: string;
  fullText: string;
}

export interface TeachingChunk {
  type: "text" | "section-start" | "section-end" | "visual" | "challenge" | "summary";
  content: string;
  metadata?: Record<string, string>;
}
