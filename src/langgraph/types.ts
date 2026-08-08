import type { Trace, TraceStage, PipelineTelemetry } from "../pipeline/trace";
import type { ScoredChunk, GroundedSource, FaithfulnessResult, HallucinationResult, ConfidenceResult } from "../pipeline/scoring";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LearnerProfile {
  style: string;
  depth: number;
  pacing: string;
  analogies: boolean;
  examples: number;
  weakConcepts: string[];
  strongConcepts: string[];
}

export interface KnowledgeGapResult {
  prerequisites: string[];
  missingPrerequisites: string[];
  directive: string;
}

export interface FormattedSection {
  type: string;
  title: string;
  content: string;
  order: number;
}

export interface GraphState {
  userPrompt: string;
  conversationHistory: ChatMessage[];
  uploadedDocuments: File[];
  model: string;
  knowledgeContext: string;
  runId: string;
  workspaceId: string;
  tabId: string;
  memoryContext: string;
  canvasContext: string;
  trace: Trace;
  documentText: string;
  documentChars: number;
  documentWords: number;
  documentLanguage: string;
  documentHeadings: string[];
  documentKeywords: string[];
  documentConcepts: string[];
  documentObjectives: string[];
  documentError: string | null;
  intent: string;
  intentConfidence: number;
  subject: string;
  subjectConfidence: number;
  researchMode: string | null;
  allSubjects: Array<{ name: string; confidence: number }>;
  difficulty: string;
  learnerProfile: LearnerProfile | null;
  knowledgeGaps: KnowledgeGapResult;
  generatedPrompt: string;
  systemInstruction: string;
  aiResponse: string;
  aiLatency: number;
  retryCount: number;
  temperature: number;
  maxTokens: number;
  qualityPassed: boolean;
  qualityScores: Record<string, number>;
  needsRegeneration: boolean;
  formattedSections: FormattedSection[];
  formattedReport: string;
  errors: string[];
  executionOrder: string[];
  executionTimes: Record<string, number>;
  confidenceScores: Record<string, number>;
  visitedNodes: string[];
  retrievedChunks: ScoredChunk[];
  groundedSources: GroundedSource[];
  faithfulness: FaithfulnessResult | null;
  hallucination: HallucinationResult | null;
  confidence: ConfidenceResult | null;
  telemetry: PipelineTelemetry;
  traceStages: TraceStage[];
  error?: string;
  errorCode?: string;
}



export type GraphNode = (state: GraphState) => Promise<Partial<GraphState>>;

export type RouterFunction = (state: GraphState) => string;

export interface GraphDefinition {
  nodes: Record<string, GraphNode>;
  edges: Array<{ from: string; to: string | RouterFunction }>;
  start: string;
  end: string[];
}

export interface GraphRunResult {
  state: GraphState;
  visitedNodes: string[];
  executionTimes: Record<string, number>;
  finalNode: string;
  success: boolean;
  error?: string;
  errorCode?: string;
}

export interface NodeTiming {
  name: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  status: "success" | "error";
  error?: string;
}

export interface PipelineRunInput {
  prompt: string;
  files: File[];
  history: Array<{ role: string; content: string }>;
  subject: string | null;
  mode: string | null;
  model?: string;
  knowledgeContext?: string;
  metadata: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
  workspaceId?: string;
  tabId?: string;
  memoryContext?: string;
  canvasContext?: string;
}
