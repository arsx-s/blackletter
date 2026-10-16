import type { AiRequest, AiResponse, AiError } from "./types";
import { streamOpenRouter } from "./openrouter";
import { isTransientLocalError, streamOllama } from "./ollama";
import { getModel } from "../config/models";
import { isCancelledError } from "../lib/cancellation";
import { getProviderSelection, providerLabel, resolveProvider, type ProviderId } from "./selection";

export type { AiRequest, AiResponse, AiError };

/** Who the next generation will use, and the reason a local choice is unusable. */
export function activeProvider(): { provider: ProviderId; label: string; model: string; problem?: string } {
  const selection = getProviderSelection();
  const resolved = resolveProvider();
  const model = resolved.provider === "ollama" ? selection.ollamaModel : getModel("default");
  return { provider: resolved.provider, label: providerLabel(resolved.provider), model, problem: resolved.problem };
}

/**
 * Stream a completion.
 *
 * Provider choice lives here and nowhere else, so no caller can accidentally
 * reach a hosted endpoint after the operator chose local inference. The only
 * path from local to remote is `remoteFallback: "allow"`, which the operator sets
 * deliberately in Workshop, and which reports itself through `onProvider` so the
 * run is labelled as remote.
 */
export async function* generateStream(req: AiRequest): AsyncGenerator<string, void, unknown> {
  const selection = getProviderSelection();
  const resolved = resolveProvider(req.provider);

  if (resolved.provider === "ollama") {
    if (resolved.problem) {
      throw {
        code: "LOCAL_PROVIDER_MISCONFIGURED",
        message: `Local inference is selected but not usable: ${resolved.problem}. Nothing was sent to a remote service.`,
      } satisfies AiError;
    }

    const localModel = (req.ollamaModel ?? selection.ollamaModel).trim();
    try {
      yield* streamOllama({
        prompt: req.prompt,
        systemInstruction: req.systemInstruction,
        model: localModel,
        temperature: req.temperature,
        maxTokens: req.maxTokens,
        signal: req.signal,
        onRetry: req.onRetry,
        baseUrl: selection.ollamaBaseUrl,
        allowNonLoopback: selection.allowNonLoopbackLocalProvider,
      });
      req.onProvider?.({ provider: "ollama", model: localModel, fallback: false });
      return;
    } catch (e) {
      if (isCancelledError(e)) throw e;

      if (selection.remoteFallback !== "allow" || !isTransientLocalError(e)) throw e;

      // Opted-in fallback. It is reported as a fallback, and it never happens
      // for a missing model, an oversized prompt, or a cancellation.
      const remoteModel = req.model || getModel("default");
      req.onProvider?.({ provider: "openrouter", model: remoteModel, fallback: true });
      yield* streamOpenRouter(
        req.prompt,
        req.systemInstruction,
        remoteModel,
        req.temperature,
        req.maxTokens,
        req.signal,
        req.onRetry,
      );
      return;
    }
  }

  const remoteModel = req.model || getModel("default");
  req.onProvider?.({ provider: "openrouter", model: remoteModel, fallback: false });
  yield* streamOpenRouter(
    req.prompt,
    req.systemInstruction,
    remoteModel,
    req.temperature,
    req.maxTokens,
    req.signal,
    req.onRetry,
  );
}

export async function generateResponse(req: AiRequest): Promise<AiResponse> {
  const start = performance.now();
  let text = "";
  let retryCount = 0;
  let provider: ProviderId | undefined;
  let fallback = false;

  try {
    for await (const chunk of generateStream({
      ...req,
      onRetry: () => { retryCount++; },
      onProvider: (info) => {
        provider = info.provider;
        fallback = info.fallback;
      },
    })) {
      text += chunk;
    }
  } catch (e) {
    // Cancellation keeps its own code so callers can tell a deliberate stop
    // apart from a failure of the request itself.
    if (isCancelledError(e)) throw e;
    const err = e as { code?: string; message?: string };
    throw { code: err.code || "SERVER", message: err.message || "AI generation failed" };
  }

  const latency = Math.round(performance.now() - start);

  if (text.length === 0) {
    throw { code: "EMPTY", message: "Model returned an empty response after streaming completed." };
  }

  return { text, latency, retryCount, ...(provider ? { provider, local: provider === "ollama" } : {}), fallback };
}
