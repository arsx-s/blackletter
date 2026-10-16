import { useEffect, useState } from "react";
import { LogOut, MessageSquare, MoreHorizontal, Pencil, Plus, Settings as SettingsIcon, Trash2 } from "lucide-react";
import { useWorkspaceStore, workspaceStore } from "../../stores/use-workspace";
import { useContextMenu } from "../app/ContextMenu";
import { Button } from "../ui/button";
import { fieldAppearance } from "../../lib/field-styles";
import { cn } from "../../lib/utils";

interface SimpleSidebarProps {
  onOpenSettings: () => void;
  onExit: () => void;
  onDeleteChat: (tabId: string) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
}

/** Compact relative time for the recents list — derived from the real stored
 *  timestamps, no invented activity. */
function formatRelativeTime(ts: number): string {
  const minutes = Math.floor((Date.now() - ts) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
    <aside className="flex h-full w-full flex-col overflow-hidden border-r border-border bg-sidebar/40">
      <div className="scrollbar-hide flex-1 overflow-y-auto py-3">
        <div className="px-3">
          <Button onClick={newChat} className="w-full gap-2" title="New chat (Ctrl+N)" aria-label="New chat (Ctrl+N)">
            <Plus size={15} /> New Chat
          </Button>
        </div>

        <div className="px-3 pb-1 pt-5">
          <span className="font-mono text-2xs uppercase tracking-ultra text-muted">Recent Chats</span>
        </div>
        <div className="space-y-px px-2" role="list">
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
            <div className="px-2 py-1.5 font-sans text-xs text-faint">No chats yet — start one above.</div>
          )}
        </div>

        <div className="flex items-center justify-between px-3 pb-1 pt-5">
          <span className="font-mono text-2xs uppercase tracking-ultra text-muted">Workspaces</span>
          <button
            onClick={() => setCreatingWorkspace((v) => !v)}
            className="rounded-sm p-1 text-muted transition-colors hover:bg-bone/5 hover:text-bone focus-ring"
            title="New workspace"
            aria-label="New workspace"
            aria-expanded={creatingWorkspace}
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
                aria-label="New workspace name"
                className={cn(fieldAppearance, "min-w-0 flex-1 px-2.5 py-1.5 text-xs")}
              />
              <Button
                size="sm"
                onClick={createWorkspace}
                disabled={!workspaceName.trim()}
                className="shrink-0 px-2.5"
              >
                Create
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-px px-2" role="list">
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
            <div className="px-2 py-1.5 font-sans text-xs text-faint">No workspaces yet.</div>
          )}
        </div>

        {activeWorkspace && (
          <div className="px-3 pt-4">
            <p className="font-sans text-2xs leading-relaxed text-faint">
              Working in <span className="text-bone">{activeWorkspace.name}</span>
            </p>
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-px border-t border-border p-2">
        <button
          onClick={() => workspaceStore.setPrefs({ developerMode: true })}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left font-sans text-xs text-bone transition-colors hover:bg-bone/5 focus-ring"
          title="Switch to Developer Mode — model controls, graph, canvas, and diagnostics"
        >
          <MoreHorizontal size={13} className="shrink-0" aria-hidden="true" />
          Developer Mode
        </button>
        <button
          onClick={onOpenSettings}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left font-sans text-xs text-bone transition-colors hover:bg-bone/5 focus-ring"
        >
          <SettingsIcon size={13} className="shrink-0" aria-hidden="true" />
          Settings
        </button>
        <button
          onClick={onExit}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left font-sans text-xs text-faint transition-colors hover:bg-bone/5 hover:text-bone focus-ring"
        >
          <LogOut size={13} className="shrink-0" aria-hidden="true" />
          Exit to landing page
        </button>
      </div>
      {menu}
    </aside>
  );
}

/** Shared row chrome: the active row carries an accent rail so the current
 *  context is legible without relying on a low-contrast background wash. */
