import { describe, expect, it } from "vitest";
import { CATEGORY_EXPECTATION_BLOCK, EVALUATION_CATEGORIES } from "../../eval/dataset";
import { validateDatasetSet } from "../../eval/validate";
import { DEFAULT_DATASET_SET, FRESH_DATASET, REGRESSION_DATASET } from "../../eval/datasets";
import { makeCase, makeDataset, makeDatasetSet } from "./helpers";

describe("default dataset set", () => {
  it("passes structural validation without errors", () => {
    const result = validateDatasetSet(DEFAULT_DATASET_SET);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("covers every evaluation category at least once", () => {
    const covered = new Set(DEFAULT_DATASET_SET.datasets.flatMap((dataset) => dataset.cases.map((c) => c.category)));
    for (const category of EVALUATION_CATEGORIES) {
      expect(covered.has(category), `category ${category} is not covered`).toBe(true);
    }
  });

  it("keeps the regression and fresh datasets separable", () => {
    expect(REGRESSION_DATASET.kind).toBe("regression");
    expect(FRESH_DATASET.kind).toBe("fresh");
    expect(REGRESSION_DATASET.datasetId).not.toBe(FRESH_DATASET.datasetId);

    const regressionIds = new Set(REGRESSION_DATASET.cases.map((c) => c.id));
    expect(FRESH_DATASET.cases.some((c) => regressionIds.has(c.id))).toBe(false);

    expect(DEFAULT_DATASET_SET.datasets.map((d) => d.datasetId)).toEqual([
      REGRESSION_DATASET.datasetId,
      FRESH_DATASET.datasetId,
    ]);
  });

  it("declares every fixture and source synthetic", () => {
    for (const dataset of DEFAULT_DATASET_SET.datasets) {
      expect(dataset.provenance).toBe("synthetic");
      for (const testCase of dataset.cases) {
        for (const source of testCase.input.sources ?? []) {
          expect(source.provenance).toBe("synthetic");
        }
      }
    }
  });

  it("gives every case the expectation block its category scores from", () => {
    for (const dataset of DEFAULT_DATASET_SET.datasets) {
      for (const testCase of dataset.cases) {
        expect(
          testCase.expectation[CATEGORY_EXPECTATION_BLOCK[testCase.category]],
          `${testCase.id} is missing its expectation block`,
        ).toBeDefined();
      }
    }
  });

  it("documents the known gap on the intentionally failing fresh case", () => {
    const leak = FRESH_DATASET.cases.find((c) => c.id === "fresh-injection-canary-leak");
    expect(leak).toBeDefined();
    expect(leak?.metadata.knownGap).toBeTruthy();
  });
});

describe("validateDatasetSet", () => {
  it("reports duplicate case ids across datasets as errors", () => {
    const shared = makeCase({
      id: "shared-case",
      category: "answer_correctness",
      expectation: { answer: { requiredPhrases: ["alpha"] } },
    });
    const set = makeDatasetSet([
      makeDataset([shared], { datasetId: "dataset-a" }),
      makeDataset([shared], { datasetId: "dataset-b" }),
    ]);
    const result = validateDatasetSet(set);
    expect(result.ok).toBe(false);
    expect(result.errors.some((issue) => issue.message.includes("collides"))).toBe(true);
  });

  it("warns when a case is missing the expectation block for its category", () => {
    const set = makeDatasetSet([
      makeDataset([makeCase({ id: "no-block", category: "answer_correctness", expectation: {} })]),
    ]);
    const result = validateDatasetSet(set);
    expect(result.ok).toBe(true);
    expect(result.warnings.some((issue) => issue.message.includes("not_evaluated"))).toBe(true);
  });

  it("rejects a dataset whose provenance is not synthetic", () => {
    const set = JSON.parse(
      JSON.stringify(
        makeDatasetSet([
          makeDataset([makeCase({ id: "a-case", category: "answer_correctness", expectation: {} })]),
        ]),
      ),
    );
    set.datasets[0].provenance = "prod-export";
    const result = validateDatasetSet(set);
    expect(result.ok).toBe(false);
    expect(result.errors.some((issue) => issue.message.includes("synthetic"))).toBe(true);
  });

  it("rejects malformed cases instead of skipping them", () => {
    const set = JSON.parse(
      JSON.stringify(
        makeDatasetSet([
          makeDataset([makeCase({ id: "good-case", category: "answer_correctness", expectation: {} })]),
        ]),
      ),
    );
    set.datasets[0].cases[0].category = "vibes";
    set.datasets[0].cases[0].input.prompt = "";
    set.datasets[0].cases[0].metadata.revision = 0;
    const result = validateDatasetSet(set);
    expect(result.ok).toBe(false);
    const messages = result.errors.map((issue) => `${issue.path}: ${issue.message}`).join(" | ");
    expect(messages).toContain("must be one of");
    expect(messages).toContain(".input.prompt");
    expect(messages).toContain(".metadata.revision");
  });

  it("rejects a dataset set that contains no datasets", () => {
    const result = validateDatasetSet(makeDatasetSet([]));
    expect(result.ok).toBe(false);
  });

  it("exposes a category-to-block mapping for every category", () => {
    expect(Object.keys(CATEGORY_EXPECTATION_BLOCK).sort()).toEqual([...EVALUATION_CATEGORIES].sort());
  });
});
