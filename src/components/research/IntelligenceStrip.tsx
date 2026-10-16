import { useMemo, useState } from "react";
import {
  Activity, AlertCircle, Check, ChevronDown, ChevronRight, Cpu, FileText,
  Layers, ShieldCheck, X,
} from "lucide-react";
import type { TabIntelligence } from "../../types/workspace";
import { confidenceLabelOrNull } from "../../pipeline/scoring";
import { formatLocator } from "../../pipeline/grounding";
import { CAVEAT, describeEvidenceCoverage } from "../../eval/calibration";
import { cn } from "../../lib/utils";

function pct(value: number): string {
  return `${Math.round(value)}%`;
}

/** A confidence component that may not have been measurable. */
function pctOrAbsent(value: number | null | undefined): string {
  return typeof value === "number" ? pct(value) : "not measured";
}

export function IntelligenceStrip({ intelligence }: { intelligence: TabIntelligence | null | undefined }) {
  const [traceOpen, setTraceOpen] = useState(false);
  const [chunksOpen, setChunksOpen] = useState(false);
  const [citationsOpen, setCitationsOpen] = useState(false);

  const label = useMemo(
    () => confidenceLabelOrNull(intelligence?.confidence?.score),
    [intelligence?.confidence],
  );

  if (!intelligence) return null;

  const confidence = intelligence.confidence;
  const faithfulness = intelligence.faithfulness;
  const hallucination = intelligence.hallucination;
  const grounding = intelligence.groundingReport ?? null;
  const citations = grounding?.citations ?? null;
  const trace = intelligence.trace ?? [];
  const chunks = intelligence.retrievedChunks ?? [];
  const sources = intelligence.groundedSources ?? [];

  // A chunk is verified when it was reproduced from its source text. Chunks
  // stored before locators existed have neither field, so they are counted as
  // unverified rather than quietly assumed good.
  const unverifiable = new Set((grounding?.unverifiable ?? []).map((entry) => entry.chunkId));
  const unverifiedCount = chunks.filter((chunk) => !chunk.location || unverifiable.has(chunk.id)).length;
  const verifiedCount = chunks.length - unverifiedCount;

  const unresolvedCitations = citations?.unresolved ?? [];
  const weakCitations = citations?.weakCitations ?? [];
  const unsupportedClaims = faithfulness?.unsupportedClaims?.length ?? 0;

  // Evidence coverage (Mission 5's harness vocabulary) travels with the
  // confidence number, because the number alone reads like a probability.
  const topRetrievalScore = chunks.reduce<number | null>(
    (best, chunk) => (best === null || chunk.score > best ? chunk.score : best),
    null,
  );
  const coverage = describeEvidenceCoverage({
    retrievedChunkCount: chunks.length,
    topRetrievalScore,
    faithfulnessScore: faithfulness?.score ?? null,
  });

  const metrics: Array<{ icon: typeof Cpu; label: string; value: string; accent?: boolean; warn?: boolean }> = [
    {
      icon: Activity,
      label: "Confidence",
      value: confidence?.score != null ? `${confidence.score}/100 ${label ?? ""}`.trim() : "not measured",
      accent: confidence?.score != null,
    },
    {
      icon: ShieldCheck,
      label: "Faithfulness",
      value: faithfulness?.score != null ? pct(faithfulness.score * 100) : "not measured",
      warn: faithfulness?.score != null && faithfulness.score < 0.6,
    },
    {
      icon: FileText,
      label: "Citations",
      value: citations ? `${citations.resolved.length}/${citations.markers.length} resolved` : "—",
      warn: unresolvedCitations.length > 0 || weakCitations.length > 0,
    },
    {
      icon: Layers,
      label: "Evidence verified",
      value: chunks.length > 0 ? `${verifiedCount}/${chunks.length}` : "—",
      warn: unverifiedCount > 0,
    },
    {
      icon: AlertCircle,
      label: "Unsupported claims",
      value: faithfulness?.score != null ? `${unsupportedClaims}` : "not measured",
      warn: unsupportedClaims > 0,
    },
    {
      icon: Cpu,
      label: "Latency",
      value: intelligence.telemetry?.totalMs != null ? `${Math.round(intelligence.telemetry.totalMs)}ms` : "—",
    },
  ];

  return (
    <div className="border border-border/70 rounded-sm bg-bone/[0.02]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">Intelligence</span>
        <span className="font-mono text-[10px] text-faint">{intelligence.telemetry?.runId ?? ""}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-border/30">
        {metrics.map((m) => (
          <div key={m.label} className="flex items-center gap-2 px-3 py-2 bg-background/60">
            <m.icon size={12} className={cn("shrink-0", m.warn ? "text-accent" : "text-muted/70")} />
            <div className="min-w-0">
              <p className="font-sans text-[10px] text-muted/70 leading-tight">{m.label}</p>
              <p className={cn("font-mono text-xs leading-tight truncate", m.accent ? "text-accent" : m.warn ? "text-accent" : "text-bone/80")}>
                {m.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {confidence && (
        <div className="px-3 py-2 border-t border-border/50 space-y-1.5">
          {confidence.components.map((component) => (
            <div key={component.name} className="flex items-center gap-2" title={`${component.basis}${component.reason ? ` — not measured: ${component.reason}` : ""}`}>
              <span className="font-sans text-[10px] text-muted/70 w-24 shrink-0">
                {component.name === "answerQuality" ? "Completeness" : component.name[0].toUpperCase() + component.name.slice(1)}
              </span>
              <div className="flex-1 h-1 bg-border/40 rounded-full overflow-hidden">
                {component.value !== null && (
                  <div className="h-full bg-accent/80 rounded-full transition-all" style={{ width: pct(component.value * 100) }} />
                )}
              </div>
              <span className={cn("font-mono text-[10px] w-16 text-right", component.value === null ? "text-muted/60" : "text-muted/80")}>
                {pctOrAbsent(component.value === null ? null : component.value * 100)}
              </span>
            </div>
          ))}
          {confidence.score === null && (
            <p className="font-sans text-[10px] text-muted leading-snug pt-0.5">
              Nothing in this run could be measured, so no confidence score is shown.
            </p>
          )}
          <div className="pt-1 space-y-1">
            <p className="font-sans text-[10px] text-muted leading-snug">
              Evidence coverage: <span className="font-medium text-bone/80">{coverage.level}</span>
              <span className="text-muted/70"> — {coverage.criteria}</span>
            </p>
            <details>
              <summary className="cursor-pointer font-sans text-[10px] text-muted/80 hover:text-muted focus-ring rounded-xs">
                What the confidence number means — and what it does not
              </summary>
              <div className="pt-1 space-y-1">
                <p className="font-sans text-[10px] text-muted/80 leading-snug">{CAVEAT}</p>
                <p className="font-sans text-[10px] text-muted/80 leading-snug">
                  Inputs are computed by this application: retrieval overlap, faithfulness of the answer to the
                  retrieved text, answer length, and retry stability. A confidence statement written by the model
                  is not one of them, and none of them is a measured probability of correctness.
                </p>
              </div>
            </details>
          </div>
        </div>
      )}

      {hallucination?.present && (
        <div className="px-3 py-2 border-t border-border/50 bg-accent/[0.06]">
          <p className="font-sans text-[11px] text-accent mb-1">
            <AlertCircle size={11} className="inline mr-1 -mt-0.5" />
            {hallucination.flaggedClaims.length} unsupported claim(s) detected
          </p>
          <ul className="space-y-0.5">
            {hallucination.flaggedClaims.slice(0, 3).map((c, i) => (
              <li key={i} className="font-sans text-[10px] text-muted leading-snug">— {c}</li>
            ))}
          </ul>
        </div>
      )}

      {(unresolvedCitations.length > 0 || weakCitations.length > 0 || unverifiedCount > 0) && (
        <div className="px-3 py-2 border-t border-border/50 bg-accent/[0.06] space-y-1">
          {unresolvedCitations.length > 0 && (
            <p className="font-sans text-[11px] text-accent">
              <X size={11} className="inline mr-1 -mt-0.5" />
              {unresolvedCitations.length} citation(s) point at evidence that does not exist:{" "}
              <span className="font-mono">
                {[...new Set(unresolvedCitations.map((c) => c.marker))].slice(0, 4).join(" ")}
              </span>
            </p>
          )}
          {weakCitations.length > 0 && (
            <p className="font-sans text-[11px] text-accent">
              <AlertCircle size={11} className="inline mr-1 -mt-0.5" />
              {weakCitations.length} citation(s) resolve to evidence that scored below the grounding threshold.
            </p>
          )}
          {unverifiedCount > 0 && (
            <p className="font-sans text-[11px] text-accent">
              <AlertCircle size={11} className="inline mr-1 -mt-0.5" />
              {unverifiedCount} chunk(s) could not be reproduced from their source and are not shown as evidence.
            </p>
          )}
        </div>
      )}

      {citations && citations.resolved.length > 0 && (
        <div className="border-t border-border/50">
          <button
            onClick={() => setCitationsOpen(!citationsOpen)}
            className="w-full flex items-center gap-1.5 px-3 py-2 hover:bg-bone/[0.03] text-left"
          >
            {citationsOpen ? <ChevronDown size={11} className="text-muted" /> : <ChevronRight size={11} className="text-muted" />}
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted">Citations</span>
            <span className="ml-auto font-mono text-[10px] text-faint">
              {citations.resolved.length} resolved
              {citations.citedClaimRatio !== null ? ` · ${Math.round(citations.citedClaimRatio * 100)}% of claims cited` : ""}
            </span>
          </button>
          {citationsOpen && (
            <ul className="px-3 pb-2 space-y-1">
              {citations.resolved.map((citation, index) => (
                <li key={`${citation.marker}-${index}`} className="flex items-start gap-2">
                  <span className="font-mono text-[10px] text-accent shrink-0 w-8">{citation.marker}</span>
                  <span className="flex-1 min-w-0 font-sans text-[10px] text-bone/70 leading-snug">
                    {formatLocator(citation.location)}
                    {citation.score !== null && (
                      <span className={cn("font-mono ml-1", citation.grounded ? "text-muted/70" : "text-accent")}>
                        · score {Math.round(citation.score * 100)}%
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {sources.length > 0 && (
        <div className="px-3 py-2 border-t border-border/50 flex flex-wrap gap-1.5">
          {sources.map((s) => (
            <span
              key={s.name}
              title={
                s.pages && s.pages.length > 0
                  ? `best score ${Math.round(s.bestScore * 100)}% · pages ${s.pages.join(", ")}`
                  : `best score ${Math.round(s.bestScore * 100)}%`
              }
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-bone/[0.04] border border-border/60 font-sans text-[10px] text-bone/70"
            >
              <Check size={9} className="text-accent" />
              {s.name}
              {s.pages && s.pages.length > 0 && (
                <span className="font-mono text-[9px] text-muted/70">p{s.pages.join(",")}</span>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="border-t border-border/50">
        <button
          onClick={() => setTraceOpen(!traceOpen)}
          className="w-full flex items-center gap-1.5 px-3 py-2 hover:bg-bone/[0.03] text-left"
        >
          {traceOpen ? <ChevronDown size={11} className="text-muted" /> : <ChevronRight size={11} className="text-muted" />}
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">Reasoning trace</span>
          <span className="ml-auto font-mono text-[10px] text-faint">{trace.filter((s) => s.status === "success").length}/{trace.length} stages</span>
        </button>
        {traceOpen && (
          <ol className="px-3 pb-2 space-y-1">
            {trace.map((stage) => (
              <li key={stage.id} className="flex items-center gap-2">
                {stage.status === "success" ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                ) : stage.status === "skipped" ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-muted/40 shrink-0" />
                ) : stage.status === "error" ? (
                  <X size={9} className="text-accent shrink-0" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full border border-muted/50 shrink-0" />
                )}
                <span className="flex-1 min-w-0 truncate font-sans text-[10px] text-bone/70">{stage.name}</span>
                <span className="font-mono text-[10px] text-faint">
                  {stage.status === "skipped" ? "skipped" : stage.status === "error" ? "failed" : `${stage.durationMs}ms`}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="border-t border-border/50">
        <button
          onClick={() => setChunksOpen(!chunksOpen)}
          className="w-full flex items-center gap-1.5 px-3 py-2 hover:bg-bone/[0.03] text-left"
        >
          {chunksOpen ? <ChevronDown size={11} className="text-muted" /> : <ChevronRight size={11} className="text-muted" />}
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">Retrieved chunks</span>
        </button>
        {chunksOpen && (
          <ul className="px-3 pb-2 space-y-2">
            {chunks.map((c) => {
              const unverified = !c.location || unverifiable.has(c.id);
              return (
                <li key={c.id} className="border border-border/50 rounded-sm p-2 bg-bone/[0.02]">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="flex-1 min-w-0 truncate font-sans text-[10px] text-bone/80">{c.source}</span>
                    {unverified && <span className="font-mono text-[9px] text-accent shrink-0">unverified</span>}
                    <span className="font-mono text-[10px] text-muted/70">{c.sourceType}</span>
                    <span className="font-mono text-[10px] text-accent">{Math.round(c.score * 100)}%</span>
                  </div>
                  <p className="font-mono text-[9px] text-muted/60 mb-1">{c.id}</p>
                  <p className="font-sans text-[10px] text-muted leading-snug line-clamp-2">{c.text}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
