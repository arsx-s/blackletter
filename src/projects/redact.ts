/**
 * Credential redaction — re-exported from its home in `src/lib/redact.ts`.
 *
 * It moved to `lib` in Mission 14, when the control plane's stop reason became a
 * second caller; this file stays so that `src/projects`'s public surface (and the
 * imports in its tests) do not change.
 */
export * from "../lib/redact";
