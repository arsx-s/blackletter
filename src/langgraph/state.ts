import type { GraphState, LearnerProfile, KnowledgeGapResult } from "./types";
import { Trace } from "../pipeline/trace";
import { resolveProvider } from "../providers/selection";

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
  // Resolved once, at the start of the run, and recorded. LLMNode replaces it
  // with the provider that actually ran the request, so a fallback cannot be
  // reported as a local run.
  const resolved = resolveProvider();
  return {
    userPrompt: input.prompt,
    knowledgeContext: input.knowledgeContext || "",
    conversationHistory: input.history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    uploadedDocuments: input.files,
    model: input.model || "",
    provider: resolved.provider,
    providerLocal: resolved.provider === "ollama",
    providerFallback: false,
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
    documentParts: [],
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
    groundingReport: null,
    evidenceSources: new Map(),
    telemetry: {
      runId,
      workspaceId: input.workspaceId || "",
      tabId: input.tabId || "",
      query: input.prompt,
      model: input.model || "",
      provider: resolved.provider,
      local: resolved.provider === "ollama",
      providerFallback: false,
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
