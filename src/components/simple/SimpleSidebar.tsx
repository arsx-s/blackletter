import { useEffect, useState } from "react";
import { LogOut, MessageSquare, MoreHorizontal, Pencil, Plus, Settings as SettingsIcon, Trash2 } from "lucide-react";
import { useWorkspaceStore, workspaceStore } from "../../stores/use-workspace";
import { useContextMenu } from "../app/ContextMenu";
import { cn } from "../../lib/utils";

interface SimpleSidebarProps {
  onOpenSettings: () => void;
  onExit: () => void;
  onDeleteChat: (tabId: string) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
}

export function SimpleSidebar({ onOpenSettings, onExit, onDeleteChat, onDeleteWorkspace }: SimpleSidebarProps) {
  const state = useWorkspaceStore();
  const [renaming, setRenaming] = useState<{ kind: "chat" | "workspace"; id: string; value: string } | null>(null);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const { open, menu } = useContextMenu();

  const activeWorkspace = state.workspaces.find((w) => w.id === state.activeWorkspaceId) ?? null;
  const workspaces = state.workspaces.filter((w) => !w.archived);
  const chats = state.tabs
    .filter((t) => t.workspaceId === state.activeWorkspaceId)
    .sort((a, b) => (b.lastOpenedAt ?? b.updatedAt) - (a.lastOpenedAt ?? a.updatedAt));

  useEffect(() => {
    const id = workspaceStore.takePendingRenameWorkspace();
    if (!id) return;
    const name = workspaceStore.getState().workspaces.find((w) => w.id === id)?.name ?? "";
    setRenaming({ kind: "workspace", id, value: name });
  }, [state.pendingRenameWorkspaceId]);

  const newChat = () => {
    workspaceStore.createTab();
  };

  const openChatMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const tab = state.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    open(e.clientX, e.clientY, [
      { label: "Rename", icon: <Pencil size={12} />, onClick: () => setRenaming({ kind: "chat", id: tabId, value: tab.title }) },
      { label: "Delete", icon: <Trash2 size={12} />, danger: true, separatorBefore: true, onClick: () => onDeleteChat(tabId) },
    ]);
  };

  const openWorkspaceMenu = (e: React.MouseEvent, workspaceId: string) => {
    e.preventDefault();
    const w = state.workspaces.find((x) => x.id === workspaceId);
    if (!w) return;
    open(e.clientX, e.clientY, [
      { label: "Rename", icon: <Pencil size={12} />, onClick: () => setRenaming({ kind: "workspace", id: workspaceId, value: w.name }) },
      { label: "Delete", icon: <Trash2 size={12} />, danger: true, separatorBefore: true, onClick: () => onDeleteWorkspace(workspaceId) },
    ]);
  };

  const commitRename = () => {
    if (!renaming) return;
    const value = renaming.value.trim();
    if (renaming.kind === "chat") workspaceStore.renameTab(renaming.id, value);
    if (renaming.kind === "workspace") workspaceStore.renameWorkspace(renaming.id, value);
    setRenaming(null);
  };

  const createWorkspace = () => {
    const name = workspaceName.trim();
    if (name) workspaceStore.createWorkspace(name);
    setWorkspaceName("");
    setCreatingWorkspace(false);
  };

  return (
    <aside className="flex h-full w-full flex-col bg-sidebar/40 border-r border-border overflow-hidden">
      <div className="flex-1 overflow-y-auto scrollbar-hide py-3">
        <button
          onClick={newChat}
          className="mx-3 flex w-[calc(100%-1.5rem)] items-center gap-2 px-4 py-2.5 rounded-md bg-accent text-surface font-sans text-sm font-medium transition-colors hover:bg-accent/90"
          title="New chat (Ctrl+N)"
        >
          <Plus size={15} /> New Chat
        </button>

        <div className="px-3 pt-5 pb-1">
          <span className="font-mono text-2xs uppercase tracking-ultra text-muted">Recent Chats</span>
        </div>
        <div className="space-y-px px-2">
          {chats.map((tab) => (
            <ChatRow
              key={tab.id}
              tabId={tab.id}
              active={tab.id === state.activeTabId}
              renaming={renaming?.kind === "chat" && renaming.id === tab.id ? renaming.value : null}
              onRename={(value) => setRenaming({ kind: "chat", id: tab.id, value })}
              onCommit={commitRename}
              onCancel={() => setRenaming(null)}
              onContextMenu={(e) => openChatMenu(e, tab.id)}
            />
          ))}
          {chats.length === 0 && (
            <div className="px-2 py-1.5 font-sans text-xs text-muted/60">No chats yet — start one above.</div>
          )}
        </div>

        <div className="px-3 pt-5 pb-1 flex items-center justify-between">
          <span className="font-mono text-2xs uppercase tracking-ultra text-muted">Workspaces</span>
          <button
            onClick={() => setCreatingWorkspace((v) => !v)}
            className="p-1 rounded-sm text-muted hover:text-bone hover:bg-bone/5"
            title="New workspace"
            aria-label="New workspace"
          >
            <Plus size={12} />
          </button>
        </div>

        {creatingWorkspace && (
          <div className="px-3 pb-2">
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createWorkspace();
                  if (e.key === "Escape") { setCreatingWorkspace(false); setWorkspaceName(""); }
                }}
                placeholder="New workspace"
                className="min-w-0 flex-1 bg-bone/[0.04] border border-border px-2.5 py-1.5 font-sans text-xs outline-none focus:border-accent/50 rounded-sm placeholder:text-muted/40"
              />
              <button
                onClick={createWorkspace}
                disabled={!workspaceName.trim()}
                className="px-2.5 py-1.5 rounded-sm bg-accent text-surface font-sans text-xs font-medium disabled:opacity-40"
              >
                Create
              </button>
            </div>
          </div>
        )}

        <div className="space-y-px px-2">
          {workspaces.map((w) => (
            <WorkspaceRow
              key={w.id}
              name={w.name}
              active={w.id === state.activeWorkspaceId}
              chatCount={state.tabs.filter((t) => t.workspaceId === w.id).length}
              renaming={renaming?.kind === "workspace" && renaming.id === w.id ? renaming.value : null}
              onRename={(value) => setRenaming({ kind: "workspace", id: w.id, value })}
              onCommit={commitRename}
              onCancel={() => setRenaming(null)}
              onClick={() => { workspaceStore.setActiveWorkspace(w.id); workspaceStore.takePendingRenameWorkspace(); }}
              onContextMenu={(e) => openWorkspaceMenu(e, w.id)}
            />
          ))}
          {workspaces.length === 0 && (
            <div className="px-2 py-1.5 font-sans text-xs text-muted/60">No workspaces yet.</div>
          )}
        </div>

        {activeWorkspace && (
          <div className="px-3 pt-4">
            <p className="font-sans text-2xs text-muted/70 leading-relaxed">
              Working in <span className="text-bone/70">{activeWorkspace.name}</span>
            </p>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border p-2 space-y-px">
        <button
          onClick={() => workspaceStore.setPrefs({ developerMode: true })}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md font-sans text-xs text-bone/70 hover:text-bone hover:bg-bone/5 transition-colors text-left"
          title="Switch to Developer Mode — model controls, graph, canvas, and diagnostics"
        >
          <MoreHorizontal size={13} className="text-muted shrink-0" />
          Developer Mode
        </button>
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md font-sans text-xs text-bone/70 hover:text-bone hover:bg-bone/5 transition-colors text-left"
        >
          <SettingsIcon size={13} className="text-muted shrink-0" />
          Settings
        </button>
        <button
          onClick={onExit}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md font-sans text-xs text-bone/50 hover:text-bone hover:bg-bone/5 transition-colors text-left"
        >
          <LogOut size={13} className="text-muted shrink-0" />
          Exit to landing page
        </button>
      </div>
      {menu}
    </aside>
  );
}

