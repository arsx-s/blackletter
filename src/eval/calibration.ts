/**
 * Honest labelling for the pipeline's lexical confidence/grounding heuristics,
 * plus false positive / false negative tracking against fixture ground truth.
 *
 * What this module is NOT: a calibration procedure. No held-out dataset has
 * been collected, no outcome has been observed, and no probability has been
 * measured. The labels below describe *evidence coverage inside the retrieved
 * fixture/context*, not the chance that an answer is correct.
 */

import { confidenceLabel } from "../pipeline/scoring";
import type { AnswerSignals } from "./answer";
import type { HeuristicGroundTruth } from "./dataset";

/**
 * Embed this verbatim (or import it) wherever a heuristic confidence number is
 * surfaced. It must travel with the number, including inside run records.
 */
export const CAVEAT =
  "Not a calibrated probability. The pipeline's 0..100 confidence value is a deterministic lexical " +
  "heuristic (retrieval overlap, faithfulness ratio, answer length, retry stability). It has not been " +
  "measured against outcomes on a held-out dataset, so it must not be read as P(correct), as a percentage, " +
  "or as a margin of safety. Treat it as a relative, within-suite signal only, and always show the " +
  "evidence-coverage label alongside it.";

export interface CalibrationStatus {
  present: boolean;
  note: string;
}

/** The module must say, in data, that calibration evidence is absent. */
export const CALIBRATION_STATUS: CalibrationStatus = {
  present: false,
  note:
    "No held-out calibration dataset exists in this repository, so no empirical calibration numbers " +
    "(accuracy-vs-confidence curves, Brier score, expected calibration error, or reliability diagrams) " +
    "are produced or claimed anywhere in this harness. The fixtures in src/eval/datasets are hand-written " +
    "synthetic cases, not a survey of model outputs.",
};

// ---------------------------------------------------------------------------
// Evidence coverage
// ---------------------------------------------------------------------------

export type EvidenceCoverageLevel = "limited" | "moderate" | "strong";

const THRESHOLDS = {
  strong: { minChunks: 4, minTopScore: 0.5, minFaithfulness: 0.75 },
  moderate: { minChunks: 2, minTopScore: 0.25, minFaithfulness: 0.5 },
} as const;

/** Explicit band criteria, built from the same thresholds the code applies. */
export const EVIDENCE_COVERAGE_CRITERIA: Record<EvidenceCoverageLevel, string> = {
  strong:
    `>= ${THRESHOLDS.strong.minChunks} retrieved chunks, top chunk score >= ${THRESHOLDS.strong.minTopScore}, ` +
    `and a measured faithfulness >= ${THRESHOLDS.strong.minFaithfulness}`,
  moderate:
    `>= ${THRESHOLDS.moderate.minChunks} retrieved chunks, top chunk score >= ${THRESHOLDS.moderate.minTopScore}, ` +
    `and faithfulness either unmeasured or >= ${THRESHOLDS.moderate.minFaithfulness}`,
  limited: "anything below the moderate criteria, including zero retrieved evidence",
};

export interface EvidenceCoverageInput {
  retrievedChunkCount: number;
  /** Best chunk score on the pipeline's 0..1 scale, or `null` when unavailable. */
  topRetrievalScore: number | null;
  /** 0..1 faithfulness ratio, or `null` when the pipeline could not measure it. */
  faithfulnessScore: number | null;
}