function rowClass(active: boolean) {
  return cn(
    "group relative flex items-center rounded-md transition-colors",
    active ? "bg-bone/[0.07] text-bone" : "text-muted hover:bg-bone/[0.04] hover:text-bone",
  );
}

function ActiveRail() {
  return (
    <span
      className="absolute left-0 top-1/2 h-3.5 w-[2px] -translate-y-1/2 rounded-full bg-accent"
      aria-hidden="true"
    />
  );
}

function RowOptionsButton({ label, onClick }: { label: string; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className="hover-reveal mr-0.5 shrink-0 rounded-sm p-0.5 text-muted transition-colors hover:bg-bone/10 hover:text-bone focus-ring"
      aria-label={label}
      title={label}
    >
      <MoreHorizontal size={12} />
    </button>
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

  const renamed = props.renaming !== null;
  const stamp = tab.lastOpenedAt ?? tab.updatedAt;

  return (
    <div role="listitem" className={rowClass(props.active)}>
      {props.active && <ActiveRail />}
      {/* The row body is a real button, not a clickable div, and the options
          trigger is a sibling rather than a nested button (which would be
          invalid HTML and unreachable by keyboard). While renaming, the input
          replaces the button outright — interactive content cannot nest. */}
      {renamed ? (
        <div className="flex min-w-0 flex-1 items-center gap-2 py-1 pl-2.5 pr-1">
          <MessageSquare size={12} className="shrink-0 opacity-60" aria-hidden="true" />
          <input
            autoFocus
            value={props.renaming ?? ""}
            onChange={(e) => props.onRename(e.target.value)}
            onBlur={props.onCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter") props.onCommit();
              if (e.key === "Escape") props.onCancel();
            }}
            aria-label="Rename chat"
            className="w-full min-w-0 rounded-sm border border-accent/40 bg-transparent px-1 font-sans text-xs text-bone outline-none focus:ring-1 focus:ring-accent/40"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => workspaceStore.setActiveTab(tab.id)}
          onContextMenu={props.onContextMenu}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 pl-2.5 pr-1 text-left focus-ring"
          title={tab.title}
          aria-current={props.active ? "true" : undefined}
        >
          <MessageSquare
            size={12}
            className={cn("shrink-0", props.active ? "text-accent" : "opacity-60")}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate font-sans text-xs">{tab.title}</span>
        </button>
      )}
      {!renamed && (
        <time
          dateTime={new Date(stamp).toISOString()}
          className="hover-conceal mr-1 shrink-0 font-mono text-2xs text-faint"
        >
          {formatRelativeTime(stamp)}
        </time>
      )}
      <RowOptionsButton label={`Options for ${tab.title}`} onClick={props.onContextMenu} />
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
  const renamed = props.renaming !== null;

  return (
    <div role="listitem" className={rowClass(props.active)}>
      {props.active && <ActiveRail />}
      {renamed ? (
        <div className="flex min-w-0 flex-1 items-center gap-2 py-1 pl-2.5 pr-1">
          <input
            autoFocus
            value={props.renaming ?? ""}
            onChange={(e) => props.onRename(e.target.value)}
            onBlur={props.onCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter") props.onCommit();
              if (e.key === "Escape") props.onCancel();
            }}
            aria-label="Rename workspace"
            className="w-full min-w-0 rounded-sm border border-accent/40 bg-transparent px-1 font-sans text-xs text-bone outline-none focus:ring-1 focus:ring-accent/40"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={props.onClick}
          onContextMenu={props.onContextMenu}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 pl-2.5 pr-1 text-left focus-ring"
          aria-current={props.active ? "true" : undefined}
        >
          <span className="min-w-0 flex-1 truncate font-sans text-xs">{props.name}</span>
          <span className="shrink-0 font-mono text-2xs text-faint" aria-label={`${props.chatCount} chats`}>
            {props.chatCount}
          </span>
        </button>
      )}
      <RowOptionsButton label={`Options for ${props.name}`} onClick={props.onContextMenu} />
    </div>
  );
}
