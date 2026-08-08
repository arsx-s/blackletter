import { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import {
  Activity, BookMarked, ChevronDown, FileText, Home, Layers, Layout, LogOut,
  MessageSquare, Network, PanelLeft, PanelRight, Plus, Search, Settings,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "../ui/button";
import { Logo } from "../ui/logo";
import { cn } from "../../lib/utils";
import { FeedbackModal } from "../ui/feedback-modal";
import { useWorkspaceStore, workspaceStore } from "../../stores/use-workspace";
import { useWorkspaceShortcuts } from "../../hooks/use-workspace-shortcuts";
import { TabBar } from "./TabBar";
import { LeftSidebar } from "./LeftSidebar";
import { InspectorPanel } from "./InspectorPanel";
import { StatusBar } from "./StatusBar";
import { Dashboard } from "./Dashboard";
import { GlobalSearch } from "./GlobalSearch";
import { NewSessionModal } from "./NewSessionModal";
import { FloatingAiChat } from "./FloatingAiChat";

const ResearchWorkspace = lazy(() => import("../research/ResearchWorkspace").then((m) => ({ default: m.ResearchWorkspace })));
const NotebookView = lazy(() => import("./NotebookView").then((m) => ({ default: m.NotebookView })));
const DocumentViewer = lazy(() => import("./DocumentViewer").then((m) => ({ default: m.DocumentViewer })));
const SettingsView = lazy(() => import("./SettingsView").then((m) => ({ default: m.SettingsView })));
const GraphView = lazy(() => import("../knowledge/GraphView").then((m) => ({ default: m.GraphView })));
const CanvasView = lazy(() => import("../canvas/CanvasView").then((m) => ({ default: m.CanvasView })));
const SystemStatus = lazy(() => import("../observability/SystemStatus").then((m) => ({ default: m.SystemStatus })));
const DeveloperMode = lazy(() => import("../observability/DeveloperMode").then((m) => ({ default: m.DeveloperMode })));

type ToolView = "home" | "ledger" | "documents" | "workshop" | "graph" | "canvas" | "system";

const TOOLS: Array<{ id: ToolView; label: string; icon: typeof BookMarked }> = [
  { id: "home", label: "Home", icon: Home },
  { id: "canvas", label: "Research Canvas", icon: Layout },
  { id: "graph", label: "Knowledge Graph", icon: Network },
  { id: "ledger", label: "Ledger — Notes", icon: BookMarked },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "workshop", label: "Workshop — Settings", icon: Settings },
  { id: "system", label: "System Status", icon: Activity },
];

function ViewFallback() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="flex items-center gap-3">
        <span className="w-2 h-2 rounded-full bg-accent/60 animate-pulse" />
        <span className="font-sans text-xs text-muted">Loading view...</span>
      </div>
    </div>
  );
}

