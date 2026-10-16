/**
 * Structured run records: the persisted, JSON-safe output of an evaluation
 * run, plus the aggregation logic that turns per-case results into scores.
 *
 * Two rules from the programme apply here:
 *
 * - `not_evaluated` is a first-class status. A case with no ground truth is
 *   never scored as 0, and `passRate` is `null` (not 0) when nothing could be
 *   evaluated, so "unknown" can never be read as "failed".
 * - Failures are collected explicitly so a test suite cannot silently pass a
 *   case whose checks failed.
 */

import { EVALUATION_CATEGORIES, type EvaluationCategory } from "./dataset";
import type { AnswerSignals } from "./answer";
import type { HeuristicDiagnostics } from "./calibration";
import { digestValue } from "./hash";

export const RUN_RECORD_SCHEMA_VERSION = 1 as const;

export type CaseStatus = "pass" | "fail" | "not_evaluated" | "error";
export type CategoryStatus = "evaluated" | "not_evaluated";

export interface CheckResult {
  name: string;
  passed: boolean;
  expected: string;
  observed: string;
}

export interface CaseResult {
  caseId: string;
  category: EvaluationCategory;
  datasetId: string;
  datasetVersion: string;
  status: CaseStatus;
  /** Fraction of checks passed (0..1), or `null` when the case was not evaluated. */
  score: number | null;
  checks: CheckResult[];
  /** Why the case could not be evaluated. Present only when `status` is `not_evaluated`. */
  skipReason?: string;
  /** Error message when the answer function threw. Present only when `status` is `error`. */
  error?: string;
  durationMs: number;
  /** Heuristic signals reported by the answer function, if any. Not scored. */
  signals?: AnswerSignals;
}

export interface ScoreAggregate {
  evaluatedCases: number;
  passedCases: number;
  failedCases: number;
  /** Cases where the answer function threw — distinct from assertion failures. */
  errorCases: number;
  notEvaluatedCases: number;
  /** `passedCases / evaluatedCases`, or `null` when `evaluatedCases` is 0. */
  passRate: number | null;
  /** Mean fraction of checks passed across evaluated cases, or `null` when none. */
  meanCheckScore: number | null;
}

export interface CategoryScore extends ScoreAggregate {
  category: EvaluationCategory;
  status: CategoryStatus;
  /** One entry per unevaluated case, preserving the precise reason. */
  skipReasons: Array<{ caseId: string; reason: string }>;
}

export interface AggregateScore extends ScoreAggregate {
  /** Always contains every known category so an absent category is visible as `not_evaluated`. */
  byCategory: CategoryScore[];
}

export interface CaseFailure {
  caseId: string;
  category: EvaluationCategory;
  kind: "assertion" | "error";
  summary: string;
  failedChecks: CheckResult[];
}

export interface RunEnvironment {
  /** `process.version` when available (Node/Electron); `null` in a plain browser. */
  node: string | null;
  platform: string | null;
}

export interface EvalRunDatasetRef {
  datasetId: string;
  version: string;
  kind: "regression" | "fresh";
  caseCount: number;
  /** Digest over the dataset contents, so an edited fixture changes the record. */
  digest: string;
}

export interface ReproducibilityMetadata {
  /** Honest description of what produced the answers (e.g. `replay-fixture:17-answers`). */
  answerSource: string;
  clockInjected: boolean;
  runIdInjected: boolean;
  /**
   * Facts about the run. These describe the runner, not the answer function —
   * an injected answer function could still perform I/O, and nothing here
   * certifies a hosted model.
   */
  notes: string[];
}

export interface EvalRunRecord {
  schemaVersion: typeof RUN_RECORD_SCHEMA_VERSION;
  runId: string;
  startedAt: string;
  finishedAt: string;
  datasetSet: { setId: string; version: string };
  datasets: EvalRunDatasetRef[];
  /** Provider identifier. For fixture runs this is `fixture`, never a real vendor. */
  provider: string;
  model: string;
  /** Digest over provider/model/dataset digests/answer source — a change detector, not a security hash. */
  configurationFingerprint: string;
  environment: RunEnvironment;
  cases: CaseResult[];
  aggregate: AggregateScore;
  failures: CaseFailure[];
  heuristicDiagnostics: HeuristicDiagnostics;
  reproducibility: ReproducibilityMetadata;
  /** The calibration caveat, embedded so an exported record cannot be misread. */
  confidenceCaveat: string;
}

