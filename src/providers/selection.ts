/**
 * Which model provider a run uses, and how local failures are handled.
 *
 * This is the one place the selection lives. `provider.ts` reads it, the
 * workspace store writes it from preferences, and a caller may override it for a
 * single request (tests do, and so does an explicit operator choice).
 *
 * Two safety properties are enforced here rather than left to the UI:
 *
 * 1. **Loopback by default.** A base URL that is not loopback is refused unless
 *    the operator has explicitly allowed it, so a typo cannot point the local
 *    runtime at a machine on the network.
 * 2. **No silent remote fallback.** When local inference fails, the request fails.
 *    Falling back to a hosted model would send the operator's content to a third
 *    party at exactly the moment they had asked to keep it local, so it requires a
 *    deliberate preference change (`remoteFallback: "allow"`) and the run is then
 *    labelled as a remote run.
 */

import { OLLAMA_BASE_URL, OLLAMA_DEFAULT_MODEL } from "../config/model-defaults.mjs";

export type ProviderId = "openrouter" | "ollama";

/** What to do when a local provider fails. `never` is the default. */
export type LocalFallbackPolicy = "never" | "allow";

export interface ProviderSelection {
  provider: ProviderId;
  /** Base URL of the local runtime. Validated by `validateOllamaBaseUrl`. */
  ollamaBaseUrl: string;
  /** The operator's model id. Empty means "not chosen yet". */
  ollamaModel: string;
  /** Explicit opt-in required before a non-loopback base URL is used. */
  allowNonLoopbackLocalProvider: boolean;
  /** Explicit opt-in required before a failed local run is retried remotely. */
  remoteFallback: LocalFallbackPolicy;
}

export const DEFAULT_SELECTION: ProviderSelection = {
  provider: "openrouter",
  ollamaBaseUrl: OLLAMA_BASE_URL,
  ollamaModel: OLLAMA_DEFAULT_MODEL,
  allowNonLoopbackLocalProvider: false,
  remoteFallback: "never",
};

let selection: ProviderSelection = { ...DEFAULT_SELECTION };

export function getProviderSelection(): ProviderSelection {
  return selection;
}

export function setProviderSelection(patch: Partial<ProviderSelection>): ProviderSelection {
  selection = { ...selection, ...patch };
  return selection;
}

/** Tests reset between cases; the app writes through the store. */
export function resetProviderSelection(): void {
  selection = { ...DEFAULT_SELECTION };
}

export function isLocalProvider(id: ProviderId): boolean {
  return id === "ollama";
}

export function providerLabel(id: ProviderId): string {
  return id === "ollama" ? "Local (Ollama)" : "Remote (OpenRouter)";
}

/** Short label for a badge: where the tokens were processed. */
export function transportLabel(id: ProviderId): string {
  return id === "ollama" ? "Local inference" : "Remote inference";
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isLoopbackHost(host: string): boolean {
  const normalised = host.trim().toLowerCase();
  if (LOOPBACK_HOSTS.has(normalised)) return true;
  // Any 127.0.0.0/8 address is loopback; so is any IPv6 loopback.
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalised)) return true;
  if (normalised === "[::1]" || normalised === "0:0:0:0:0:0:0:1") return true;
  return false;
}

export interface UrlCheck {
  ok: boolean;
  url?: string;
  reason?: string;
  /** True when the URL is syntactically fine but not loopback. */
  needsOptIn?: boolean;
  /** True for any non-loopback host, whether or not the opt-in is on. */
  nonLoopback?: boolean;
}

/**
 * Validate a local base URL. Rejects credentials in the URL, non-http(s)
 * schemes, and non-loopback hosts unless explicitly allowed.
 */
export function validateOllamaBaseUrl(raw: string, options: { allowNonLoopback?: boolean } = {}): UrlCheck {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: false, reason: "a base URL is required" };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: `"${trimmed}" is not a valid URL` };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: `only http and https are supported (got ${parsed.protocol.replace(":", "")})` };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "credentials must not be embedded in the base URL" };
  }
  if (!isLoopbackHost(parsed.hostname)) {
    if (options.allowNonLoopback) {
      return { ok: true, url: trimmed.replace(/\/+$/, ""), nonLoopback: true };
    }
    return {
      ok: false,
      url: trimmed.replace(/\/+$/, ""),
      needsOptIn: true,
      nonLoopback: true,
      reason: `${parsed.hostname} is not loopback; enable the non-loopback opt-in after a security review`,
    };
  }

  return { ok: true, url: trimmed.replace(/\/+$/, "") };
}

/** Tolerant reader for preferences written by an older version. */
export function normaliseSelection(raw: unknown): ProviderSelection {
  const value = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const provider = value.provider === "ollama" ? "ollama" : "openrouter";
  const ollamaBaseUrl = typeof value.ollamaBaseUrl === "string" && value.ollamaBaseUrl.trim() ? value.ollamaBaseUrl.trim() : OLLAMA_BASE_URL;
  const ollamaModel = typeof value.ollamaModel === "string" ? value.ollamaModel.trim() : OLLAMA_DEFAULT_MODEL;
  const remoteFallback = value.remoteFallback === "allow" ? "allow" : "never";
  const allowNonLoopbackLocalProvider = value.allowNonLoopbackLocalProvider === true;
  return { provider, ollamaBaseUrl, ollamaModel, allowNonLoopbackLocalProvider, remoteFallback };
}

/**
 * The provider a run will actually use, with the reason a requested provider was
 * refused. A refusal is reported, never silently downgraded to the remote one.
 */
export interface ResolvedProvider {
  provider: ProviderId;
  /** Why a local selection could not be used, if it could not. */
  problem?: string;
}

export function resolveProvider(requested?: ProviderId): ResolvedProvider {
  const wanted = requested ?? selection.provider;
  if (wanted !== "ollama") return { provider: "openrouter" };
  if (!selection.ollamaModel.trim()) {
    return { provider: "ollama", problem: "no local model is configured" };
  }
  const check = validateOllamaBaseUrl(selection.ollamaBaseUrl, {
    allowNonLoopback: selection.allowNonLoopbackLocalProvider,
  });
  if (!check.ok) {
    return { provider: "ollama", problem: check.reason };
  }
  return { provider: "ollama" };
}
