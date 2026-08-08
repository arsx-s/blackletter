import type { GraphState } from "../types";
import { log, logError } from "../logger";
import { generateStream } from "../../providers/provider";
import { getReadableError } from "../../lib/error-utils";

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

export async function LLMNode(state: GraphState): Promise<Partial<GraphState>> {
  log("NODE", "LLMNode: generating AI response");

  const prompt = state.generatedPrompt;
  const systemInstruction = state.systemInstruction;

  if (!prompt) {
    return { error: "Cannot call AI: no generated prompt available.", errorCode: "SERVER" };
  }

  let fullResponse = "";
  let chunkCount = 0;
  let lastError: string | null = null;

  try {
    for await (const chunk of generateStream({
      prompt,
      systemInstruction: systemInstruction || undefined,
      model: state.model || undefined,
      temperature: state.temperature ?? 0.7,
      maxTokens: state.maxTokens ?? 4096,
    })) {
      chunkCount++;
      fullResponse += chunk;
    }
  } catch (e) {
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
  return { aiResponse: fullResponse };
}
