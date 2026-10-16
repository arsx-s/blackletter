import type { GraphState } from "../types";
import { log } from "../logger";
import { EVIDENCE_WINDOW, evaluateGrounding } from "../../pipeline/grounding";
import {
  GROUNDING_THRESHOLD,
  computeConfidence,
  detectHallucination,
  estimateTokens,
  faithfulnessFromReport,
  toEvidenceChunks,
} from "../../pipeline/scoring";
import type { PipelineTelemetry, TraceStage } from "../../pipeline/trace";

function stageDuration(stages: TraceStage[], id: string): number {
  const stage = stages.find((s) => s.id === id);
  return stage ? stage.durationMs : 0;
}

export async function EvaluationNode(state: GraphState): Promise<Partial<GraphState>> {
  log("NODE", "EvaluationNode: claim attribution, citations, confidence");
  const answer = state.aiResponse;
  const chunks = state.retrievedChunks || [];

  state.trace.start("evaluation", "Evaluation");

  // One judgement, made once. Faithfulness, citations and locator verification all
  // come out of the same report, so the number the user sees and the evidence
  // listed next to it cannot disagree.
  const groundingReport = evaluateGrounding(answer, toEvidenceChunks(chunks.slice(0, EVIDENCE_WINDOW)), {
    scores: new Map(chunks.map((chunk) => [chunk.id, chunk.score])),
    sources: state.evidenceSources,
    groundingThreshold: GROUNDING_THRESHOLD,
  });
  const faithfulness = faithfulnessFromReport(groundingReport);
  const hallucination = detectHallucination(answer, chunks, faithfulness);
  const confidence = computeConfidence(state.userPrompt, chunks, answer, faithfulness, {
    qualityScores: state.qualityScores,
    retryCount: state.retryCount,
    hadDocuments: state.documentChars > 0,
  });

  log(
    "NODE",
    `EvaluationNode: faithfulness=${faithfulness.score ?? "n/a"}, confidence=${confidence.score ?? "n/a"}, ` +
      `citations=${groundingReport.citations.resolved.length}/${groundingReport.citations.markers.length} resolved, ` +
      `unverifiable=${groundingReport.unverifiable.length}, hallucination=${hallucination.present}`,
  );
  for (const unresolved of groundingReport.citations.unresolved) {
    log("NODE", `EvaluationNode: citation ${unresolved.marker} does not resolve (${unresolved.reason})`);
  }

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
    claimsJudged: groundingReport.supportedClaims.length + groundingReport.unsupportedClaims.length,
    citationsResolved: groundingReport.citations.resolved.length,
    citationsUnresolved: groundingReport.citations.unresolved.length,
    unverifiableChunks: groundingReport.unverifiable.length,
    flaggedClaims: hallucination.flaggedClaims.length,
  });

  return { faithfulness, hallucination, confidence, groundingReport, telemetry };
}