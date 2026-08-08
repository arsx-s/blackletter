export interface TeachingPhilosophy {
  coreBelief: string;
  explanationOrder: string[];
  preferredExamples: string[];
  preferredAnalogies: string[];
  difficultyProgression: string[];
  responseStructure: string[];
  importantTerminology: string[];
  commonMisconceptions: string[];
  visualStrategy: string;
  practiceStrategy: string;
  revisionStrategy: string;
}

export interface SubjectProfile {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  subdisciplines: string[];
  teachingPhilosophy: TeachingPhilosophy;
}

export interface LearningRequest {
  query: string;
  documents?: string[];
  previousMessages?: { role: "user" | "assistant"; content: string }[];
}

export interface LearningResponse {
  subject: SubjectClassification;
  fullText: string;
}

export interface SubjectClassification {
  primary: string;
  primaryId: string;
  confidence: number;
  subdiscipline?: string;
}

export const PIPELINE_STEPS = [
  "Big Picture",
  "Intuition",
  "Core Explanation",
  "Worked Example",
  "Visual Thinking",
  "Common Mistakes",
  "Memory Trick",
  "Real World Applications",
  "Challenge Question",
  "Summary",
] as const;

export type PipelineStep = typeof PIPELINE_STEPS[number];
