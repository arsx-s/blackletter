/**
 * Deterministic evaluation runner.
 *
 * The runner orchestrates: it validates the dataset set, calls the injected
 * answer function once per case, scores each case against its expectation
 * block, and assembles a structured run record. It imports no provider and no
 * network code — all external facts enter through `AnswerFn`. The only
 * pipeline import on the harness path is the pure, side-effect-free
 * `confidenceLabel` threshold reused by calibration.ts.
 *
 * The default answer function used by tests and the docs is
 * `createReplayAnswerFn`, which replays recorded fixture answers. It proves
 * the harness works; it says nothing about a hosted model.
 */

import type { EvalDatasetSet } from "./dataset";
import type { AnswerFn, AnswerSignals, RunnerAnswer } from "./answer";
import { scoreCase } from "./scorers";
import { validateDatasetSet } from "./validate";
import { digestValue } from "./hash";
import {
  RUN_RECORD_SCHEMA_VERSION,
  collectFailures,
  configurationFingerprint,
  scoreRun,
  type CaseResult,
  type EvalRunDatasetRef,
  type EvalRunRecord,
  type RunEnvironment,
} from "./run-record";
import { CAVEAT, trackHeuristics, type CalibrationSample } from "./calibration";

export interface RunEvaluationOptions {
  /** Provider identifier recorded on the run. Defaults to `fixture` — never a real vendor for replay runs. */
  provider?: string;
  /** Model identifier recorded on the run. Defaults to `deterministic-replay`. */
  model?: string;
  /** Overrides the answer function's own `answerSource` metadata. */
  answerSource?: string;
  /** Clock injection so a rerun can produce a byte-identical record. */
  now?: () => Date;
  /** Fixed run id for reproducible records; defaults to a time + counter id. */
  runId?: string;
  /** Called after each case completes, for progress reporting. */
  onCaseComplete?: (result: CaseResult) => void;
}

let runCounter = 0;

function readEnvironment(): RunEnvironment {
  const scope = globalThis as { process?: { version?: string; platform?: string } };
  const node = typeof scope.process?.version === "string" ? scope.process.version : null;
  const platform = typeof scope.process?.platform === "string" ? scope.process.platform : null;
  return { node, platform };
}

/** Drop `undefined` fields so a serialized record round-trips byte-for-byte. */
function sanitizeSignals(signals: AnswerSignals): AnswerSignals {
  const sanitized: AnswerSignals = {};
  if (signals.confidenceScore !== undefined) sanitized.confidenceScore = signals.confidenceScore;
  if (signals.faithfulnessScore !== undefined) sanitized.faithfulnessScore = signals.faithfulnessScore;
  if (signals.hallucinationFlagged !== undefined) sanitized.hallucinationFlagged = signals.hallucinationFlagged;
  return sanitized;
}

/**
 * Replay recorded answers keyed by case id. Unknown case ids throw so a
 * fixture drift surfaces as an `error` case instead of a silent skip.
 */
export function createReplayAnswerFn(answers: Readonly<Record<string, RunnerAnswer>>): AnswerFn {
  const fn: AnswerFn = async (testCase) => {
    const recorded = answers[testCase.id];
    if (!recorded) {
      throw new Error(`replay fixture has no recorded answer for case "${testCase.id}"`);
    }
    return recorded;
  };
  fn.answerSource = `replay-fixture:${Object.keys(answers).length}-answers`;
  return fn;
}

/**
 * Run an evaluation over a dataset set.
 *
 * Throws when the dataset set fails structural validation — a malformed
 * fixture must not produce a plausible-looking record. Per-case failures and
 * thrown answer functions are captured as case results, never rethrown, so one
 * bad case does not hide the rest of the run.
 */
