import { describe, expect, it, vi } from "vitest";
import { createReplayAnswerFn, runEvaluation } from "../../eval/runner";
import type { AnswerFn, RunnerAnswer } from "../../eval/answer";
import {
  DEFAULT_DATASET_SET,
  DEFAULT_REPLAY,
  FRESH_DATASET,
  FRESH_REPLAY,
  REGRESSION_DATASET,
  REGRESSION_REPLAY,
} from "../../eval/datasets";
import { fixedClock, makeAnswer, makeCase, makeDataset, makeDatasetSet } from "./helpers";

const GOOD_CASE = () =>
  makeCase({
    id: "good-case",
    category: "answer_correctness",
    expectation: { answer: { requiredPhrases: ["expected content"] } },
  });

describe("runEvaluation determinism", () => {
  it("produces a byte-identical record on a rerun with an injected clock and run id", async () => {
    const answerFn = createReplayAnswerFn(DEFAULT_REPLAY);
    const options = { now: fixedClock, runId: "run-fixed" };
    const first = await runEvaluation(DEFAULT_DATASET_SET, answerFn, options);
    const second = await runEvaluation(DEFAULT_DATASET_SET, answerFn, options);
    expect(second).toStrictEqual(first);
  });

  it("keeps case results and aggregates identical even when run id and timestamps differ", async () => {
    const answerFn = createReplayAnswerFn(DEFAULT_REPLAY);
    const first = await runEvaluation(DEFAULT_DATASET_SET, answerFn);
    const second = await runEvaluation(DEFAULT_DATASET_SET, answerFn);

    // Per-case durations come from the real clock in this run, so normalise
    // them before comparing; everything else must match exactly.
    const stripVolatile = (record: Awaited<ReturnType<typeof runEvaluation>>) =>
      record.cases.map((caseResult) => ({ ...caseResult, durationMs: 0 }));

    expect(stripVolatile(second)).toEqual(stripVolatile(first));
    expect(second.aggregate).toEqual(first.aggregate);
    expect(second.configurationFingerprint).toBe(first.configurationFingerprint);
    expect(second.failures).toEqual(first.failures);
    expect(second.runId).not.toBe(first.runId);
  });
});

describe("runEvaluation failure reporting", () => {
  it("reports a failing case as a failure, not a silent pass", async () => {
    const set = makeDatasetSet([makeDataset([GOOD_CASE()])]);
    const record = await runEvaluation(set, async () => makeAnswer("This content is wrong."), {
      now: fixedClock,
      runId: "run-fail",
    });

    expect(record.cases).toHaveLength(1);
    expect(record.cases[0].status).toBe("fail");
    expect(record.cases[0].score).toBe(0);
    expect(record.aggregate.passedCases).toBe(0);
    expect(record.aggregate.failedCases).toBe(1);
    expect(record.aggregate.passRate).toBe(0);
    expect(record.failures).toHaveLength(1);
    expect(record.failures[0].caseId).toBe("good-case");
    expect(record.failures[0].kind).toBe("assertion");
    expect(record.failures[0].failedChecks.length).toBeGreaterThan(0);
  });

  it("distinguishes a not_evaluated case from a zero score", async () => {
    const set = makeDatasetSet([
      makeDataset([
        makeCase({
          id: "scored-case",
          category: "answer_correctness",
          expectation: { answer: { requiredPhrases: ["never present"] } },
        }),
        makeCase({ id: "unscored-case", category: "tool_honesty", expectation: {} }),
      ]),
    ]);
    const record = await runEvaluation(
      set,
      async (testCase) => makeAnswer(testCase.id === "scored-case" ? "Wrong content." : "Anything at all."),
      { now: fixedClock, runId: "run-mixed" },
    );

    const scored = record.cases.find((c) => c.caseId === "scored-case");
    const unscored = record.cases.find((c) => c.caseId === "unscored-case");
    expect(scored?.status).toBe("fail");
    expect(scored?.score).toBe(0);
    expect(unscored?.status).toBe("not_evaluated");
    expect(unscored?.score).toBeNull();
    expect(unscored?.skipReason).toContain("tools");

    const toolCategory = record.aggregate.byCategory.find((c) => c.category === "tool_honesty");
    expect(toolCategory?.status).toBe("not_evaluated");
    expect(toolCategory?.passRate).toBeNull();
    expect(toolCategory?.notEvaluatedCases).toBe(1);

    expect(record.failures.map((failure) => failure.caseId)).toEqual(["scored-case"]);
  });

  it("reports a thrown answer function as an error case", async () => {
    const set = makeDatasetSet([makeDataset([GOOD_CASE()])]);
    const record = await runEvaluation(
      set,
      async () => {
        throw new Error("boom");
      },
      { now: fixedClock, runId: "run-error" },
    );

    expect(record.cases[0].status).toBe("error");
    expect(record.cases[0].error).toContain("boom");
    expect(record.aggregate.errorCases).toBe(1);
    expect(record.aggregate.passRate).toBeNull();
    expect(record.failures).toHaveLength(1);
    expect(record.failures[0].kind).toBe("error");
  });

  it("treats a malformed answer as an error instead of crashing", async () => {
    const set = makeDatasetSet([makeDataset([GOOD_CASE()])]);
    const malformed = (async () => ({ text: 42 })) as unknown as AnswerFn;
    const record = await runEvaluation(set, malformed, { now: fixedClock, runId: "run-malformed" });
    expect(record.cases[0].status).toBe("error");
    expect(record.cases[0].error).toContain("no text");
  });

  it("throws on an invalid dataset set instead of producing a plausible record", async () => {
    await expect(runEvaluation(makeDatasetSet([]), async () => makeAnswer("x"))).rejects.toThrow(
      /invalid evaluation dataset set/,
    );
  });
});

