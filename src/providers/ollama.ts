/**
 * The Ollama provider adapter.
 *
 * Design constraints that shaped this file:
 *
 * - **It is a separate adapter behind the existing provider abstraction.**
 *   `provider.ts` picks between this and OpenRouter; nothing above that layer
 *   knows which one ran, except through the run's recorded provider.
 * - **It never pulls, starts, or reconfigures anything.** There is no `/api/pull`
 *   call anywhere in this file. When a model is missing the error says what to
 *   run yourself.
 * - **Diagnostics never carry prompts.** The health check asks for the runtime
 *   version and the model list asks for tags; both are GETs with no body, and
 *   both are operator-triggered from the Workshop panel.
 * - **Malformed output is not guessed at.** A malformed NDJSON line is counted,
 *   and a stream that produced no content is reported as malformed or empty
 *   rather than passed off as a successful generation.
 */

import { OLLAMA_REQUEST_TIMEOUT_MS } from "../config/model-defaults.mjs";
import { CancelledError, isCancelledError, linkAbort } from "../lib/cancellation";
import { devLog } from "../lib/dev-log";
import type { ModelEvidence } from "./capabilities";
import { getProviderSelection, validateOllamaBaseUrl } from "./selection";
import type { AiError } from "./types";

/** One retry, and only for the two failures that are plausibly transient. */
const MAX_RETRIES = 1;
const DIAGNOSTIC_TIMEOUT = 10000;

export interface OllamaOptions {
  prompt: string;
  systemInstruction?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onRetry?: (attempt: number) => void;
  /** Overrides the configured base URL (tests, and an explicit operator choice). */
  baseUrl?: string;
  /** Overrides the configured non-loopback opt-in. */
  allowNonLoopback?: boolean;
  /** Injected in tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

export interface OllamaHealth {
  ok: boolean;
  version?: string;
  code?: string;
  message?: string;
}

export interface OllamaModelSummary {
  name: string;
  sizeBytes: number | null;
  family: string | null;
  parameterSize: string | null;
  quantization: string | null;
  modifiedAt: string | null;
}

export interface OllamaModelList {
  ok: boolean;
  models: OllamaModelSummary[];
  code?: string;
  message?: string;
}

export interface OllamaInspection {
  ok: boolean;
  evidence?: ModelEvidence;
  code?: string;
  message?: string;
}

function localError(code: string, message: string): AiError {
  if (code !== "CANCELLED") console.error(`[Ollama] ${code}: ${message}`);
  return { code, message };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveBase(options: { baseUrl?: string; allowNonLoopback?: boolean }): { url: string } | { error: AiError } {
  const selection = getProviderSelection();
  const raw = options.baseUrl ?? selection.ollamaBaseUrl;
  const allowNonLoopback = options.allowNonLoopback ?? selection.allowNonLoopbackLocalProvider;
  const check = validateOllamaBaseUrl(raw, { allowNonLoopback });
  if (!check.ok || !check.url) {
    return {
      error: localError(
        "LOCAL_PROVIDER_MISCONFIGURED",
        `Local provider base URL is unusable: ${check.reason ?? "unknown reason"}. Nothing was sent anywhere.`,
      ),
    };
  }
  return { url: check.url };
}

function classifyHttpFailure(status: number, body: string, model: string): AiError {
  const detail = body.slice(0, 300);
  if (status === 404) {
    return localError(
      "MODEL_NOT_FOUND",
      `Ollama does not have a model named "${model}". Run \`ollama list\` to see what is installed, or \`ollama pull ${model}\` yourself if that is the model you want. Nothing was downloaded automatically.`,
    );
  }
  if (status === 401 || status === 403) {
    return localError("LOCAL_ACCESS_DENIED", `The local runtime refused the request (HTTP ${status}): ${detail}`);
  }
  if (status === 400 && /context|too long|exceed|num_ctx|maximum/i.test(body)) {
    return localError(
      "CONTEXT_OVERFLOW",
      `The prompt is larger than this model's context window (HTTP 400): ${detail}. Shrink the request, or raise the model's context size in Ollama yourself.`,
    );
  }
  if (status >= 500) {
    return localError("SERVER", `The local runtime reported an error (HTTP ${status}): ${detail}`);
  }
  return localError("BAD_REQUEST", `The local runtime rejected the request (HTTP ${status}): ${detail}`);
}

export function isTransientLocalError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "OLLAMA_UNREACHABLE" || code === "SERVER";
}

/**
 * Stream a completion from the local runtime.
 *
 * Yields text chunks. Throws `AiError`-shaped objects with a specific code, or
 * `CancelledError` when the operator cancelled.
 */
export async function* streamOllama(options: OllamaOptions): AsyncGenerator<string, void, unknown> {
  const base = resolveBase(options);
  if ("error" in base) throw base.error;

  if (!options.model.trim()) {
    throw localError(
      "MODEL_NOT_CONFIGURED",
      "No local model is configured. Choose one in Workshop → AI & Models (list what is installed, then pick an id).",
    );
  }

  const doFetch = options.fetchImpl ?? fetch;
  let lastError: AiError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (options.signal?.aborted) throw new CancelledError();

    if (attempt > 0) {
      const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 2000);
      options.onRetry?.(attempt);
      devLog(`[Ollama] retry ${attempt}/${MAX_RETRIES} after ${Math.round(backoff)}ms`);
      await sleep(backoff);
      if (options.signal?.aborted) throw new CancelledError();
    }

