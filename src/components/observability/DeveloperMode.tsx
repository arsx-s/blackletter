import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, FileText, Loader2, Minus, X } from "lucide-react";
import { LAST_EVENTS, onPipelineEvent, stageNameFor } from "../../pipeline/trace";
import type { PipelineEvent } from "../../pipeline/trace";
import { useWorkspaceStore } from "../../stores/use-workspace";
import { cn } from "../../lib/utils";

const STAGE_ORDER = [
  "intent", "subject", "router", "document", "profile", "gaps",
  "retrieval", "scoring", "prompt", "openrouter", "quality",
  "evaluation", "formatting", "report", "response",
];

export function DeveloperMode() {
  const state = useWorkspaceStore();
  const [events, setEvents] = useState<PipelineEvent[]>(() => [...LAST_EVENTS]);
  const [promptOpen, setPromptOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = onPipelineEvent((event) => setEvents((prev) => [...prev.slice(-99), event]));
    return unsub;
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [events.length]);

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId) ?? null;
  const intel = activeTab?.intelligence;
  const runs = events.length > 0;
  const statuses: Record<PipelineEvent["status"], { icon: typeof Check; cls: string }> = {
    success: { icon: Check, cls: "text-accent" },
    skipped: { icon: Minus, cls: "text-muted/50" },
    error: { icon: X, cls: "text-accent" },
    running: { icon: Loader2, cls: "text-accent animate-spin" },
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-semibold text-bone">Developer Mode</h1>
          <p className="font-sans text-xs text-muted mt-1">
            Live pipeline feed: Question → Retrieval → Scoring → Prompt → OpenRouter → Evaluation → Formatting → Response.
          </p>
        </div>

        {!runs && !intel && (
          <div className="border border-border/70 rounded-sm bg-bone/[0.02] px-6 py-10 text-center">
            <Loader2 size={20} className="mx-auto text-muted/40 mb-3" />
            <p className="font-sans text-xs text-muted/70">No pipeline activity yet. Run a research session while this panel is open.</p>
          </div>
        )}

        {intel && (
          <div className="border border-border/70 rounded-sm bg-bone/[0.02] mb-6">
            <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Last run (session tab)</p>
              <span className="font-mono text-[10px] text-muted/60">{intel.telemetry?.runId}</span>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-wider text-muted/70 mb-1">Query</p>
                <p className="font-sans text-xs text-bone/80">{intel.telemetry?.query || activeTab?.topic || "—"}</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  ["Model", intel.telemetry?.model || "—"],
                  ["Total", intel.telemetry?.totalMs != null ? `${Math.round(intel.telemetry.totalMs)}ms` : "—"],
                  ["Retrieval", intel.telemetry?.retrievalMs != null ? `${Math.round(intel.telemetry.retrievalMs)}ms` : "—"],
                  ["Generation", intel.telemetry?.generationMs != null ? `${Math.round(intel.telemetry.generationMs)}ms` : "—"],
                  ["Tokens in", intel.telemetry?.tokensIn != null ? intel.telemetry.tokensIn.toLocaleString() : "—"],
                  ["Tokens out", intel.telemetry?.tokensOut != null ? intel.telemetry.tokensOut.toLocaleString() : "—"],
                  ["Chunks", intel.retrievedChunks?.length ?? 0],
                  ["Sources", intel.groundedSources?.length ?? 0],
                ].map(([label, value]) => (
                  <div key={label} className="border border-border/50 rounded-sm px-2.5 py-1.5 bg-bone/[0.02]">
                    <p className="font-mono text-[8px] uppercase tracking-wider text-muted/60">{label}</p>
                    <p className="font-mono text-xs text-bone/80 mt-0.5 truncate">{value}</p>
                  </div>
                ))}
              </div>
              {intel.trace && intel.trace.length > 0 && (
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-muted/70 mb-1">Stage trace</p>
                  <div className="flex flex-wrap gap-1.5">
                    {intel.trace.map((s) => (
                      <span
                        key={s.id}
                        title={`${s.name} — ${s.durationMs}ms`}
                        className={cn(
                          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border font-mono text-[9px]",
                          s.status === "success"
                            ? "border-accent/30 text-accent bg-accent/[0.06]"
                            : s.status === "skipped"
                              ? "border-border/50 text-muted/50"
                              : "border-border/50 text-muted",
                        )}
                      >
                        {s.status === "success" ? <Check size={8} /> : s.status === "skipped" ? <Minus size={8} /> : <X size={8} />}
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="border border-border/50 rounded-sm">
                <button
                  onClick={() => setPromptOpen(!promptOpen)}
                  className="w-full flex items-center gap-1.5 px-3 py-2 hover:bg-bone/[0.03] text-left"
                >
                  {promptOpen ? <ChevronDown size={11} className="text-muted" /> : <ChevronRight size={11} className="text-muted" />}
                  <FileText size={11} className="text-muted" />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted">Prompt inspection</span>
                </button>
                {promptOpen && (
                  <div className="px-3 pb-3">
                    <p className="font-sans text-[10px] text-muted/70 leading-relaxed">
                      The generated prompt for this run is assembled from the system instruction, retrieved evidence, workspace memory, and canvas context inside the Prompt Builder stage. Full prompt text is captured in the graph state during execution and shown here on future builds of this panel.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="border border-border/70 rounded-sm bg-bone/[0.02]">
          <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Live event feed</p>
            <span className="font-mono text-[10px] text-muted/60">{events.length} events buffered</span>
          </div>
          <div ref={listRef} className="max-h-[420px] overflow-y-auto">
            {events.length === 0 ? (
              <p className="font-sans text-xs text-muted/60 px-4 py-6">Waiting for the next run…</p>
            ) : (
              <ul>
                {events.map((e, i) => {
                  const S = statuses[e.status];
                  return (
                    <li key={`${e.runId}-${e.stageId}-${e.atMs}-${i}`} className="px-4 py-1.5 border-t border-border/40 flex items-center gap-2.5">
                      <S.icon size={10} className={S.cls} />
                      <span className="flex-1 min-w-0 truncate font-mono text-[10px] text-bone/70">{e.stageName}</span>
                      <span className="font-mono text-[9px] text-muted/50 truncate max-w-40">{e.runId}</span>
                      <span className="font-mono text-[9px] text-muted/60">{e.durationMs != null ? `${e.durationMs}ms` : e.status}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="mt-6">
          <p className="font-mono text-[9px] uppercase tracking-wider text-muted/60 mb-2">Pipeline stages</p>
          <div className="flex flex-wrap gap-1.5">
            {STAGE_ORDER.map((s) => (
              <span key={s} className="px-2 py-1 rounded-sm border border-border/50 font-mono text-[9px] text-muted/70">
                {stageNameFor(s as never)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
