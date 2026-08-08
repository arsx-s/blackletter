const KEYS = {
  API_PROVIDER: "blackletter_api_provider",
} as const;

export type AIProvider = "openai" | "anthropic" | "openrouter";

export function getApiProvider(): AIProvider | null {
  try { return localStorage.getItem(KEYS.API_PROVIDER) as AIProvider | null; } catch { return null; }
}

export function setApiProvider(provider: AIProvider): void {
  try { localStorage.setItem(KEYS.API_PROVIDER, provider); } catch { /* ignore */ }
}
