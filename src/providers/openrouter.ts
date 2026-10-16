import type { AiRequest, AiResponse, AiError } from "./types";
import { getModel } from "../config/models";
import { getReadableError } from "../lib/error-utils";
import { isElectron } from "../lib/electron";
import { devLog } from "../lib/dev-log";
import { CancelledError, isCancelledError, linkAbort } from "../lib/cancellation";
import { relayAuthHeaders } from "../lib/relay-auth";

const REQUEST_TIMEOUT = 60000;
/** One retry, and never for a cancellation. */
const MAX_RETRIES = 1;

function makeError(code: string, message: string): AiError {
  if (code !== "CANCELLED") console.error(`[OpenRouter] ${code}: ${message}`);
  return { code, message };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseSSELine(line: string): Record<string, unknown> | null {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

export async function* streamOpenRouter(
  prompt: string,
  systemInstruction?: string,
  model?: string,
  temperature?: number,
  maxTokens?: number,
  /**
   * Optional caller-owned cancellation. When it aborts, the fetch aborts, no
   * retry is attempted, and a `CancelledError` (code `CANCELLED`) is thrown so
   * the UI can distinguish a deliberate stop from a failure.
   */
  signal?: AbortSignal,
  /** Called once per retry attempt that is actually started. */
  onRetry?: (attempt: number) => void,
): AsyncGenerator<string, void, unknown> {
  const selectedModel = model || getModel("default");
  let lastError: AiError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // A cancellation is final: never begin (or resume) a retry for one.
    if (signal?.aborted) throw new CancelledError();

    if (attempt > 0) {
      const backoff = Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 500, 4000);
      onRetry?.(attempt);
      devLog(`[OpenRouter] retry ${attempt}/${MAX_RETRIES} after ${Math.round(backoff)}ms`);
      await sleep(backoff);
      if (signal?.aborted) throw new CancelledError();
    }

    const link = linkAbort(signal, REQUEST_TIMEOUT);

    try {
      let response: Response;
      try {
        const base = isElectron() ? (window.electronAPI?.apiBase ?? "") : "";
        response = await fetch(`${base}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...relayAuthHeaders() },
          body: JSON.stringify({
            prompt,
            systemInstruction: systemInstruction || undefined,
            model: selectedModel,
            temperature: temperature !== undefined ? temperature : undefined,
            maxTokens: maxTokens !== undefined ? maxTokens : undefined,
          }),
          signal: link.signal,
        });
      } catch (e) {
        // Only a caller cancellation short-circuits here. A timeout abort is
        // deliberately re-thrown so the outer handler can classify it.
        if (link.reason === "cancelled") throw new CancelledError();
        throw e;
      }

      if (!response.ok) {
        let errorBody = "";
        try {
          errorBody = await response.text();
        } catch {
          /* body may be unreadable */
        }

        if (response.status === 429) {
          let retryAfter = 10;
          const header = response.headers.get("Retry-After");
          if (header) retryAfter = parseInt(header, 10) || 10;
          lastError = makeError("RATE_LIMITED", `Rate limited (HTTP 429). Retry after ${retryAfter}s.`);
          lastError.retryAfter = retryAfter;
          continue;
        }

        if (response.status >= 500) {
          const parsed = parseJsonSafe(errorBody);
          const relayError = parsed?.error as { code?: unknown } | undefined;
          if (response.status === 503 && relayError?.code === "RELAY_AUTH_NOT_CONFIGURED") {
            throw makeError(
              "RELAY_AUTH_NOT_CONFIGURED",
              "The hosted relay needs BLACKLETTER_RELAY_TOKEN configured on the server. Redeploy after setting it, then enter the matching token in Workshop → Model relay access.",
            );
          }
          // Never surface a raw 5xx body: it can contain upstream diagnostics.
          lastError = makeError("SERVER", `Server error (HTTP ${response.status}).`);
          continue;
        }

        const parsed = parseJsonSafe(errorBody);
        const errObj = parsed?.error as { message?: string; code?: string } | undefined;
        const errMsg = errObj?.message || errorBody.slice(0, 200);
        const errCode = errObj?.code || (response.status === 401 ? "INVALID_KEY" : "SERVER");
        throw makeError(errCode, `API returned error (HTTP ${response.status}): ${errMsg}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        lastError = makeError("NETWORK", "No response stream from server.");
        continue;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let chunkCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (!trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6).trim();
          if (!data || data === "[DONE]") continue;

          const parsed = parseSSELine(data);

          if (parsed?.error) {
            const err = parsed.error as Record<string, unknown>;
            const code = typeof err.code === "string" ? err.code : "SERVER";
            if (code === "CANCELLED") throw new CancelledError();
            throw makeError(code, (err.message as string) || "API error");
          }

          const choices = parsed?.choices as Array<Record<string, unknown>> | undefined;
          if (choices && choices.length > 0) {
            const delta = choices[0]?.delta as Record<string, unknown> | undefined;
            const content = delta?.content as string | undefined;
            if (content) {
              chunkCount++;
              yield content;
            }
          }
        }
      }

      if (chunkCount === 0) {
        lastError = makeError("EMPTY", "Model returned an empty response. Try rephrasing your question.");
        continue;
      }

      return;
    } catch (e) {
      // The controller that performed the abort knows *why* it fired, so it is
      // authoritative. A bare DOM `AbortError` cannot distinguish a user
      // cancellation from a timeout, and guessing here is what previously made
      // a cancelled run retry and then report itself as "timed out".
      if (link.reason === "cancelled") throw new CancelledError();
      if (e instanceof CancelledError) throw e;

      if (link.reason === "timeout") {
        lastError = makeError("TIMEOUT", `Request timed out after ${REQUEST_TIMEOUT}ms.`);
        continue;
      }

      if (isAiError(e)) {
        throw e;
      }

      if (isCancelledError(e)) throw new CancelledError();

      if (e instanceof TypeError) {
        lastError = makeError("NETWORK", `Network error: ${e.message}. Check your connection.`);
        continue;
      }

      lastError = makeError("SERVER", `Unexpected error: ${getReadableError(e)}`);
      continue;
    } finally {
      link.dispose();
    }
  }

  if (lastError) throw lastError;
  throw makeError("SERVER", "Request failed after all retries with no specific error.");
}

function parseJsonSafe(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isAiError(e: unknown): e is AiError {
  return typeof e === "object" && e !== null && "code" in e;
}

export type { AiRequest, AiResponse, AiError };
