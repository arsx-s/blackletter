import { digestValue } from "../../lib/hash";
import { STOP } from "../../pipeline/grounding";
import { bindClaims, buildSourceRecord, chunkSource, detectConflicts, markDuplicates, summariseRun } from "./analysis";
import { canonicaliseUrl, extractPage, hostOf } from "./extract";
import { fetchSource } from "./fetch";
import { defaultResearchPolicy, type FetchFailureCode, type ResearchPolicy, type ResearchQuestion, type ResearchRunRecord, type SearchPlan, type SourceFailure, type SourceRecord } from "./types";

/**
 * The research pipeline: plan → search → fetch → extract → store → bind.
 *
 * Every stage is bounded and every stage reports what it did not do. If no
 * provider is configured, the run stops before the first network call and says
 * so, because a plausible-looking source list produced without retrieving
 * anything would be worse than an empty answer.
 */

/* ------------------------------------------------------------------ plan */

const MAX_QUERY_CHARS = 200;
const MAX_QUERIES = 4;
export const DEFAULT_MAX_RESULTS_PER_QUERY = 5;
export const DEFAULT_MAX_SOURCES = 8;

/**
 * A deterministic search plan, built from the question rather than by a model.
 *
 * Four variants, each with a stated purpose: the question as asked, its
 * distinctive terms with the declared domain, those terms with the jurisdiction
 * and period, and a variant biased towards official publications. Deterministic
 * planning means a run can be reproduced and a reviewer can see why a query was
 * issued.
 */
export function buildSearchPlan(question: ResearchQuestion): SearchPlan {
  const asked = question.question.trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_CHARS);
  const terms = (asked.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((word) => word.length > 3 && !STOP.has(word))
    .slice(0, 6)
    .join(" ");

  const queries: string[] = [];
  if (asked.length > 0) queries.push(asked);
  if (terms.length > 0) {
    if (question.domain.trim()) queries.push(`${terms} ${question.domain.trim()}`.slice(0, MAX_QUERY_CHARS));
    const scope = [question.jurisdiction, question.period].map((value) => value.trim()).filter(Boolean).join(" ");
    if (scope.length > 0) queries.push(`${terms} ${scope}`.slice(0, MAX_QUERY_CHARS));
    queries.push(`${terms} official publication statistics`.slice(0, MAX_QUERY_CHARS));
  }

  return {
    queries: [...new Set(queries)].slice(0, MAX_QUERIES),
    rationale:
      "The plan is deterministic: the question as asked, its distinctive terms with the declared domain, those terms with the declared jurisdiction and period, and a variant biased towards official publications.",
    maxResultsPerQuery: DEFAULT_MAX_RESULTS_PER_QUERY,
  };
}

/* -------------------------------------------------------------- providers */

export interface SearchHit {
  url: string;
  title: string;
  /** The provider's snippet, kept as a hint only; it is never treated as evidence. */
  snippet: string;
}

export interface SearchOutcome {
  hits: SearchHit[];
  error?: string;
}

export interface SearchProvider {
  id: string;
  label: string;
  /** What enabling this provider approves, in one sentence, for the operator. */
  description: string;
  /** Hosts that must be approved for this provider's own API calls. */
  apiHosts: string[];
  requiresKey: boolean;
  /** A sentence when the provider cannot be used in this build; `undefined` when it can. */
  unavailable?: string;
  search(queries: string[], options: SearchOptions): Promise<SearchOutcome>;
}

export interface SearchOptions {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  maxResultsPerQuery: number;
  /** URLs the operator supplied, used by the manual provider. */
  manualUrls: readonly string[];
}

/** The default. Nothing is searched, and the run says so. */
const noneProvider: SearchProvider = {
  id: "none",
  label: "No search provider",
  description: "Nothing is searched or fetched until a provider is chosen.",
  apiHosts: [],
  requiresKey: false,
  search: async () => ({ hits: [], error: "no search provider is configured, so no query was issued" }),
};

/**
 * The only provider that needs no credentials: URLs the operator supplied.
 * Retrieval is real — the URLs are fetched, extracted and stored — but nothing is
 * discovered automatically.
 */
const manualProvider: SearchProvider = {
  id: "manual",
  label: "Operator-supplied URLs",
  description: "Fetches only the URLs typed into the run form; no search API and no credentials.",
  apiHosts: [],
  requiresKey: false,
  search: async (queries, options) => ({
    hits: options.manualUrls.map((url) => ({ url, title: url, snippet: `supplied by the operator for: ${queries[0] ?? "this run"}` })),
  }),
};