export async function runEvaluation(
  datasetSet: EvalDatasetSet,
  answerFn: AnswerFn,
  options: RunEvaluationOptions = {},
): Promise<EvalRunRecord> {
  const validation = validateDatasetSet(datasetSet);
  if (!validation.ok) {
    const detail = validation.errors.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    throw new Error(`invalid evaluation dataset set: ${detail}`);
  }

  const clock = options.now ?? (() => new Date());
  const startedAt = clock();
  const runId = options.runId ?? `eval-${startedAt.getTime().toString(36)}-${(runCounter++).toString(36)}`;
  const provider = options.provider ?? "fixture";
  const model = options.model ?? "deterministic-replay";
  const answerSource = options.answerSource ?? answerFn.answerSource ?? "injected-answer-fn";

  const results: CaseResult[] = [];
  const samples: CalibrationSample[] = [];

  for (const dataset of datasetSet.datasets) {
    for (let caseIndex = 0; caseIndex < dataset.cases.length; caseIndex++) {
      const testCase = dataset.cases[caseIndex];
      const caseStarted = clock();
      let result: CaseResult;
      let signals: AnswerSignals | null = null;

      try {
        const answer = await answerFn(testCase, {
          runId,
          datasetId: dataset.datasetId,
          datasetVersion: dataset.version,
          caseIndex,
        });
        // Guard the boundary: a malformed answer is an evaluation error, not a
        // crash and not a silent pass.
        if (typeof answer?.text !== "string") {
          throw new Error(`answer function returned no text for case "${testCase.id}"`);
        }
        const evaluation = scoreCase(testCase, answer);
        signals = answer.signals ? sanitizeSignals(answer.signals) : null;
        if (signals && Object.keys(signals).length === 0) signals = null;

        const caseEnded = clock();
        result = {
          caseId: testCase.id,
          category: testCase.category,
          datasetId: dataset.datasetId,
          datasetVersion: dataset.version,
          status: evaluation.status,
          score: evaluation.score,
          checks: evaluation.checks,
          durationMs: Math.max(0, caseEnded.getTime() - caseStarted.getTime()),
        };
        if (evaluation.skipReason !== undefined) result.skipReason = evaluation.skipReason;
        if (signals !== null) result.signals = signals;
      } catch (error) {
        const caseEnded = clock();
        result = {
          caseId: testCase.id,
          category: testCase.category,
          datasetId: dataset.datasetId,
          datasetVersion: dataset.version,
          status: "error",
          score: null,
          checks: [],
          durationMs: Math.max(0, caseEnded.getTime() - caseStarted.getTime()),
          error: error instanceof Error ? error.message : String(error),
        };
      }

      results.push(result);
      samples.push({
        caseId: testCase.id,
        signals,
        groundTruth: testCase.expectation.heuristics ?? null,
      });
      options.onCaseComplete?.(result);
    }
  }

  const finishedAt = clock();

  const datasetRefs: EvalRunDatasetRef[] = datasetSet.datasets.map((dataset) => ({
    datasetId: dataset.datasetId,
    version: dataset.version,
    kind: dataset.kind,
    caseCount: dataset.cases.length,
    digest: digestValue(dataset),
  }));

  return {
    schemaVersion: RUN_RECORD_SCHEMA_VERSION,
    runId,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    datasetSet: { setId: datasetSet.setId, version: datasetSet.version },
    datasets: datasetRefs,
    provider,
    model,
    configurationFingerprint: configurationFingerprint({
      provider,
      model,
      answerSource,
      caseCount: results.length,
      datasets: datasetRefs.map((ref) => ({ datasetId: ref.datasetId, version: ref.version, digest: ref.digest })),
    }),
    environment: readEnvironment(),
    cases: results,
    aggregate: scoreRun(results),
    failures: collectFailures(results),
    heuristicDiagnostics: trackHeuristics(samples),
    reproducibility: {
      answerSource,
      clockInjected: options.now !== undefined,
      runIdInjected: options.runId !== undefined,
      notes: [
        `Answer source: ${answerSource}.`,
        "The runner and its scorers perform no network I/O and import no provider code; this does not certify an injected answer function.",
        ...validation.warnings.map((issue) => `dataset warning: ${issue.path}: ${issue.message}`),
      ],
    },
    confidenceCaveat: CAVEAT,
  };
}
