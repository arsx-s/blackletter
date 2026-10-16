import { describe, expect, it } from "vitest";
import {
  CAVEAT,
  CALIBRATION_STATUS,
  EVIDENCE_COVERAGE_CRITERIA,
  describeEvidenceCoverage,
  trackConfidenceHeuristic,
  trackGroundingHeuristic,
  trackHeuristics,
  type CalibrationSample,
} from "../../eval/calibration";
import type { HeuristicGroundTruth } from "../../eval/dataset";

function sample(
  caseId: string,
  confidenceScore: number | null,
  flagged: boolean | null,
  truth: HeuristicGroundTruth | null,
): CalibrationSample {
  const signals: NonNullable<CalibrationSample["signals"]> = {};
  if (confidenceScore !== null) signals.confidenceScore = confidenceScore;
  if (flagged !== null) signals.hallucinationFlagged = flagged;
  return { caseId, signals, groundTruth: truth };
}

const RELIABLE: HeuristicGroundTruth = { answerReliable: true, groundedInSources: true };
const RELIABLE_UNGROUNDED: HeuristicGroundTruth = { answerReliable: true, groundedInSources: false };
const UNRELIABLE: HeuristicGroundTruth = { answerReliable: false, groundedInSources: false };

describe("describeEvidenceCoverage", () => {
  it("labels rich, well-grounded evidence as strong with auditable criteria", () => {
    const coverage = describeEvidenceCoverage({
      retrievedChunkCount: 5,
      topRetrievalScore: 0.6,
      faithfulnessScore: 0.8,
    });
    expect(coverage.level).toBe("strong");
    expect(coverage.criteria).toBe(EVIDENCE_COVERAGE_CRITERIA.strong);
    expect(coverage.reasons).toHaveLength(4);
    expect(coverage.reasons.join(" ")).toContain("top retrieval score: 0.60");
  });

  it("labels partial evidence as moderate, allowing unmeasured faithfulness", () => {
    const coverage = describeEvidenceCoverage({
      retrievedChunkCount: 2,
      topRetrievalScore: 0.3,
      faithfulnessScore: null,
    });
    expect(coverage.level).toBe("moderate");
    expect(coverage.reasons.join(" ")).toContain("faithfulness: not measured");
  });

  it("never rates coverage strong without a measured faithfulness", () => {
    const coverage = describeEvidenceCoverage({
      retrievedChunkCount: 10,
      topRetrievalScore: 0.9,
      faithfulnessScore: null,
    });
    expect(coverage.level).toBe("moderate");
  });

  it("labels zero or poor evidence as limited", () => {
    expect(
      describeEvidenceCoverage({ retrievedChunkCount: 0, topRetrievalScore: null, faithfulnessScore: null }).level,
    ).toBe("limited");
    expect(
      describeEvidenceCoverage({ retrievedChunkCount: 4, topRetrievalScore: 0.6, faithfulnessScore: 0.3 }).level,
    ).toBe("limited");
  });

  it("treats non-finite inputs as not measured instead of inventing a band", () => {
    const coverage = describeEvidenceCoverage({
      retrievedChunkCount: Number.NaN,
      topRetrievalScore: Number.NaN,
      faithfulnessScore: Number.NaN,
    });
    expect(coverage.level).toBe("limited");
    expect(coverage.reasons.join(" ")).toContain("not measured");
  });
});

describe("calibration honesty constants", () => {
  it("states that the score is not a calibrated probability", () => {
    expect(CAVEAT).toContain("Not a calibrated probability");
    expect(CAVEAT).toContain("P(correct)");
    expect(CAVEAT).toContain("held-out dataset");
  });

  it("states that no held-out calibration dataset exists", () => {
    expect(CALIBRATION_STATUS.present).toBe(false);
    expect(CALIBRATION_STATUS.note).toContain("No held-out calibration dataset");
    expect(CALIBRATION_STATUS.note).toContain("not a survey of model outputs");
  });
});

describe("trackConfidenceHeuristic", () => {
  it("counts true/false positives and negatives against fixture ground truth", () => {
    const matrix = trackConfidenceHeuristic([
      sample("c-tp", 90, false, RELIABLE),
      sample("c-fp", 88, false, UNRELIABLE),
      sample("c-tn", 40, false, UNRELIABLE),
      sample("c-fn", 60, false, RELIABLE),
    ]);
    expect(matrix.truePositives).toBe(1);
    expect(matrix.falsePositives).toBe(1);
    expect(matrix.trueNegatives).toBe(1);
    expect(matrix.falseNegatives).toBe(1);
    expect(matrix.falsePositiveCaseIds).toEqual(["c-fp"]);
    expect(matrix.falseNegativeCaseIds).toEqual(["c-fn"]);
    expect(matrix.notEvaluated).toBe(0);
  });

  it("excludes samples missing either the heuristic signal or the ground truth", () => {
    const matrix = trackConfidenceHeuristic([
      sample("no-truth", 99, false, null),
      sample("no-signal", null, null, RELIABLE),
    ]);
    expect(matrix.notEvaluated).toBe(2);
    expect(matrix.truePositives + matrix.falsePositives + matrix.trueNegatives + matrix.falseNegatives).toBe(0);
  });

  it("uses the pipeline's own High threshold (>= 75) for a positive prediction", () => {
    const atBoundary = trackConfidenceHeuristic([sample("boundary", 75, false, UNRELIABLE)]);
    const belowBoundary = trackConfidenceHeuristic([sample("below", 74, false, UNRELIABLE)]);
    expect(atBoundary.falsePositives).toBe(1);
    expect(belowBoundary.trueNegatives).toBe(1);
  });
});

describe("trackGroundingHeuristic", () => {
  it("tracks the hallucination flag against ground-truth groundedness", () => {
    const matrix = trackGroundingHeuristic([
      sample("g-tp", 80, true, UNRELIABLE),
      sample("g-fp", 80, true, RELIABLE),
      sample("g-tn", 80, false, RELIABLE),
      sample("g-fn", 80, false, RELIABLE_UNGROUNDED),
      sample("g-skip", 80, null, RELIABLE),
    ]);
    expect(matrix.truePositives).toBe(1);
    expect(matrix.falsePositives).toBe(1);
    expect(matrix.trueNegatives).toBe(1);
    expect(matrix.falseNegatives).toBe(1);
    expect(matrix.falseNegativeCaseIds).toEqual(["g-fn"]);
    expect(matrix.notEvaluated).toBe(1);
  });

  it("explains what a positive prediction means in both directions", () => {
    const matrix = trackGroundingHeuristic([]);
    expect(matrix.positivePrediction).toContain("flags unsupported content");
    expect(matrix.positiveGroundTruth).toContain("unsupported by its sources");
  });
});

describe("trackHeuristics", () => {
  it("assembles diagnostics with sample counts and the caveat", () => {
    const diagnostics = trackHeuristics([
      sample("a", 90, false, RELIABLE),
      sample("b", 80, false, null),
    ]);
    expect(diagnostics.sampleCount).toBe(2);
    expect(diagnostics.samplesWithGroundTruth).toBe(1);
    expect(diagnostics.confidence.heuristic).toBe("confidence_band");
    expect(diagnostics.grounding.heuristic).toBe("grounding_flag");
    expect(diagnostics.caveat).toBe(CAVEAT);
  });
});
