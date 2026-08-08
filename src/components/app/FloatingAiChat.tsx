import { useEffect, useRef, useState } from "react";
import { MessageSquare, X } from "lucide-react";
import { useWorkspaceStore, workspaceStore } from "../../stores/use-workspace";
import { ChatBlockContent } from "../canvas/blocks";
import type { CanvasBlock } from "../../types/canvas";

export function FloatingAiChat() {
  const state = useWorkspaceStore();
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const tabId = state.prefs.floatingChatTabId;
  const tab = tabId ? state.tabs.find((t) => t.id === tabId) ?? null : null;

  useEffect(() => {
    if (!state.prefs.floatingChatOpen) return;
    if (!tab) {
      const previous = workspaceStore.getState().activeTabId;
      const id = workspaceStore.createTab(state.activeWorkspaceId);
      workspaceStore.updateTab(id, { title: "AI Chat", pinned: true });
      workspaceStore.setPrefs({ floatingChatTabId: id });
      if (previous) workspaceStore.setActiveTab(previous);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.prefs.floatingChatOpen]);

  if (!state.prefs.floatingChatOpen || !tab) return null;

  const block: CanvasBlock = {
    id: "floating-chat",
    workspaceId: tab.workspaceId,
    type: "chat",
    title: tab.title,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    z: 0,
    pinned: true,
    color: null,
    createdAt: tab.createdAt,
    updatedAt: tab.updatedAt,
    data: { tabId: tab.id },
  };

  const onHeaderDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    setDragging(true);
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.dx;
      const dy = ev.clientY - dragRef.current.dy;
      setPos({ x: Math.min(Math.max(dx, 4), window.innerWidth - 340), y: Math.min(Math.max(dy, 4), window.innerHeight - 420) });
    };
    const onUp = () => {
      setDragging(false);
      dragRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      className="fixed z-50 w-80 h-[380px] flex flex-col bg-background border border-border rounded-md shadow-premium-lg overflow-hidden select-none"
      style={pos ? { left: pos.x, top: pos.y } : { right: 16, bottom: 40 }}
    >
      <div
        onPointerDown={onHeaderDown}
        className={`h-8 shrink-0 flex items-center gap-2 px-3 border-b border-border bg-bone/[0.02] cursor-grab active:cursor-grabbing ${dragging ? "opacity-70" : ""}`}
      >
        <MessageSquare size={11} className="text-accent shrink-0" />
        <span className="flex-1 min-w-0 truncate font-mono text-[10px] uppercase tracking-wider text-bone/80">AI Chat</span>
        <button
          onClick={() => workspaceStore.setPrefs({ floatingChatOpen: false })}
          className="p-0.5 rounded-sm text-muted hover:text-bone"
          title="Close floating AI chat"
        >
          <X size={11} />
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <ChatBlockContent block={block} />
      </div>
    </div>
  );
}