export interface EvidenceCoverage {
  level: EvidenceCoverageLevel;
  /** The exact criterion the level rests on, so the label is auditable. */
  criteria: string;
  /** Per-signal values and what they would have needed to reach a higher band. */
  reasons: string[];
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Map retrieval/faithfulness signals to a transparent qualitative label.
 *
 * This never returns a probability. A `strong` label means "the retrieved
 * context was rich and the answer was well covered by it" — an assertion about
 * the evidence, not about the answer's correctness.
 */
export function describeEvidenceCoverage(input: EvidenceCoverageInput): EvidenceCoverage {
  const chunkCount = Number.isFinite(input.retrievedChunkCount)
    ? Math.max(0, Math.floor(input.retrievedChunkCount))
    : 0;
  const topScore = finiteOrNull(input.topRetrievalScore);
  const faithfulness = finiteOrNull(input.faithfulnessScore);

  const strong =
    chunkCount >= THRESHOLDS.strong.minChunks &&
    topScore !== null &&
    topScore >= THRESHOLDS.strong.minTopScore &&
    faithfulness !== null &&
    faithfulness >= THRESHOLDS.strong.minFaithfulness;
  const moderate =
    chunkCount >= THRESHOLDS.moderate.minChunks &&
    topScore !== null &&
    topScore >= THRESHOLDS.moderate.minTopScore &&
    (faithfulness === null || faithfulness >= THRESHOLDS.moderate.minFaithfulness);

  const level: EvidenceCoverageLevel = strong ? "strong" : moderate ? "moderate" : "limited";
  return {
    level,
    criteria: EVIDENCE_COVERAGE_CRITERIA[level],
    reasons: [
      `retrieved chunks: ${chunkCount} (strong needs >= ${THRESHOLDS.strong.minChunks}, moderate needs >= ${THRESHOLDS.moderate.minChunks})`,
      `top retrieval score: ${topScore === null ? "not measured" : topScore.toFixed(2)} (strong needs >= ${THRESHOLDS.strong.minTopScore}, moderate needs >= ${THRESHOLDS.moderate.minTopScore})`,
      `faithfulness: ${faithfulness === null ? "not measured" : faithfulness.toFixed(2)} (strong needs a measurement >= ${THRESHOLDS.strong.minFaithfulness}; moderate allows unmeasured)`,
      `band: ${level} — ${EVIDENCE_COVERAGE_CRITERIA[level]}`,
    ],
  };
}

// ---------------------------------------------------------------------------
// False positive / false negative tracking
// ---------------------------------------------------------------------------

export interface CalibrationSample {
  caseId: string;
  /** Heuristic output for the case, or `null`/missing when none was reported. */
  signals?: Pick<AnswerSignals, "confidenceScore" | "hallucinationFlagged"> | null;
  /** Fixture ground truth, or `null` when the case has none. */
  groundTruth: HeuristicGroundTruth | null;
}

export interface HeuristicConfusionMatrix {
  heuristic: "confidence_band" | "grounding_flag";
  /** What a positive prediction means for this heuristic. */
  positivePrediction: string;
  /** What a positive ground-truth label means. */
  positiveGroundTruth: string;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  /** Samples excluded because the heuristic or the ground truth was missing. Never counted as correct. */
  notEvaluated: number;
  falsePositiveCaseIds: string[];
  falseNegativeCaseIds: string[];
}

export interface HeuristicDiagnostics {
  sampleCount: number;
  samplesWithGroundTruth: number;
  confidence: HeuristicConfusionMatrix;
  grounding: HeuristicConfusionMatrix;
  caveat: string;
}

interface MatrixInput {
  heuristic: HeuristicConfusionMatrix["heuristic"];
  positivePrediction: string;
  positiveGroundTruth: string;
  samples: CalibrationSample[];
  /** Returns `true`/`false`, or `null` when the heuristic reported nothing usable. */
  predict: (sample: CalibrationSample) => boolean | null;
  /** Returns `true`/`false`, or `null` when the case has no ground truth. */
  truth: (sample: CalibrationSample) => boolean | null;
}

function buildMatrix(input: MatrixInput): HeuristicConfusionMatrix {
  const matrix: HeuristicConfusionMatrix = {
    heuristic: input.heuristic,
    positivePrediction: input.positivePrediction,
    positiveGroundTruth: input.positiveGroundTruth,
    truePositives: 0,
    falsePositives: 0,
    trueNegatives: 0,
    falseNegatives: 0,
    notEvaluated: 0,
    falsePositiveCaseIds: [],
    falseNegativeCaseIds: [],
  };

  for (const sample of input.samples) {
    const prediction = input.predict(sample);
    const truth = input.truth(sample);
    if (prediction === null || truth === null) {
      matrix.notEvaluated++;
      continue;
    }
    if (prediction && truth) matrix.truePositives++;
    else if (prediction && !truth) {
      matrix.falsePositives++;
      matrix.falsePositiveCaseIds.push(sample.caseId);
    } else if (!prediction && !truth) matrix.trueNegatives++;
    else {
      matrix.falseNegatives++;
      matrix.falseNegativeCaseIds.push(sample.caseId);
    }
  }
  return matrix;
}

/**
 * Track the confidence heuristic: positive prediction = the pipeline's own
 * `confidenceLabel` reports `High` (score >= 75, threshold defined in
 * src/pipeline/scoring.ts). Positive ground truth = a careful reviewer would
 * consider the answer correct and safe to rely on.
 */
export function trackConfidenceHeuristic(samples: CalibrationSample[]): HeuristicConfusionMatrix {
  return buildMatrix({
    heuristic: "confidence_band",
    positivePrediction: "heuristic labels the answer High confidence",
    positiveGroundTruth: "fixture ground truth labels the answer reliable",
    samples,
    predict: (sample) => {
      const score = sample.signals?.confidenceScore;
      if (typeof score !== "number" || !Number.isFinite(score)) return null;
      return confidenceLabel(score) === "High";
    },
    truth: (sample) => (sample.groundTruth === null ? null : sample.groundTruth.answerReliable),
  });
}

/**
 * Track the grounding heuristic: positive prediction = the pipeline flagged
 * unsupported content (`hallucinationFlagged`). Positive ground truth = the
 * answer is actually unsupported by the supplied sources.
 */
export function trackGroundingHeuristic(samples: CalibrationSample[]): HeuristicConfusionMatrix {
  return buildMatrix({
    heuristic: "grounding_flag",
    positivePrediction: "heuristic flags unsupported content",
    positiveGroundTruth: "fixture ground truth labels the answer unsupported by its sources",
    samples,
    predict: (sample) => {
      const flagged = sample.signals?.hallucinationFlagged;
      return typeof flagged === "boolean" ? flagged : null;
    },
    truth: (sample) => (sample.groundTruth === null ? null : !sample.groundTruth.groundedInSources),
  });
}

export function trackHeuristics(samples: CalibrationSample[]): HeuristicDiagnostics {
  return {
    sampleCount: samples.length,
    samplesWithGroundTruth: samples.filter((sample) => sample.groundTruth !== null).length,
    confidence: trackConfidenceHeuristic(samples),
    grounding: trackGroundingHeuristic(samples),
    caveat: CAVEAT,
  };
}
