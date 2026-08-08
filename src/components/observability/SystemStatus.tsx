import { useEffect, useState } from "react";
import { Activity, AlertCircle, BarChart3, Layers, RefreshCw, Terminal, Trash2 } from "lucide-react";
import { useWorkspaceStore, workspaceStore } from "../../stores/use-workspace";
import {
  clearObservability,
  confidenceTrend,
  dailyUsage,
  getErrors,
  getRuns,
  overallStats,
  perModel,
  perWorkspace,
  subscribeObservability,
} from "../../observability/metrics";
import { cn } from "../../lib/utils";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-border/70 rounded-sm bg-bone/[0.02] px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted/70">{label}</p>
      <p className="font-mono text-xl text-bone mt-1">{value}</p>
      {sub && <p className="font-sans text-[10px] text-muted/70 mt-0.5">{sub}</p>}
    </div>
  );
}

function Bar({ value, max, accent }: { value: number; max: number; accent?: boolean }) {
  return (
    <div className="flex-1 flex flex-col justify-end gap-1 min-w-0">
      <div className="flex-1 flex items-end">
        <div
          className={cn("w-full rounded-sm min-h-[2px] transition-all", accent ? "bg-accent/70" : "bg-border/70")}
          style={{ height: max > 0 ? `${Math.max((value / max) * 100, 3)}%` : "3%" }}
        />
      </div>
    </div>
  );
}

