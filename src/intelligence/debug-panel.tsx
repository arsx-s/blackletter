import { useState, useEffect, useCallback } from "react";
import { blackletter } from "./orchestrator";
import type { DevModeState } from "./types";
import { X, RefreshCw, BookOpen, BarChart3, Clock, Sparkles, AlertCircle, Search, Check, Lightbulb } from "lucide-react";

export function DevModePanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [devState, setDevState] = useState<DevModeState>(blackletter.getDevModeState());
  const [activeTab, setActiveTab] = useState<"overview" | "intent" | "subject" | "profile" | "quality" | "history">("overview");

  const refresh = useCallback(() => {
    setDevState(blackletter.getDevModeState());
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        blackletter.toggleDevMode();
        setIsOpen((p) => !p);
        refresh();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [refresh]);

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [isOpen, refresh]);

  if (!isOpen) return null;

  const state = devState;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-[480px] max-h-[600px] bg-[#0a0a0f] border border-[#1e1e2e] rounded-xl shadow-2xl overflow-hidden font-mono text-[11px]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#12121a] border-b border-[#1e1e2e]">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-emerald-400" />
          <span className="text-[12px] font-semibold text-emerald-300">BIO Debug</span>
          <span className="text-[10px] text-muted/50 px-1.5 py-0.5 rounded bg-[#1a1a2e]">
            v3.0
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="p-1 rounded hover:bg-[#1e1e2e] text-muted/50 hover:text-muted transition-colors"
          >
            <RefreshCw size={12} />
          </button>
          <button
            onClick={() => { setIsOpen(false); }}
            className="p-1 rounded hover:bg-[#1e1e2e] text-muted/50 hover:text-muted transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#1e1e2e] bg-[#0e0e16]">
        {[
          { id: "overview" as const, label: "Overview", icon: BarChart3 },
          { id: "intent" as const, label: "Intent", icon: Search },
          { id: "subject" as const, label: "Subject", icon: BookOpen },
          { id: "profile" as const, label: "Profile", icon: Lightbulb },
          { id: "quality" as const, label: "Quality", icon: Check },
          { id: "history" as const, label: "History", icon: Clock },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-emerald-400 text-emerald-300 bg-emerald-400/5"
                : "border-transparent text-muted/50 hover:text-muted/80"
            }`}
          >
            <tab.icon size={10} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-3 overflow-y-auto max-h-[460px] space-y-2">
        {activeTab === "overview" && (
          <div className="space-y-2">
            <MetricRow label="Pipeline Time" value={`${state.pipelineTimeMs}ms`} icon={Clock} />
            <MetricRow label="API Latency" value={`${state.apiLatencyMs}ms`} icon={BarChart3} />
            <MetricRow label="Dev Mode" value={state.enabled ? "Enabled" : "Disabled"} icon={Sparkles} />
            <MetricRow label="History Entries" value={`${state.history.length}`} icon={RefreshCw} />
            {state.lastIntent && (
              <MetricRow label="Last Intent" value={`${state.lastIntent.intent} (${(state.lastIntent.confidence * 100).toFixed(0)}%)`} icon={Search} />
            )}
            {state.lastSubject && (
              <MetricRow label="Last Subject" value={state.lastSubject.subjectName} icon={BookOpen} />
            )}
            {state.lastQualityScore && (
              <MetricRow label="Quality Score" value={`${(state.lastQualityScore.overall * 100).toFixed(0)}%`} icon={Check} />
            )}
          </div>
        )}

        {activeTab === "intent" && state.lastIntent && (
          <div className="space-y-1.5">
            <DetailRow label="Detected Intent" value={state.lastIntent.intent} />
            <DetailRow label="Confidence" value={`${(state.lastIntent.confidence * 100).toFixed(1)}%`} />
            <DetailRow label="Sub-Intent" value={state.lastIntent.subIntent || "None"} />
            <div className="mt-2 pt-2 border-t border-[#1e1e2e]">
              <span className="text-[10px] text-muted/40">Intent Detection Object</span>
              <pre className="mt-1 text-[10px] text-muted/60 bg-[#0a0a12] p-2 rounded overflow-x-auto">
                {JSON.stringify(state.lastIntent, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {activeTab === "subject" && state.lastSubject && (
          <div className="space-y-1.5">
            <DetailRow label="Detected Subject" value={state.lastSubject.subjectName} />
            <DetailRow label="Subject ID" value={state.lastSubject.subject} />
            <DetailRow label="Confidence" value={`${(state.lastSubject.confidence * 100).toFixed(1)}%`} />
            <div className="mt-2 pt-2 border-t border-[#1e1e2e]">
              <span className="text-[10px] text-muted/40">All Subject Scores</span>
              <div className="mt-1 space-y-0.5">
                {Object.entries(state.lastSubject.allScores)
                  .filter(([, s]) => s > 0)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 10)
                  .map(([subj, score]) => (
                    <div key={subj} className="flex items-center justify-between text-[10px]">
                      <span className="text-muted/60 capitalize">{subj.replace(/-/g, " ")}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-[#1a1a2e] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500/60 rounded-full"
                            style={{ width: `${Math.min(100, (score / 15) * 100)}%` }}
                          />
                        </div>
                        <span className="text-muted/40 w-6 text-right">{score}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "profile" && state.lastProfile && (
          <div className="space-y-1.5">
            <DetailRow label="Teaching Mode" value={state.lastProfile.teachingMode} />
            <DetailRow label="Difficulty" value={state.lastProfile.difficulty} />
            <DetailRow label="Output Format" value={state.lastProfile.outputFormat} />
            <DetailRow label="Quality Threshold" value={`${(state.lastProfile.qualityThreshold * 100).toFixed(0)}%`} />
            {state.lastProfile.prerequisites.length > 0 && (
              <div className="mt-2 pt-2 border-t border-[#1e1e2e]">
                <span className="text-[10px] text-muted/40">Detected Knowledge Gaps</span>
                {state.lastProfile.prerequisites.map((gap, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] mt-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${gap.isMissing ? "bg-amber-400" : "bg-emerald-400"}`} />
                    <span className="text-muted/70">{gap.concept}</span>
                    <span className="text-muted/40">{gap.isMissing ? "(missing)" : "(known)"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "quality" && state.lastQualityScore && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted/40">Overall Quality</span>
              <span className={`text-[14px] font-bold ${state.lastQualityScore.passed ? "text-emerald-400" : "text-red-400"}`}>
                {(state.lastQualityScore.overall * 100).toFixed(0)}%
              </span>
            </div>
            <QualityBar label="Correctness" score={state.lastQualityScore.correctness} />
            <QualityBar label="Completeness" score={state.lastQualityScore.completeness} />
            <QualityBar label="Readability" score={state.lastQualityScore.readability} />
            <QualityBar label="Structure" score={state.lastQualityScore.structure} />
            <QualityBar label="Logical Flow" score={state.lastQualityScore.logicalFlow} />
            <QualityBar label="Examples" score={state.lastQualityScore.examples} />
            <QualityBar label="Formatting" score={state.lastQualityScore.formatting} />
            {state.lastQualityScore.issues.length > 0 && (
              <div className="mt-2 pt-2 border-t border-[#1e1e2e]">
                <span className="text-[10px] text-red-400/80">Issues Found</span>
                {state.lastQualityScore.issues.map((issue, i) => (
                  <div key={i} className="text-[10px] text-red-400/60 mt-0.5">• {issue}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "history" && (
          <div className="space-y-1.5">
            {state.history.length === 0 && (
              <span className="text-[10px] text-muted/40">No history yet. Process a query first.</span>
            )}
            {state.history.slice(0, 10).map((entry, i) => (
              <div key={i} className="p-2 rounded bg-[#0a0a12] border border-[#1a1a2e]">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted/60 truncate max-w-[200px]">{entry.query}</span>
                  <span className="text-muted/40">{entry.pipelineTimeMs}ms</span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-[9px] text-muted/40">
                  <span>{entry.intent.intent}</span>
                  <span>•</span>
                  <span>{entry.subject.subjectName}</span>
                  <span>•</span>
                  <span>Q: {(entry.qualityScore.overall * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 bg-[#12121a] border-t border-[#1e1e2e] text-[9px] text-muted/30 flex items-center justify-between">
        <span>Ctrl+Shift+D to toggle</span>
        <span>BIO v3.0 — BlackLetter Intelligence Orchestrator</span>
      </div>
    </div>
  );
}

function MetricRow({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="flex items-center justify-between p-1.5 rounded bg-[#0a0a12] border border-[#1a1a2e]">
      <div className="flex items-center gap-2">
        <Icon size={10} className="text-muted/40" />
        <span className="text-[10px] text-muted/60">{label}</span>
      </div>
      <span className="text-[10px] text-emerald-300/80 font-medium">{value}</span>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between p-1.5 rounded bg-[#0a0a12] border border-[#1a1a2e]">
      <span className="text-[10px] text-muted/60">{label}</span>
      <span className="text-[10px] text-muted/80 font-medium">{value}</span>
    </div>
  );
}

function QualityBar({ label, score }: { label: string; score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted/60 w-20">{label}</span>
      <div className="flex-1 h-2 bg-[#1a1a2e] rounded-full overflow-hidden">
        <div className={`h-full ${color}/60 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted/50 w-8 text-right">{pct}%</span>
    </div>
  );
}
