import { createBlackLetterGraph } from "./graph";
import { createInitialState } from "./state";
import type { GraphRunResult, PipelineRunInput } from "./types";
import { recordRun, recordError } from "../observability/metrics";
import { devLog } from "../lib/dev-log";

export type { GraphState, PipelineRunInput, FormattedSection, NodeTiming } from "./types";

function toPipelineResult(runResult: GraphRunResult) {
  const s = runResult.state;
  return {
    response: s.formattedReport || s.aiResponse || "",
    sections: s.formattedSections,
    timing: runResult.visitedNodes.map((name) => ({
      name,
      startMs: 0,
      endMs: 0,
      durationMs: runResult.executionTimes[name] || 0,
      status: runResult.success ? ("success" as const) : ("error" as const),
    })),
    intent: s.intent,
    subject: s.subject,
    difficulty: s.difficulty || "intermediate",
    retryCount: s.retryCount,
    aiLatency: s.aiLatency,
    qualityPassed: s.qualityPassed,
    qualityScores: s.qualityScores,
    documentAnalyzed: s.documentText.length > 0,
    documentError: s.documentError,
    errors: s.errors,
    visitedNodes: runResult.visitedNodes,
    executionTimes: runResult.executionTimes,
    graphSuccess: runResult.success,
    graphError: runResult.error,
    errorCode: runResult.errorCode,
    runId: s.runId,
    trace: s.trace.stages,
    retrievedChunks: s.retrievedChunks,
    groundedSources: s.groundedSources,
    faithfulness: s.faithfulness,
    hallucination: s.hallucination,
    confidence: s.confidence,
    intelligence: {
      confidence: s.confidence,
      faithfulness: s.faithfulness,
      hallucination: s.hallucination,
      groundedSources: s.groundedSources,
      retrievedChunks: s.retrievedChunks,
      trace: s.trace.stages,
      telemetry: s.telemetry,
    },
    telemetry: s.telemetry,
  };
}

export async function runPipeline(input: PipelineRunInput) {
  const graph = createBlackLetterGraph();
  const initialState = createInitialState({
    prompt: input.prompt,
    files: input.files || [],
    history: input.history || [],
    subject: input.subject || null,
    mode: input.mode || null,
    model: input.model,
    knowledgeContext: input.knowledgeContext,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    researchMode: (input.metadata?.researchMode as string | null | undefined) ?? null,
    workspaceId: input.workspaceId,
    tabId: input.tabId,
    memoryContext: input.memoryContext,
    canvasContext: input.canvasContext,
  });

  devLog(`[LANGGRAPH] runPipeline: prompt="${input.prompt}", files=${(input.files || []).length}`);

  const result = await graph.execute(initialState);

  devLog(`[LANGGRAPH] Execution complete: success=${result.success}, nodes=[${result.visitedNodes.join(" → ")}], total=${Object.values(result.executionTimes).reduce((a, b) => a + b, 0)}ms`);
  if (result.error) {
    console.error(`[LANGGRAPH] Execution error: ${result.error}`);
  }

  const telemetry = result.state.telemetry;

  if (!result.success && result.error) {
    const err = new Error(result.error) as Error & { code?: string };
    err.code = result.errorCode || "SERVER";
    recordRun({
      runId: initialState.runId,
      at: Date.now(),
      workspaceId: initialState.workspaceId,
      tabId: initialState.tabId,
      query: initialState.userPrompt.slice(0, 200),
      model: initialState.model || "default",
      totalMs: telemetry.totalMs || result.state.trace.totalMs(),
      retrievalMs: telemetry.retrievalMs,
      generationMs: telemetry.generationMs,
      tokensIn: telemetry.tokensIn,
      tokensOut: telemetry.tokensOut,
      confidence: null,
      faithfulness: null,
      retrievedChunks: result.state.retrievedChunks.length,
      groundedSources: 0,
      errorCode: err.code,
    });
    recordError({
      id: `err-${initialState.runId}`,
      at: Date.now(),
      code: err.code,
      message: err.message.slice(0, 400),
      runId: initialState.runId,
      workspaceId: initialState.workspaceId,
      tabId: initialState.tabId,
    });
    throw err;
  }

  recordRun({
    runId: telemetry.runId,
    at: Date.now(),
    workspaceId: telemetry.workspaceId,
    tabId: telemetry.tabId,
    query: telemetry.query.slice(0, 200),
    model: telemetry.model || "default",
    totalMs: telemetry.totalMs || result.state.trace.totalMs(),
    retrievalMs: telemetry.retrievalMs,
    generationMs: telemetry.generationMs,
    tokensIn: telemetry.tokensIn,
    tokensOut: telemetry.tokensOut,
    confidence: telemetry.confidence,
    faithfulness: telemetry.faithfulness,
    retrievedChunks: telemetry.retrievedChunks,
    groundedSources: telemetry.groundedSources,
  });

  return toPipelineResult(result);
}

export { createBlackLetterGraph, createInitialState };
export type { GraphRunResult };
