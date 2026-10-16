/**
 * Fixture datasets for the evaluation harness.
 *
 * The runner consumes an `EvalDatasetSet`, not a single dataset, so callers
 * can run the frozen regression set, the fresh/adversarial set, or both. The
 * default set composes the two shipped datasets.
 */

import type { EvalDatasetSet } from "../dataset";
import type { RunnerAnswer } from "../answer";
import { REGRESSION_DATASET } from "./regression";
import { FRESH_DATASET } from "./fresh";
import { REGRESSION_REPLAY } from "./regression-replay";
import { FRESH_REPLAY } from "./fresh-replay";

export { REGRESSION_DATASET } from "./regression";
export { FRESH_DATASET } from "./fresh";
export { REGRESSION_REPLAY } from "./regression-replay";
export { FRESH_REPLAY } from "./fresh-replay";

export const DEFAULT_DATASET_SET: EvalDatasetSet = {
  setId: "blackletter-default-set",
  version: "1.0.0",
  createdAt: "2026-10-16T00:00:00.000Z",
  description: "The frozen regression cases plus the replaceable adversarial set.",
  datasets: [REGRESSION_DATASET, FRESH_DATASET],
};

/**
 * Combined replay for the default set. Case ids are unique across the set
 * (enforced by `validateDatasetSet`), so the merge cannot silently shadow.
 */
export const DEFAULT_REPLAY: Readonly<Record<string, RunnerAnswer>> = {
  ...REGRESSION_REPLAY,
  ...FRESH_REPLAY,
};