function ChatRow(props: {
  tabId: string;
  active: boolean;
  renaming: string | null;
  onRename: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const tab = workspaceStore.getState().tabs.find((t) => t.id === props.tabId);
  if (!tab) return null;
  return (
    <div
      onClick={() => workspaceStore.setActiveTab(tab.id)}
      onContextMenu={props.onContextMenu}
      className={cn(
        "group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-default transition-colors",
        props.active ? "bg-bone/8 text-bone" : "text-muted hover:text-bone hover:bg-bone/5",
      )}
      title={tab.title}
    >
      <MessageSquare size={12} className="shrink-0 opacity-60" />
      {props.renaming !== null ? (
        <input
          autoFocus
          value={props.renaming}
          onChange={(e) => props.onRename(e.target.value)}
          onBlur={props.onCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") props.onCommit();
            if (e.key === "Escape") props.onCancel();
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-full bg-transparent font-sans text-xs outline-none border border-accent/40 rounded-sm px-1 text-bone"
        />
      ) : (
        <span className="flex-1 min-w-0 font-sans text-xs truncate">{tab.title}</span>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          props.onContextMenu(e);
        }}
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded-sm text-muted hover:text-bone hover:bg-bone/10 shrink-0"
        aria-label="Chat options"
      >
        <MoreHorizontal size={12} />
      </button>
    </div>
  );
}

function WorkspaceRow(props: {
  name: string;
  active: boolean;
  chatCount: number;
  renaming: string | null;
  onRename: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onClick={props.onClick}
      onContextMenu={props.onContextMenu}
      className={cn(
        "group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-default transition-colors",
        props.active ? "bg-bone/8 text-bone" : "text-muted hover:text-bone hover:bg-bone/5",
      )}
    >
      {props.renaming !== null ? (
        <input
          autoFocus
          value={props.renaming}
          onChange={(e) => props.onRename(e.target.value)}
          onBlur={props.onCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") props.onCommit();
            if (e.key === "Escape") props.onCancel();
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-full bg-transparent font-sans text-xs outline-none border border-accent/40 rounded-sm px-1 text-bone"
        />
      ) : (
        <>
          <span className="flex-1 min-w-0 font-sans text-xs truncate">{props.name}</span>
          <span className="font-mono text-2xs text-muted/50 shrink-0">{props.chatCount}</span>
        </>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          props.onContextMenu(e);
        }}
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded-sm text-muted hover:text-bone hover:bg-bone/10 shrink-0"
        aria-label="Workspace options"
      >
        <MoreHorizontal size={12} />
      </button>
    </div>
  );
}