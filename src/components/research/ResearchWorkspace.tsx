import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Columns, Cpu, FileText, Layout, Loader2, Plus, Search, UploadCloud, X } from "lucide-react";
import { useWorkspaceStore, workspaceStore } from "../../stores/use-workspace";
import { runPipeline } from "../../pipeline";
import { SubjectSelector } from "./SubjectSelector";
import { ModeSelector } from "./ModeSelector";
import { ResearchReport } from "./ResearchReport";
import { FollowUpQuestions } from "./FollowUpQuestions";
import { IntelligenceStrip } from "./IntelligenceStrip";
import { ReportExport } from "./ReportExport";
import { AiErrorBanner } from "../ui/ai-error-banner";
import { toast } from "../ui/toast";
import { RESEARCH_STAGES } from "../../lib/research";
import { deriveTabRecords, recordDerivedChange } from "../../integrity";
import { extractForUpload, describeFailure } from "../../pipeline/documentEngine";
import { MODEL_CATEGORIES, MODEL_CATALOG, modelForCategory, categoryForModel } from "../../config/models";

/** The catalogue's balanced-tier model doubles as the "Recommended" marker. */
const RECOMMENDED_MODEL = modelForCategory("balanced");
import { adaptiveEngine } from "../../teaching/adaptive-engine";
import { getReadableError } from "../../lib/error-utils";
import { isCancelledError } from "../../lib/cancellation";
import { isStopEngaged, loadStop, registerInFlight } from "../../control";
import type { AiError } from "../../services/ai";
import type { ExplanationMode } from "../../teaching/adaptive-engine";
import type { WorkspaceDocument } from "../../types/workspace";

const ACCEPTED_EXTENSIONS = [".txt", ".md", ".pdf", ".docx"];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function deriveTitle(topic: string): string {
  const clean = topic.trim().replace(/\s+/g, " ");
  if (!clean) return "Untitled Research";
  if (clean.length <= 42) return clean;
  return clean.slice(0, 39).trim() + "…";
}

export function ResearchWorkspace({ onNewSession }: { onNewSession: () => void }) {
  const state = useWorkspaceStore();
  const tab = state.tabs.find((t) => t.id === state.activeTabId) ?? null;
  const splitTab = state.prefs.splitTabId ? state.tabs.find((t) => t.id === state.prefs.splitTabId) ?? null : null;

  if (state.prefs.splitView && splitTab && tab && splitTab.id !== tab.id) {
    return <SplitResearch mainTabId={tab.id} sideTabId={splitTab.id} onNewSession={onNewSession} />;
  }

  if (!tab) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <FileText size={28} className="mx-auto text-faint mb-4" />
          <p className="font-display text-xl font-medium text-bone/80 mb-2">No session open</p>
          <p className="font-sans text-sm text-muted mb-6">Start a new research session to begin.</p>
          <button
            onClick={onNewSession}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-sm bg-accent text-surface font-sans text-xs font-medium"
          >
            <Plus size={13} /> New session
          </button>
        </div>
      </div>
    );
  }

  return <Session key={tab.id} tabId={tab.id} onNewSession={onNewSession} />;
}

