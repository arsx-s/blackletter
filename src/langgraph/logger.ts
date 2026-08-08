import { devLog } from "../lib/dev-log";

export function log(prefix: string, message: string, data?: unknown): void {
  const ts = new Date().toISOString().slice(11, 23);
  if (data !== undefined) {
    devLog(`[LANGGRAPH ${ts}] ${prefix}: ${message}`, data);
  } else {
    devLog(`[LANGGRAPH ${ts}] ${prefix}: ${message}`);
  }
}

export function logError(prefix: string, message: string, error?: unknown): void {
  const ts = new Date().toISOString().slice(11, 23);
  console.error(`[LANGGRAPH ${ts}] ${prefix} ERROR: ${message}`, error || "");
}