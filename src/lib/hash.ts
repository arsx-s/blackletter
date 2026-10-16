/**
 * Deterministic, dependency-free digest helpers.
 *
 * These are *change detectors*: a digest must be stable across runs, machines
 * and key ordering so a value can prove which input produced it. FNV-1a is not
 * a security primitive and must not be used to authenticate or tamper-proof
 * anything.
 *
 * This module is the single implementation. `src/eval/hash.ts` re-exports it so
 * the evaluation harness keeps its public surface without a second copy of the
 * algorithm existing in the tree.
 */

/** JSON stringification with recursively sorted object keys. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const entries = Object.entries(record)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`;
}

/** 32-bit FNV-1a hash rendered as 8 lowercase hex characters. */
export function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Stable digest of any JSON-representable value, prefixed with the algorithm. */
export function digestValue(value: unknown): string {
  return `fnv1a32:${fnv1a32(stableStringify(value))}`;
}
