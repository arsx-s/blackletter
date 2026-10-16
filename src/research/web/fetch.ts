import { CancelledError, isCancelledError, linkAbort } from "../../lib/cancellation";
import { REDIRECTS_FOLLOWED, type FetchFailureCode, type FetchOutcome, type FetchedPage, type ResearchPolicy, type UrlVerdict } from "./types";

/**
 * The only code in this app that opens a network connection on the operator's
 * behalf, and the only place that decides whether a URL may be opened at all.
 *
 * Two layers, both required:
 *
 *   1. **Destination checks** (`checkResearchUrl`) refuse non-HTTP schemes,
 *      credentials in the URL, plaintext when it is not allowed, literal private,
 *      loopback, link-local and reserved addresses, single-label hostnames, and
 *      any host the operator has not approved for this run.
 *   2. **Transfer limits** (`fetchSource`) refuse a response that redirects, that
 *      is not a readable text type, that declares or delivers more bytes than the
 *      cap, or that does not arrive inside the timeout.
 *
 * The honest limitation: the browser resolves the hostname, so a public name that
 * resolves to a private address cannot be detected here. That is why an
 * *allowlist of approved hosts* is required in addition to the address checks —
 * the allowlist is the control, and the address checks are defence in depth.
 */

/** The only content types that may be extracted. Everything else is refused. */
export const READABLE_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "text/plain",
  "text/markdown",
  "application/xml",
  "text/xml",
] as const;

const PRIVATE_HOSTNAMES = [
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "metadata.google.internal",
  "instance-data",
  "metadata",
];

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function octets(host: string): number[] | null {
  if (!IPV4.test(host)) return null;
  const parts = host.split(".").map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts;
}

/** Loopback, private, link-local, CGNAT, documentation and reserved IPv4. */
export function isPrivateIpv4(host: string): boolean {
  const parts = octets(host);
  if (!parts) return false;
  const [a, b] = parts;
  if (a === 0 || a === 127 || a === 10) return true; // this network, loopback, private
  if (a === 169 && b === 254) return true; // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51) return true; // TEST-NET-2
  if (a === 203 && b === 0) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast and reserved
  return false;
}

/** Loopback, unspecified, unique-local, link-local and mapped-private IPv6. */
export function isPrivateIpv6(host: string): boolean {
  const lower = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (!lower.includes(":")) return false;
  if (lower === "::" || lower === "::1") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // unique local fc00::/7
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true; // link local fe80::/10
  if (/^2001:db8(:|$)/.test(lower)) return true; // documentation range
  const mapped = lower.match(/^(?:::ffff:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

export function isPrivateHost(host: string): boolean {
  const lower = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (PRIVATE_HOSTNAMES.includes(lower)) return true;
  if (lower.endsWith(".localhost") || lower.endsWith(".local") || lower.endsWith(".internal")) return true;
  if (lower.endsWith(".home.arpa")) return true;
  // A single-label host has no public suffix; it can only resolve through a
  // search domain or a local resolver, so it is treated as local.
  if (!lower.includes(".") && !lower.includes(":")) return true;
  if (isPrivateIpv4(lower)) return true;
  if (isPrivateIpv6(lower)) return true;
  return false;
}

function hostApproved(host: string, allowed: readonly string[]): boolean {
  return allowed.some((entry) => {
    const allowedHost = entry.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
    return host === allowedHost || host.endsWith(`.${allowedHost}`);
  });
}

/**
 * Decide whether a URL may be fetched. Pure, synchronous, and the single
 * authority: `fetchSource` calls this first and so does the UI, so the panel can
 * show the same refusal the fetch layer would produce without opening anything.
 */
export function checkResearchUrl(raw: string, policy: ResearchPolicy): UrlVerdict {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) {
    return { ok: false, code: "bad-url", reason: "the URL is empty or longer than 2048 characters" };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, code: "bad-url", reason: "the URL could not be parsed" };
  }

  const scheme = url.protocol.replace(":", "").toLowerCase();
  if (scheme !== "http" && scheme !== "https") {
    return { ok: false, code: "scheme", reason: `the ${scheme}: scheme is not fetched; only http and https are` };
  }
  if (url.username.length > 0 || url.password.length > 0) {
    return { ok: false, code: "credentials", reason: "the URL carries credentials; they would be sent in clear text" };
  }
  if (scheme === "http" && !policy.allowHttp) {
    return { ok: false, code: "insecure", reason: "plain http is refused; enable plaintext only if the host cannot serve https" };
  }

  const host = url.hostname.toLowerCase();
  if (isPrivateHost(host)) {
    return {
      ok: false,
      code: "private-address",
      reason: `"${host}" is a loopback, private, link-local or single-label address, and is never fetched`,
    };
  }
  if (!hostApproved(host, policy.allowedHosts)) {
    return {
      ok: false,
      code: "host-not-approved",
      reason:
        policy.allowedHosts.length === 0
          ? `no host is approved for this run, so "${host}" was not fetched`
          : `"${host}" is not one of the approved hosts for this run`,
    };
  }

  url.hash = "";
  return { ok: true, url: url.toString(), host };
}

/** The longest a diagnostic from a failed connection may be, wrapper included. */
const MAX_ERROR_CHARS = 160;

function safeMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.slice(0, MAX_ERROR_CHARS);
}

