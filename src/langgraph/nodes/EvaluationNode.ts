import type { GraphState } from "../types";
import { log } from "../logger";
import {
  computeFaithfulness,
  detectHallucination,
  computeConfidence,
  estimateTokens,
} from "../../pipeline/scoring";
import type { PipelineTelemetry, TraceStage } from "../../pipeline/trace";

function stageDuration(stages: TraceStage[], id: string): number {
  const stage = stages.find((s) => s.id === id);
  return stage ? stage.durationMs : 0;
}

export async function EvaluationNode(state: GraphState): Promise<Partial<GraphState>> {
  log("NODE", "EvaluationNode: faithfulness, confidence, hallucination detection");
  const answer = state.aiResponse;
  const chunks = state.retrievedChunks || [];

  state.trace.start("evaluation", "Evaluation");

  const faithfulness = computeFaithfulness(answer, chunks);
  const hallucination = detectHallucination(answer, chunks, faithfulness);
  const confidence = computeConfidence(state.userPrompt, chunks, answer, faithfulness, {
    qualityScores: state.qualityScores,
    retryCount: state.retryCount,
    hadDocuments: state.documentChars > 0,
  });

  log("NODE", `EvaluationNode: faithfulness=${faithfulness.score ?? "n/a"}, confidence=${confidence.score}, hallucination=${hallucination.present}`);

  const retrievalStage = stageDuration(state.trace.stages, "retrieval");
  const llmStage = stageDuration(state.trace.stages, "openrouter");

  const telemetry: PipelineTelemetry = {
    ...state.telemetry,
    finishedAt: Date.now(),
    totalMs: state.trace.totalMs(),
    retrievalMs: retrievalStage,
    generationMs: llmStage,
    tokensIn: estimateTokens(state.generatedPrompt || state.userPrompt),
    tokensOut: estimateTokens(answer),
    confidence: confidence.score,
    faithfulness: faithfulness.score,
    retrievedChunks: chunks.length,
    groundedSources: state.groundedSources.length,
  };

  state.trace.end("evaluation", {
    confidence: confidence.score,
    faithfulness: faithfulness.score ?? -1,
    flaggedClaims: hallucination.flaggedClaims.length,
  });

  return { faithfulness, hallucination, confidence, telemetry };
}