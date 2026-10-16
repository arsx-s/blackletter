/**
 * Shared builders for evaluation-harness tests.
 *
 * Kept out of the `.test.ts` files so the fixtures read as data. Nothing here
 * touches the network; every answer is a literal.
 */

import type {
  EvalCaseMetadata,
  EvalDataset,
  EvalDatasetSet,
  EvalExpectation,
  EvalTestCase,
  EvaluationCategory,
} from "../../eval/dataset";
import type { RunnerAnswer } from "../../eval/answer";

export const FIXED_NOW = new Date("2026-10-16T12:00:00.000Z");
export const fixedClock = (): Date => FIXED_NOW;

export const FIXED_CASE_META: EvalCaseMetadata = {
  createdAt: "2026-10-16T00:00:00.000Z",
  author: "test",
  revision: 1,
  rationale: "Unit-test fixture.",
};

export function makeCase(input: {
  id: string;
  category: EvaluationCategory;
  expectation: EvalExpectation;
  prompt?: string;
  sources?: EvalTestCase["input"]["sources"];
  metadata?: Partial<EvalCaseMetadata>;
}): EvalTestCase {
  return {
    id: input.id,
    category: input.category,
    input: {
      prompt: input.prompt ?? "Synthetic unit-test prompt.",
      ...(input.sources ? { sources: input.sources } : {}),
    },
    expectation: input.expectation,
    metadata: { ...FIXED_CASE_META, ...input.metadata },
  };
}

export function makeDataset(cases: EvalTestCase[], overrides: Partial<EvalDataset> = {}): EvalDataset {
  return {
    datasetId: "test-dataset",
    version: "1.0.0",
    createdAt: "2026-10-16T00:00:00.000Z",
    description: "Synthetic dataset for unit tests.",
    kind: "regression",
    provenance: "synthetic",
    cases,
    ...overrides,
  };
}

export function makeDatasetSet(datasets: EvalDataset[], overrides: Partial<EvalDatasetSet> = {}): EvalDatasetSet {
  return {
    setId: "test-set",
    version: "1.0.0",
    createdAt: "2026-10-16T00:00:00.000Z",
    description: "Synthetic dataset set for unit tests.",
    datasets,
    ...overrides,
  };
}

export function makeAnswer(text: string, extras: Partial<RunnerAnswer> = {}): RunnerAnswer {
  return { text, ...extras };
}
