import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown, ChevronLeft, ChevronRight, History, Layout, Plus,
  Presentation, Search, StickyNote, X, ZoomIn, ZoomOut,
} from "lucide-react";
import { useWorkspaceStore, workspaceStore } from "../../stores/use-workspace";
import { useContextMenu } from "../app/ContextMenu";
import { BlockContent, BlockRenderer } from "./blocks";
import type { CanvasBlock, CanvasBlockType } from "../../types/canvas";
import { cn } from "../../lib/utils";

interface Camera { x: number; y: number; zoom: number; }

const SNAP = 8;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function toWorld(clientX: number, clientY: number, rect: DOMRect, camera: Camera): { x: number; y: number } {
  return { x: (clientX - rect.left - camera.x) / camera.zoom, y: (clientY - rect.top - camera.y) / camera.zoom };
}

export function CanvasView() {
  const state = useWorkspaceStore();
  const wsId = state.activeWorkspaceId;
  const blocks = useMemo(() => workspaceStore.canvasBlocksFor(wsId), [state.canvasBlocks, wsId]);
  const edges = useMemo(() => workspaceStore.canvasEdgesFor(wsId), [state.canvasEdges, wsId]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState<Camera>({ x: 60, y: 40, zoom: 1 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<{ fromId: string; x: number; y: number } | null>(null);
  const [present, setPresent] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [query, setQuery] = useState("");
  const dragRef = useRef<null | { kind: "pan" } | { kind: "block"; id: string; sx: number; sy: number; bx: number; by: number } | { kind: "resize"; id: string; sx: number; sy: number; bw: number; bh: number }>(null);
  const { open: openMenu, close: closeMenu, menu } = useContextMenu();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (state.prefs.focusCanvasBlockId) {
      const id = state.prefs.focusCanvasBlockId;
      const block = workspaceStore.getState().canvasBlocks.find((b) => b.id === id);
      if (block && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setCamera((c) => ({
          ...c,
          x: rect.width / 2 - (block.x + block.w / 2) * c.zoom,
          y: rect.height / 2 - (block.y + block.h / 2) * c.zoom,
        }));
        setSelectedId(id);
      }
      workspaceStore.setPrefs({ focusCanvasBlockId: null });
    }
  }, [state.prefs.focusCanvasBlockId]);

  const worldBounds = useMemo(() => {
    if (blocks.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of blocks) {
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
    }
    return { minX, minY, maxX, maxY };
  }, [blocks]);

  const visibleBlocks = useMemo(() => {
    if (size.w === 0) return blocks;
    const margin = 200;
    const vx0 = -camera.x / camera.zoom - margin;
    const vy0 = -camera.y / camera.zoom - margin;
    const vx1 = vx0 + size.w / camera.zoom + margin * 2;
    const vy1 = vy0 + size.h / camera.zoom + margin * 2;
    return blocks.filter((b) => b.x < vx1 && b.x + b.w > vx0 && b.y < vy1 && b.y + b.h > vy0);
  }, [blocks, camera, size]);

  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return new Set<string>();
    return new Set(blocks.filter((b) => b.title.toLowerCase().includes(q)).map((b) => b.id));
  }, [blocks, query]);

  const fit = useCallback(() => {
    if (!worldBounds || size.w === 0) return;
    const bw = worldBounds.maxX - worldBounds.minX || 400;
    const bh = worldBounds.maxY - worldBounds.minY || 300;
    const zoom = clamp(Math.min((size.w - 80) / bw, (size.h - 80) / bh), MIN_ZOOM, 1.2);
    setCamera({
      zoom,
      x: (size.w - bw * zoom) / 2 - worldBounds.minX * zoom,
      y: (size.h - bh * zoom) / 2 - worldBounds.minY * zoom,
    });
  }, [worldBounds, size]);

  useEffect(() => {
    if (state.prefs.canvasViewOpen) {
      const t = setTimeout(() => fit(), 80);
      workspaceStore.setPrefs({ canvasViewOpen: false });
      return () => clearTimeout(t);
    }
  }, [state.prefs.canvasViewOpen, fit]);

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = clientX - rect.left, py = clientY - rect.top;
    const wx = (px - camera.x) / camera.zoom, wy = (py - camera.y) / camera.zoom;
    const zoom = clamp(camera.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    setCamera({ x: px - wx * zoom, y: py - wy * zoom, zoom });
  }, [camera]);

  const zoomAtCenter = useCallback((factor: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }, [zoomAt]);

  const startPan = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (e.detail === 2) {
      const rect = containerRef.current!.getBoundingClientRect();
      const p = toWorld(e.clientX, e.clientY, rect, camera);
      workspaceStore.addCanvasBlock({
        workspaceId: wsId,
        type: "sticky",
        title: "Sticky Note",
        x: Math.round(p.x / SNAP) * SNAP,
        y: Math.round(p.y / SNAP) * SNAP,
        data: { text: "" },
      });
      return;
    }
    dragRef.current = { kind: "pan" };
    const sx = e.clientX, sy = e.clientY, cam = camera;
    const move = (ev: PointerEvent) => {
      if (dragRef.current?.kind !== "pan") return;
      setCamera((c) => ({ ...c, x: cam.x + (ev.clientX - sx), y: cam.y + (ev.clientY - sy) }));
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [camera, wsId]);

  const startDragBlock = useCallback((e: React.PointerEvent, block: CanvasBlock) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelectedId(block.id);
    workspaceStore.bringCanvasBlockToFront(block.id);
    dragRef.current = { kind: "block", id: block.id, sx: e.clientX, sy: e.clientY, bx: block.x, by: block.y };
    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d || d.kind !== "block") return;
      const dx = (ev.clientX - d.sx) / camera.zoom;
      const dy = (ev.clientY - d.sy) / camera.zoom;
      workspaceStore.updateCanvasBlock(d.id, {
        x: Math.round((d.bx + dx) / SNAP) * SNAP,
        y: Math.round((d.by + dy) / SNAP) * SNAP,
      });
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [camera]);

  const startResize = useCallback((e: React.PointerEvent, block: CanvasBlock) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelectedId(block.id);
    dragRef.current = { kind: "resize", id: block.id, sx: e.clientX, sy: e.clientY, bw: block.w, bh: block.h };
    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d || d.kind !== "resize") return;
      const dx = (ev.clientX - d.sx) / camera.zoom;
      const dy = (ev.clientY - d.sy) / camera.zoom;
      workspaceStore.updateCanvasBlock(d.id, {
        w: Math.max(160, Math.round((d.bw + dx) / SNAP) * SNAP),
        h: Math.max(120, Math.round((d.bh + dy) / SNAP) * SNAP),
      });
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [camera]);

  const beginConnect = useCallback((e: React.PointerEvent, fromId: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setConnecting({ fromId, x: e.clientX, y: e.clientY });
    const move = (ev: PointerEvent) => setConnecting((c) => (c ? { ...c, x: ev.clientX, y: ev.clientY } : c));
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setConnecting((c) => {
        if (!c) return null;
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          for (const b of workspaceStore.getState().canvasBlocks) {
            if (b.id === c.fromId || b.workspaceId !== wsId) continue;
            const sx = rect.left + camera.x + b.x * camera.zoom;
            const sy = rect.top + camera.y + b.y * camera.zoom;
            if (ev.clientX >= sx && ev.clientX <= sx + b.w * camera.zoom && ev.clientY >= sy && ev.clientY <= sy + b.h * camera.zoom) {
              workspaceStore.addCanvasEdge(wsId, c.fromId, b.id);
              break;
            }
          }
        }
        return null;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [camera, wsId]);

  const slides = useMemo(() => [...blocks].sort((a, b) => a.y - b.y || a.x - b.x), [blocks]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      if (present !== null) {
        if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); setPresent((p) => Math.min((p ?? 0) + 1, slides.length - 1)); }
        if (e.key === "ArrowLeft") { e.preventDefault(); setPresent((p) => Math.max((p ?? 0) - 1, 0)); }
        if (e.key === "Escape") setPresent(null);
        return;
      }
      if (e.key === "Escape") { setSelectedId(null); closeMenu(); }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        workspaceStore.removeCanvasBlock(selectedId);
        setSelectedId(null);
      }
      if (e.key.startsWith("Arrow") && selectedId) {
        e.preventDefault();
        const step = e.shiftKey ? 40 : 8;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        const block = workspaceStore.getState().canvasBlocks.find((b) => b.id === selectedId);
        if (block) workspaceStore.updateCanvasBlock(selectedId, { x: block.x + dx, y: block.y + dy });
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        const id = workspaceStore.createTab();
        const rect = containerRef.current?.getBoundingClientRect();
        const p = rect ? toWorld(rect.width / 2, rect.height / 2, rect, camera) : { x: 200, y: 120 };
        workspaceStore.addCanvasBlock({ workspaceId: wsId, type: "chat", title: "AI Session", x: Math.round(p.x / SNAP) * SNAP, y: Math.round(p.y / SNAP) * SNAP, data: { tabId: id } });
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "=" || e.key === "+") { e.preventDefault(); zoomAtCenter(1.15); }
        if (e.key === "-") { e.preventDefault(); zoomAtCenter(0.87); }
        if (e.key === "0") { e.preventDefault(); fit(); }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [present, selectedId, camera, wsId, size, zoomAtCenter, fit, closeMenu, slides.length]);

  const addBlock = (type: CanvasBlockType, tabId?: string, documentId?: string) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const p = rect ? toWorld((rect.width - 320) / 2, (rect.height - 200) / 2, rect, camera) : { x: 160, y: 120 };
    const id = workspaceStore.addCanvasBlock({
      workspaceId: wsId,
      type,
      x: Math.round(p.x / SNAP) * SNAP,
      y: Math.round(p.y / SNAP) * SNAP,
      data: { tabId, documentId },
    });
    setSelectedId(id);
    setAddOpen(false);
  };

  const blockMenu = (e: React.MouseEvent, block: CanvasBlock) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(block.id);
    openMenu(e.clientX, e.clientY, [
      {
        label: "Rename…",
        onClick: () => {
          const next = window.prompt("Rename block", block.title);
          if (next != null && next.trim()) workspaceStore.updateCanvasBlock(block.id, { title: next.trim() });
        },
      },
      { label: block.pinned ? "Unpin" : "Pin in place", onClick: () => workspaceStore.toggleCanvasBlockPin(block.id) },
      { label: "Duplicate", onClick: () => workspaceStore.duplicateCanvasBlock(block.id) },
      { label: "Bring to front", onClick: () => workspaceStore.bringCanvasBlockToFront(block.id) },
      { label: "Delete", danger: true, separatorBefore: true, onClick: () => { workspaceStore.removeCanvasBlock(block.id); if (selectedId === block.id) setSelectedId(null); } },
    ]);
  };

  const visibleEdges = useMemo(() => {
    const vis = new Set(visibleBlocks.map((b) => b.id));
    return edges.filter((e) => vis.has(e.fromBlockId) && vis.has(e.toBlockId));
  }, [edges, visibleBlocks]);

  const selectFromSearch = () => {
    const id = matching.values().next().value as string | undefined;
    if (!id) return;
    const block = blocks.find((b) => b.id === id);
    if (!block) return;
    setSelectedId(id);
    setCamera((c) => ({
      ...c,
      x: size.w / 2 - (block.x + block.w / 2) * c.zoom,
      y: size.h / 2 - (block.y + block.h / 2) * c.zoom,
    }));
  };

  const snapshots = workspaceStore.snapshotsFor(wsId);
  const activeTab = state.tabs.find((t) => t.id === state.activeTabId) ?? null;
  const workspaceDocs = state.documents.filter((d) => d.workspaceId === wsId);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-background select-none" onWheel={(e) => zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 0.92 : 1.09)}>
      <div
        onPointerDown={startPan}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        style={{
          backgroundImage:
            "linear-gradient(rgba(232,230,225,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(232,230,225,0.05) 1px, transparent 1px)",
          backgroundSize: `${24 * camera.zoom}px ${24 * camera.zoom}px`,
          backgroundPosition: `${camera.x}px ${camera.y}px`,
        }}
      />

      <div className="absolute inset-0 pointer-events-none" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`, transformOrigin: "0 0" }}>
        <svg width="0" height="0" className="absolute overflow-visible">
          {visibleEdges.map((e) => {
            const a = blocks.find((b) => b.id === e.fromBlockId);
            const b = blocks.find((x) => x.id === e.toBlockId);
            if (!a || !b) return null;
            const sel = selectedId !== null && (e.fromBlockId === selectedId || e.toBlockId === selectedId);
            return (
              <g key={e.id}>
                <line
                  x1={a.x + a.w / 2} y1={a.y + a.h / 2} x2={b.x + b.w / 2} y2={b.y + b.h / 2}
                  stroke={sel ? "rgba(114,56,61,0.7)" : "rgba(232,230,225,0.2)"}
                  strokeWidth={sel ? 1.5 : 1}
                  strokeDasharray={sel ? undefined : "4 4"}
                />
                {(sel || e.label) && (
                  <text x={(a.x + a.w / 2 + b.x + b.w / 2) / 2} y={(a.y + a.h / 2 + b.y + b.h / 2) / 2 - 4} fill="rgba(232,230,225,0.5)" fontSize="10" textAnchor="middle" fontFamily="sans-serif">
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {visibleBlocks.map((block) => (
          <div key={block.id} className="pointer-events-auto" style={{ position: "absolute", left: block.x, top: block.y, zIndex: 10 + block.z }}>
            <BlockRenderer
              block={block}
              selected={selectedId === block.id || matching.has(block.id)}
              connectSource
              onSelect={() => { setSelectedId(block.id); workspaceStore.bringCanvasBlockToFront(block.id); }}
              onDragStart={(e) => startDragBlock(e, block)}
              onResizeStart={(e) => startResize(e, block)}
              onBeginConnect={(e) => beginConnect(e, block.id)}
              onContextMenu={(e) => blockMenu(e, block)}
              onRename={(title) => workspaceStore.updateCanvasBlock(block.id, { title })}
            />
          </div>
        ))}
      </div>

      {connecting && (
        <svg className="absolute inset-0 pointer-events-none z-40" width={size.w} height={size.h}>
          {(() => {
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return null;
            const from = blocks.find((b) => b.id === connecting.fromId);
            if (!from) return null;
            const fx = rect.left + camera.x + (from.x + from.w / 2) * camera.zoom;
            const fy = rect.top + camera.y + (from.y + from.h / 2) * camera.zoom;
            return (
              <g>
                <line
                  x1={fx - rect.left} y1={fy - rect.top}
                  x2={connecting.x - rect.left} y2={connecting.y - rect.top}
                  stroke="rgba(114,56,61,0.8)" strokeWidth={1.5} strokeDasharray="5 4"
                />
                <circle cx={connecting.x - rect.left} cy={connecting.y - rect.top} r={3} fill="rgba(232,230,225,0.7)" />
              </g>
            );
          })()}
        </svg>
      )}

      {blocks.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto text-center max-w-md px-6">
            <div className="w-12 h-12 rounded-lg border border-border bg-bone/[0.03] flex items-center justify-center mx-auto mb-4">
              <Layout size={20} className="text-muted/70" />
            </div>
            <p className="font-display text-xl font-medium text-bone/80 mb-2">Research Canvas</p>
            <p className="font-sans text-sm text-muted mb-6 leading-relaxed">
              Your research desk — reports, sessions, documents, notes and knowledge graphs live together.
              Double-click anywhere to drop a sticky note, or start a session.
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => { const tabId = workspaceStore.createTab(); const blockId = workspaceStore.addCanvasBlock({ workspaceId: wsId, type: "chat", title: "AI Session", x: 160, y: 120, data: { tabId } }); setSelectedId(blockId); }}
                className="px-4 py-2 rounded-sm bg-accent text-surface font-sans text-xs font-medium"
              >
                <MessageSquareIcon /> New AI session
              </button>
              <button onClick={() => addBlock("sticky")} className="flex items-center gap-1.5 px-4 py-2 rounded-sm border border-border hover:border-accent/40 font-sans text-xs text-bone/80">
                <StickyNote size={12} /> Sticky note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="absolute top-3 left-3 z-40 flex items-center gap-1 bg-background/90 backdrop-blur-sm border border-border rounded-sm p-1 shadow-premium">
        <button onClick={() => zoomAtCenter(1.15)} className="p-1.5 rounded-sm hover:bg-bone/5 text-muted hover:text-bone" title="Zoom in (Ctrl +)"><ZoomIn size={13} /></button>
        <button onClick={() => zoomAtCenter(0.87)} className="p-1.5 rounded-sm hover:bg-bone/5 text-muted hover:text-bone" title="Zoom out (Ctrl -)"><ZoomOut size={13} /></button>
        <button onClick={fit} className="px-2 py-1 rounded-sm hover:bg-bone/5 font-mono text-2xs text-muted hover:text-bone" title="Fit (Ctrl 0)">
          {Math.round(camera.zoom * 100)}%
        </button>
        <div className="w-px h-4 bg-border mx-0.5" />
        <button onClick={() => setAddOpen((v) => !v)} className={cn("flex items-center gap-1 px-2 py-1 rounded-sm text-2xs font-sans transition-colors", addOpen ? "bg-bone/8 text-bone" : "hover:bg-bone/5 text-muted hover:text-bone")}>
          <Plus size={12} /> Add block
        </button>
        <button onClick={() => { workspaceStore.addCanvasSnapshot(wsId, "Snapshot"); }} className="p-1.5 rounded-sm hover:bg-bone/5 text-muted hover:text-bone" title="Save version"><History size={13} /></button>
        <button onClick={() => setHistoryOpen((v) => !v)} className={cn("p-1.5 rounded-sm transition-colors", historyOpen ? "bg-bone/8 text-bone" : "hover:bg-bone/5 text-muted hover:text-bone")} title="Version history">
          <ChevronDown size={13} />
        </button>
        <div className="w-px h-4 bg-border mx-0.5" />
        <button
          onClick={() => { workspaceStore.addCanvasSnapshot(wsId, "Presentation"); setPresent(0); }}
          className="flex items-center gap-1 px-2 py-1 rounded-sm hover:bg-bone/5 text-muted hover:text-bone font-sans text-2xs"
          title="Present"
        >
          <Presentation size={13} />
          <span className="hidden md:inline">Present</span>
        </button>
      </div>

      {addOpen && (
        <div className="absolute top-12 left-3 z-40 w-52 py-1 bg-background border border-border rounded-sm shadow-premium-lg">
          <MenuGroup title="Create">
            <MenuItem onClick={() => addBlock("sticky")} icon={<StickyNote size={12} />} label="Sticky note" />
            <MenuItem onClick={() => addBlock("note")} icon={<StickyNote size={12} />} label="Note block" />
            <MenuItem onClick={() => addBlock("code")} icon={<CodeIcon />} label="Code block" />
            <MenuItem onClick={() => addBlock("diagram")} icon={<WorkflowIcon />} label="Diagram" />
            <MenuItem onClick={() => addBlock("mindmap")} icon={<MindMapIcon />} label="Mind map" />
            <MenuItem onClick={() => addBlock("table")} icon={<TableIcon />} label="Table" />
            <MenuItem onClick={() => addBlock("image")} icon={<ImageIcon />} label="Image" />
            <MenuItem onClick={() => addBlock("pdf")} icon={<PdfIcon />} label="PDF viewer" />
          </MenuGroup>
          <MenuGroup title="AI">
            <MenuItem onClick={() => { const id = workspaceStore.createTab(); addBlock("chat", id); }} icon={<ChatIcon />} label="New AI session" hint="Ctrl+Shift+A" />
            <MenuItem onClick={() => addBlock("chat", activeTab?.id)} icon={<ChatIcon />} label="AI block (active session)" />
            <MenuItem onClick={() => addBlock("report", activeTab?.id)} icon={<FileTextIcon />} label="Report block" />
            <MenuItem onClick={() => addBlock("summary", activeTab?.id)} icon={<SparklesIcon />} label="AI summary block" />
            <MenuItem onClick={() => addBlock("knowledge", activeTab?.id)} icon={<NetworkIcon />} label="Knowledge graph block" />
            <MenuItem onClick={() => addBlock("timeline", activeTab?.id)} icon={<ClockIcon />} label="Timeline block" />
          </MenuGroup>
          {workspaceDocs.length > 0 && (
            <MenuGroup title="Documents">
              {workspaceDocs.slice(0, 5).map((d) => (
                <MenuItem key={d.id} onClick={() => addBlock("document", undefined, d.id)} icon={<FileIcon />} label={d.name} />
              ))}
            </MenuGroup>
          )}
        </div>
      )}

      {historyOpen && (
        <div className="absolute top-12 left-3 z-40 w-56 py-1 bg-background border border-border rounded-sm shadow-premium-lg">
          <p className="px-3 pb-1 pt-1 font-mono text-2xs uppercase tracking-ultra text-muted/60">Version History</p>
          {snapshots.length === 0 ? (
            <p className="px-3 py-2 font-sans text-2xs text-muted/60">No versions yet. Click the save icon to capture one.</p>
          ) : (
            snapshots.slice(0, 12).map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  if (window.confirm(`Restore the canvas to the "${s.label}" version? This replaces the current blocks.`)) {
                    workspaceStore.restoreCanvasSnapshot(wsId, s.id);
                    setHistoryOpen(false);
                  }
                }}
                className="w-full flex items-center justify-between px-3 py-1.5 font-sans text-2xs text-bone/70 hover:bg-bone/5"
              >
                <span className="truncate">{s.label}</span>
                <span className="font-mono text-[9px] text-muted/50 shrink-0">{new Date(s.at).toLocaleTimeString()}</span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Search */}
      <div className="absolute top-3 right-3 z-40 flex items-center gap-2">
        <div className="relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") selectFromSearch(); }}
            placeholder="Search blocks…"
            className="w-44 bg-background/90 backdrop-blur-sm border border-border pl-7 pr-3 py-1.5 font-sans text-xs outline-none focus:border-accent/40 transition-colors rounded-sm placeholder:text-muted/40"
          />
        </div>
      </div>

      {/* Minimap */}
      {blocks.length > 0 && worldBounds && (
        <div className="absolute bottom-3 right-3 z-40 bg-background/90 backdrop-blur-sm border border-border rounded-sm p-1.5 shadow-premium">
          <svg
            width={150}
            height={100}
            className="block cursor-crosshair"
            onPointerDown={(e) => {
              const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
              const bw = Math.max(worldBounds.maxX - worldBounds.minX, 1);
              const bh = Math.max(worldBounds.maxY - worldBounds.minY, 1);
              const scale = Math.min(150 / bw, 100 / bh);
              const ox = (150 - bw * scale) / 2, oy = (100 - bh * scale) / 2;
              const setFrom = (ev: PointerEvent | React.PointerEvent) => {
                const wx = (ev.clientX - rect.left - ox) / scale + worldBounds.minX;
                const wy = (ev.clientY - rect.top - oy) / scale + worldBounds.minY;
                setCamera((c) => ({ ...c, x: size.w / 2 - wx * c.zoom, y: size.h / 2 - wy * c.zoom }));
              };
              setFrom(e);
              const move = (ev: PointerEvent) => setFrom(ev);
              const up = () => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
              };
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", up);
            }}
          >
            {(() => {
              const bw = Math.max(worldBounds.maxX - worldBounds.minX, 1);
              const bh = Math.max(worldBounds.maxY - worldBounds.minY, 1);
              const scale = Math.min(150 / bw, 100 / bh);
              const ox = (150 - bw * scale) / 2, oy = (100 - bh * scale) / 2;
              const tx = (v: number) => ox + (v - worldBounds.minX) * scale;
              const ty = (v: number) => oy + (v - worldBounds.minY) * scale;
              const vx0 = -camera.x / camera.zoom, vy0 = -camera.y / camera.zoom;
              return (
                <g>
                  {blocks.map((b) => (
                    <rect key={b.id} x={tx(b.x)} y={ty(b.y)} width={Math.max(2, b.w * scale)} height={Math.max(1.5, b.h * scale)} rx={1} fill={selectedId === b.id ? "rgba(114,56,61,0.8)" : "rgba(232,230,225,0.25)"} />
                  ))}
                  <rect x={tx(vx0)} y={ty(vy0)} width={size.w / camera.zoom * scale} height={size.h / camera.zoom * scale} fill="none" stroke="rgba(232,230,225,0.6)" strokeWidth="1" />
                </g>
              );
            })()}
          </svg>
        </div>
      )}

      {/* Presentation */}
      {present !== null && (
        <div className="absolute inset-0 z-50 bg-background flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
            <span className="font-mono text-2xs uppercase tracking-ultra text-muted">
              {slides[present]?.title ?? "Presentation"} · {present + 1}/{slides.length}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPresent((p) => Math.max((p ?? 0) - 1, 0))} className="p-1.5 rounded-sm hover:bg-bone/5 text-muted hover:text-bone"><ChevronLeft size={14} /></button>
              <button onClick={() => setPresent((p) => Math.min((p ?? 0) + 1, slides.length - 1))} className="p-1.5 rounded-sm hover:bg-bone/5 text-muted hover:text-bone"><ChevronRight size={14} /></button>
              <button onClick={() => setPresent(null)} className="p-1.5 rounded-sm hover:bg-bone/5 text-muted hover:text-bone"><X size={14} /></button>
            </div>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center p-6">
            {slides[present] && <SlideFrame block={slides[present]} />}
          </div>
        </div>
      )}

      {menu}
    </div>
  );
}

function SlideFrame({ block }: { block: CanvasBlock }) {
  return (
    <div className="relative">
      <div className="max-h-full overflow-auto bg-background border border-border rounded-sm shadow-premium-lg" style={{ width: Math.min(block.w, 960), height: Math.min(block.h, 620) }}>
        <div className="flex items-center gap-2 h-8 px-3 border-b border-border/70">
          <span className="font-sans text-2xs text-bone/70 truncate">{block.title}</span>
        </div>
        <div className="h-[calc(100%-2rem)]">
          <BlockContent block={block} />
        </div>
      </div>
    </div>
  );
}

function MenuGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <p className="px-3 pt-2 pb-1 font-mono text-2xs uppercase tracking-ultra text-muted/60">{title}</p>
      {children}
    </>
  );
}

function MenuItem({ onClick, icon, label, hint }: { onClick: () => void; icon: React.ReactNode; label: string; hint?: string }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2 px-3 py-1.5 font-sans text-xs text-bone/70 hover:bg-bone/5 hover:text-bone text-left">
      <span className="text-muted [&>svg]:w-3.5 [&>svg]:h-3.5">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="font-mono text-[9px] text-muted/40 shrink-0">{hint}</span>}
    </button>
  );
}

function MessageSquareIcon() { return <span className="inline-block w-3 h-3 mr-1 rounded-sm bg-accent/30" />; }
function CodeIcon() { return <CodeGlyph />; }
function CodeGlyph() { return <span className="font-mono text-[10px]">&lt;/&gt;</span>; }
function WorkflowIcon() { return <span className="font-mono text-[10px]">→◇</span>; }
function ChatIcon() { return <span className="font-mono text-[10px]">💬</span>; }
function FileTextIcon() { return <span className="font-mono text-[10px]">¶</span>; }
function SparklesIcon() { return <span className="font-mono text-[10px]">✦</span>; }
function NetworkIcon() { return <span className="font-mono text-[10px]">◎</span>; }
function ClockIcon() { return <span className="font-mono text-[10px]">◷</span>; }
function FileIcon() { return <span className="font-mono text-[10px]">▤</span>; }
function MindMapIcon() { return <span className="font-mono text-[10px]">◈</span>; }
function TableIcon() { return <span className="font-mono text-[10px]">▦</span>; }
function ImageIcon() { return <span className="font-mono text-[10px]">▨</span>; }
function PdfIcon() { return <span className="font-mono text-[10px]">⧉</span>; }
