/**
 * Public surface of the memory layer.
 *
 * Memory is a store of *claims with provenance*, not a chat log and not a
 * document store. The layers above the code enforce that:
 *
 * - conversation turns may write episodic records, but only as `inferred`;
 * - the pipeline reads records through `memoryContextText`, which labels each
 *   one with how far it is trusted;
 * - the Settings panel is the only place a record's content and status change,
 *   and every change appends a revision saying why.
 *
 * There is no model-weight update anywhere in this module, and no code path here
 * reads or writes a model.
 */

export * from "./types";
export * from "./state";
export * from "./retrieval";
