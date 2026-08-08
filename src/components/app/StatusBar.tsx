import { CheckCircle2, Cloud, CloudOff, Loader2, MessageSquare } from "lucide-react";
import { workspaceStore } from "../../stores/workspace-store";
import { useWorkspaceStore } from "../../stores/use-workspace";
import { cn } from "../../lib/utils";
import { categoryForModel, MODEL_CATEGORIES } from "../../config/models";

export function StatusBar() {
  const state = useWorkspaceStore();
  const tab = state.tabs.find((t) => t.id === state.activeTabId) ?? null;
  const workspace = state.workspaces.find((w) => w.id === state.activeWorkspaceId) ?? null;

  const SaveIcon = state.saveState === "saved" ? CheckCircle2 : state.saveState === "saving" ? Loader2 : CloudOff;

  return (
    <footer className="h-6 shrink-0 flex items-center gap-3 px-3 border-t border-border bg-background/90 font-mono text-2xs text-muted select-none">
      <span className="flex items-center gap-1.5">
        <SaveIcon size={11} className={state.saveState === "saved" ? "text-emerald-600" : "text-accent"} />
        {state.saveState === "saved" ? "Saved" : state.saveState === "saving" ? "Saving…" : "Unsaved"}
      </span>
      <span className="hidden sm:flex items-center gap-1 text-muted/70">
        <Cloud size={10} /> Local
      </span>
      <div className="flex-1" />
      <button
        onClick={() => workspaceStore.setPrefs({ floatingChatOpen: !state.prefs.floatingChatOpen })}
        className={cn(
          "flex items-center gap-1.5 px-2 py-0.5 rounded-sm transition-colors",
          state.prefs.floatingChatOpen ? "text-accent bg-bone/8" : "text-muted hover:text-bone hover:bg-bone/5",
        )}
        title="Floating AI chat"
      >
        <MessageSquare size={11} /> AI Chat
      </button>
      <div className="hidden sm:flex items-center border border-border rounded-sm overflow-hidden">
        <button
          onClick={() => workspaceStore.setPrefs({ developerMode: false })}
          className={cn(
            "px-2 py-0.5 font-sans text-2xs transition-colors",
            !state.prefs.developerMode ? "bg-bone/8 text-bone" : "text-muted hover:text-bone",
          )}
          title="Intelligence mode — clean interface, system status view"
        >
          Intelligence
        </button>
        <button
          onClick={() => workspaceStore.setPrefs({ developerMode: true })}
          className={cn(
            "px-2 py-0.5 font-sans text-2xs transition-colors",
            state.prefs.developerMode ? "bg-bone/8 text-bone" : "text-muted hover:text-bone",
          )}
          title="Developer mode — diagnostics, telemetry, and run traces"
        >
          Developer
        </button>
      </div>
      {tab && (
        <span className="hidden md:inline truncate max-w-48">
          {tab.model ? MODEL_CATEGORIES.find((c) => c.id === categoryForModel(tab.model))?.label ?? tab.model : "Default model"}
        </span>
      )}
      {workspace && <span className="hidden md:inline text-muted/70 truncate max-w-32">{workspace.name}</span>}
      <span className="hidden lg:inline text-muted/50">v3.2.0</span>
      <span className="hidden lg:inline text-muted/50">Ctrl+K Search · Ctrl+N Tab · Ctrl+S Save</span>
    </footer>
  );
}