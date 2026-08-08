import { useState } from "react";
import { FileText, Plus, Pin, X, Copy, Pencil, Star, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "../../lib/utils";
import { workspaceStore } from "../../stores/workspace-store";
import { useContextMenu, type ContextMenuItem } from "./ContextMenu";
import { ConfirmDialog } from "../ui/confirm-dialog";

export function TabBar({ onNewSession }: { onNewSession: () => void }) {
  const state = workspaceStore.getState();
  const tabs = state.tabs.filter((t) => t.workspaceId === state.activeWorkspaceId);
  const pinned = tabs.filter((t) => t.pinned);
  const unpinned = tabs.filter((t) => !t.pinned);
  const ordered = [...pinned, ...unpinned];
  const activeId = state.activeTabId;

  const { open, menu } = useContextMenu();
  const [dragId, setDragId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [closingTabId, setClosingTabId] = useState<string | null>(null);

  const closingTab = state.tabs.find((t) => t.id === closingTabId) ?? null;

  const openContext = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (renaming?.id === tabId) return;
    const tab = workspaceStore.getState().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const items: ContextMenuItem[] = [
      {
        label: "Activate",
        icon: <Star />,
        onClick: () => workspaceStore.setActiveTab(tabId),
      },
      {
        label: "Duplicate tab",
        icon: <Copy />,
        onClick: () => workspaceStore.duplicateTab(tabId),
      },
      {
        label: "Rename…",
        icon: <Pencil />,
        onClick: () => beginRename(tabId),
      },
      {
        label: tab.pinned ? "Unpin tab" : "Pin tab",
        icon: <Pin />,
        onClick: () => workspaceStore.pinTab(tabId),
      },
      {
        label: "Delete session…",
        icon: <Trash2 />,
        danger: true,
        separatorBefore: true,
        onClick: () => setClosingTabId(tabId),
      },
    ];
    open(e.clientX, e.clientY, items);
  };

  const beginRename = (tabId: string) => {
    const tab = workspaceStore.getState().tabs.find((t) => t.id === tabId);
    if (tab) setRenaming({ id: tabId, value: tab.title });
  };

  const commitRename = () => {
    if (renaming) workspaceStore.renameTab(renaming.id, renaming.value.trim());
    setRenaming(null);
  };

  return (
    <div className="h-10 shrink-0 flex items-end gap-0.5 px-2 pt-1.5 border-b border-border bg-background/90 select-none">
      <div className="flex items-center gap-0.5 min-w-0 overflow-x-auto scrollbar-hide flex-1">
        {ordered.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <div
              key={tab.id}
              onClick={() => workspaceStore.setActiveTab(tab.id)}
              onContextMenu={(e) => openContext(e, tab.id)}
              onDoubleClick={() => beginRename(tab.id)}
              draggable
              onDragStart={() => setDragId(tab.id)}
              onDragOver={(e) => {
                if (dragId && dragId !== tab.id) {
                  e.preventDefault();
                  const current = workspaceStore.getState().tabs.filter((t) => t.workspaceId === workspaceStore.getState().activeWorkspaceId);
                  const toIndex = current.findIndex((t) => t.id === tab.id);
                  workspaceStore.reorderTab(dragId, toIndex, workspaceStore.getState().activeWorkspaceId);
                }
              }}
              onDragEnd={() => setDragId(null)}
              className={cn(
                "group relative flex h-7 min-w-0 items-center gap-1.5 rounded-md px-2.5 cursor-default transition-colors",
                isActive ? "bg-surface text-bone" : "text-muted hover:bg-bone/5 hover:text-bone/80",
              )}
              title={tab.title}
            >
              <FileText size={12} className="shrink-0 opacity-60" />
              {renaming?.id === tab.id ? (
                <input
                  autoFocus
                  value={renaming.value}
                  onChange={(e) => setRenaming({ id: tab.id, value: e.target.value })}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-32 bg-transparent font-sans text-xs outline-none border border-accent/40 rounded-sm px-1 text-bone"
                />
              ) : (
                <span className="font-sans text-xs truncate max-w-40">
                  {tab.title}
                  {tab.unsaved && <span className="ml-0.5 text-accent">•</span>}
                </span>
              )}
              {tab.pinned && <Pin size={10} className="shrink-0 opacity-50" />}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setClosingTabId(tab.id);
                }}
                className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 rounded-sm hover:bg-bone/10 text-muted hover:text-bone"
                aria-label={`Delete ${tab.title}`}
                title="Delete session"
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
        <motion.button
          onClick={onNewSession}
          className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:text-bone hover:bg-bone/5 transition-colors"
          title="New research (Ctrl+N)"
          aria-label="New tab"
        >
          <Plus size={13} />
        </motion.button>
        <div className="flex-1" />
      </div>
      {menu}
      <ConfirmDialog
        isOpen={closingTabId !== null}
        title="Delete session?"
        message={`"${closingTab?.title ?? "Untitled Research"}" and its entire conversation history will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete session"
        onConfirm={() => { if (closingTabId) workspaceStore.closeTab(closingTabId); }}
        onClose={() => setClosingTabId(null)}
      />
    </div>
  );
}