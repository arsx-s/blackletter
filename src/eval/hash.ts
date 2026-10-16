/**
 * Deterministic, dependency-free digest helpers for evaluation metadata.
 *
 * The implementation lives in `src/lib/hash.ts`, because the retrieval layer
 * needs the same digests for content-addressed evidence ids. This module is the
 * evaluation harness's entry point to it and re-exports the whole surface, so
 * nothing outside `src/eval` needs to know where the algorithm moved.
 */

export { stableStringify, fnv1a32, digestValue } from "../lib/hash";
