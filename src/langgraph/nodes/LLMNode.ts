import type { GraphState, RunContext } from "../types";
import { log, logError } from "../logger";
import { generateStream } from "../../providers/provider";
import { getReadableError } from "../../lib/error-utils";
import { isCancelledError } from "../../lib/cancellation";

const REQUEST_TIMEOUT = 60000;

function extractApiError(parsed: Record<string, unknown>): string | null {
  if (parsed.error) {
    const err = parsed.error as Record<string, unknown>;
    return err.message as string || JSON.stringify(parsed.error);
  }
  const choices = parsed.choices as Array<Record<string, unknown>> | undefined;
  if (choices && choices.length > 0) {
    const finishReason = choices[0]?.finish_reason as string | undefined;
    if (finishReason === "length") {
      return "Response was truncated due to token limit. Try a more focused query.";
    }
    if (finishReason === "content_filter") {
      return "Response was blocked by content filter. Try rephrasing.";
    }
  }
  return null;
}

export async function LLMNode(state: GraphState, ctx: RunContext = {}): Promise<Partial<GraphState>> {
  log("NODE", "LLMNode: generating AI response");

  const prompt = state.generatedPrompt;
  const systemInstruction = state.systemInstruction;

  if (!prompt) {
    return { error: "Cannot call AI: no generated prompt available.", errorCode: "SERVER" };
  }

  let fullResponse = "";
  let chunkCount = 0;
  let lastError: string | null = null;
  /**
   * Filled in by the provider layer before the first byte arrives, so the run is
   * labelled with the provider that actually ran — including when an opted-in
   * fallback moved it off the local runtime.
   *
   * Held in an object because the assignment happens in a callback: a plain
   * `let` would be narrowed to `null` by the control-flow analyser and the
   * recorded provider would be lost.
   */
  const used: { info: { provider: string; local: boolean; fallback: boolean } | null } = { info: null };

  try {
    for await (const chunk of generateStream({
      prompt,
      systemInstruction: systemInstruction || undefined,
      model: state.model || undefined,
      temperature: state.temperature ?? 0.7,
      maxTokens: state.maxTokens ?? 4096,
      signal: ctx.signal,
      onProvider: (info) => {
        used.info = { provider: info.provider, local: info.provider === "ollama", fallback: info.fallback };
      },
    })) {
      chunkCount++;
      fullResponse += chunk;
    }
  } catch (e) {
    // Preserve the cancellation code so it is never reported as a failure.
    if (isCancelledError(e)) {
      log("NODE", "LLMNode: cancelled by the operator");
      return { error: "Cancelled by the operator.", errorCode: "CANCELLED" };
    }
    const msg = getReadableError(e);
    const code = (e as { code?: string })?.code || "SERVER";
    logError("NODE", `LLMNode: generation failed — ${msg}`);
    return { error: msg || "AI generation failed.", errorCode: code };
  }

  if (chunkCount === 0) {
    lastError = "AI returned an empty response (0 content chunks received).";
    logError("NODE", `LLMNode: ${lastError}`);
    return { error: lastError, errorCode: "EMPTY" };
  }

  const echoed = fullResponse.trim() === prompt.trim();
  if (echoed) {
    logError("NODE", "LLMNode: AI returned the input prompt verbatim");
    return { error: "AI returned your own prompt instead of a response. Please try again.", errorCode: "EMPTY" };
  }

  log("NODE", `LLMNode: received ${fullResponse.length} chars in ${chunkCount} chunks`);
  const info = used.info;
  return {
    aiResponse: fullResponse,
    ...(info
      ? {
          provider: info.provider,
          providerLocal: info.local,
          providerFallback: info.fallback,
          telemetry: { ...state.telemetry, provider: info.provider, local: info.local, providerFallback: info.fallback },
        }
      : {}),
  };
}