interface CappedBody {
  text: string;
  bytes: number;
  over: boolean;
}

/**
 * Read a body with a hard byte cap.
 *
 * The cap is enforced while reading, not after: a response that is larger than
 * the cap is abandoned mid-stream and refused. Silently keeping the first
 * `maxBytes` of a page would produce an extraction that claims to describe a
 * document it only saw part of.
 */
async function readCapped(response: Response, maxBytes: number): Promise<CappedBody> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { text: "", bytes: declared, over: true };
  }

  const body = response.body;
  if (!body) {
    const text = await response.text();
    const bytes = new TextEncoder().encode(text).length;
    return { text, bytes, over: bytes > maxBytes };
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let bytes = 0;
  let over = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      over = true;
      parts.length = 0;
      try {
        await reader.cancel();
      } catch {
        // A failed cancel must not mask the refusal.
      }
      break;
    }
    parts.push(decoder.decode(value, { stream: true }));
  }
  parts.push(decoder.decode());
  return { text: over ? "" : parts.join(""), bytes, over };
}

export interface FetchOptions {
  policy: ResearchPolicy;
  signal?: AbortSignal;
  /** Injected in tests; the app always uses the platform `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injected in tests; defaults to `Date.now`. */
  now?: () => number;
}

/**
 * Fetch one page inside the policy. Returns a discriminated result for every
 * outcome — there is no path where a failure looks like an empty success.
 */
export async function fetchSource(url: string, options: FetchOptions): Promise<FetchOutcome> {
  const { policy } = options;
  const verdict = checkResearchUrl(url, policy);
  if (!verdict.ok || !verdict.url) {
    return { ok: false, code: verdict.code ?? "bad-url", reason: verdict.reason ?? "refused", url };
  }

  const doFetch = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const link = linkAbort(options.signal, policy.timeoutMs);

  try {
    const response = await doFetch(verdict.url, {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: { accept: READABLE_CONTENT_TYPES.join(", ") },
      signal: link.signal,
    });

    if (response.type === "opaqueredirect" || response.status === 0) {
      return {
        ok: false,
        code: "redirect-blocked",
        reason: `the server redirected; ${REDIRECTS_FOLLOWED} redirects are followed, because a cross-origin redirect target cannot be inspected before it is followed`,
        url: verdict.url,
      };
    }
    if (!response.ok) {
      return { ok: false, code: "http-error", reason: `the server answered HTTP ${response.status}`, url: verdict.url };
    }

    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!(READABLE_CONTENT_TYPES as readonly string[]).includes(contentType)) {
      return {
        ok: false,
        code: "content-type",
        reason: contentType
          ? `the response is "${contentType}", which this app does not extract text from`
          : "the response has no content type, so it was not trusted as text",
        url: verdict.url,
      };
    }

    const body = await readCapped(response, policy.maxBytes);
    if (body.over) {
      return {
        ok: false,
        code: "too-large",
        reason: `the response is larger than the ${policy.maxBytes} byte limit and was not kept`,
        url: verdict.url,
      };
    }
    if (body.text.trim().length === 0) {
      return { ok: false, code: "empty", reason: "the response contained no text", url: verdict.url };
    }

    const page: FetchedPage = {
      requestedUrl: verdict.url,
      finalUrl: verdict.url,
      status: response.status,
      contentType,
      bytes: body.bytes,
      body: body.text,
      fetchedAt: now(),
    };
    return { ok: true, page };
  } catch (error) {
    // Order matters: a linked abort and a timeout both reject with an AbortError,
    // and only the link knows which fired. Timeout is checked first so a slow
    // host is never reported as an operator cancellation.
    if (link.reason === "timeout") {
      return { ok: false, code: "timeout", reason: `no response within ${policy.timeoutMs}ms`, url: verdict.url };
    }
    if (link.reason === "cancelled") {
      return { ok: false, code: "cancelled", reason: "the fetch was cancelled", url: verdict.url };
    }
    if (isCancelledError(error) || error instanceof CancelledError) {
      return { ok: false, code: "cancelled", reason: "the fetch was aborted before it completed", url: verdict.url };
    }
    return {
      ok: false,
      code: "network",
      reason: `the request failed (${safeMessage(error)})`,
      url: verdict.url,
    };
  } finally {
    link.dispose();
  }
}

/** Human-readable failure code, for the panel and the report. */
export const FAILURE_LABELS: Record<FetchFailureCode, string> = {
  "bad-url": "the URL was unreadable",
  scheme: "the URL scheme is not fetched",
  credentials: "the URL carried credentials",
  insecure: "plain http was refused",
  "private-address": "the destination is a local or private address",
  "host-not-approved": "the host is not approved for this run",
  "redirect-blocked": "the server redirected, and the target could not be checked",
  "http-error": "the server answered with an error",
  "content-type": "the response was not a text type",
  "too-large": "the response was larger than the limit",
  timeout: "the fetch timed out",
  network: "the request failed",
  empty: "the response contained no text",
  cancelled: "the fetch was cancelled",
};
