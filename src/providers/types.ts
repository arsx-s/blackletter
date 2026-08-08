export interface AiRequest {
  prompt: string;
  systemInstruction?: string;
  fileContent?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AiResponse {
  text: string;
  latency: number;
  retryCount: number;
}

export interface AiError {
  code: string;
  message: string;
  retryAfter?: number;
  retryCount?: number;
}

export type AiStreamEvent =
  | { type: "chunk"; text: string }
  | { type: "error"; code: string; message: string }
  | { type: "done"; finishReason?: string }
  | { type: "meta"; model?: string; usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } };
