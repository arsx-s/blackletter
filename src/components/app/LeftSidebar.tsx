import { useState, useEffect } from "react";
import {
  Archive, ChevronDown, ChevronRight, Copy, File, FileText, Folder,
  FolderOpen, FolderPlus, MoreHorizontal, Pencil, Plus, Pin, Star, Trash2,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { workspaceStore } from "../../stores/workspace-store";
import { useContextMenu, type ContextMenuItem } from "./ContextMenu";
import { ConfirmDialog } from "../ui/confirm-dialog";
import type { WorkspaceDocument } from "../../types/workspace";

const FOLDER_COLORS = ["", "#72383D", "#B45309", "#1D4ED8", "#15803D", "#7C3AED"];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function LeftSidebar() {
  const [renaming, setRenaming] = useState<{ kind: "workspace" | "folder" | "document" | "tab"; id: string; value: string } | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderInput, setFolderInput] = useState("");
  const [docFilter, setDocFilter] = useState("");
  const [recentFilter, setRecentFilter] = useState("");
  const [closingTabId, setClosingTabId] = useState<string | null>(null);
  const { open, menu } = useContextMenu();

  const state = workspaceStore.getState();
  const workspace = state.workspaces.find((w) => w.id === state.activeWorkspaceId) ?? null;

  useEffect(() => {
    const id = workspaceStore.takePendingRenameWorkspace();
    if (!id) return;
    const name = workspaceStore.getState().workspaces.find((w) => w.id === id)?.name ?? "";
    setRenaming({ kind: "workspace", id, value: name });
  }, [state.pendingRenameWorkspaceId]);
  const visibleWorkspaces = state.workspaces.filter((w) => !w.archived);
  const archived = state.workspaces.filter((w) => w.archived);
  const folders = state.folders
    .filter((f) => f.workspaceId === state.activeWorkspaceId)
    .sort((a, b) => a.order - b.order);
  const workspaceTabs = state.tabs.filter((t) => t.workspaceId === state.activeWorkspaceId);
  const documents = state.documents.filter((d) => d.workspaceId === state.activeWorkspaceId);
  const recentSessions = workspaceTabs
    .filter((t) => {
      if (!recentFilter) return true;
      const q = recentFilter.toLowerCase();
      return t.title.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (b.lastOpenedAt ?? b.updatedAt) - (a.lastOpenedAt ?? a.updatedAt);
    });

  const openWorkspaceMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const w = state.workspaces.find((x) => x.id === id);
    if (!w) return;
    const items: ContextMenuItem[] = [
      { label: "Activate", icon: <Star />, onClick: () => workspaceStore.setActiveWorkspace(id) },
      { label: "Rename…", icon: <Pencil />, onClick: () => setRenaming({ kind: "workspace", id, value: w.name }) },
      { label: w.favorite ? "Remove from favorites" : "Add to favorites", icon: <Star />, onClick: () => workspaceStore.toggleFavoriteWorkspace(id) },
      { label: "Duplicate workspace", icon: <Copy />, onClick: () => workspaceStore.duplicateWorkspace(id) },
      {
        label: w.archived ? "Restore workspace" : "Archive workspace",
        icon: <Archive />,
        onClick: () => (w.archived ? workspaceStore.restoreWorkspace(id) : workspaceStore.archiveWorkspace(id)),
      },
      { label: "Delete workspace", icon: <Trash2 />, danger: true, onClick: () => { if (window.confirm(`Delete workspace "${w.name}"? This permanently removes all of its sessions.`)) workspaceStore.deleteWorkspace(id); } },
    ];
    open(e.clientX, e.clientY, items);
  };

  const openFolderMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const items: ContextMenuItem[] = [
      { label: "Rename…", icon: <Pencil />, onClick: () => { const f = state.folders.find((x) => x.id === id); if (f) setRenaming({ kind: "folder", id, value: f.name }); } },
      ...FOLDER_COLORS.map((color) => ({
        label: color ? `Label ${color}` : "No label",
        icon: <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color || "transparent" }} />,
        onClick: () => workspaceStore.setFolderColor(id, color),
      })),
      { label: "Delete folder", icon: <Trash2 />, danger: true, onClick: () => workspaceStore.deleteFolder(id) },
    ];
    open(e.clientX, e.clientY, items);
  };

  const openDocumentMenu = (e: React.MouseEvent, doc: WorkspaceDocument) => {
    e.preventDefault();
    const moveItems: ContextMenuItem[] = folders.map((folder) => ({
      label: folder.name,
      icon: <Folder size={12} />,
      onClick: () => workspaceStore.moveDocument(doc.id, folder.id),
    }));
    const items: ContextMenuItem[] = [
      { label: "Rename…", icon: <Pencil />, onClick: () => setRenaming({ kind: "document", id: doc.id, value: doc.name }) },
      ...moveItems.map((item, i) => ({ ...item, separatorBefore: i === 0 })),
      {
        label: "Remove from folder",
        icon: <FolderOpen size={12} />,
        onClick: () => workspaceStore.moveDocument(doc.id, null),
      },
      { label: "Delete document", icon: <Trash2 />, danger: true, separatorBefore: true, onClick: () => workspaceStore.deleteDocument(doc.id) },
    ];
    open(e.clientX, e.clientY, items);
  };

  const openTabMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const tab = state.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const items: ContextMenuItem[] = [
      { label: "Activate", icon: <Star />, onClick: () => workspaceStore.setActiveTab(tabId) },
      { label: "Rename…", icon: <Pencil />, onClick: () => setRenaming({ kind: "tab", id: tabId, value: tab.title }) },
      { label: tab.pinned ? "Unpin" : "Pin", icon: <Pin size={12} />, onClick: () => workspaceStore.pinTab(tabId) },
      { label: "Duplicate", icon: <Copy size={12} />, onClick: () => workspaceStore.duplicateTab(tabId) },
      { label: "Delete session…", icon: <Trash2 size={12} />, danger: true, separatorBefore: true, onClick: () => setClosingTabId(tabId) },
    ];
    open(e.clientX, e.clientY, items);
  };

  const commitRename = () => {
    if (!renaming) return;
    const value = renaming.value.trim();
    if (renaming.kind === "workspace") workspaceStore.renameWorkspace(renaming.id, value);
    if (renaming.kind === "folder") workspaceStore.renameFolder(renaming.id, value);
    if (renaming.kind === "document") workspaceStore.renameDocument(renaming.id, value);
    if (renaming.kind === "tab") workspaceStore.renameTab(renaming.id, value);
    setRenaming(null);
  };

  const createFolder = () => {
    const name = folderInput.trim();
    if (name) workspaceStore.createFolder(state.activeWorkspaceId, name);
    setFolderInput("");
    setCreatingFolder(false);
  };

  const filteredDocs = docFilter
    ? documents.filter((d) => d.name.toLowerCase().includes(docFilter.toLowerCase()))
    : documents;

  return (
    <aside className="flex h-full w-full flex-col bg-sidebar/40 border-r border-border overflow-hidden">
      <div className="flex-1 overflow-y-auto scrollbar-hide py-2">
        <div className="px-3 pb-2 flex items-center justify-between">
          <span className="font-mono text-2xs uppercase tracking-ultra text-muted">Workspaces</span>
          <button
            onClick={() => {
              const id = workspaceStore.createWorkspace("");
              setRenaming({ kind: "workspace", id, value: "" });
            }}
            className="p-1 rounded-sm text-muted hover:text-bone hover:bg-bone/5"
            title="New workspace (Ctrl+Shift+N)"
            aria-label="New workspace"
          >
            <Plus size={12} />
          </button>
        </div>

        <div className="space-y-px px-2">
          {visibleWorkspaces.map((w) => (
            <WorkspaceRow
              key={w.id}
              name={w.name}
              favorite={w.favorite}
              active={w.id === state.activeWorkspaceId}
              tabCount={state.tabs.filter((t) => t.workspaceId === w.id).length}
              renaming={renaming?.kind === "workspace" && renaming.id === w.id ? renaming.value : null}
              onRename={(value) => setRenaming({ kind: "workspace", id: w.id, value })}
              onCommit={commitRename}
              onCancel={() => setRenaming(null)}
              onClick={() => workspaceStore.setActiveWorkspace(w.id)}
              onContextMenu={(e) => openWorkspaceMenu(e, w.id)}
            />
          ))}
          {archived.length > 0 && (
            <div className="pt-1 mt-1 border-t border-border/50">
              {archived.map((w) => (
                <WorkspaceRow
                  key={w.id}
                  name={w.name}
                  favorite={w.favorite}
                  active={w.id === state.activeWorkspaceId}
                  tabCount={0}
                  archived
                  renaming={renaming?.kind === "workspace" && renaming.id === w.id ? renaming.value : null}
                  onRename={(value) => setRenaming({ kind: "workspace", id: w.id, value })}
                  onCommit={commitRename}
                  onCancel={() => setRenaming(null)}
                  onClick={() => workspaceStore.setActiveWorkspace(w.id)}
                  onContextMenu={(e) => openWorkspaceMenu(e, w.id)}
                />
              ))}
            </div>
          )}
        </div>

        {workspace && (
          <>
            <div className="px-3 pt-4 pb-1 flex items-center justify-between">
              <span className="font-mono text-2xs uppercase tracking-ultra text-muted">{workspace.name} · Folders</span>
              <button
                onClick={() => setCreatingFolder((v) => !v)}
                className="p-1 rounded-sm text-muted hover:text-bone hover:bg-bone/5"
                title="New folder"
                aria-label="New folder"
              >
                <FolderPlus size={12} />
              </button>
            </div>

            {creatingFolder && (
              <div className="px-3 pb-1">
                <input
                  autoFocus
                  value={folderInput}
                  onChange={(e) => setFolderInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") createFolder();
                    if (e.key === "Escape") { setCreatingFolder(false); setFolderInput(""); }
                  }}
                  onBlur={createFolder}
                  placeholder="Folder name…"
                  className="w-full bg-bone/[0.04] border border-border px-2 py-1 font-sans text-xs outline-none focus:border-accent/50 rounded-sm placeholder:text-muted/40"
                />
              </div>
            )}

            <div className="space-y-px px-2">
              {folders.map((folder) => {
                const folderTabs = workspaceTabs.filter((t) => t.folderId === folder.id);
                const expanded = !folder.collapsed;
                return (
                  <div key={folder.id}>
                    <div
                      className={cn(
                        "group flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-default transition-colors",
                        "text-muted hover:text-bone hover:bg-bone/5",
                      )}
                      onContextMenu={(e) => openFolderMenu(e, folder.id)}
                    >
                      <button
                        onClick={() => workspaceStore.toggleFolderCollapsed(folder.id)}
                        className="p-0.5 rounded-sm hover:bg-bone/10"
                        aria-label={expanded ? "Collapse folder" : "Expand folder"}
                      >
                        {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      </button>
                      {folder.color ? (
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: folder.color }} />
                      ) : (
                        <FolderOpen size={12} className="shrink-0 opacity-70" />
                      )}
                      {renaming?.kind === "folder" && renaming.id === folder.id ? (
                        <input
                          autoFocus
                          value={renaming.value}
                          onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename();
                            if (e.key === "Escape") setRenaming(null);
                          }}
                          className="w-full bg-transparent font-sans text-xs outline-none border border-accent/40 rounded-sm px-1"
                        />
                      ) : (
                        <button
                          className="flex-1 flex items-center gap-1 min-w-0 text-left font-sans text-xs truncate"
                          onClick={() => workspaceStore.toggleFolderCollapsed(folder.id)}
                        >
                          <span className="truncate">{folder.name}</span>
                          <span className="font-mono text-2xs text-muted/60 shrink-0">({folderTabs.length})</span>
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openFolderMenu(e as unknown as React.MouseEvent, folder.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded-sm text-muted hover:text-bone hover:bg-bone/10"
                        aria-label="Folder options"
                      >
                        <MoreHorizontal size={11} />
                      </button>
                    </div>
                    {expanded && (
                      <div className="ml-5 space-y-px">
                        {folderTabs.map((tab) => (
                          <TabItem key={tab.id} tabId={tab.id} active={tab.id === state.activeTabId} renaming={renaming} onRename={(v) => setRenaming({ kind: "tab", id: tab.id, value: v })} onCommit={commitRename} onCancel={() => setRenaming(null)} onContextMenu={(e) => openTabMenu(e, tab.id)} />
                        ))}
                        <div
                          className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-muted/40 font-sans text-2xs border border-dashed border-border/40"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            const docId = e.dataTransfer.getData("text/plain");
                            if (docId) workspaceStore.moveDocument(docId, folder.id);
                            const tabId = e.dataTransfer.getData("application/x-bl-tab");
                            if (tabId) workspaceStore.moveTabToFolder(tabId, folder.id);
                          }}
                        >
                          <Folder size={10} /> Drop tabs or documents here
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {folders.length === 0 && !creatingFolder && (
                <div className="px-2 py-1.5 font-sans text-2xs text-muted/50">No folders — create one to organize sessions.</div>
              )}
            </div>

            <div className="px-3 pt-4 pb-1">
              <span className="font-mono text-2xs uppercase tracking-ultra text-muted">Sessions</span>
            </div>
            <div className="space-y-px px-2">
              {workspaceTabs.filter((t) => !t.folderId).map((tab) => (
                <TabItem key={tab.id} tabId={tab.id} active={tab.id === state.activeTabId} renaming={renaming} onRename={(v) => setRenaming({ kind: "tab", id: tab.id, value: v })} onCommit={commitRename} onCancel={() => setRenaming(null)} onContextMenu={(e) => openTabMenu(e, tab.id)} />
              ))}
              {workspaceTabs.length === 0 && (
                <div className="px-2 py-1.5 font-sans text-2xs text-muted/50">No sessions yet.</div>
              )}
            </div>

            <div className="px-3 pt-4 pb-1">
              <span className="font-mono text-2xs uppercase tracking-ultra text-muted">Documents</span>
            </div>
            <div className="px-2 pb-1">
              <input
                value={docFilter}
                onChange={(e) => setDocFilter(e.target.value)}
                placeholder="Filter documents…"
                className="w-full bg-bone/[0.04] border border-border px-2 py-1 font-sans text-xs outline-none focus:border-accent/50 rounded-sm placeholder:text-muted/40"
              />
            </div>
            <div className="space-y-px px-2">
              {filteredDocs.map((doc) => (
                <div
                  key={doc.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", doc.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onContextMenu={(e) => openDocumentMenu(e, doc)}
                  onClick={() => workspaceStore.setPrefs({ documentsViewOpen: true, focusDocumentId: doc.id })}
                  className={cn(
                    "group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
                    "text-muted hover:text-bone hover:bg-bone/5",
                  )}
                  title={doc.name}
                >
                  <File size={12} className="shrink-0 opacity-70" />
                  {renaming?.kind === "document" && renaming.id === doc.id ? (
                    <input
                      autoFocus
                      value={renaming.value}
                      onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      className="w-full bg-transparent font-sans text-xs outline-none border border-accent/40 rounded-sm px-1"
                    />
                  ) : (
                    <>
                      <span className="flex-1 min-w-0 font-sans text-xs truncate">{doc.name}</span>
                      <span className="font-mono text-2xs text-muted/50 shrink-0">{formatBytes(doc.size)}</span>
                      {doc.status === "processing" && <span className="w-1.5 h-1.5 rounded-full bg-accent/50 animate-pulse shrink-0" />}
                    </>
                  )}
                </div>
              ))}
              {documents.length === 0 && (
                <div className="px-2 py-1.5 font-sans text-2xs text-muted/50">Upload documents from a session.</div>
              )}
            </div>

            <div className="px-3 pt-4 pb-1 flex items-center justify-between">
              <span className="font-mono text-2xs uppercase tracking-ultra text-muted">Recent</span>
            </div>
            <div className="px-2 pb-1">
              <input
                value={recentFilter}
                onChange={(e) => setRecentFilter(e.target.value)}
                placeholder="Search recent sessions…"
                className="w-full bg-bone/[0.04] border border-border px-2 py-1 font-sans text-xs outline-none focus:border-accent/50 rounded-sm placeholder:text-muted/40"
              />
            </div>
            <div className="space-y-px px-2 pb-2">
              {recentSessions.slice(0, 8).map((tab) => (
                <TabItem key={tab.id} tabId={tab.id} active={tab.id === state.activeTabId} compact renaming={renaming} onRename={(v) => setRenaming({ kind: "tab", id: tab.id, value: v })} onCommit={commitRename} onCancel={() => setRenaming(null)} onContextMenu={(e) => openTabMenu(e, tab.id)} />
              ))}
              {recentSessions.length === 0 && <div className="px-2 py-1.5 font-sans text-2xs text-muted/50">Recent sessions appear here.</div>}
            </div>
          </>
        )}
      </div>
      {menu}
      <ConfirmDialog
        isOpen={closingTabId !== null}
        title="Delete session?"
        message={`"${state.tabs.find((t) => t.id === closingTabId)?.title ?? "Untitled Research"}" and its entire conversation history will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete session"
        onConfirm={() => { if (closingTabId) workspaceStore.closeTab(closingTabId); }}
        onClose={() => setClosingTabId(null)}
      />
    </aside>
  );
}

function WorkspaceRow(props: {
  name: string;
  favorite: boolean;
  active: boolean;
  tabCount: number;
  archived?: boolean;
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
        props.archived && "opacity-50",
      )}
    >
      {props.favorite && <Star size={11} className="shrink-0 fill-accent text-accent" />}
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
          className="w-full bg-transparent font-sans text-xs outline-none border border-accent/40 rounded-sm px-1"
        />
      ) : (
        <>
          <span className="flex-1 min-w-0 font-sans text-xs truncate">{props.name}</span>
          <span className="font-mono text-2xs text-muted/50 shrink-0">{props.tabCount}</span>
        </>
      )}
    </div>
  );
}

function TabItem(props: {
  tabId: string;
  active: boolean;
  compact?: boolean;
  renaming: { kind: string; id: string; value: string } | null;
  onRename: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const tab = workspaceStore.getState().tabs.find((t) => t.id === props.tabId);
  if (!tab) return null;
  const renaming = props.renaming;
  const isRenaming = renaming?.kind === "tab" && renaming.id === tab.id;
  return (
    <div
      onClick={() => workspaceStore.setActiveTab(tab.id)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        props.onRename(tab.title);
      }}
      onContextMenu={props.onContextMenu}
      draggable={!isRenaming}
      onDragStart={(e) => e.dataTransfer.setData("application/x-bl-tab", tab.id)}
      className={cn(
        "group flex items-center gap-1.5 px-2 rounded-md cursor-default transition-colors",
        props.compact ? "py-1" : "py-1.5",
        props.active ? "bg-bone/8 text-bone" : "text-muted hover:text-bone hover:bg-bone/5",
      )}
      title={tab.title}
    >
      <FileText size={11} className="shrink-0 opacity-60" />
      {isRenaming ? (
        <input
          autoFocus
          value={renaming.value}
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
      {tab.pinned && <Pin size={10} className="shrink-0 opacity-50" />}
      {tab.unsaved && !isRenaming && <span className="text-accent shrink-0">•</span>}
    </div>
  );
}