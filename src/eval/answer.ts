/**
 * The system-under-test boundary.
 *
 * The evaluation runner never imports the execution graph (`src/langgraph`)
 * or a provider: every fact it knows about an answer arrives through these
 * types. That is what keeps the harness offline and deterministic. A future
 * adapter can map the live pipeline's results onto `RunnerAnswer` (see
 * docs/evaluation.md) — that adapter is deliberately not shipped here, because
 * wiring it up would make the suite depend on network access and model
 * availability.
 */

import type { EvalTestCase } from "./dataset";

/**
 * Heuristic signals produced by the pipeline's local scoring
 * (`src/pipeline/scoring.ts`). Optional on purpose: a case whose answer reports
 * no signals contributes no calibration samples instead of a fabricated one.
 */
export interface AnswerSignals {
  /** 0..100 lexical confidence from `computeConfidence`. NOT a probability. */
  confidenceScore?: number | null;
  /** 0..1 faithfulness ratio from `computeFaithfulness`. */
  faithfulnessScore?: number | null;
  /** `true` when `detectHallucination` flagged unsupported content. */
  hallucinationFlagged?: boolean | null;
}

/** One answer produced for one test case. */
export interface RunnerAnswer {
  /** The answer text the scorers inspect. */
  text: string;
  /** Source ids the answer cites (structured, not scraped from the text). */
  citedSourceIds?: string[];
  /** Source ids retrieval surfaced, as reported by the adapter. */
  retrievedSourceIds?: string[];
  /** Optional local heuristic signals, used only for FP/FN tracking. */
  signals?: AnswerSignals;
  /** Free-form notes from the adapter, e.g. tool invocations. Not scored. */
  notes?: string[];
}

export interface AnswerContext {
  runId: string;
  datasetId: string;
  datasetVersion: string;
  /** Position of the case inside its dataset. */
  caseIndex: number;
}

/**
 * Injectable answer function. Tests and the default suite use
 * `createReplayAnswerFn` (recorded fixtures); the live pipeline can be plugged
 * in later without changing the runner.
 *
 * The optional `answerSource` string is metadata only — the runner cannot
 * verify it, so it must describe the implementation honestly.
 */
export type AnswerFn = ((
  testCase: EvalTestCase,
  context: AnswerContext,
) => Promise<RunnerAnswer>) & { answerSource?: string };
