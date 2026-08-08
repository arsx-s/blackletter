import type { PipelineContext } from "./types";
import { generateStream } from "../providers/provider";

export interface ExecutionResult {
  response: string;
  latency: number;
  retryCount: number;
}

export async function executeLLM(ctx: PipelineContext): Promise<ExecutionResult> {
  const start = performance.now();

  const documentText = ctx.documentText || undefined;

  let response = "";
  const retries = 0;

  try {
    for await (const chunk of generateStream({
      prompt: ctx.prompt,
      systemInstruction: ctx.systemInstruction || undefined,
      fileContent: documentText,
    })) {
      response += chunk;
    }
  } catch (e) {
    const err = e as { code?: string; message?: string };
    throw { code: err.code || "SERVER", message: err.message || "AI execution failed" };
  }

  const latency = Math.round(performance.now() - start);

  if (response.length === 0) {
    throw {
      code: "EMPTY_RESPONSE",
      message: "AI returned an empty response after streaming completed. This may indicate a context window issue or a content filter rejection.",
    };
  }

  return { response, latency, retryCount: retries };
}
