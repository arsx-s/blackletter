import type { ProviderId } from "./selection";

export interface AiRequest {
  prompt: string;
  systemInstruction?: string;
  fileContent?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /**
   * Cancels the underlying network request. Callers own the controller; the
   * provider layer only observes the signal.
   */
  signal?: AbortSignal;
  /**
   * Notified once per retry attempt actually started, so `retryCount` reported
   * back to callers is a measured value rather than a constant.
   */
  onRetry?: (attempt: number) => void;
  /**
   * Runs this request through a specific provider instead of the configured
   * one. Used by tests and by an explicit operator choice; never as an implicit
   * upgrade path from local to remote.
   */
  provider?: ProviderId;
  /** Overrides the configured local model id for this request. */
  ollamaModel?: string;
  /**
   * Called once, before any content arrives, with the provider that is actually
   * running the request — including when an explicitly opted-in fallback moved
   * it off the local runtime. Callers record this rather than assuming.
   */
  onProvider?: (info: { provider: ProviderId; model: string; fallback: boolean }) => void;
}

export interface AiResponse {
  text: string;
  latency: number;
  retryCount: number;
  /** Which provider produced the text, so the UI never guesses. */
  provider?: ProviderId;
  /** True when the tokens were produced on this machine. */
  local?: boolean;
  /** True when an opted-in fallback ran instead of the requested local model. */
  fallback?: boolean;
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