function SplitResearch({ mainTabId, sideTabId, onNewSession }: { mainTabId: string; sideTabId: string; onNewSession: () => void }) {
  const state = useWorkspaceStore();
  const [ratio, setRatio] = useState(0.5);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const workspaceTabs = state.tabs.filter((t) => t.workspaceId === state.activeWorkspaceId);

  const onDividerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    const onMove = (ev: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const r = (ev.clientX - rect.left) / rect.width;
      setRatio(Math.min(Math.max(r, 0.2), 0.8));
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div ref={containerRef} className="h-full flex min-h-0">
      <div className="flex-1 min-w-0 min-h-0 border-r border-border">
        <Session key={mainTabId} tabId={mainTabId} onNewSession={onNewSession} />
      </div>
      <div
        onPointerDown={onDividerDown}
        className={`w-1 cursor-col-resize hover:bg-accent/30 active:bg-accent/50 transition-colors shrink-0 ${dragging ? "bg-accent/50" : ""}`}
      />
      <div className="min-w-0 min-h-0 flex flex-col" style={{ flex: `${1 - ratio}` }}>
        <div className="flex items-center gap-2 h-8 shrink-0 px-3 border-b border-border bg-background/80">
          <Columns size={10} className="text-muted shrink-0" />
          <select
            value={sideTabId}
            onChange={(e) => workspaceStore.setPrefs({ splitTabId: e.target.value })}
            className="flex-1 min-w-0 bg-bone/[0.04] border border-border rounded-sm px-2 py-0.5 font-sans text-2xs outline-none focus:border-accent/40"
            title="Choose the tab shown in this pane"
          >
            {workspaceTabs.filter((t) => t.id !== mainTabId).map((t) => (
              <option key={t.id} value={t.id}>{t.title || "Untitled Research"}</option>
            ))}
          </select>
          <button
            onClick={() => workspaceStore.setPrefs({ splitView: false, splitTabId: null })}
            className="p-1 rounded-sm text-muted hover:text-bone"
            title="Close split view"
          >
            <X size={11} />
          </button>
        </div>
        <div className="flex-1 min-h-0 min-w-0">
          <Session key={sideTabId} tabId={sideTabId} onNewSession={onNewSession} />
        </div>
      </div>
    </div>
  );
}

