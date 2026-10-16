/**
 * Operator-supplied relay access token.
 *
 * The relays can require `Authorization: Bearer <token>`
 * (`BLACKLETTER_RELAY_TOKEN`). That token is deliberately *not* compiled into
 * the bundle: the operator enters it in Workshop and it is kept in this
 * browser's local storage only.
 *
 * This is the operator's credential for reaching their own relay. It is not a
 * provider API key — `OPENROUTER_API_KEY` never leaves the server, and the
 * client never sees it.
 *
 * Threat note: anything in browser storage is readable by scripts running on
 * this origin and by anyone with access to the profile. The token therefore
 * scopes access to a relay that already bound itself to loopback or to the
 * operator's own deployment; it is not a substitute for account
 * authentication on a multi-user service.
 */

const STORAGE_KEY = "blackletter.relay.token";

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    // Storage can throw outright when the user has blocked site data.
    return null;
  }
}

export function getRelayToken(): string {
  try {
    return storage()?.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setRelayToken(token: string): void {
  const store = storage();
  if (!store) return;
  const trimmed = token.trim();
  try {
    if (trimmed) store.setItem(STORAGE_KEY, trimmed);
    else store.removeItem(STORAGE_KEY);
  } catch {
    /* quota exceeded or storage blocked — the request will simply 401 */
  }
}

export function clearRelayToken(): void {
  setRelayToken("");
}

export function hasRelayToken(): boolean {
  return getRelayToken().length > 0;
}

/** Headers to attach to every relay request. Empty when no token is set. */
export function relayAuthHeaders(): Record<string, string> {
  const token = getRelayToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