    const link = linkAbort(options.signal, OLLAMA_REQUEST_TIMEOUT_MS);

    try {
      let response: Response;
      try {
        response = await doFetch(`${base.url}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: options.model,
            messages: [
              ...(options.systemInstruction ? [{ role: "system", content: options.systemInstruction }] : []),
              { role: "user", content: options.prompt },
            ],
            stream: true,
            options: {
              ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
              ...(options.maxTokens !== undefined ? { num_predict: options.maxTokens } : {}),
            },
          }),
          signal: link.signal,
        });
      } catch (e) {
        // The linked controller knows *why* the request aborted, and it is
        // authoritative: a timeout is not a cancellation, and vice versa.
        if (link.reason === "cancelled") throw new CancelledError();
        if (link.reason === "timeout") {
          throw localError("TIMEOUT", `Local generation timed out after ${OLLAMA_REQUEST_TIMEOUT_MS}ms.`);
        }
        if (isCancelledError(e)) throw new CancelledError();
        // Unreachable is the one transport failure worth one retry: the runtime
        // may still be starting up.
        lastError = localError(
          "OLLAMA_UNREACHABLE",
          `Could not reach the local runtime at ${base.url}. Start Ollama yourself (\`ollama serve\`), then check the connection in Workshop. Nothing was sent to any remote service.`,
        );
        continue;
      }

      if (!response.ok) {
        let body = "";
        try {
          body = await response.text();
        } catch {
          /* body may be unreadable */
        }
        const error = classifyHttpFailure(response.status, body, options.model);
        // Retrying a missing model or an oversized prompt cannot help.
        if (isTransientLocalError(error)) {
          lastError = error;
          continue;
        }
        throw error;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        lastError = localError("MALFORMED_RESPONSE", "The local runtime returned a response with no body stream.");
        continue;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let chunkCount = 0;
      let malformed = 0;
      let doneReason: string | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(trimmed) as Record<string, unknown>;
          } catch {
            malformed += 1;
            continue;
          }

          if (typeof parsed.error === "string") {
            const error = classifyHttpFailure(400, parsed.error, options.model);
            throw error.code === "BAD_REQUEST"
              ? localError("SERVER", `The local runtime reported: ${parsed.error}`)
              : error;
          }

          if (parsed.done === true && typeof parsed.done_reason === "string") {
            doneReason = parsed.done_reason;
          }

          const message = parsed.message as { content?: unknown } | undefined;
          const content = typeof message?.content === "string" ? message.content : "";
          if (content) {
            chunkCount += 1;
            yield content;
          }
        }
      }

