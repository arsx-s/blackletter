import type { AiRequest, AiResponse, AiError } from "./types";
import { streamOpenRouter } from "./openrouter";
import { getModel } from "../config/models";

export type { AiRequest, AiResponse, AiError };

export async function* generateStream(req: AiRequest): AsyncGenerator<string, void, unknown> {
  const model = req.model || getModel("default");
  yield* streamOpenRouter(req.prompt, req.systemInstruction, model, req.temperature, req.maxTokens);
}

export async function generateResponse(req: AiRequest): Promise<AiResponse> {
  const start = performance.now();
  let text = "";
  let retries = 0;

  try {
    for await (const chunk of generateStream(req)) {
      text += chunk;
    }
  } catch (e) {
    const err = e as { code?: string; message?: string };
    throw { code: err.code || "SERVER", message: err.message || "AI generation failed" };
  }

  const latency = Math.round(performance.now() - start);

  if (text.length === 0) {
    throw { code: "EMPTY", message: "Model returned an empty response after streaming completed." };
  }

  return { text, latency, retryCount: retries };
}
