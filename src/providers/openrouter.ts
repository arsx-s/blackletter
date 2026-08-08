import type { AiRequest, AiResponse, AiError } from "./types";
import { getModel } from "../config/models";
import { getReadableError } from "../lib/error-utils";
import { isElectron } from "../lib/electron";
import { devLog } from "../lib/dev-log";

const REQUEST_TIMEOUT = 60000;
const MAX_RETRIES = 1;

function makeError(code: string, message: string): AiError {
  console.error(`[OpenRouter] ${code}: ${message}`);
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
): AsyncGenerator<string, void, unknown> {
  const selectedModel = model || getModel("default");
  let lastError: AiError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 500, 4000);
      devLog(`[OpenRouter] retry ${attempt}/${MAX_RETRIES} after ${Math.round(backoff)}ms`);
      await sleep(backoff);
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      let response: Response;
      try {
        const base = isElectron() ? (window.electronAPI?.apiBase ?? "") : "";
        response = await fetch(`${base}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            systemInstruction: systemInstruction || undefined,
            model: selectedModel,
            temperature: temperature !== undefined ? temperature : undefined,
            maxTokens: maxTokens !== undefined ? maxTokens : undefined,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        let errorBody = "";
        try { errorBody = await response.text(); } catch { }

        if (response.status === 429) {
          let retryAfter = 10;
          const header = response.headers.get("Retry-After");
          if (header) retryAfter = parseInt(header, 10) || 10;
          lastError = makeError("RATE_LIMITED", `Rate limited (HTTP 429). Retry after ${retryAfter}s.`);
          lastError.retryAfter = retryAfter;
          continue;
        }

        if (response.status >= 500) {
          lastError = makeError("SERVER", `Server error (HTTP ${response.status}): ${errorBody.slice(0, 200)}`);
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
      if (isAiError(e)) {
        throw e;
      }

      if (e instanceof DOMException && e.name === "AbortError") {
        lastError = makeError("TIMEOUT", `Request timed out after ${REQUEST_TIMEOUT}ms.`);
        continue;
      }

      if (e instanceof TypeError) {
        lastError = makeError("NETWORK", `Network error: ${e.message}. Check your connection.`);
        continue;
      }

      lastError = makeError("SERVER", `Unexpected error: ${getReadableError(e)}`);
      continue;
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
