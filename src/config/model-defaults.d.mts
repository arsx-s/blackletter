/** Types for `model-defaults.mjs`, which is plain ESM so the server-side
 *  relays can import the same constants the browser uses. */
export const DEFAULT_MODEL: string;

/** Loopback base URL for a local Ollama runtime. */
export const OLLAMA_BASE_URL: string;

/** Empty on purpose: no local model identifier is assumed. */
export const OLLAMA_DEFAULT_MODEL: string;

/** Request timeout for local generation, in milliseconds. */
export const OLLAMA_REQUEST_TIMEOUT_MS: number;
