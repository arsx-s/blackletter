/**
 * Epistemic integrity (Mission 10).
 *
 * The boundary between "text a model produced" and "records this application
 * stores". Everything model-derived crosses it here:
 *
 *   - `derive.ts`   — one entry point from an answer to validated, deduplicated,
 *                     bounded records with provenance and support labels;
 *   - `schema.ts`   — the bounds, stable ids and checks that boundary applies;
 *   - `changes.ts`  — the reviewable change set for what a run added to memory
 *                     and the knowledge graph;
 *   - `types.ts`    — the vocabulary, kept deliberately small and aligned with
 *                     the memory layer's epistemic statuses.
 *
 * `src/lib/research.ts` still exports the raw extractors — they are pure string
 * functions and are tested as such — but no component calls them directly any
 * more. The guard "one derivation path" enforces that.
 */

export * from "./types";
export * from "./schema";
export * from "./derive";
export * from "./changes";
