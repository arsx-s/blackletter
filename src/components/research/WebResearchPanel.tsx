/**
 * Web research panel — retrieval, with the difference between evidence and
 * synthesis kept visible.
 *
 * The panel drives the real pipeline in `src/research/web`: the plan, the
 * provider, the fetch guard, extraction, deduplication, claim binding and the
 * run log. It shows three things and never blurs them:
 *
 *   1. what was **retrieved** (fetched bytes, with URL, digest and kind-label
 *      basis);
 *   2. what was **refused** (a URL or a response, with the reason);
 *   3. what the **synthesis** claims, sentence by sentence, and which retrieved
 *      passage supports each one.
 *
 * A run with no provider configured retrieves nothing and says so. There is no
 * sample data on this panel.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ChevronDown, ExternalLink, Globe, Play, RefreshCw, Shield, X } from "lucide-react";
import { useWorkspaceStore } from "../../stores/use-workspace";
import { cn } from "../../lib/utils";
import {
  SEARCH_PROVIDERS,
  appendWebRun,
  clearWebResearch,
  findSearchProvider,
  latestWebRunFor,
  loadWebResearch,
  rebindSynthesis,
  runWebResearch,
  subscribeWebResearch,
  webRunsDroppedCount,
  webRunsFor,
  type ClaimVerdict,
  type ResearchQuestion,
  type ResearchRunRecord,
  type SourceRecord,
} from "../../research/web";

const EMPTY_QUESTION: ResearchQuestion = { question: "", domain: "", jurisdiction: "", period: "", missingEvidence: "" };

function timeOf(at: number): string {
  return new Date(at).toLocaleString();
}

function shortDigest(value: string): string {
  return value.replace(/^fnv1a32:/, "").slice(0, 10);
}

function statusClass(status: ClaimVerdict["status"]): string {
  switch (status) {
    case "supported":
      return "border-accent/30 text-accent bg-accent/[0.06]";
    case "partial":
      return "border-amber-500/40 text-amber-600";
    default:
      return "border-border/60 text-muted";
  }
}

function kindClass(kind: SourceRecord["kind"]): string {
  switch (kind) {
    case "likely-primary":
      return "border-accent/30 text-accent";
    case "secondary":
      return "border-border/60 text-bone";
    case "commentary":
      return "border-amber-500/40 text-amber-600";
    default:
      return "border-border/50 text-muted";
  }
}

export function WebResearchPanel() {
  const state = useWorkspaceStore();
  const workspaceId = state.activeWorkspaceId;
  const tab = state.tabs.find((candidate) => candidate.id === state.activeTabId);
  const lastAnswer = useMemo(
    () => [...(tab?.messages ?? [])].reverse().find((message) => message.role === "assistant")?.content ?? "",
    [tab?.messages],
  );

  const [providerId, setProviderId] = useState("none");
  const [question, setQuestion] = useState<ResearchQuestion>(EMPTY_QUESTION);
  const [manualUrls, setManualUrls] = useState("");
  const [synthesis, setSynthesis] = useState("");
  const [synthesisTouched, setSynthesisTouched] = useState(false);
  const [running, setRunning] = useState(false);
  const [controller, setController] = useState<AbortController | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [run, setRun] = useState<ResearchRunRecord | null>(() => latestWebRunFor(workspaceId));
  const [history, setHistory] = useState<readonly ResearchRunRecord[]>(() => webRunsFor(workspaceId));
  const [showPlan, setShowPlan] = useState(false);

  const provider = findSearchProvider(providerId);

  useEffect(() => {
    void loadWebResearch();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeWebResearch(() => setHistory(webRunsFor(workspaceId)));
    setHistory(webRunsFor(workspaceId));
    setRun((current) => current ?? latestWebRunFor(workspaceId));
    return unsubscribe;
  }, [workspaceId]);

  useEffect(() => {
    if (!synthesisTouched && lastAnswer.length > 0) setSynthesis(lastAnswer);
  }, [lastAnswer, synthesisTouched]);

  const start = useCallback(async () => {
    if (question.question.trim().length === 0) {
      setProblem("A research question is required; a run without one has nothing to plan against.");
      return;
    }
    setProblem(null);
    setRunning(true);
    const next = new AbortController();
    setController(next);
    try {
      const urls = manualUrls
        .split(/\s+/)
        .map((url) => url.trim())
        .filter((url) => url.length > 0);
      const result = await runWebResearch({
        workspaceId,
        question,
        providerId,
        manualUrls: urls,
        synthesis,
        signal: next.signal,
      });
      appendWebRun(result);
      setRun(result);
      setHistory(webRunsFor(workspaceId));
    } catch (error) {
      setProblem(`The run failed before it could report: ${error instanceof Error ? error.message.slice(0, 200) : "unknown error"}`);
    } finally {
      setRunning(false);
      setController(null);
    }
  }, [workspaceId, question, providerId, manualUrls, synthesis]);

  const rebind = useCallback(() => {
    if (!run) return;
    const rebound = rebindSynthesis(run, synthesis);
    setRun(rebound);
    appendWebRun(rebound);
  }, [run, synthesis]);

  const refusals = run ? run.failures : [];

  return (
    <section className="surface-default rounded-md border border-border/60">
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Globe size={15} className="text-muted" />
          <h3 className="text-body-sm text-bone">Web research</h3>
          <span className="text-micro text-muted">
            {provider?.label ?? "no provider"} · {history.length} run{history.length === 1 ? "" : "s"} in this workspace
          </span>
        </div>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              type="button"
              className="text-micro text-muted hover:text-bone"
              onClick={() => {
                void clearWebResearch();
                setRun(null);
                setHistory([]);
              }}
            >
              Clear log
            </button>
          )}
        </div>
      </header>

      <div className="space-y-4 px-4 py-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-micro text-muted">Search provider</span>
            <select
              aria-label="Search provider"
              className="mt-1 w-full rounded-xs border border-border/60 bg-background px-2 py-1.5 text-body-sm text-bone"
              value={providerId}
              onChange={(event) => setProviderId(event.target.value)}
            >
              {SEARCH_PROVIDERS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                  {entry.unavailable ? " — not configured" : ""}
                </option>
              ))}
            </select>
            {provider && (
              <span className="mt-1 block text-micro text-muted">
                {provider.description}
                {provider.requiresKey ? " Requires an API key." : ""}
              </span>
            )}
          </label>

          <label className="block">
            <span className="text-micro text-muted">Research question</span>
            <input
              aria-label="Research question"
              className="mt-1 w-full rounded-xs border border-border/60 bg-background px-2 py-1.5 text-body-sm text-bone"
              placeholder="What has to be established, and against what standard?"
              value={question.question}
              onChange={(event) => setQuestion({ ...question, question: event.target.value })}
            />
          </label>

          <label className="block">
            <span className="text-micro text-muted">Domain</span>
            <input
              aria-label="Domain"
              className="mt-1 w-full rounded-xs border border-border/60 bg-background px-2 py-1.5 text-body-sm text-bone"
              placeholder="e.g. energy regulation"
              value={question.domain}
              onChange={(event) => setQuestion({ ...question, domain: event.target.value })}
            />
          </label>

          <label className="block">
            <span className="text-micro text-muted">Jurisdiction and period</span>
            <div className="mt-1 flex gap-2">
              <input
                aria-label="Jurisdiction"
                className="w-1/2 rounded-xs border border-border/60 bg-background px-2 py-1.5 text-body-sm text-bone"
                placeholder="jurisdiction"
                value={question.jurisdiction}
                onChange={(event) => setQuestion({ ...question, jurisdiction: event.target.value })}
              />
              <input
                aria-label="Period"
                className="w-1/2 rounded-xs border border-border/60 bg-background px-2 py-1.5 text-body-sm text-bone"
                placeholder="period, e.g. 2019-2024"
                value={question.period}
                onChange={(event) => setQuestion({ ...question, period: event.target.value })}
              />
            </div>
          </label>

          <label className="block md:col-span-2">
            <span className="text-micro text-muted">Evidence known to be missing</span>
            <input
              aria-label="Missing evidence"
              className="mt-1 w-full rounded-xs border border-border/60 bg-background px-2 py-1.5 text-body-sm text-bone"
              placeholder="What would a complete answer need that you do not have yet?"
              value={question.missingEvidence}
              onChange={(event) => setQuestion({ ...question, missingEvidence: event.target.value })}
            />
          </label>

          {provider?.id === "manual" && (
            <label className="block md:col-span-2">
              <span className="text-micro text-muted">URLs to fetch (one per line; each host is approved for this run)</span>
              <textarea
                aria-label="URLs to fetch"
                rows={3}
                className="mt-1 w-full rounded-xs border border-border/60 bg-background px-2 py-1.5 font-mono text-caption text-bone"
                placeholder="https://example.gov/report-2023"
                value={manualUrls}
                onChange={(event) => setManualUrls(event.target.value)}
              />
            </label>
          )}

          <label className="block md:col-span-2">
            <span className="text-micro text-muted">Synthesis to bind (defaults to this tab's last answer; never treated as evidence)</span>
            <textarea
              aria-label="Synthesis to bind"
              rows={3}
              className="mt-1 w-full rounded-xs border border-border/60 bg-background px-2 py-1.5 text-caption text-bone"
              placeholder="Paste the text whose claims should be checked against the retrieved sources."
              value={synthesis}
              onChange={(event) => {
                setSynthesisTouched(true);
                setSynthesis(event.target.value);
              }}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xs border border-accent/40 bg-accent/[0.08] px-3 py-1.5 text-caption text-accent disabled:opacity-50"
            disabled={running}
            onClick={() => void start()}
          >
            {running ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
            {running ? "Retrieving…" : "Run retrieval"}
          </button>
          {running && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xs border border-border/60 px-3 py-1.5 text-caption text-muted hover:text-bone"
              onClick={() => controller?.abort()}
            >
              <X size={13} /> Cancel
            </button>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xs border border-border/60 px-3 py-1.5 text-caption text-muted hover:text-bone disabled:opacity-50"
            disabled={!run || synthesis.trim().length === 0}
            onClick={rebind}
          >
            <Shield size={13} /> Re-bind claims
          </button>
          {run && (
            <span className="text-micro text-muted">
              last run {timeOf(run.finishedAt)} · {run.sources.length} source(s) · {run.claims.length} claim(s) checked
            </span>
          )}
          {webRunsDroppedCount() > 0 && <span className="text-micro text-muted">· {webRunsDroppedCount()} older run(s) dropped from the log</span>}
        </div>

        {problem && (
          <p className="flex items-start gap-2 rounded-xs border border-amber-500/40 px-3 py-2 text-caption text-amber-600">
            <AlertCircle size={14} className="mt-0.5" /> {problem}
          </p>
        )}

        {run && (
          <div className="space-y-4 border-t border-border/60 pt-4">
            <div
              className={cn(
                "rounded-xs border px-3 py-2 text-caption",
                run.insufficientEvidence ? "border-amber-500/40 text-amber-600" : "border-border/60 text-muted",
              )}
            >
              <span className="text-bone">Run summary. </span>
              {run.summary}
            </div>

            {run.providerUnavailable && (
              <p className="text-caption text-muted">Nothing was retrieved: {run.providerUnavailable}.</p>
            )}

            <div>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-caption text-muted hover:text-bone"
                onClick={() => setShowPlan((current) => !current)}
              >
                <ChevronDown size={13} className={cn("transition-transform", showPlan && "rotate-180")} />
                Search plan ({run.plan.queries.length} queries)
              </button>
              {showPlan && (
                <div className="mt-2 space-y-1">
                  <p className="text-micro text-muted">{run.plan.rationale}</p>
                  <ul className="space-y-0.5">
                    {run.plan.queries.map((query) => (
                      <li key={query} className="font-mono text-caption text-bone">
                        {query}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div>
              <h4 className="text-micro text-muted">Retrieved sources ({run.sources.length})</h4>
              {run.sources.length === 0 ? (
                <p className="mt-1 text-caption text-muted">No page was retrieved in this run.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {run.sources.map((source) => (
                    <li key={source.id} className="rounded-xs border border-border/60 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 text-body-sm text-bone hover:text-accent"
                        >
                          {source.title} <ExternalLink size={12} />
                        </a>
                        <span className={cn("rounded-xs border px-1.5 py-0.5 text-micro", kindClass(source.kind))}>{source.kind}</span>
                        {!source.representative && (
                          <span className="text-micro text-muted">duplicate of {source.duplicates[0] ? shortDigest(source.duplicates[0]) : "another source"}</span>
                        )}
                        {source.textTruncated && <span className="text-micro text-amber-600">text was truncated at the extraction cap</span>}
                      </div>
                      <p className="mt-1 text-micro text-muted">{source.kindBasis}</p>
                      <p className="mt-1 text-micro text-muted">
                        {source.method} · fetched {timeOf(source.retrievedAt)} · {source.contentType} · {source.text.length.toLocaleString()} chars ·{" "}
                        {source.sanitisedElements} element(s) stripped before extraction · {source.linksNotFollowed} outbound link(s) not followed
                      </p>
                      <p className="mt-0.5 font-mono text-micro text-muted">
                        text {shortDigest(source.contentHash)} · raw {shortDigest(source.rawHash)}
                        {source.publishedAt ? ` · published ${source.publishedAt}` : " · no publication date stated"}
                        {source.publisher ? ` · ${source.publisher}` : ""}
                        {source.author ? ` · ${source.author}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {refusals.length > 0 && (
              <div>
                <h4 className="text-micro text-muted">Refused or failed ({refusals.length})</h4>
                <ul className="mt-2 space-y-1">
                  {refusals.map((failure, index) => (
                    <li key={`${failure.url}-${index}`} className="text-caption text-muted">
                      <span className="font-mono text-bone">{failure.url}</span> — {failure.code}: {failure.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h4 className="text-micro text-muted">Claims bound to retrieved text ({run.claims.length})</h4>
              {run.claims.length === 0 ? (
                <p className="mt-1 text-caption text-muted">
                  {synthesis.trim().length === 0
                    ? "No synthesis was provided, so no claim was judged. Retrieval alone does not make a claim."
                    : "No sentence in the synthesis was long enough to judge against retrieved text."}
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {run.claims.map((claim, index) => (
                    <li key={`${claim.claim}-${index}`} className="rounded-xs border border-border/60 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("rounded-xs border px-1.5 py-0.5 text-micro", statusClass(claim.status))}>{claim.status}</span>
                        <span className="text-micro text-muted">overlap {(claim.overlap * 100).toFixed(0)}%</span>
                        <span className="text-micro text-muted">
                          {claim.independentSourceIds.length} independent source(s)
                        </span>
                      </div>
                      <p className="mt-1 text-caption text-bone">{claim.claim}</p>
                      {claim.supportingSourceIds.length > 0 && (
                        <p className="mt-1 text-micro text-muted">
                          supporting:{" "}
                          {claim.supportingSourceIds.map((id) => {
                            const source = run.sources.find((candidate) => candidate.id === id);
                            return source ? (
                              <a
                                key={id}
                                href={source.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="mr-2 inline-flex items-center gap-1 hover:text-accent"
                              >
                                {source.title.slice(0, 60)} <ExternalLink size={10} />
                              </a>
                            ) : (
                              <span key={id} className="mr-2 font-mono">
                                {shortDigest(id)}
                              </span>
                            );
                          })}
                        </p>
                      )}
                      {claim.notes.map((note) => (
                        <p key={note} className="mt-1 text-micro text-amber-600">
                          {note}
                        </p>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {run.conflicts.length > 0 && (
              <div>
                <h4 className="text-micro text-muted">Conflicts between sources ({run.conflicts.length})</h4>
                <ul className="mt-2 space-y-1">
                  {run.conflicts.map((conflict, index) => (
                    <li key={`${conflict.kind}-${index}`} className="text-caption text-muted">
                      <span className="text-bone">{conflict.kind}</span>: {conflict.reason}
                      {conflict.claimB && (
                        <span className="block text-micro">
                          “{conflict.claimA}” / “{conflict.claimB}”
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