describe("runEvaluation dataset sets", () => {
  it("runs the regression and fresh datasets separately", async () => {
    const regressionRecord = await runEvaluation(
      makeDatasetSet([REGRESSION_DATASET], { setId: "regression-only" }),
      createReplayAnswerFn(REGRESSION_REPLAY),
      { now: fixedClock, runId: "run-regression" },
    );
    const freshRecord = await runEvaluation(
      makeDatasetSet([FRESH_DATASET], { setId: "fresh-only" }),
      createReplayAnswerFn(FRESH_REPLAY),
      { now: fixedClock, runId: "run-fresh" },
    );

    expect(regressionRecord.datasets.map((d) => d.datasetId)).toEqual([REGRESSION_DATASET.datasetId]);
    expect(freshRecord.datasets.map((d) => d.datasetId)).toEqual([FRESH_DATASET.datasetId]);
    expect(regressionRecord.cases.every((c) => c.datasetId === REGRESSION_DATASET.datasetId)).toBe(true);
    expect(freshRecord.cases.every((c) => c.datasetId === FRESH_DATASET.datasetId)).toBe(true);
    expect(regressionRecord.configurationFingerprint).not.toBe(freshRecord.configurationFingerprint);
    expect(regressionRecord.datasetSet.setId).not.toBe(freshRecord.datasetSet.setId);
  });

  it("runs a dataset set composed of both and records both references", async () => {
    const record = await runEvaluation(DEFAULT_DATASET_SET, createReplayAnswerFn(DEFAULT_REPLAY), {
      now: fixedClock,
      runId: "run-both",
    });
    expect(record.datasets.map((d) => d.datasetId)).toEqual([
      REGRESSION_DATASET.datasetId,
      FRESH_DATASET.datasetId,
    ]);
    expect(record.cases).toHaveLength(
      REGRESSION_DATASET.cases.length + FRESH_DATASET.cases.length,
    );
  });

  it("invokes onCaseComplete once per case in dataset order", async () => {
    const seen: string[] = [];
    await runEvaluation(DEFAULT_DATASET_SET, createReplayAnswerFn(DEFAULT_REPLAY), {
      now: fixedClock,
      runId: "run-progress",
      onCaseComplete: (result) => seen.push(result.caseId),
    });
    expect(seen).toEqual(DEFAULT_DATASET_SET.datasets.flatMap((dataset) => dataset.cases.map((c) => c.id)));
  });
});

describe("runEvaluation network isolation", () => {
  it("performs no network I/O (fetch is stubbed to throw)", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("network access attempted");
    });
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const record = await runEvaluation(DEFAULT_DATASET_SET, createReplayAnswerFn(DEFAULT_REPLAY), {
        now: fixedClock,
        runId: "run-offline",
      });
      expect(record.cases.length).toBeGreaterThan(0);
      expect(record.aggregate.evaluatedCases).toBeGreaterThan(0);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(record.reproducibility.notes.join(" ")).toContain("no network I/O");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not require a provider to be present", async () => {
    // The harness imports no provider module; a replay run needs no live
    // client. This asserts the runner completes while fetch cannot be used at
    // all (it is replaced with a throwing stub for the duration of the run).
    const fetchSpy = vi.fn(() => {
      throw new Error("network access attempted");
    });
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const record = await runEvaluation(DEFAULT_DATASET_SET, createReplayAnswerFn(DEFAULT_REPLAY), {
        now: fixedClock,
        runId: "run-no-provider",
      });
      expect(record.cases.length).toBe(REGRESSION_DATASET.cases.length + FRESH_DATASET.cases.length);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("createReplayAnswerFn", () => {
  it("throws for a case id that has no recorded answer", async () => {
    const fn = createReplayAnswerFn({});
    await expect(
      fn(GOOD_CASE(), { runId: "r", datasetId: "d", datasetVersion: "1.0.0", caseIndex: 0 }),
    ).rejects.toThrow(/no recorded answer/);
  });

  it("reports an answer source describing the replay", () => {
    const fn = createReplayAnswerFn(DEFAULT_REPLAY);
    expect(fn.answerSource).toMatch(/^replay-fixture:\d+-answers$/);
  });

  it("returns the recorded answer unchanged", async () => {
    const answer: RunnerAnswer = makeAnswer("recorded text", { citedSourceIds: ["doc-x"] });
    const fn = createReplayAnswerFn({ "good-case": answer });
    await expect(
      fn(GOOD_CASE(), { runId: "r", datasetId: "d", datasetVersion: "1.0.0", caseIndex: 0 }),
    ).resolves.toBe(answer);
  });
});