const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";

/**
 * MediaWiki's public Action API. Documented, no key, CORS-enabled with
 * `origin=*` — and a reference work, not a general web search: the label says so
 * because a claim about the world sourced to an encyclopedia article is a claim
 * about what that article says.
 */
const wikipediaProvider: SearchProvider = {
  id: "wikipedia",
  label: "Wikipedia (MediaWiki API)",
  description:
    "Searches Wikipedia through its public API without credentials. Results are encyclopedia articles, which summarise sources rather than being them.",
  apiHosts: ["wikipedia.org"],
  requiresKey: false,
  search: async (queries, options) => {
    const hits: SearchHit[] = [];
    for (const query of queries) {
      const url = `${WIKIPEDIA_API}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${options.maxResultsPerQuery}&format=json&origin=*`;
      const doFetch = options.fetchImpl ?? fetch;
      try {
        const response = await doFetch(url, { signal: options.signal, credentials: "omit", referrerPolicy: "no-referrer" });
        if (!response.ok) return { hits, error: `the Wikipedia API answered HTTP ${response.status}` };
        const payload = (await response.json()) as {
          query?: { search?: Array<{ title?: string; snippet?: string }> };
        };
        for (const item of payload.query?.search ?? []) {
          if (!item.title) continue;
          hits.push({
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, "_"))}`,
            title: item.title,
            snippet: (item.snippet ?? "").replace(/<[^>]*>/g, "").slice(0, 300),
          });
        }
      } catch (error) {
        return { hits, error: `the Wikipedia API request failed (${error instanceof Error ? error.message.slice(0, 120) : "unknown error"})` };
      }
    }
    return { hits };
  },
};

/**
 * Brave Search. Documented, and the key is a *server-side* secret: the renderer
 * must never hold it. This build has no relay route for search, so the provider
 * is listed with its requirement and refuses to run rather than pretending.
 */
const braveProvider: SearchProvider = {
  id: "brave",
  label: "Brave Search (API key required)",
  description: "Searches the web through Brave Search. Requires a Brave API key held by the relay; the key must never reach the renderer.",
  apiHosts: ["api.search.brave.com"],
  requiresKey: true,
  unavailable:
    "Brave Search needs an API key and a relay route for search; neither exists in this build, so selecting it performs no search",
  search: async () => ({ hits: [], error: "the Brave Search provider is not configured in this build" }),
};

export const SEARCH_PROVIDERS: readonly SearchProvider[] = [
  noneProvider,
  manualProvider,
  wikipediaProvider,
  braveProvider,
];

export function findSearchProvider(id: string): SearchProvider | undefined {
  return SEARCH_PROVIDERS.find((provider) => provider.id === id);
}

/* --------------------------------------------------------------- the run */

export interface RunResearchOptions {
  workspaceId: string;
  question: ResearchQuestion;
  providerId: string;
  manualUrls?: readonly string[];
  /** The synthesis to bind against the retrieved text, usually the last answer. */
  synthesis?: string;
  /** Plain http is refused by default; an operator may allow it per run. */
  allowHttp?: boolean;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  now?: () => number;
  maxSources?: number;
}

function failure(url: string, code: FetchFailureCode, reason: string): SourceFailure {
  return { url, code, reason };
}

/**
 * Run one research pass. Bounded in every direction: queries, results per query,
 * sources fetched, bytes per source, and wall time per fetch.
 */
export async function runWebResearch(options: RunResearchOptions): Promise<ResearchRunRecord> {
  const now = options.now ?? Date.now;
  const maxSources = options.maxSources ?? DEFAULT_MAX_SOURCES;
  const startedAt = now();
  const provider = findSearchProvider(options.providerId) ?? noneProvider;
  const plan = buildSearchPlan(options.question);

  const base: Omit<ResearchRunRecord, "sources" | "failures" | "claims" | "conflicts" | "summary" | "insufficientEvidence"> = {
    id: `research-${digestValue([options.workspaceId, startedAt, options.question.question]).replace(/^fnv1a32:/, "")}`,
    workspaceId: options.workspaceId,
    startedAt,
    finishedAt: startedAt,
    question: options.question,
    plan,
    providerId: provider.id,
    providerLabel: provider.label,
    approvedHosts: [],
    synthesis: options.synthesis ?? "",
  };

  const unavailable = provider.unavailable ?? (provider.id === "none" ? provider.description : undefined);

  if (unavailable) {
    const { summary, insufficientEvidence } = summariseRun({
      question: options.question,
      sources: [],
      failures: [],
      claims: [],
      conflicts: [],
      providerUnavailable: unavailable,
    });
    return {
      ...base,
      providerUnavailable: unavailable,
      approvedHosts: [],
      sources: [],
      failures: [],
      claims: [],
      conflicts: [],
      summary,
      insufficientEvidence,
      finishedAt: now(),
    };
  }

  const cancelledUpFront = Boolean(options.signal?.aborted);
  const search: SearchOutcome = cancelledUpFront
    ? { hits: [] }
    : await provider.search(plan.queries, {
        signal: options.signal,
        fetchImpl: options.fetchImpl,
        maxResultsPerQuery: plan.maxResultsPerQuery,
        manualUrls: options.manualUrls ?? [],
      });

  const failures: SourceFailure[] = [];
  if (cancelledUpFront) failures.push(failure("(search)", "cancelled", "the run was cancelled before the search was issued"));

  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const hit of search.hits) {
    const canonical = canonicaliseUrl(hit.url);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    candidates.push(hit.url);
    if (candidates.length >= maxSources) break;
  }
  if (search.error) failures.push(failure("(search)", "network", search.error));
  if (!cancelledUpFront && candidates.length === 0 && !search.error) {
    failures.push(failure("(search)", "empty", "the provider returned no results for this plan"));
  }

  // What this run is allowed to fetch: the provider's own API hosts, plus the
  // hosts of the candidates it returned. The address rules in the fetch layer
  // still apply on top, so a result pointing at a private address is refused.
  const policy: ResearchPolicy = defaultResearchPolicy({
    allowedHosts: [...new Set([...provider.apiHosts, ...candidates.map((url) => hostOf(url) ?? "").filter(Boolean)])],
    allowHttp: options.allowHttp === true,
  });

  const sources: SourceRecord[] = [];
  for (const url of candidates) {
    if (options.signal?.aborted) {
      failures.push(failure(url, "cancelled", "the run was cancelled before this URL was fetched"));
      continue;
    }
    const outcome = await fetchSource(url, { policy, signal: options.signal, fetchImpl: options.fetchImpl, now });
    if (!outcome.ok) {
      failures.push(failure(url, outcome.code, outcome.reason));
      continue;
    }
    const extraction = extractPage(outcome.page.body, outcome.page.finalUrl);
    sources.push(buildSourceRecord(outcome.page, extraction, "search-provider"));
  }

  markDuplicates(sources);
  const passages = sources.flatMap((record) => chunkSource(record, policy));
  const claims = bindClaims(options.synthesis ?? "", sources, passages);
  const conflicts = detectConflicts(claims, sources, options.question, now());
  const { summary, insufficientEvidence } = summariseRun({
    question: options.question,
    sources,
    failures,
    claims,
    conflicts,
  });

  return { ...base, approvedHosts: [...policy.allowedHosts], sources, failures, claims, conflicts, summary, insufficientEvidence, finishedAt: now() };
}

export function rebindSynthesis(run: ResearchRunRecord, synthesis: string, now: () => number = Date.now): ResearchRunRecord {
  const policy = defaultResearchPolicy({ allowedHosts: run.approvedHosts });
  const passages = run.sources.flatMap((record) => chunkSource(record, policy));
  const claims = bindClaims(synthesis, [...run.sources], passages);
  const conflicts = detectConflicts(claims, [...run.sources], run.question, now());
  const { summary, insufficientEvidence } = summariseRun({
    question: run.question,
    sources: [...run.sources],
    failures: [...run.failures],
    claims,
    conflicts,
  });
  return { ...run, synthesis, claims, conflicts, summary, insufficientEvidence, finishedAt: now() };
}

/** Fetch and store a page the operator supplied, outside a search plan. */
export async function ingestManualUrls(
  options: Pick<RunResearchOptions, "workspaceId" | "question" | "signal" | "fetchImpl" | "now" | "manualUrls" | "synthesis" | "allowHttp">,
): Promise<ResearchRunRecord> {
  return runWebResearch({ ...options, providerId: "manual" });
}
