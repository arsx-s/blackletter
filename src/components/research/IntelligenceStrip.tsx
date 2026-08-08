import { useMemo, useState } from "react";
import {
  Activity, AlertCircle, Check, ChevronDown, ChevronRight, Cpu, FileText,
  Layers, ShieldCheck, X,
} from "lucide-react";
import type { TabIntelligence } from "../../types/workspace";
import { confidenceLabel } from "../../pipeline/scoring";
import { cn } from "../../lib/utils";

function pct(value: number): string {
  return `${Math.round(value)}%`;
}

export function IntelligenceStrip({ intelligence }: { intelligence: TabIntelligence | null | undefined }) {
  const [traceOpen, setTraceOpen] = useState(false);
  const [chunksOpen, setChunksOpen] = useState(false);

  const label = useMemo(
    () => (intelligence?.confidence ? confidenceLabel(intelligence.confidence.score) : null),
    [intelligence?.confidence],
  );

  if (!intelligence) return null;

  const confidence = intelligence.confidence;
  const faithfulness = intelligence.faithfulness;
  const hallucination = intelligence.hallucination;
  const trace = intelligence.trace ?? [];
  const chunks = intelligence.retrievedChunks ?? [];
  const sources = intelligence.groundedSources ?? [];

  const metrics: Array<{ icon: typeof Cpu; label: string; value: string; accent?: boolean; warn?: boolean }> = [
    {
      icon: Activity,
      label: "Confidence",
      value: confidence ? `${confidence.score}/100 ${label ?? ""}` : "—",
      accent: !!confidence,
    },
    {
      icon: ShieldCheck,
      label: "Faithfulness",
      value: faithfulness?.score != null ? pct(faithfulness.score * 100) : "—",
      warn: faithfulness?.score != null && faithfulness.score < 0.6,
    },
    {
      icon: AlertCircle,
      label: "Hallucination",
      value: hallucination?.present ? `Flagged ${hallucination.flaggedClaims.length}` : "None detected",
      warn: !!hallucination?.present,
    },
    {
      icon: FileText,
      label: "Grounded sources",
      value: `${sources.length}`,
    },
    {
      icon: Layers,
      label: "Retrieved chunks",
      value: `${chunks.length}`,
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
        <span className="font-mono text-[10px] text-muted/60">{intelligence.telemetry?.runId ?? ""}</span>
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
          {(
            [
              ["Retrieval", confidence.breakdown.retrieval],
              ["Faithfulness", confidence.breakdown.faithfulness],
              ["Completeness", confidence.breakdown.completeness],
              ["Stability", confidence.breakdown.stability],
            ] as const
          ).map(([name, value]) => (
            <div key={name} className="flex items-center gap-2">
              <span className="font-sans text-[10px] text-muted/70 w-20 shrink-0">{name}</span>
              <div className="flex-1 h-1 bg-border/40 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent/80 rounded-full transition-all"
                  style={{ width: pct(value) }}
                />
              </div>
              <span className="font-mono text-[10px] text-muted/80 w-9 text-right">{Math.round(value)}%</span>
            </div>
          ))}
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

      {sources.length > 0 && (
        <div className="px-3 py-2 border-t border-border/50 flex flex-wrap gap-1.5">
          {sources.map((s) => (
            <span
              key={s.name}
              title={`score ${Math.round(s.bestScore * 100)}%`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-bone/[0.04] border border-border/60 font-sans text-[10px] text-bone/70"
            >
              <Check size={9} className="text-accent" />
              {s.name}
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
          <span className="ml-auto font-mono text-[10px] text-muted/60">{trace.filter((s) => s.status === "success").length}/{trace.length} stages</span>
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
                <span className="font-mono text-[10px] text-muted/60">
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
            {chunks.map((c) => (
              <li key={c.id} className="border border-border/50 rounded-sm p-2 bg-bone/[0.02]">
                <div className="flex items-center gap-2 mb-1">
                  <span className="flex-1 min-w-0 truncate font-sans text-[10px] text-bone/80">{c.source}</span>
                  <span className="font-mono text-[10px] text-muted/70">{c.sourceType}</span>
                  <span className="font-mono text-[10px] text-accent">{Math.round(c.score * 100)}%</span>
                </div>
                <p className="font-sans text-[10px] text-muted leading-snug line-clamp-2">{c.text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