export interface FingerprintInput {
  provider: string;
  model: string;
  answerSource: string;
  caseCount: number;
  datasets: Array<{ datasetId: string; version: string; digest: string }>;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function groupAggregate(results: CaseResult[]): ScoreAggregate {
  let passedCases = 0;
  let failedCases = 0;
  let errorCases = 0;
  let notEvaluatedCases = 0;
  let scoreSum = 0;
  let scoreCount = 0;

  for (const result of results) {
    if (result.status === "pass") passedCases++;
    else if (result.status === "fail") failedCases++;
    else if (result.status === "error") errorCases++;
    else notEvaluatedCases++;

    if (result.score !== null) {
      scoreSum += result.score;
      scoreCount++;
    }
  }

  const evaluatedCases = passedCases + failedCases;
  return {
    evaluatedCases,
    passedCases,
    failedCases,
    errorCases,
    notEvaluatedCases,
    passRate: evaluatedCases === 0 ? null : round3(passedCases / evaluatedCases),
    meanCheckScore: scoreCount === 0 ? null : round3(scoreSum / scoreCount),
  };
}

/** Aggregate per-case results into overall and per-category scores. */
export function scoreRun(results: CaseResult[]): AggregateScore {
  const byCategory = EVALUATION_CATEGORIES.map((category): CategoryScore => {
    const subset = results.filter((result) => result.category === category);
    const aggregate = groupAggregate(subset);
    const status: CategoryStatus = aggregate.evaluatedCases > 0 ? "evaluated" : "not_evaluated";
    return {
      category,
      status,
      ...aggregate,
      skipReasons: subset
        .filter((result) => result.status === "not_evaluated")
        .map((result) => ({ caseId: result.caseId, reason: result.skipReason ?? "no reason recorded" })),
    };
  });

  return { ...groupAggregate(results), byCategory };
}

/**
 * Collect assertion failures and errors. `not_evaluated` cases are not
 * failures: they are missing evidence, and conflating the two would overstate
 * coverage.
 */
export function collectFailures(results: CaseResult[]): CaseFailure[] {
  const failures: CaseFailure[] = [];
  for (const result of results) {
    if (result.status === "fail") {
      const failedChecks = result.checks.filter((check) => !check.passed);
      failures.push({
        caseId: result.caseId,
        category: result.category,
        kind: "assertion",
        summary: `${failedChecks.length} of ${result.checks.length} checks failed: ${failedChecks
          .map((check) => check.name)
          .join(", ")}`,
        failedChecks,
      });
    } else if (result.status === "error") {
      failures.push({
        caseId: result.caseId,
        category: result.category,
        kind: "error",
        summary: `answer function threw: ${truncate(result.error ?? "unknown error", 200)}`,
        failedChecks: [],
      });
    }
  }
  return failures;
}

/** Digest over the configuration that identifies a run's setup, independent of timestamps. */
export function configurationFingerprint(input: FingerprintInput): string {
  return digestValue(input);
}

export function serializeRunRecord(record: EvalRunRecord): string {
  return JSON.stringify(record, null, 2);
}

/**
 * Parse a serialized run record.
 *
 * This is a schema-version gate plus a shallow structural check, not a full
 * validator: only records produced by `runEvaluation` are expected to be fed
 * back in. It throws rather than returning a partial object so a malformed
 * record cannot be mistaken for a run.
 */
export function parseRunRecord(json: string): EvalRunRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`run record is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("run record must be a JSON object");
  }
  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== RUN_RECORD_SCHEMA_VERSION) {
    throw new Error(`unsupported run record schemaVersion: ${String(record.schemaVersion)}`);
  }
  if (!Array.isArray(record.cases)) {
    throw new Error("run record is missing a cases array");
  }
  if (typeof record.aggregate !== "object" || record.aggregate === null) {
    throw new Error("run record is missing an aggregate object");
  }
  return parsed as EvalRunRecord;
}