export function OperatingSystem({ onExit }: { onExit: () => void }) {
  const state = useWorkspaceStore();
  const [view, setView] = useState<ToolView>("home");
  const [searchOpen, setSearchOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [resizing, setResizing] = useState<null | "sidebar" | "inspector">(null);
  const [userName, setUserName] = useState(() => {
    try { return localStorage.getItem("bl_username") || ""; } catch { return ""; }
  });
  const [showNamePrompt, setShowNamePrompt] = useState(() => {
    try { return !localStorage.getItem("bl_username"); } catch { return true; }
  });
  const [nameInput, setNameInput] = useState("");

  useWorkspaceShortcuts(() => setSearchOpen(true), () => setNewSessionOpen(true));

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId) ?? null;
  const activeWorkspace = state.workspaces.find((w) => w.id === state.activeWorkspaceId) ?? null;
  const shellRef = useRef<HTMLDivElement>(null);

  const handleSetName = useCallback(() => {
    const name = nameInput.trim() || "Researcher";
    try { localStorage.setItem("bl_username", name); } catch { /* ignore */ }
    setUserName(name);
    setShowNamePrompt(false);
  }, [nameInput]);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: PointerEvent) => {
      const shell = shellRef.current;
      if (!shell) return;
      const rect = shell.getBoundingClientRect();
      if (resizing === "sidebar") {
        const width = Math.min(Math.max(e.clientX - rect.left, 200), 440);
        workspaceStore.setPrefs({ sidebarWidth: width });
      } else {
        const width = Math.min(Math.max(rect.right - e.clientX, 240), 520);
        workspaceStore.setPrefs({ inspectorWidth: width });
      }
    };
    const onUp = () => setResizing(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [resizing]);

  const renderTool = () => {
    switch (view) {
      case "canvas": return <Suspense fallback={<ViewFallback />}><CanvasView /></Suspense>;
      case "graph": return <Suspense fallback={<ViewFallback />}><GraphView /></Suspense>;
      case "ledger": return <Suspense fallback={<ViewFallback />}><NotebookView /></Suspense>;
      case "documents": return <Suspense fallback={<ViewFallback />}><DocumentViewer /></Suspense>;
      case "workshop": return <Suspense fallback={<ViewFallback />}><SettingsView /></Suspense>;
      case "system": return state.prefs.developerMode
        ? <Suspense fallback={<ViewFallback />}><DeveloperMode /></Suspense>
        : <Suspense fallback={<ViewFallback />}><SystemStatus /></Suspense>;
      default: return null;
    }
  };

  useEffect(() => {
    if (workspaceStore.getState().prefs.graphViewOpen) {
      setView("graph");
      workspaceStore.setPrefs({ graphViewOpen: false });
    }
  }, [state.prefs.graphViewOpen]);

  useEffect(() => {
    if (workspaceStore.getState().prefs.canvasViewOpen) {
      setView("canvas");
      workspaceStore.setPrefs({ canvasViewOpen: false });
    }
  }, [state.prefs.canvasViewOpen]);

  useEffect(() => {
    if (workspaceStore.getState().prefs.workshopViewOpen) {
      setView("workshop");
      workspaceStore.setPrefs({ workshopViewOpen: false });
    }
  }, [state.prefs.workshopViewOpen]);

  useEffect(() => {
    if (workspaceStore.getState().prefs.documentsViewOpen) {
      setView("documents");
      workspaceStore.setPrefs({ documentsViewOpen: false });
    }
  }, [state.prefs.documentsViewOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        setView((v) => (v === "canvas" ? "home" : "canvas"));
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "g" || e.key === "G")) {
        e.preventDefault();
        setView((v) => (v === "graph" ? "home" : "graph"));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div ref={shellRef} data-fontsize={state.prefs.fontSize} className="h-screen flex flex-col overflow-hidden bg-background">
      <AnimatePresence>
        {showNamePrompt && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-bone/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-background border border-border rounded-lg p-8 max-w-sm w-full mx-4 shadow-premium-lg">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-md bg-accent flex items-center justify-center"><Logo variant="white" size={20} /></div>
                <div><p className="font-mono text-2xs uppercase tracking-ultra text-muted">BlackLetter</p><p className="font-sans text-xs text-muted/80">Ready</p></div>
              </div>
              <p className="font-display text-2xl font-black tracking-tight mb-2">What's your name?</p>
              <p className="font-sans text-sm text-muted mb-6">This name is used for your profile and greetings in the workspace.</p>
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSetName()}
                placeholder="Enter your name..."
                autoFocus
                className="w-full bg-bone/[0.03] border border-border px-4 py-2.5 font-sans text-sm outline-none focus:border-accent/50 transition-colors rounded-sm mb-4"
              />
              <Button onClick={handleSetName} className="w-full">Enter Workspace</Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="h-12 shrink-0 flex items-center gap-2 px-3 border-b border-border bg-background/90 z-30">
        <button
          onClick={() => workspaceStore.toggleSidebar()}
          className={cn("p-1.5 rounded-sm transition-colors", state.prefs.sidebarOpen ? "text-bone bg-bone/8" : "text-muted hover:text-bone hover:bg-bone/5")}
          title="Toggle sidebar (Ctrl+B)"
          aria-label="Toggle sidebar"
        >
          <PanelLeft size={15} />
        </button>

        <div className="flex items-center gap-2 select-none">
          <Logo size={20} />
          <span className="hidden md:inline font-display text-sm font-semibold tracking-tight text-bone">BlackLetter</span>
        </div>

        <div className="relative">
          <button
            onClick={() => setWorkspaceMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-border hover:border-accent/40 font-sans text-xs text-bone/80 transition-colors max-w-44"
            title="Switch workspace"
          >
            <Layers size={12} className="text-muted shrink-0" />
            <span className="truncate">{activeWorkspace?.name ?? "No workspace"}</span>
            <ChevronDown size={11} className="text-muted shrink-0" />
          </button>
          {workspaceMenuOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 min-w-52 py-1 bg-background border border-border rounded-sm shadow-premium-lg">
              {state.workspaces.filter((w) => !w.archived).map((w) => (
                <button
                  key={w.id}
                  onClick={() => { workspaceStore.setActiveWorkspace(w.id); setWorkspaceMenuOpen(false); }}
                  className={cn("w-full flex items-center gap-2 px-3 py-1.5 font-sans text-xs text-left transition-colors", w.id === state.activeWorkspaceId ? "bg-bone/8 text-bone" : "text-bone/70 hover:bg-bone/5")}
                >
                  <Layers size={11} className="text-muted" />
                  <span className="flex-1 truncate">{w.name}</span>
                  {w.favorite && <span className="text-accent">★</span>}
                </button>
              ))}
              <div className="my-1 mx-2 border-t border-border" />
              <button
                onClick={() => { const id = workspaceStore.createWorkspace("Untitled Workspace"); workspaceStore.beginRenameWorkspace(id); setWorkspaceMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 font-sans text-xs text-bone/70 hover:bg-bone/5"
              >
                <Plus size={11} /> New workspace
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => setSearchOpen(true)}
          className="hidden sm:flex flex-1 max-w-md mx-4 items-center gap-2 h-7 px-3 border border-border bg-bone/[0.02] rounded-sm font-sans text-xs text-muted/70 transition-colors hover:border-accent/30"
        >
          <Search size={12} />
          <span className="flex-1 text-left">Search everything…</span>
          <kbd className="font-mono text-2xs text-muted/50 border border-border rounded px-1.5 py-0.5">Ctrl K</kbd>
        </button>

        <div className="flex-1" />

        <div className="relative">
          <button
            onClick={() => setToolsOpen((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-border hover:border-accent/40 font-sans text-xs text-bone/80 transition-colors"
          >
            <FileText size={12} className="text-muted" />
            <span className="hidden md:inline">{TOOLS.find((t) => t.id === view)?.label ?? "Tools"}</span>
            <ChevronDown size={11} className="text-muted" />
          </button>
          {toolsOpen && (
            <div className="absolute top-full right-0 mt-1 z-50 min-w-52 py-1 bg-background border border-border rounded-sm shadow-premium-lg">
              {TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  onClick={() => { setView(tool.id); setToolsOpen(false); }}
                  className={cn("w-full flex items-center gap-2.5 px-3 py-1.5 font-sans text-xs text-left transition-colors", view === tool.id ? "bg-bone/8 text-bone" : "text-bone/70 hover:bg-bone/5")}
                >
                  <tool.icon size={12} className="text-muted" />
                  {tool.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {view === "home" && activeTab && (
          <button
            onClick={() => workspaceStore.toggleInspector()}
            className={cn("hidden lg:flex p-1.5 rounded-sm transition-colors", state.prefs.inspectorOpen ? "text-bone bg-bone/8" : "text-muted hover:text-bone hover:bg-bone/5")}
            title="Toggle inspector"
            aria-label="Toggle inspector"
          >
            <PanelRight size={15} />
          </button>
        )}

        <button
          onClick={() => setFeedbackOpen(true)}
          className="p-1.5 rounded-sm text-muted hover:text-bone hover:bg-bone/5 transition-colors"
          title="Feedback"
          aria-label="Feedback"
        >
          <MessageSquare size={15} />
        </button>
        <button
          onClick={() => setView((v) => (v === "system" ? "home" : "system"))}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-border hover:border-accent/40 font-sans text-xs text-bone/80 transition-colors",
            view === "system" && "border-accent/40 bg-bone/5",
          )}
          title="System status — interface mode, model, and diagnostics"
        >
          <Activity size={12} className="text-muted" />
          <span className="hidden md:inline">{state.prefs.developerMode ? "Developer" : "System"}</span>
        </button>
        <Button variant="ghost" size="sm" className="hidden sm:flex" onClick={onExit}><LogOut size={13} /> Exit</Button>
      </header>

      {view === "home" && <TabBar onNewSession={() => setNewSessionOpen(true)} />}

      <div className="flex flex-1 min-h-0">
        {state.prefs.sidebarOpen && (
          <div className="flex h-full shrink-0" style={{ width: state.prefs.sidebarWidth }}>
            <LeftSidebar />
            <div
              onPointerDown={(e) => { e.preventDefault(); setResizing("sidebar"); }}
              className="w-1 cursor-col-resize hover:bg-accent/30 active:bg-accent/50 transition-colors shrink-0"
            />
          </div>
        )}

        <main className="flex-1 min-w-0 min-h-0 bg-background">
          {view === "home" ? (
            <Suspense fallback={<ViewFallback />}>
              {activeTab ? <ResearchWorkspace key={activeTab.id} onNewSession={() => setNewSessionOpen(true)} /> : <Dashboard userName={userName} onNewSession={() => setNewSessionOpen(true)} />}
            </Suspense>
          ) : view === "graph" || view === "canvas" ? (
            <Suspense fallback={<ViewFallback />}>{renderTool()}</Suspense>
          ) : (
            <div className="h-full overflow-y-auto scrollbar-hide">{renderTool()}</div>
          )}
        </main>

        {view === "home" && activeTab && state.prefs.inspectorOpen && (
          <div className="hidden lg:flex h-full shrink-0" style={{ width: state.prefs.inspectorWidth }}>
            <div
              onPointerDown={(e) => { e.preventDefault(); setResizing("inspector"); }}
              className="w-1 cursor-col-resize hover:bg-accent/30 active:bg-accent/50 transition-colors shrink-0"
            />
            <InspectorPanel />
          </div>
        )}
      </div>

      <StatusBar />

      <FloatingAiChat />
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <FeedbackModal isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <NewSessionModal isOpen={newSessionOpen} onClose={() => setNewSessionOpen(false)} />
    </div>
  );
}