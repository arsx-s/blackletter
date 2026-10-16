import { describe, expect, it } from "vitest";
import * as harness from "../../eval/index";
import { createReplayAnswerFn, runEvaluation } from "../../eval/runner";
import {
  DEFAULT_DATASET_SET,
  DEFAULT_REPLAY,
  FRESH_DATASET,
  FRESH_REPLAY,
  REGRESSION_DATASET,
  REGRESSION_REPLAY,
} from "../../eval/datasets";
import { fixedClock, makeDatasetSet } from "./helpers";

describe("public barrel", () => {
  it("exposes the harness API through src/eval/index", () => {
    expect(typeof harness.runEvaluation).toBe("function");
    expect(typeof harness.createReplayAnswerFn).toBe("function");
    expect(typeof harness.scoreRun).toBe("function");
    expect(typeof harness.validateDatasetSet).toBe("function");
    expect(typeof harness.describeEvidenceCoverage).toBe("function");
    expect(typeof harness.trackHeuristics).toBe("function");
    expect(harness.DEFAULT_DATASET_SET.datasets).toHaveLength(2);
    expect(harness.EVALUATION_CATEGORIES).toHaveLength(9);
  });
});

describe("recorded replay coverage", () => {
  it("has exactly one recorded answer per regression case", () => {
    const caseIds = REGRESSION_DATASET.cases.map((c) => c.id).sort();
    expect(Object.keys(REGRESSION_REPLAY).sort()).toEqual(caseIds);
  });

  it("has exactly one recorded answer per fresh case", () => {
    const caseIds = FRESH_DATASET.cases.map((c) => c.id).sort();
    expect(Object.keys(FRESH_REPLAY).sort()).toEqual(caseIds);
  });

  it("has exactly one recorded answer per default-set case and no collisions", () => {
    const caseIds = DEFAULT_DATASET_SET.datasets.flatMap((dataset) => dataset.cases.map((c) => c.id)).sort();
    expect(Object.keys(DEFAULT_REPLAY).sort()).toEqual(caseIds);
  });
});

describe("baseline runs over the shipped fixtures", () => {
  it("runs the regression set green against its recorded answers", async () => {
    const record = await runEvaluation(
      makeDatasetSet([REGRESSION_DATASET], { setId: "regression-only" }),
      createReplayAnswerFn(REGRESSION_REPLAY),
      { now: fixedClock, runId: "baseline-regression" },
    );
    expect(record.aggregate.evaluatedCases).toBe(9);
    expect(record.aggregate.passedCases).toBe(9);
    expect(record.aggregate.failedCases).toBe(0);
    expect(record.aggregate.errorCases).toBe(0);
    expect(record.aggregate.notEvaluatedCases).toBe(0);
    expect(record.aggregate.passRate).toBe(1);
    expect(record.failures).toEqual([]);
  });

  it("surfaces the documented known failure in the fresh set", async () => {
    const record = await runEvaluation(
      makeDatasetSet([FRESH_DATASET], { setId: "fresh-only" }),
      createReplayAnswerFn(FRESH_REPLAY),
      { now: fixedClock, runId: "baseline-fresh" },
    );
    expect(record.aggregate.failedCases).toBe(1);
    expect(record.failures).toHaveLength(1);
    const failure = record.failures[0];
    expect(failure.caseId).toBe("fresh-injection-canary-leak");
    expect(failure.kind).toBe("assertion");
    const failingCase = FRESH_DATASET.cases.find((c) => c.id === failure.caseId);
    expect(failingCase?.metadata.knownGap).toBeTruthy();
  });

  it("matches the documented totals and heuristic diagnostics on the default set", async () => {
    const record = await runEvaluation(DEFAULT_DATASET_SET, createReplayAnswerFn(DEFAULT_REPLAY), {
      now: fixedClock,
      runId: "baseline-default",
    });

    expect(record.aggregate.evaluatedCases).toBe(16);
    expect(record.aggregate.passedCases).toBe(15);
    expect(record.aggregate.failedCases).toBe(1);
    expect(record.aggregate.notEvaluatedCases).toBe(0);
    expect(record.aggregate.passRate).toBe(0.938);

    expect(record.heuristicDiagnostics.sampleCount).toBe(16);
    expect(record.heuristicDiagnostics.samplesWithGroundTruth).toBe(10);

    expect(record.heuristicDiagnostics.confidence).toMatchObject({
      truePositives: 5,
      falsePositives: 1,
      trueNegatives: 0,
      falseNegatives: 4,
      notEvaluated: 6,
    });
    expect(record.heuristicDiagnostics.confidence.falsePositiveCaseIds).toEqual([
      "fresh-injection-canary-leak",
    ]);

    expect(record.heuristicDiagnostics.grounding).toMatchObject({
      truePositives: 0,
      falsePositives: 0,
      trueNegatives: 9,
      falseNegatives: 1,
      notEvaluated: 6,
    });
    expect(record.heuristicDiagnostics.grounding.falseNegativeCaseIds).toEqual([
      "fresh-injection-canary-leak",
    ]);

    expect(record.confidenceCaveat).toContain("Not a calibrated probability");
  });

  it("records dataset versions and content digests on the run", async () => {
    const record = await runEvaluation(DEFAULT_DATASET_SET, createReplayAnswerFn(DEFAULT_REPLAY), {
      now: fixedClock,
      runId: "baseline-refs",
    });
    for (const ref of record.datasets) {
      expect(ref.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(ref.digest).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
      expect(ref.caseCount).toBeGreaterThan(0);
    }
  });
});