      if (chunkCount === 0) {
        if (malformed > 0) {
          lastError = localError(
            "MALFORMED_RESPONSE",
            `The local runtime sent ${malformed} line(s) that were not valid JSON and no text. Check the model and the Ollama version.`,
          );
          continue;
        }
        lastError = localError(
          "EMPTY",
          doneReason === "length"
            ? "The model hit its output limit before producing any text. Raise Max tokens or shorten the prompt."
            : "The model returned an empty response. Try rephrasing, or a different local model.",
        );
        continue;
      }

      return;
    } catch (e) {
      // Same ordering rule as the fetch catch: the abort reason is checked
      // before the error shape, because a DOM AbortError cannot tell a
      // cancellation from a timeout.
      if (link.reason === "cancelled") throw new CancelledError();
      if (link.reason === "timeout") throw localError("TIMEOUT", `Local generation timed out after ${OLLAMA_REQUEST_TIMEOUT_MS}ms.`);
      if (e instanceof CancelledError || isCancelledError(e)) throw new CancelledError();
      if (isAiError(e)) throw e;
      lastError = localError("SERVER", `Unexpected local provider error: ${(e as Error)?.message ?? String(e)}`);
    } finally {
      link.dispose();
    }
  }

  if (lastError) throw lastError;
  throw localError("SERVER", "Local generation failed after all retries with no specific error.");
}

/* --------------------------------------------------------------- diagnostics */

async function getJson(
  url: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; code: string; message: string }> {
  const link = linkAbort(signal, DIAGNOSTIC_TIMEOUT);
  try {
    const response = await fetchImpl(url, { method: "GET", signal: link.signal });
    if (!response.ok) {
      return { ok: false, code: "HTTP", message: `The local runtime answered HTTP ${response.status}.` };
    }
    const text = await response.text();
    try {
      return { ok: true, body: JSON.parse(text) as Record<string, unknown> };
    } catch {
      return { ok: false, code: "MALFORMED_RESPONSE", message: "The local runtime did not return JSON." };
    }
  } catch (e) {
    if (link.reason === "timeout") return { ok: false, code: "TIMEOUT", message: "The local runtime did not answer in time." };
    if (isCancelledError(e)) return { ok: false, code: "CANCELLED", message: "Cancelled." };
    return {
      ok: false,
      code: "OLLAMA_UNREACHABLE",
      message: "Could not reach the local runtime. Start Ollama yourself, then try again.",
    };
  } finally {
    link.dispose();
  }
}

/**
 * Is a local runtime answering? Asks for its version. Sends no prompt, no
 * document text, and no memory: this request contains nothing about the
 * operator's work.
 */
export async function checkOllamaHealth(options: {
  baseUrl?: string;
  allowNonLoopback?: boolean;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
} = {}): Promise<OllamaHealth> {
  const base = resolveBase(options);
  if ("error" in base) return { ok: false, code: base.error.code, message: base.error.message };

  const result = await getJson(`${base.url}/api/version`, options.fetchImpl ?? fetch, options.signal);
  if (!result.ok) return { ok: false, code: result.code, message: `${result.message} (${base.url})` };
  const version = typeof result.body.version === "string" ? result.body.version : undefined;
  return { ok: true, ...(version ? { version } : {}) };
}

