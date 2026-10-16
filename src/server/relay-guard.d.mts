/**
 * Types for `relay-guard.mjs`, which is plain ESM so the JavaScript dev relay
 * can import the exact same policy the TypeScript function uses.
 */

export interface RelayLimits {
  maxBodyBytes: number;
  maxPromptChars: number;
  maxSystemChars: number;
  minTemperature: number;
  maxTemperature: number;
  minMaxTokens: number;
  maxMaxTokens: number;
  maxModelIdChars: number;
  defaultTimeoutMs: number;
  ratePerMinute: number;
  rateBurst: number;
}

export interface RelayConfig {
  profile: "hosted" | "local";
  token: string;
  allowedOrigins: Set<string>;
  allowNoOrigin: boolean;
  allowNullOrigin: boolean;
  allowAnyModel: boolean;
  allowedModels: Set<string>;
  allowedPrefixes: Set<string>;
  defaultModel: string;
  ratePerMinute: number;
  rateBurst: number;
  timeoutMs: number;
}

export interface ValidatedChatRequest {
  prompt: string;
  systemInstruction?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export type PolicyFailure = { ok: false; status: number; code: string; message: string; close?: boolean };
export type PolicyResult<T> = ({ ok: true } & T) | PolicyFailure;

export interface AbortBridge {
  readonly signal: AbortSignal;
  readonly reason: string | null;
  readonly aborted: boolean;
  dispose(): void;
}

export const RELAY_LIMITS: RelayLimits;
export const MODEL_ID_PATTERN: RegExp;
export const DEFAULT_MODEL_PREFIXES: string[];
export const DEFAULT_ALLOWED_ORIGINS: string[];

export function redact(value: unknown): string;
export function resolveConfig(
  env?: Record<string, string | undefined>,
  profile?: "hosted" | "local",
): RelayConfig;
export function isSafeCode(code: string): boolean;
export function toClientError(error: unknown): { code: string; message: string };
export function policyError(status: number, code: string, message: string): Error;
export function jsonError(
  res: { setHeader(name: string, value: string): void; end(chunk?: string): void; statusCode: number },
  status: number,
  code: string,
  message: string,
  extraHeaders?: Record<string, string>,
): void;
export function applyCors(res: unknown, origin: string | undefined, config: RelayConfig): void;
export function readBody(
  req: unknown,
  maxBytes?: number,
): Promise<{ ok: true; value: unknown } | PolicyFailure>;
export function checkAuthorization(req: unknown, config: RelayConfig): { ok: boolean; enforced: boolean };
export function checkOrigin(req: unknown, config: RelayConfig): { ok: boolean; origin?: string; reason?: string };
export function clientKey(req: unknown): string;
export function createRateLimiter(options: {
  ratePerMinute: number;
  burst: number;
  maxKeys?: number;
}): { check(key: string, now?: number): { ok: true } | { ok: false; retryAfter: number }; size(): number };
export function validateModel(model: unknown, config: RelayConfig): PolicyResult<{ value: string }>;
export function validateChatRequest(body: unknown, config: RelayConfig): PolicyResult<{ value: ValidatedChatRequest }>;
export function createAbortBridge(res: unknown, timeoutMs?: number): AbortBridge;
export function writeSSE(res: { write(chunk: string): void }, data: unknown): void;
export function beginSSE(res: unknown): void;