export function SystemStatus() {
  const state = useWorkspaceStore();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const unsub = subscribeObservability(() => setTick((t) => t + 1));
    return unsub;
  }, []);

  const stats = overallStats();
  const days = dailyUsage(14);
  const models = perModel();
  const workspaces = perWorkspace(Object.fromEntries(state.workspaces.map((w) => [w.id, w.name])));
  const trend = confidenceTrend(40);
  const errors = getErrors().slice(0, 50);
  const runs = getRuns();
  const maxDayRuns = Math.max(...days.map((d) => d.runs), 1);
  const maxTrend = Math.max(...trend.map((t) => t.confidence), 1);

  const refresh = () => {
    setTick((t) => t + 1);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-semibold text-bone">System Status</h1>
            <p className="font-sans text-xs text-muted mt-1">Live analytics for every research run — latency, tokens, confidence, and errors.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-border font-sans text-xs text-bone/70 hover:bg-bone/5 transition-colors"
            >
              <RefreshCw size={12} /> Refresh
            </button>
            <button
              onClick={() => void clearObservability().then(refresh)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-border font-sans text-xs text-bone/70 hover:bg-bone/5 transition-colors"
            >
              <Trash2 size={12} /> Clear data
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          <StatCard label="Runs" value={`${stats.runs}`} sub="total pipeline runs" />
          <StatCard label="Errors" value={`${stats.errors}`} sub="logged failures" />
          <StatCard label="Avg latency" value={`${stats.avgLatencyMs}ms`} sub={`p95 ${stats.p95LatencyMs}ms`} />
          <StatCard label="Tokens" value={`${(stats.tokensIn + stats.tokensOut).toLocaleString()}`} sub={`${stats.tokensIn.toLocaleString()} in / ${stats.tokensOut.toLocaleString()} out`} />
          <StatCard label="Avg confidence" value={stats.avgConfidence != null ? `${stats.avgConfidence}%` : "—"} />
          <StatCard label="Avg faithfulness" value={stats.avgFaithfulness != null ? `${Math.round(stats.avgFaithfulness * 100)}%` : "—"} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="border border-border/70 rounded-sm bg-bone/[0.02] p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted mb-3">Daily runs (14 days)</p>
            <div className="h-24 flex items-end gap-1">
              {days.map((d) => (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${d.day}: ${d.runs} runs, ${d.errors} errors`}>
                  <Bar value={d.runs} max={maxDayRuns} accent={d.errors > 0} />
                  <span className="font-mono text-[8px] text-muted/50">{d.day.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-border/70 rounded-sm bg-bone/[0.02] p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted mb-3">Confidence trend (last runs)</p>
            {trend.length === 0 ? (
              <p className="font-sans text-xs text-muted/60">No runs yet — start a research session to see trends.</p>
            ) : (
              <div className="h-24 flex items-end gap-0.5">
                {trend.map((t, i) => (
                  <div
                    key={i}
                    title={`${new Date(t.at).toLocaleTimeString()} — ${t.confidence}%`}
                    className="flex-1 rounded-sm bg-accent/50 min-w-[2px] transition-all"
                    style={{ height: `${Math.max((t.confidence / maxTrend) * 100, 4)}%` }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="border border-border/70 rounded-sm bg-bone/[0.02]">
            <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Per model</p>
              <BarChart3 size={12} className="text-muted/60" />
            </div>
            {models.length === 0 ? (
              <p className="font-sans text-xs text-muted/60 px-4 py-6">No model data yet.</p>
            ) : (
              <table className="w-full font-sans text-xs">
                <thead>
                  <tr className="text-left font-mono text-[9px] uppercase tracking-wider text-muted/70">
                    <th className="px-4 py-2 font-normal">Model</th>
                    <th className="px-2 py-2 font-normal text-right">Runs</th>
                    <th className="px-2 py-2 font-normal text-right">Avg ms</th>
                    <th className="px-2 py-2 font-normal text-right">p95 ms</th>
                    <th className="px-4 py-2 font-normal text-right">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m) => (
                    <tr key={m.model} className="border-t border-border/40">
                      <td className="px-4 py-2 text-bone/80 truncate max-w-40">{m.model}</td>
                      <td className="px-2 py-2 text-muted text-right">{m.runs}</td>
                      <td className="px-2 py-2 text-muted text-right">{m.avgLatencyMs}</td>
                      <td className="px-2 py-2 text-muted text-right">{m.p95LatencyMs}</td>
                      <td className="px-4 py-2 text-right">{m.avgConfidence != null ? <span className="text-accent">{m.avgConfidence}%</span> : <span className="text-muted/50">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="border border-border/70 rounded-sm bg-bone/[0.02]">
            <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Per workspace</p>
              <Layers size={12} className="text-muted/60" />
            </div>
            {workspaces.length === 0 ? (
              <p className="font-sans text-xs text-muted/60 px-4 py-6">No workspace activity yet.</p>
            ) : (
              <table className="w-full font-sans text-xs">
                <thead>
                  <tr className="text-left font-mono text-[9px] uppercase tracking-wider text-muted/70">
                    <th className="px-4 py-2 font-normal">Workspace</th>
                    <th className="px-2 py-2 font-normal text-right">Runs</th>
                    <th className="px-4 py-2 font-normal text-right">Avg confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {workspaces.map((w) => (
                    <tr key={w.workspaceId} className="border-t border-border/40">
                      <td className="px-4 py-2 text-bone/80 truncate max-w-48">{w.name}</td>
                      <td className="px-2 py-2 text-muted text-right">{w.runs}</td>
                      <td className="px-4 py-2 text-right">{w.avgConfidence != null ? <span className="text-accent">{w.avgConfidence}%</span> : <span className="text-muted/50">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="border border-border/70 rounded-sm bg-bone/[0.02]">
            <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Recent runs</p>
              <Activity size={12} className="text-muted/60" />
            </div>
            {runs.length === 0 ? (
              <p className="font-sans text-xs text-muted/60 px-4 py-6">No runs recorded.</p>
            ) : (
              <ul className="max-h-64 overflow-y-auto">
                {runs.slice(0, 30).map((r) => (
                  <li key={r.runId} className="px-4 py-2 border-t border-border/40 flex items-center gap-3">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-accent/70" />
                    <div className="min-w-0 flex-1">
                      <p className="font-sans text-xs text-bone/80 truncate">{r.query}</p>
                      <p className="font-mono text-[9px] text-muted/60">{r.model} · {new Date(r.at).toLocaleString()}</p>
                    </div>
                    <span className="font-mono text-[10px] text-muted shrink-0">{r.totalMs}ms</span>
                    <span className="font-mono text-[10px] text-accent shrink-0 w-12 text-right">{r.confidence != null ? `${r.confidence}%` : "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border border-border/70 rounded-sm bg-bone/[0.02]">
            <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Error log</p>
              <AlertCircle size={12} className="text-muted/60" />
            </div>
            {errors.length === 0 ? (
              <p className="font-sans text-xs text-muted/60 px-4 py-6">No errors logged — clean bill of health.</p>
            ) : (
              <ul className="max-h-64 overflow-y-auto">
                {errors.map((e) => (
                  <li key={e.id} className="px-4 py-2 border-t border-border/40">
                    <p className="font-mono text-[10px] text-accent">{e.code}</p>
                    <p className="font-sans text-xs text-bone/80 mt-0.5">{e.message}</p>
                    <p className="font-mono text-[9px] text-muted/60 mt-0.5">{new Date(e.at).toLocaleString()}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="border border-border/70 rounded-sm bg-bone/[0.02] px-4 py-3 mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Terminal size={14} className="text-muted shrink-0" />
            <div>
              <p className="font-sans text-xs text-bone/80">Developer Mode</p>
              <p className="font-sans text-[10px] text-muted/70">Watch the live pipeline as it runs — stages, events, and prompt inspection.</p>
            </div>
          </div>
          <button
            onClick={() => workspaceStore.setPrefs({ developerMode: !state.prefs.developerMode })}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-sans text-xs font-medium transition-colors",
              state.prefs.developerMode ? "bg-accent text-surface" : "border border-border text-bone/70 hover:bg-bone/5",
            )}
          >
            <Activity size={12} /> {state.prefs.developerMode ? "Enabled" : "Enable"}
          </button>
        </div>
      </div>
    </div>
  );
}
