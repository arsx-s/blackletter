/**
 * The single source of truth for the model identifier that crosses the
 * client/server boundary.
 *
 * Plain ESM with no dependencies, because it is imported by all three sides:
 *   - `src/config/models.ts`              the browser (via Vite)
 *   - `src/server/relay-guard.mjs`        the Vercel function
 *   - `scripts/dev-server.mjs`            the local/desktop relay
 *
 * The default used to be repeated as a literal in `api/chat.ts`,
 * `scripts/dev-server.mjs` and `src/config/models.ts`, and `.env.example`
 * documented a `DEFAULT_MODEL` variable that nothing actually read. Keeping one
 * exported constant removes the class of bug where the client asks for one
 * model while the relay silently substitutes another.
 *
 * Types are in `model-defaults.d.mts`.
 */

export const DEFAULT_MODEL = "openai/gpt-4o-mini";

/**
 * Local model provider defaults.
 *
 * `OLLAMA_BASE_URL` is loopback: the adapter refuses any host that is not
 * loopback unless the operator turns on `allowNonLoopbackLocalProvider`, because
 * pointing this at a LAN address would expose the local runtime to the network.
 *
 * There is deliberately **no default local model id**. "Ornith 9B" is not a
 * documented Ollama identifier, and guessing one would either fail confusingly
 * or, worse, silently pull a different model. The operator names the model, or
 * lists what is installed and picks from that.
 */
export const OLLAMA_BASE_URL = "http://127.0.0.1:11434";

/** No model id is assumed; an empty value means "not configured yet". */
export const OLLAMA_DEFAULT_MODEL = "";

/**
 * Local generation is slower than a hosted endpoint, so the local request
 * timeout is separate from the relay's 60s.
 */
export const OLLAMA_REQUEST_TIMEOUT_MS = 180000;
