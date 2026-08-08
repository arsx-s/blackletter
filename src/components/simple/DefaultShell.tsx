import { useEffect, useState } from "react";
import { CheckCircle2, CloudOff, Loader2, LogOut, PanelLeft, Plus, Settings as SettingsIcon, X } from "lucide-react";
import { useWorkspaceStore, workspaceStore } from "../../stores/use-workspace";
import { SimpleSidebar } from "./SimpleSidebar";
import { SimpleChat } from "./SimpleChat";
import { SimpleSettings } from "./SimpleSettings";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { Logo } from "../ui/logo";
import { cn } from "../../lib/utils";

interface DefaultShellProps {
  onExit: () => void;
}

export function DefaultShell({ onExit }: DefaultShellProps) {
  const state = useWorkspaceStore();
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
    return window.matchMedia("(min-width: 768px)").matches;
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(() => {
    try { return localStorage.getItem("bl_username") || ""; } catch { return ""; }
  });
  const [confirm, setConfirm] = useState<{ kind: "chat" | "workspace"; id: string; title: string } | null>(null);

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId) ?? null;
  const activeWorkspace = state.workspaces.find((w) => w.id === state.activeWorkspaceId) ?? null;

  useEffect(() => {
    const s = workspaceStore.getState();
    if (s.workspaces.length === 0) workspaceStore.createWorkspace("My Research");
    if (s.tabs.length === 0) workspaceStore.createTab();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n" && !e.shiftKey) {
        e.preventDefault();
        workspaceStore.createTab();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        const id = workspaceStore.createWorkspace("My Research");
        workspaceStore.beginRenameWorkspace(id);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        workspaceStore.saveNow();
      }
      if (e.key === "Escape") {
        setProfileOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const saveName = () => {
    try { localStorage.setItem("bl_username", nameDraft.trim()); } catch { /* ignore */ }
    setProfileOpen(false);
  };

  const deleteChat = (id: string) => {
    const tab = state.tabs.find((t) => t.id === id);
    setConfirm({ kind: "chat", id, title: tab?.title ?? "Untitled Research" });
  };

  const deleteWorkspace = (id: string) => {
    const w = state.workspaces.find((x) => x.id === id);
    setConfirm({ kind: "workspace", id, title: w?.name ?? "Workspace" });
  };

  const confirmDelete = () => {
    if (!confirm) return;
    if (confirm.kind === "chat") workspaceStore.closeTab(confirm.id);
    if (confirm.kind === "workspace") workspaceStore.deleteWorkspace(confirm.id);
    setConfirm(null);
  };

  const SaveIcon = state.saveState === "saved" ? CheckCircle2 : state.saveState === "saving" ? Loader2 : CloudOff;

  return (
    <div data-fontsize={state.prefs.fontSize} className="h-full flex flex-col overflow-hidden bg-background">
      <header className="h-12 shrink-0 flex items-center gap-2 px-3 border-b border-border bg-background/90 z-30">
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className={cn("p-1.5 rounded-sm transition-colors", sidebarOpen ? "text-bone bg-bone/8" : "text-muted hover:text-bone hover:bg-bone/5")}
          title="Toggle sidebar (Ctrl+B)"
          aria-label="Toggle sidebar"
        >
          <PanelLeft size={15} />
        </button>

        <div className="flex items-center gap-2 select-none">
          <Logo size={20} />
          <span className="hidden md:inline font-display text-sm font-semibold tracking-tight text-bone">BlackLetter</span>
        </div>

        <div className="flex-1" />

        <span className="hidden sm:flex items-center gap-1.5 font-mono text-2xs text-muted select-none">
          <SaveIcon size={11} className={state.saveState === "saved" ? "text-emerald-600" : "text-accent"} />
          {state.saveState === "saved" ? "Saved" : state.saveState === "saving" ? "Saving…" : "Unsaved"}
        </span>

        <div className="relative">
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-sm border border-border hover:border-accent/40 font-sans text-xs text-bone/80 transition-colors"
            title="Profile"
            aria-label="Profile"
          >
            <span className="w-5 h-5 rounded-full bg-accent/15 border border-accent/25 flex items-center justify-center font-mono text-2xs text-accent">
              {(nameDraft.trim() || "R").charAt(0).toUpperCase()}
            </span>
            <span className="max-w-28 truncate">{nameDraft.trim() || "Researcher"}</span>
          </button>
          {profileOpen && (
            <div className="absolute top-full right-0 mt-1 z-50 min-w-56 py-2 px-3 bg-background border border-border rounded-sm shadow-premium-lg">
              <p className="font-mono text-2xs uppercase tracking-ultra text-muted mb-2">Profile name</p>
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") { setProfileOpen(false); }
                }}
                onBlur={saveName}
                placeholder="Your name"
                className="w-full bg-bone/[0.03] border border-border px-2.5 py-1.5 font-sans text-xs outline-none focus:border-accent/50 rounded-sm placeholder:text-muted/40"
              />
            </div>
          )}
        </div>

        <div className="hidden md:flex items-center border border-border rounded-sm overflow-hidden">
          <button
            onClick={() => workspaceStore.setPrefs({ developerMode: false })}
            className={cn("px-2.5 py-1 font-sans text-2xs transition-colors", !state.prefs.developerMode ? "bg-bone/8 text-bone" : "text-muted hover:text-bone")}
            title="BlackLetter — the simple research interface"
          >
            BlackLetter
          </button>
          <button
            onClick={() => workspaceStore.setPrefs({ developerMode: true })}
            className={cn("px-2.5 py-1 font-sans text-2xs transition-colors", state.prefs.developerMode ? "bg-bone/8 text-bone" : "text-muted hover:text-bone")}
            title="Developer Mode — model controls, graph, canvas, and diagnostics"
          >
            Developer
          </button>
        </div>

        <button
          onClick={() => setSettingsOpen(true)}
          className="p-1.5 rounded-sm text-muted hover:text-bone hover:bg-bone/5 transition-colors"
          title="Settings"
          aria-label="Settings"
        >
          <SettingsIcon size={15} />
        </button>

        <button
          onClick={onExit}
          className="hidden sm:flex p-1.5 rounded-sm text-muted hover:text-bone hover:bg-bone/5 transition-colors"
          title="Exit to landing page"
          aria-label="Exit to landing page"
        >
          <LogOut size={15} />
        </button>
      </header>

      <div className="flex flex-1 min-h-0 relative">
        {sidebarOpen && (
          <>
            <div className="hidden md:flex h-full shrink-0" style={{ width: 288 }}>
              <SimpleSidebar
                onOpenSettings={() => setSettingsOpen(true)}
                onExit={onExit}
                onDeleteChat={deleteChat}
                onDeleteWorkspace={deleteWorkspace}
              />
            </div>
            <div className="md:hidden fixed inset-0 z-40 flex">
              <div className="w-72 h-full shrink-0 shadow-premium-lg">
                <div className="h-full flex flex-col">
                  <div className="flex items-center justify-between px-3 h-11 shrink-0 border-b border-border bg-background/90">
                    <span className="font-display text-sm font-semibold tracking-tight text-bone">BlackLetter</span>
                    <button
                      onClick={() => setSidebarOpen(false)}
                      className="p-1 rounded-sm text-muted hover:text-bone"
                      aria-label="Close sidebar"
                    >
                      <X size={15} />
                    </button>
                  </div>
                  <div className="flex-1 min-h-0">
                    <SimpleSidebar
                      onOpenSettings={() => { setSidebarOpen(false); setSettingsOpen(true); }}
                      onExit={onExit}
                      onDeleteChat={deleteChat}
                      onDeleteWorkspace={deleteWorkspace}
                    />
                  </div>
                </div>
              </div>
              <div className="flex-1 bg-black/30" onClick={() => setSidebarOpen(false)} />
            </div>
          </>
        )}

        <main className="flex-1 min-w-0 min-h-0 bg-background">
          {settingsOpen ? (
            <SimpleSettings onClose={() => setSettingsOpen(false)} />
          ) : activeTab ? (
            <SimpleChat key={activeTab.id} tabId={activeTab.id} onOpenSettings={() => setSettingsOpen(true)} />
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center px-6">
                <p className="font-sans text-sm text-muted mb-6">You have no active chat.</p>
                <button
                  onClick={() => workspaceStore.createTab()}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md bg-accent text-surface font-sans text-sm font-medium transition-colors hover:bg-accent/90"
                >
                  <Plus size={15} /> New Chat
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      <ConfirmDialog
        isOpen={confirm !== null}
        title={confirm?.kind === "chat" ? "Delete chat?" : "Delete workspace?"}
        message={
          confirm?.kind === "chat"
            ? "\u201C" + (confirm?.title ?? "") + "\u201D and its entire conversation history will be permanently removed. This cannot be undone."
            : "\u201C" + (confirm?.title ?? "") + "\u201D and all of its chats will be permanently removed. This cannot be undone."
        }
        confirmLabel={confirm?.kind === "chat" ? "Delete chat" : "Delete workspace"}
        onConfirm={confirmDelete}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}