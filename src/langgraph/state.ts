import type { GraphState, LearnerProfile, KnowledgeGapResult } from "./types";
import { Trace } from "../pipeline/trace";

export function createInitialState(input: {
  prompt: string;
  files: File[];
  history: Array<{ role: string; content: string }>;
  subject: string | null;
  mode: string | null;
  model?: string;
  knowledgeContext?: string;
  temperature?: number;
  maxTokens?: number;
  researchMode?: string | null;
  workspaceId?: string;
  tabId?: string;
  memoryContext?: string;
  canvasContext?: string;
}): GraphState {
  const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const trace = new Trace(runId);
  return {
    userPrompt: input.prompt,
    knowledgeContext: input.knowledgeContext || "",
    conversationHistory: input.history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    uploadedDocuments: input.files,
    model: input.model || "",
    runId,
    workspaceId: input.workspaceId || "",
    tabId: input.tabId || "",
    memoryContext: input.memoryContext || "",
    canvasContext: input.canvasContext || "",
    trace,
    documentText: "",
    documentChars: 0,
    documentWords: 0,
    documentLanguage: "en",
    documentHeadings: [],
    documentKeywords: [],
    documentConcepts: [],
    documentObjectives: [],
    documentError: null,
    intent: "teach",
    intentConfidence: 0.6,
    subject: input.subject || "general",
    subjectConfidence: 0,
    researchMode: input.researchMode ?? null,
    allSubjects: [],
    difficulty: "intermediate",
    learnerProfile: null,
    knowledgeGaps: { prerequisites: [], missingPrerequisites: [], directive: "" },
    generatedPrompt: "",
    systemInstruction: "",
    aiResponse: "",
    aiLatency: 0,
    retryCount: 0,
    temperature: input.temperature ?? 0.7,
    maxTokens: input.maxTokens ?? 4096,
    qualityPassed: false,
    qualityScores: {},
    needsRegeneration: false,
    formattedSections: [],
    formattedReport: "",
    errors: [],
    executionOrder: [],
    executionTimes: {},
    confidenceScores: {},
    visitedNodes: [],
    retrievedChunks: [],
    groundedSources: [],
    faithfulness: null,
    hallucination: null,
    confidence: null,
    telemetry: {
      runId,
      workspaceId: input.workspaceId || "",
      tabId: input.tabId || "",
      query: input.prompt,
      model: input.model || "",
      startedAt: Date.now(),
      finishedAt: 0,
      totalMs: 0,
      retrievalMs: 0,
      generationMs: 0,
      tokensIn: 0,
      tokensOut: 0,
      confidence: null,
      faithfulness: null,
      retrievedChunks: 0,
      groundedSources: 0,
    },
    traceStages: [],
  };
}

export function reduceState(prev: GraphState, update: Partial<GraphState>): GraphState {
  return { ...prev, ...update };
}
