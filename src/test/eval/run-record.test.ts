import { describe, expect, it } from "vitest";
import {
  collectFailures,
  configurationFingerprint,
  parseRunRecord,
  scoreRun,
  serializeRunRecord,
  type CaseResult,
  type CheckResult,
} from "../../eval/run-record";
import type { EvaluationCategory } from "../../eval/dataset";
import { createReplayAnswerFn, runEvaluation } from "../../eval/runner";
import { DEFAULT_DATASET_SET, DEFAULT_REPLAY } from "../../eval/datasets";
import { fixedClock } from "./helpers";

function caseResult(
  overrides: Partial<CaseResult> & { caseId: string; category: EvaluationCategory },
): CaseResult {
  return {
    datasetId: "test-dataset",
    datasetVersion: "1.0.0",
    status: "pass",
    score: 1,
    checks: [],
    durationMs: 0,
    ...overrides,
  };
}

function check(name: string, passed: boolean): CheckResult {
  return { name, passed, expected: "expected", observed: "observed" };
}

describe("scoreRun", () => {
  it("computes passRate from evaluated cases only", () => {
    const aggregate = scoreRun([
      caseResult({ caseId: "a", category: "answer_correctness" }),
      caseResult({ caseId: "b", category: "answer_correctness", status: "fail", score: 0.5 }),
      caseResult({ caseId: "c", category: "answer_correctness", status: "not_evaluated", score: null, skipReason: "no ground truth" }),
    ]);
    expect(aggregate.evaluatedCases).toBe(2);
    expect(aggregate.notEvaluatedCases).toBe(1);
    expect(aggregate.passRate).toBe(0.5);
    expect(aggregate.meanCheckScore).toBe(0.75);
  });

  it("distinguishes a zero score from an unevaluated category", () => {
    const zeroScore = scoreRun([
      caseResult({ caseId: "z", category: "answer_correctness", status: "fail", score: 0 }),
    ]);
    const noEvidence = scoreRun([
      caseResult({
        caseId: "n",
        category: "answer_correctness",
        status: "not_evaluated",
        score: null,
        skipReason: "expectation block absent",
      }),
    ]);

    expect(zeroScore.passRate).toBe(0);
    expect(zeroScore.meanCheckScore).toBe(0);
    expect(zeroScore.byCategory.find((c) => c.category === "answer_correctness")?.status).toBe("evaluated");

    expect(noEvidence.passRate).toBeNull();
    expect(noEvidence.meanCheckScore).toBeNull();
    const category = noEvidence.byCategory.find((c) => c.category === "answer_correctness");
    expect(category?.status).toBe("not_evaluated");
    expect(category?.skipReasons).toEqual([{ caseId: "n", reason: "expectation block absent" }]);
  });

  it("always reports every category, marking uncovered ones not_evaluated", () => {
    const aggregate = scoreRun([caseResult({ caseId: "a", category: "tool_honesty" })]);
    expect(aggregate.byCategory).toHaveLength(9);
    const covered = aggregate.byCategory.find((c) => c.category === "tool_honesty");
    expect(covered?.status).toBe("evaluated");
    const uncovered = aggregate.byCategory.find((c) => c.category === "permission_boundary");
    expect(uncovered?.status).toBe("not_evaluated");
    expect(uncovered?.passRate).toBeNull();
    expect(uncovered?.evaluatedCases).toBe(0);
  });

  it("counts answer-function errors separately from assertion failures", () => {
    const aggregate = scoreRun([
      caseResult({ caseId: "boom", category: "answer_correctness", status: "error", score: null, error: "kaboom" }),
      caseResult({ caseId: "bad", category: "answer_correctness", status: "fail", score: 0.5 }),
    ]);
    expect(aggregate.errorCases).toBe(1);
    expect(aggregate.failedCases).toBe(1);
    expect(aggregate.evaluatedCases).toBe(1);
    expect(aggregate.passRate).toBe(0);
  });
});

describe("collectFailures", () => {
  it("lists failed checks for assertion failures and errors for thrown answers", () => {
    const failures = collectFailures([
      caseResult({
        caseId: "bad",
        category: "answer_correctness",
        status: "fail",
        score: 0.5,
        checks: [check("required_phrases", false), check("forbidden_phrases", true)],
      }),
      caseResult({ caseId: "boom", category: "answer_correctness", status: "error", score: null, error: "kaboom" }),
      caseResult({
        caseId: "skip",
        category: "answer_correctness",
        status: "not_evaluated",
        score: null,
        skipReason: "no ground truth",
      }),
    ]);
    expect(failures).toHaveLength(2);
    expect(failures[0].caseId).toBe("bad");
    expect(failures[0].kind).toBe("assertion");
    expect(failures[0].summary).toContain("required_phrases");
    expect(failures[0].failedChecks).toHaveLength(1);
    expect(failures[1].caseId).toBe("boom");
    expect(failures[1].kind).toBe("error");
    expect(failures[1].summary).toContain("kaboom");
  });

  it("does not treat not_evaluated cases as failures", () => {
    const failures = collectFailures([
      caseResult({
        caseId: "skip",
        category: "answer_correctness",
        status: "not_evaluated",
        score: null,
        skipReason: "no ground truth",
      }),
    ]);
    expect(failures).toEqual([]);
  });
});

describe("configurationFingerprint", () => {
  const base = {
    provider: "fixture",
    model: "deterministic-replay",
    answerSource: "replay-fixture:16-answers",
    caseCount: 16,
    datasets: [{ datasetId: "d", version: "1.0.0", digest: "fnv1a32:deadbeef" }],
  };

  it("is stable for identical configuration and insensitive to run timestamps", () => {
    expect(configurationFingerprint(base)).toBe(configurationFingerprint({ ...base }));
    expect(configurationFingerprint(base)).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
  });

  it("changes when the model, dataset or answer source changes", () => {
    expect(configurationFingerprint(base)).not.toBe(configurationFingerprint({ ...base, model: "other-model" }));
    expect(configurationFingerprint(base)).not.toBe(
      configurationFingerprint({ ...base, datasets: [{ datasetId: "d", version: "1.0.1", digest: "fnv1a32:deadbeef" }] }),
    );
    expect(configurationFingerprint(base)).not.toBe(
      configurationFingerprint({ ...base, answerSource: "injected-answer-fn" }),
    );
  });
});

describe("run record round-trip", () => {
  it("serializes and parses back to an identical record", async () => {
    const record = await runEvaluation(DEFAULT_DATASET_SET, createReplayAnswerFn(DEFAULT_REPLAY), {
      now: fixedClock,
      runId: "run-round-trip",
    });
    const json = serializeRunRecord(record);
    const parsed = parseRunRecord(json);
    expect(parsed).toStrictEqual(record);
    // Canonical form is stable: re-serializing the parsed record is byte-identical.
    expect(serializeRunRecord(parsed)).toBe(json);
  });

  it("rejects JSON that is not a run record", () => {
    expect(() => parseRunRecord("not json")).toThrow(/valid JSON/);
    expect(() => parseRunRecord('{"schemaVersion":99,"cases":[]}')).toThrow(/schemaVersion/);
    expect(() => parseRunRecord('{"schemaVersion":1}')).toThrow(/cases/);
  });
});