function Session({ tabId, onNewSession }: { tabId: string; onNewSession: () => void }) {
  const state = useWorkspaceStore();
  const tab = state.tabs.find((t) => t.id === tabId) ?? null;

  const [input, setInput] = useState("");
  const [stage, setStage] = useState(0);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [gapHits, setGapHits] = useState<ReturnType<typeof workspaceStore.graphGapHits>>([]);
  const [gapQuery, setGapQuery] = useState("");
  /** Owns the in-flight run so the operator can actually abort it. */
  const runControllerRef = useRef<AbortController | null>(null);
  const unregisterStopRef = useRef<(() => void) | null>(null);
  const runSequenceRef = useRef(0);
  const [cancellable, setCancellable] = useState(false);

  useEffect(
    () => () => {
      runSequenceRef.current += 1;
      runControllerRef.current?.abort();
      runControllerRef.current = null;
      unregisterStopRef.current?.();
      unregisterStopRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (gapQuery === input.trim()) return;
    setGapQuery(input.trim());
    const timer = setTimeout(() => {
      if (input.trim().length < 6) {
        setGapHits([]);
        return;
      }
      try {
        setGapHits(workspaceStore.graphGapHits(input.trim()).slice(0, 3));
      } catch {
        setGapHits([]);
      }
    }, 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  useEffect(() => {
    const el = scrollRef.current;
    const t = workspaceStore.getState().tabs.find((x) => x.id === tabId);
    if (el && t) el.scrollTop = t.scrollTop ?? 0;
  }, [tabId]);

  if (!tab) return null;

  const docs = tab.documentIds
    .map((id) => state.documents.find((d) => d.id === id))
    .filter((d) => d !== undefined);

  const cancelResearch = () => {
    // The abort rejects the awaited run; the catch/finally below performs the
    // visible state transition and clears the stage ticker.
    runControllerRef.current?.abort();
  };

  const commitRun = async (topic: string, subject: string | null, mode: string | null) => {
    await loadStop();
    if (isStopEngaged()) {
      toast("Global stop is engaged. Release it from the status bar before starting a research run.", "error");
      return;
    }
    const current = workspaceStore.getState().tabs.find((t) => t.id === tabId);
    if (!current) return;

    // Starting a run supersedes any run still in flight.
    runControllerRef.current?.abort();
    unregisterStopRef.current?.();
    const controller = new AbortController();
    runControllerRef.current = controller;
    const runId = ++runSequenceRef.current;
    const unregisterStop = registerInFlight({
      id: `research:${tabId}:${runId}`,
      label: "research workspace run",
      abort: () => controller.abort(),
    });
    unregisterStopRef.current = unregisterStop;
    setCancellable(true);

    let adaptiveMode = "analogy";
    try {
      adaptiveMode = adaptiveEngine.getNextMode(current.teachingMode ? [current.teachingMode as ExplanationMode] : []) as string;
    } catch {
      adaptiveMode = "analogy";
    }

    workspaceStore.updateTab(tabId, {
      topic,
      phase: "researching",
      streaming: true,
      pipelineStage: 0,
      docStage: current.documentIds.length > 0 ? "analyzing" : "idle",
      error: null,
      teachingMode: adaptiveMode,
      followUps: [],
      messages: [...current.messages, { role: "user", content: topic, timestamp: Date.now() }],
    });
    workspaceStore.pushTabEvent(tabId, "started", `Started research on "${topic.slice(0, 60)}"`);
    setStage(0);

    const ticker = setInterval(() => setStage((s) => Math.min(s + 1, RESEARCH_STAGES.length - 1)), 380);

    const workspaceId = current.workspaceId;
    const files = current.documentIds
      .map((id) => workspaceStore.getState().documents.find((d) => d.id === id))
      .filter((d): d is WorkspaceDocument => d !== undefined && d.content !== "")
      .map((doc) => new File([doc.content], `${doc.name}.txt`, { type: "text/plain" }));

    const history = current.messages.map((m) => ({ role: m.role, content: m.content }));
    const resolution = workspaceStore.resolveFollowupQuery(workspaceId, topic);

    try {
      const result = await runPipeline({
        prompt: resolution.prompt,
        files,
        history,
        subject: resolution.isFollowup && resolution.subjectHint ? resolution.subjectHint : subject ?? current.subject,
        mode: adaptiveMode,
        model: current.model,
        knowledgeContext: workspaceStore.graphContextFor(topic),
        temperature: workspaceStore.getState().prefs.temperature,
        maxTokens: workspaceStore.getState().prefs.maxTokens,
        workspaceId,
        tabId,
        memoryContext: workspaceStore.memoryContextFor(workspaceId, topic),
        canvasContext: workspaceStore.canvasContextFor(workspaceId),
        metadata: { researchMode: mode, followupKind: resolution.kind },
        signal: controller.signal,
      });

      // A superseded or unmounted run must never commit late output.
      if (runSequenceRef.current !== runId) return;

      const reportText = result.response;
      if (!reportText || !reportText.trim() || reportText.trim() === topic.trim()) {
        throw new Error("AI returned an empty or echoed response. Please try again.");
      }
      // One derivation path (Mission 10): validated, deduplicated, provenance-
      // carrying records only. The raw extractors are never read directly by a
      // component.
      const records = deriveTabRecords(reportText, {
        tabId,
        workspaceId,
        runId: result.telemetry?.runId ?? null,
        chunks: result.intelligence?.retrievedChunks ?? [],
      });

      clearInterval(ticker);
      const fresh = workspaceStore.getState().tabs.find((t) => t.id === tabId);
      workspaceStore.updateTab(tabId, {
        phase: "complete",
        streaming: false,
        pipelineStage: -1,
        docStage: "idle",
        sections: records.sections,
        fullText: reportText,
        entities: records.entities,
        timelineEvents: records.timelineEvents,
        notes: records.notes,
        followUps: records.followUps.map((followUp) => followUp.question),
        followUpsOrigin: records.followUps.some((followUp) => followUp.origin === "app") ? "app" : "answer",
        derivation: records.provenance,
        difficulty: result.difficulty || "intermediate",
        title: deriveTitle(topic),
        intelligence: result.intelligence
          ? {
              ...result.intelligence,
              // Chunks are stored whole: truncating their text would invalidate
              // the locators the grounding report carries, and an unverifiable
              // chunk must not be displayed as evidence.
            }
          : undefined,
        messages: fresh
          ? [...fresh.messages, { role: "assistant", content: `Research complete — ${records.sections.length} sections, ${records.entities.length} entities, ${records.timelineEvents.length} timeline events.`, timestamp: Date.now() }]
          : undefined,
      });

      // What this run changed outside the tab, recorded for review.
      const knowledge = workspaceStore.deriveGraphFromTab(tabId);
      const memory = workspaceStore.rememberExchange(workspaceId, topic, reportText, tabId);
      recordDerivedChange({
        workspaceId,
        tabId,
        tabTitle: workspaceStore.getState().tabs.find((t) => t.id === tabId)?.title ?? topic,
        provenance: records.provenance,
        effects: {
          knowledge,
          memory: memory ? { outcome: memory.outcome, recordId: memory.record?.id ?? null, detail: memory.detail } : null,
        },
      });
      workspaceStore.pushTabEvent(tabId, "completed", `Completed in ${Math.round(result.telemetry?.totalMs ?? 0)}ms`);
    } catch (e) {
      clearInterval(ticker);
      if (runSequenceRef.current !== runId) return;
      if (isCancelledError(e)) {
        const fresh = workspaceStore.getState().tabs.find((t) => t.id === tabId);
        workspaceStore.updateTab(tabId, {
          phase: fresh && fresh.fullText ? "complete" : "selecting-subject",
          streaming: false,
          pipelineStage: -1,
          docStage: "idle",
          error: null,
        });
        workspaceStore.pushTabEvent(tabId, "cancelled", "Stopped by the operator");
      } else {
        const fresh = workspaceStore.getState().tabs.find((t) => t.id === tabId);
        workspaceStore.updateTab(tabId, {
          phase: fresh && fresh.fullText ? "complete" : "researching",
          streaming: false,
          error: { code: (e as { code?: string })?.code || "SERVER", message: getReadableError(e) },
        });
        workspaceStore.pushTabEvent(tabId, "failed", `Failed: ${getReadableError(e)}`);
      }
    } finally {
      if (runControllerRef.current === controller) runControllerRef.current = null;
      unregisterStop();
      if (unregisterStopRef.current === unregisterStop) unregisterStopRef.current = null;
      if (runSequenceRef.current === runId) setCancellable(false);
    }
  };

  const beginWizard = () => {
    const topic = input.trim();
    if (!topic) return;
    workspaceStore.updateTab(tabId, { topic, title: deriveTitle(topic), error: null, phase: "selecting-subject" });
    setInput("");
  };

  const handleFollowUp = (question: string) => {
    void commitRun(question, tab.subject, tab.mode);
  };

  const handleRetry = () => {
    void commitRun(tab.topic || tab.title, tab.subject, tab.mode);
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files) return;
    workspaceStore.updateTab(tabId, { docStage: "extracting" });
    for (const file of Array.from(files)) {
      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        workspaceStore.updateTab(tabId, { error: { code: "UNSUPPORTED_FILE_TYPE", message: `Unsupported file type: ${file.name}. Supported: ${ACCEPTED_EXTENSIONS.join(", ")}` } });
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        workspaceStore.updateTab(tabId, { error: { code: "DOCUMENT_TOO_LARGE", message: `${file.name} exceeds the 10 MB limit.` } });
        continue;
      }
      try {
        const extracted = await extractForUpload(file);
        const docId = workspaceStore.addDocument({
          workspaceId: tab.workspaceId,
          folderId: null,
          name: file.name,
          extension: ext.replace(".", ""),
          size: file.size,
          pageCount: extracted.pageCount,
          content: extracted.text,
        });
        workspaceStore.attachDocumentToTab(tabId, docId);
        workspaceStore.deriveGraphFromDocument(docId);
      } catch (error) {
        workspaceStore.updateTab(tabId, { error: describeFailure(error, file.name) });
      }
    }
    workspaceStore.updateTab(tabId, { docStage: "idle" });
  };

  const attachFileInput = (node: HTMLInputElement | null) => {
    fileInputRef.current = node;
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2 h-11 shrink-0 px-4 border-b border-border bg-background/70">
        <span className="font-mono text-2xs uppercase tracking-ultra text-muted">Model</span>
        <div className="relative">
          <button
            onClick={() => setModelOpen((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-border hover:border-accent/40 font-sans text-xs text-bone/80 transition-colors"
            title="Active model"
          >
            <Cpu size={12} className="text-muted" />
            {MODEL_CATEGORIES.find((c) => c.id === categoryForModel(tab.model))?.label ?? "Balanced"}
          </button>
          {modelOpen && (
            <div className="absolute top-full left-0 mt-1 z-40 w-72 py-1 bg-background border border-border rounded-sm shadow-premium-lg">
              <div className="flex items-center gap-1.5 px-3 pt-2 pb-2 border-b border-border/60">
                <Search size={11} className="text-muted shrink-0" />
                <input
                  autoFocus
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") setModelOpen(false); }}
                  placeholder="Search models…"
                  className="w-full bg-transparent font-sans text-xs outline-none placeholder:text-faint text-bone/80"
                />
              </div>
              <div className="max-h-72 overflow-y-auto scrollbar-hide py-1">
                {modelSearch.trim() ? (
                  MODEL_CATALOG.filter((m) => {
                    const q = modelSearch.trim().toLowerCase();
                    const cat = MODEL_CATEGORIES.find((c) => c.id === categoryForModel(m.id));
                    return m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || (cat?.label.toLowerCase().includes(q) ?? false);
                  }).map((m) => {
                    const cat = MODEL_CATEGORIES.find((c) => c.id === categoryForModel(m.id));
                    return (
                      <button
                        key={m.id}
                        onClick={() => { workspaceStore.updateTab(tabId, { model: m.id }); setModelOpen(false); setModelSearch(""); }}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2 font-sans text-xs text-left text-bone/70 hover:bg-bone/5 hover:text-bone"
                      >
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 font-medium text-bone/80">
                            {m.label}
                            {m.id === RECOMMENDED_MODEL && (
                              <span className="px-1 py-0.5 rounded-full bg-accent/10 border border-accent/25 font-mono text-2xs text-accent">Recommended</span>
                            )}
                          </p>
                          <p className="text-2xs text-muted truncate font-mono">{m.id}</p>
                        </div>
                        <span className="text-2xs text-muted shrink-0">{cat?.label ?? "Model"}</span>
                        {tab.model === m.id && <Check size={11} className="text-accent shrink-0" />}
                      </button>
                    );
                  })
                ) : (
                  MODEL_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        workspaceStore.updateTab(tabId, { model: cat.model });
                        setModelOpen(false);
                      }}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2 font-sans text-xs text-left text-bone/70 hover:bg-bone/5 hover:text-bone"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-medium text-bone/80">
                          {cat.label}
                          {cat.id === "balanced" && (
                            <span className="px-1 py-0.5 rounded-full bg-accent/10 border border-accent/25 font-mono text-2xs text-accent">Recommended</span>
                          )}
                        </p>
                        <p className="text-2xs text-muted truncate">{cat.description}</p>
                      </div>
                      {categoryForModel(tab.model) === cat.id && <Check size={11} className="text-accent shrink-0" />}
                    </button>
                  ))
                )}
                {modelSearch.trim() && MODEL_CATALOG.filter((m) => {
                  const q = modelSearch.trim().toLowerCase();
                  const cat = MODEL_CATEGORIES.find((c) => c.id === categoryForModel(m.id));
                  return m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || (cat?.label.toLowerCase().includes(q) ?? false);
                }).length === 0 && (
                  <p className="px-3 py-3 font-sans text-2xs text-faint">No models match &ldquo;{modelSearch}&rdquo;.</p>
                )}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-border hover:border-accent/40 font-sans text-xs text-bone/80 transition-colors"
          title="Upload documents"
        >
          <UploadCloud size={12} className="text-muted" />
          {docs.length > 0 ? `${docs.length} document${docs.length === 1 ? "" : "s"}` : "Upload documents"}
          {(tab.docStage === "extracting" || tab.docStage === "analyzing") && <Loader2 size={11} className="animate-spin text-accent" />}
        </button>

        {docs.length > 0 && (
          <div className="flex items-center gap-1 overflow-hidden">
            {docs.slice(0, 3).map((doc) => (
              <span key={doc.id} className="flex items-center gap-1 px-2 py-0.5 rounded-sm bg-bone/5 border border-border font-sans text-2xs text-muted max-w-28 truncate">
                <FileText size={9} className="shrink-0" />
                <span className="truncate">{doc.name}</span>
                <button
                  onClick={() => workspaceStore.deleteDocument(doc.id)}
                  className="shrink-0 hover:text-bone"
                  aria-label={`Remove ${doc.name}`}
                >
                  <X size={9} />
                </button>
              </span>
            ))}
            {docs.length > 3 && <span className="font-mono text-2xs text-faint">+{docs.length - 3}</span>}
          </div>
        )}

        <div className="flex-1" />
        <button
          onClick={() => {
            const others = workspaceStore.getState().tabs.filter((t) => t.workspaceId === tab.workspaceId && t.id !== tabId);
            if (!others.length) {
              toast("Open a second session to use Split View");
              return;
            }
            const side = others.sort((a, b) => b.updatedAt - a.updatedAt)[0].id;
            workspaceStore.setPrefs({ splitView: !workspaceStore.getState().prefs.splitView, splitTabId: side });
          }}
          className="flex items-center gap-1.5 px-3 py-1 rounded-sm border border-border hover:border-accent/40 font-mono text-2xs text-bone/80 transition-colors"
          title="Split view — work on two sessions side by side"
        >
          <Columns size={11} /> Split
        </button>
        <button
          onClick={() => {
            const id = workspaceStore.addCanvasBlock({
              workspaceId: tab.workspaceId,
              type: "report",
              title: tab.title || "Report",
              data: { tabId: tab.id },
              x: 320,
              y: 180,
            });
            workspaceStore.setPrefs({ canvasViewOpen: true, focusCanvasBlockId: id });
          }}
          className="flex items-center gap-1.5 px-3 py-1 rounded-sm border border-border hover:border-accent/40 font-mono text-2xs text-bone/80 transition-colors"
          title="Open this session's report on the research canvas"
        >
          <Layout size={11} /> Canvas
        </button>
        {tab.phase === "complete" && tab.fullText && (
          <button
            onClick={() => setExportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-sm border border-border hover:border-accent/40 font-mono text-2xs text-bone/80 transition-colors"
          >
            <FileText size={11} /> Export
          </button>
        )}
        <button
          onClick={onNewSession}
          className="flex items-center gap-1.5 px-3 py-1 rounded-sm bg-accent text-surface font-sans text-xs font-medium"
          title="New session (Ctrl+N)"
        >
          <Plus size={12} /> New
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto scrollbar-hide"
        onScroll={() => {
          const el = scrollRef.current;
          if (el) workspaceStore.setTabScrollTop(tabId, el.scrollTop);
        }}
      >
        {tab.phase === "idle" && (
          <div className="max-w-2xl mx-auto px-6 py-14">
            {tab.error && (
              <AiErrorBanner
                error={tab.error}
                onRetry={() => { workspaceStore.updateTab(tabId, { error: null }); void commitRun(input.trim() || tab.topic, tab.subject ?? null, tab.mode ?? null); }}
                onDismiss={() => workspaceStore.updateTab(tabId, { error: null })}
              />
            )}
            <p className="font-mono text-2xs uppercase tracking-ultra text-muted mb-4">New Research Session</p>
            <h2 className="font-display text-3xl font-black tracking-tighter mb-2">What do you want to research?</h2>
            <p className="font-sans text-sm text-muted mb-8 max-w-lg">
              Enter a topic or question. Every session keeps its own conversation, documents, report, and knowledge graph.
            </p>

            <textarea
              value={input || tab.topic}
              onChange={(e) => {
                setInput(e.target.value);
                workspaceStore.updateTab(tabId, { topic: e.target.value });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  beginWizard();
                }
              }}
              spellCheck={state.prefs.spellcheck}
              wrap={state.prefs.wordWrap ? "soft" : "off"}
              placeholder="e.g. How does the EU AI Act regulate high-risk systems?"
              rows={3}
              className="w-full bg-bone/[0.03] border border-border px-4 py-3 font-sans bl-prose outline-none focus:border-accent/50 transition-colors resize-none placeholder:text-faint"
            />

            {gapHits.length > 0 && (
              <div className="mt-2 space-y-1">
                {gapHits.map((hit) => (
                  <div key={hit.node.id} className="flex items-start gap-2 px-3 py-1.5 rounded-sm bg-bone/[0.03] border border-border/60">
                    <span className="font-mono text-2xs text-muted shrink-0 mt-0.5">graph</span>
                    <p className="font-sans text-2xs text-muted leading-relaxed">
                      <span className="text-bone/80">{hit.node.label}</span>
                      {hit.node.strength < 0.3 && " is new in your knowledge graph."}
                      {hit.prereqs.length > 0 && (
                        <>
                          {" "}Consider learning {hit.prereqs.slice(0, 3).map((p) => p.label).join(", ")} first.
                        </>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                onClick={beginWizard}
                disabled={!(input.trim() || tab.topic.trim())}
                className="flex w-full items-center justify-center gap-2 rounded-sm bg-accent px-5 py-2.5 font-sans text-xs font-semibold text-surface transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 focus-ring sm:w-auto"
              >
                Begin research <ArrowRight size={13} />
              </button>
              <span className="font-mono text-2xs text-faint">Enter to run · Shift+Enter for a new line</span>
            </div>
          </div>
        )}

        {tab.phase === "selecting-subject" && (
          <SubjectSelector
            onSelect={(subject) => workspaceStore.updateTab(tabId, { subject, phase: "selecting-mode" })}
          />
        )}

        {tab.phase === "selecting-mode" && (
          <ModeSelector
            subject={tab.subject || ""}
            topic={tab.topic}
            initial={state.prefs.defaultMode}
            onBack={() => workspaceStore.updateTab(tabId, { phase: "selecting-subject" })}
            onSelect={(mode) => {
              workspaceStore.updateTab(tabId, { mode });
              void commitRun(tab.topic, tab.subject, mode);
            }}
          />
        )}

        {tab.phase === "researching" && (
          <div className="max-w-md mx-auto px-6 py-14">
            {tab.error && (
              <AiErrorBanner
                error={{ code: tab.error.code, message: tab.error.message } as AiError}
                onRetry={() => void handleRetry()}
                onDismiss={() => workspaceStore.updateTab(tabId, { error: null })}
                onOpenSettings={() => workspaceStore.setPrefs({ workshopViewOpen: true })}
              />
            )}
            <div className="flex flex-col items-center gap-1 mb-10 text-center mt-4">
              <div className="w-9 h-9 rounded-lg bg-bone/8 flex items-center justify-center mb-3">
                <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              </div>
              <p className="font-display text-xl font-medium text-bone">Assembling intelligence</p>
              <p className="font-sans text-xs text-muted">Running through the structured research pipeline</p>
            </div>
            <div className="space-y-1">
              {RESEARCH_STAGES.map((label, i) => {
                const status = i < stage ? "done" : i === stage ? "active" : "pending";
                return (
                  <div
                    key={label}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md transition-all ${status === "active" ? "bg-bone/6" : status === "done" ? "" : "opacity-35"}`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${status === "done" ? "border-accent bg-accent/15 text-accent" : status === "active" ? "border-accent/60" : "border-border"}`}
                    >
                      {status === "done" ? (
                        <Check size={9} strokeWidth={3} />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50" />
                      )}
                    </div>
                    <span
                      className={`font-sans text-xs transition-colors ${status === "active" ? "text-bone font-medium" : status === "done" ? "text-faint" : "text-faint"}`}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>

            {cancellable && (
              <div className="mt-8 flex justify-center">
                <button
                  onClick={cancelResearch}
                  className="inline-flex items-center gap-2 rounded-sm border border-border-strong px-4 py-2 font-sans text-xs font-medium text-bone transition-colors hover:bg-bone/[0.06] focus-ring"
                >
                  <span className="h-2.5 w-2.5 rounded-2xs bg-current" aria-hidden="true" />
                  Stop research
                </button>
              </div>
            )}
          </div>
        )}

        {tab.phase === "complete" && (
          <div className="max-w-3xl mx-auto px-6 py-10">
            {tab.error && (
              <AiErrorBanner
                error={{ code: tab.error.code, message: tab.error.message } as AiError}
                onRetry={() => void handleRetry()}
                onDismiss={() => workspaceStore.updateTab(tabId, { error: null })}
                onOpenSettings={() => workspaceStore.setPrefs({ workshopViewOpen: true })}
              />
            )}
            <div className="mb-8 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-md bg-accent/15 border border-accent/30 flex items-center justify-center shrink-0">
                  <FileText size={13} className="text-accent" />
                </div>
                <div className="min-w-0">
                  <h1 className="font-display text-lg font-semibold text-bone truncate">{tab.title}</h1>
                  <p className="font-mono text-2xs uppercase tracking-wider text-muted mt-0.5">
                    {tab.subject || "General"} {tab.mode ? `- ${tab.mode}` : ""} - {tab.sections.length} sections
                  </p>
                </div>
              </div>
            </div>

            <ResearchReport sections={tab.sections} isStreaming={false} fullText={tab.fullText} />

            {tab.intelligence && (
              <div className="mt-6">
                <IntelligenceStrip intelligence={tab.intelligence} />
              </div>
            )}

            <FollowUpQuestions questions={tab.followUps} onSelect={(q) => handleFollowUp(q)} origin={tab.followUpsOrigin} />

            <div className="mt-10 pt-6 border-t border-border">
              <p className="font-mono text-2xs uppercase tracking-ultra text-muted mb-3">Continue this session</p>
              <div className="relative">
<textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && input.trim()) {
                      e.preventDefault();
                      handleFollowUp(input.trim());
                      setInput("");
                    }
                  }}
                  spellCheck={state.prefs.spellcheck}
                  wrap={state.prefs.wordWrap ? "soft" : "off"}
                  placeholder="Ask a follow-up question…"
                  rows={2}
                  className="w-full bg-bone/[0.03] border border-border px-4 py-3 font-sans bl-prose outline-none focus:border-accent/50 transition-colors resize-none placeholder:text-faint"
                />
                <button
                  onClick={() => {
                    if (input.trim()) {
                      handleFollowUp(input.trim());
                      setInput("");
                    }
                  }}
                  disabled={!input.trim()}
                  className="absolute right-2 bottom-2 flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-accent text-surface font-sans text-2xs font-medium disabled:opacity-40"
                >
                  Run <ArrowRight size={11} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <ReportExport open={exportOpen} onClose={() => setExportOpen(false)} topic={tab.topic} mode={tab.mode ?? ""} fullText={tab.fullText} intelligence={tab.intelligence} derivation={tab.derivation} />

      <input ref={attachFileInput} type="file" accept={ACCEPTED_EXTENSIONS.join(",")} multiple className="hidden" onChange={(e) => void handleUpload(e.target.files)} />
    </div>
  );
}
