import type { TraceStage, PipelineTelemetry } from "./trace";
import type { ScoredChunk, GroundedSource, FaithfulnessResult, HallucinationResult, ConfidenceResult } from "./scoring";

export interface PipelineInput {
  prompt: string;
  files: File[];
  history: Array<{ role: string; content: string }>;
  subject: string | null;
  mode: string | null;
  metadata: Record<string, unknown>;
}

export interface StageTiming {
  name: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  status: "success" | "skipped" | "error";
  error?: string;
}

export interface PipelineContext {
  input: PipelineInput;
  timing: StageTiming[];

  normalizedPrompt: string;

  intent: string;
  intentConfidence: number;
  difficulty: string;

  primarySubject: string;
  subjectConfidence: number;
  allSubjects: Array<{ name: string; confidence: number }>;

  hasDocuments: boolean;

  documentText: string;
  documentChars: number;
  documentWords: number;
  documentLanguage: string;
  documentHeadings: string[];
  documentKeywords: string[];
  documentConcepts: string[];
  documentObjectives: string[];
  documentError: string | null;

  learnerProfile: {
    style: string;
    depth: number;
    pacing: string;
    analogies: boolean;
    examples: number;
    weakConcepts: string[];
    strongConcepts: string[];
  } | null;

  prerequisites: string[];
  missingPrerequisites: string[];
  knowledgeGapDirective: string;

  prompt: string;
  systemInstruction: string;
  promptSize: number;

  response: string;
  aiLatency: number;

  retryCount: number;
  qualityPassed: boolean;
  qualityScores: Record<string, number>;
  needsRegeneration: boolean;

  formattedSections: FormattedSection[];
  finalReport: string;
}

export interface FormattedSection {
  type: string;
  title: string;
  content: string;
  order: number;
}

/* ── Legacy types (preserved for test compatibility) ── */
export type BlackLetterMode = "teach" | "research" | "build" | "debate" | "compare" | "plan" | "analyze" | "create" | "review" | "master";

export interface ModeConfig {
  mode: BlackLetterMode;
  label: string;
  description: string;
  complexity: "simple" | "moderate" | "complex";
  enableCriticalThinking: boolean;
  enableFactCheck: boolean;
  enableCitations: boolean;
  enableVisualThinking: boolean;
  enableKnowledgeGraph: boolean;
  enableFollowUp: boolean;
  verbosity: "concise" | "balanced" | "thorough";
  reasoningDepth: "shallow" | "moderate" | "deep";
  agents: string[];
}

export type ThinkingToolType = "flashcards" | "quiz" | "lecture" | "report" | "mind-map" | "timeline" | "flowchart" | "presentation" | "study-notes" | "business-plan" | "legal-memo" | "case-analysis" | "research-proposal" | "technical-documentation" | "project-roadmap";

export interface ThinkingToolResult {
  type: ThinkingToolType;
  title: string;
  content: string;
  sections: ToolSection[];
  metadata?: Record<string, unknown>;
}

export interface ToolSection {
  heading: string;
  content: string;
  items: string[];
}

export interface ReasoningEnhancement {
  type: string;
  content: string;
  items: string[];
  importance: string;
}

export interface PipelineResult {
  response: string;
  sections: FormattedSection[];
  timing: StageTiming[];
  intent: string;
  subject: string;
  difficulty: string;
  retryCount: number;
  aiLatency: number;
  qualityPassed: boolean;
  qualityScores: Record<string, number>;
  documentAnalyzed: boolean;
  documentError: string | null;
  graphError?: string;
  errors?: string[];
  graphSuccess?: boolean;
  visitedNodes?: string[];
  executionTimes?: Record<string, number>;
  errorCode?: string;
  runId?: string;
  trace?: TraceStage[];
  retrievedChunks?: ScoredChunk[];
  groundedSources?: GroundedSource[];
  faithfulness?: FaithfulnessResult | null;
  hallucination?: HallucinationResult | null;
  confidence?: ConfidenceResult | null;
  intelligence?: {
    confidence: ConfidenceResult | null;
    faithfulness: FaithfulnessResult | null;
    hallucination: HallucinationResult | null;
    groundedSources: GroundedSource[];
    retrievedChunks: ScoredChunk[];
    trace: TraceStage[];
    telemetry: PipelineTelemetry;
  };
  telemetry?: PipelineTelemetry;
}
