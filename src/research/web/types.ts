/**
 * Web research: types.
 *
 * This module exists to make one distinction impossible to blur: **retrieved
 * evidence** is a record of bytes that were actually fetched from a URL, and
 * **synthesis** is text the model wrote. A citation is only ever a pointer into
 * the first; the second is never allowed to invent one.
 *
 * Nothing here invents credentials or providers. If no search provider is
 * configured, the honest result is "nothing was retrieved", not a plausible list
 * of links.
 */

/** How a source was obtained. Retrieval method changes what may be claimed. */
export type RetrievalMethod = "manual-url" | "search-provider" | "revalidation";

export type UrlRefusalCode =
  | "bad-url"
  | "scheme"
  | "credentials"
  | "insecure"
  | "private-address"
  | "host-not-approved";

export type FetchFailureCode =
  | UrlRefusalCode
  | "redirect-blocked"
  | "http-error"
  | "content-type"
  | "too-large"
  | "timeout"
  | "network"
  | "empty"
  | "cancelled";

/** Policy the fetch layer enforces. Defaults are in `defaultResearchPolicy`. */
export interface ResearchPolicy {
  /** Hosts the operator approved: manual URLs, or an enabled provider's hosts. */
  allowedHosts: readonly string[];
  /** Hard cap on a fetched body, in bytes. Refused, not truncated. */
  maxBytes: number;
  timeoutMs: number;
  /** `http://` is refused unless the operator explicitly allows plaintext. */
  allowHttp: boolean;
}

export const DEFAULT_MAX_BYTES = 2_000_000;
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

/**
 * Redirects followed. Zero, on purpose, and not configurable.
 *
 * A renderer-side `fetch` cannot read the `Location` header of a cross-origin
 * redirect (`redirect: "manual"` hands back an opaque response), so following a
 * redirect would mean handing the connection to a URL this app never checked.
 * A redirect is therefore reported as a refusal, with the original URL, and the
 * operator can fetch the destination explicitly if it is approved.
 */
export const REDIRECTS_FOLLOWED = 0;

export function defaultResearchPolicy(overrides: Partial<ResearchPolicy> = {}): ResearchPolicy {
  return {
    allowedHosts: [],
    maxBytes: DEFAULT_MAX_BYTES,
    timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
    allowHttp: false,
    ...overrides,
  };
}

/** What a URL in the source has to answer before anything is fetched. */
export interface UrlVerdict {
  ok: boolean;
  code?: UrlRefusalCode;
  reason?: string;
  url?: string;
  host?: string;
}

export interface FetchedPage {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  bytes: number;
  /** Raw HTML/text exactly as received, before any extraction. */
  body: string;
  fetchedAt: number;
}

export type FetchOutcome =
  | { ok: true; page: FetchedPage }
  | { ok: false; code: FetchFailureCode; reason: string; url: string };

/**
 * Primary/commentary classification is a **heuristic with a stated basis**, never
 * a verification. The basis string travels with the source so the UI can say why.
 */
export type SourceKind = "likely-primary" | "secondary" | "commentary" | "unknown";

export interface SourceRecord {
  /** Stable: a digest of the canonical URL, so the same page keeps its id. */
  id: string;
  url: string;
  canonicalUrl: string;
  title: string;
  publisher: string | null;
  author: string | null;
  publishedAt: string | null;
  retrievedAt: number;
  method: RetrievalMethod;
  contentType: string;
  /** Digest of the extracted text, used for deduplication. */
  contentHash: string;
  /** Digest of the raw fetched bytes, used to detect a changed page. */
  rawHash: string;
  text: string;
  /** True when the page was longer than the extraction cap and was cut. */
  textTruncated: boolean;
  kind: SourceKind;
  kindBasis: string;
  /** Other source ids this one duplicates or republishes. */
  duplicates: string[];
  /** True when this record is the representative of its duplicate group. */
  representative: boolean;
  /** Elements removed before extraction (script/style/iframe/…), for reporting. */
  sanitisedElements: number;
  /**
   * Outbound links on the page. None of them is ever followed: this build does
   * not crawl, so the count is reported rather than acted on.
   */
  linksNotFollowed: number;
}

export interface SourceFailure {
  url: string;
  code: FetchFailureCode;
  reason: string;
}

export interface Passage {
  chunkId: string;
  sourceId: string;
  /** Human-readable pointer, e.g. `url#chars=200-800`. */
  locator: string;
  text: string;
  /** True when the passage text is still reproducible from the stored source. */
  reproducible: boolean;
  /** `not-checked` unless the operator asked for a live revalidation. */
  resolves: "not-checked" | "ok" | "failed";
  resolvesReason?: string;
}

export interface ClaimVerdict {
  claim: string;
  status: "supported" | "partial" | "unsupported";
  overlap: number;
  supportingChunkIds: string[];
  /** Source ids behind the supporting passages, counting one per duplicate group. */
  supportingSourceIds: string[];
  /** Source ids that are representatives of independent duplicate groups. */
  independentSourceIds: string[];
  /** A citation that exists but whose passage does not reproduce is not support. */
  notes: string[];
}

export interface ClaimConflict {
  kind: "contradiction" | "date-mismatch" | "stale-source";
  claimA: string;
  claimB: string;
  reason: string;
}

export interface ResearchQuestion {
  question: string;
  domain: string;
  jurisdiction: string;
  period: string;
  /** What evidence is known to be missing, in the operator's words. */
  missingEvidence: string;
}

export interface SearchPlan {
  queries: string[];
  rationale: string;
  maxResultsPerQuery: number;
}

export interface ResearchRunRecord {
  id: string;
  workspaceId: string;
  startedAt: number;
  finishedAt: number;
  question: ResearchQuestion;
  plan: SearchPlan;
  providerId: string;
  providerLabel: string;
  /** The provider could not be used; nothing was searched or fetched. */
  providerUnavailable?: string;
  /**
   * Hosts this run was allowed to fetch. Kept so a later re-binding of a
   * synthesis reads the same policy the retrieval used.
   */
  approvedHosts: string[];
  sources: SourceRecord[];
  failures: SourceFailure[];
  claims: ClaimVerdict[];
  conflicts: ClaimConflict[];
  /** The synthesis the claims were bound against, if any was provided. */
  synthesis: string;
  /** Honest summary, including what could not be established. */
  summary: string;
  insufficientEvidence: boolean;
}