function summaryOf(raw: Record<string, unknown>): OllamaModelSummary | null {
  const name = typeof raw.name === "string" ? raw.name : typeof raw.model === "string" ? raw.model : "";
  if (!name) return null;
  const details = (typeof raw.details === "object" && raw.details !== null ? raw.details : {}) as Record<string, unknown>;
  return {
    name,
    sizeBytes: typeof raw.size === "number" ? raw.size : null,
    family: typeof details.family === "string" ? details.family : null,
    parameterSize: typeof details.parameter_size === "string" ? details.parameter_size : null,
    quantization: typeof details.quantization_level === "string" ? details.quantization_level : null,
    modifiedAt: typeof raw.modified_at === "string" ? raw.modified_at : null,
  };
}

/**
 * List the models the runtime already has. Operator-triggered only: this is the
 * "read the local model list if the operator explicitly permits it" step, and it
 * pulls nothing.
 */
export async function listOllamaModels(options: {
  baseUrl?: string;
  allowNonLoopback?: boolean;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
} = {}): Promise<OllamaModelList> {
  const base = resolveBase(options);
  if ("error" in base) return { ok: false, models: [], code: base.error.code, message: base.error.message };

  const result = await getJson(`${base.url}/api/tags`, options.fetchImpl ?? fetch, options.signal);
  if (!result.ok) return { ok: false, models: [], code: result.code, message: `${result.message} (${base.url})` };

  const raw = Array.isArray(result.body.models) ? result.body.models : [];
  const models = raw
    .map((entry) => summaryOf((typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>))
    .filter((entry): entry is OllamaModelSummary => entry !== null);

  return { ok: true, models };
}

/**
 * Ask the runtime about one model: its capability list and context length. This
 * is the only source of capability evidence other than the app's own behaviour.
 */
export async function inspectOllamaModel(
  model: string,
  options: { baseUrl?: string; allowNonLoopback?: boolean; fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<OllamaInspection> {
  const base = resolveBase(options);
  if ("error" in base) return { ok: false, code: base.error.code, message: base.error.message };
  if (!model.trim()) return { ok: false, code: "MODEL_NOT_CONFIGURED", message: "No local model was named." };

  const link = linkAbort(options.signal, DIAGNOSTIC_TIMEOUT);
  const doFetch = options.fetchImpl ?? fetch;
  try {
    const response = await doFetch(`${base.url}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
      signal: link.signal,
    });
    if (!response.ok) {
      if (response.status === 404) {
        return { ok: false, code: "MODEL_NOT_FOUND", message: `Ollama does not have a model named "${model}".` };
      }
      return { ok: false, code: "HTTP", message: `The local runtime answered HTTP ${response.status}.` };
    }

    const body = (await response.json()) as Record<string, unknown>;
    const runtimeCapabilities = Array.isArray(body.capabilities)
      ? body.capabilities.filter((entry): entry is string => typeof entry === "string")
      : null;
    const modelInfo = (typeof body.model_info === "object" && body.model_info !== null ? body.model_info : {}) as Record<string, unknown>;
    const details = (typeof body.details === "object" && body.details !== null ? body.details : {}) as Record<string, unknown>;

    let contextLength: number | null = null;
    for (const [key, value] of Object.entries(modelInfo)) {
      if (key.endsWith(".context_length") && typeof value === "number") {
        contextLength = contextLength === null ? value : Math.max(contextLength, value);
      }
    }

    return {
      ok: true,
      evidence: {
        model,
        runtimeCapabilities,
        contextLength,
        family: typeof details.family === "string" ? details.family : null,
        parameterSize: typeof details.parameter_size === "string" ? details.parameter_size : null,
        quantization: typeof details.quantization_level === "string" ? details.quantization_level : null,
        inspectedAt: Date.now(),
      },
    };
  } catch (e) {
    if (isCancelledError(e)) return { ok: false, code: "CANCELLED", message: "Cancelled." };
    return { ok: false, code: "OLLAMA_UNREACHABLE", message: "Could not reach the local runtime to inspect that model." };
  } finally {
    link.dispose();
  }
}

function isAiError(e: unknown): e is AiError {
  return typeof e === "object" && e !== null && "code" in e && typeof (e as { code?: unknown }).code === "string";
}
