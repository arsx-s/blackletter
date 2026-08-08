import { useEffect, useMemo, useRef, useState } from "react";
import { File, FileText, FolderOpen, Layout, Layers, Network, Search, SearchX } from "lucide-react";
import { cn } from "../../lib/utils";
import { workspaceStore } from "../../stores/workspace-store";

interface GlobalHit {
  key: string;
  type: "tab" | "workspace" | "folder" | "document" | "knowledge" | "canvas";
  id: string;
  tag: string;
  title: string;
  detail: string;
}

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const hits = useMemo(() => {
    const results = workspaceStore.search(query);
    const flat: GlobalHit[] = [];
    for (const h of results.tabs) flat.push({ key: `tab-${h.id}`, type: "tab", id: h.id, tag: "Session", title: h.title, detail: h.detail });
    for (const h of results.workspaces) flat.push({ key: `workspace-${h.id}`, type: "workspace", id: h.id, tag: "Workspace", title: h.title, detail: h.detail });
    for (const h of results.folders) flat.push({ key: `folder-${h.id}`, type: "folder", id: h.id, tag: "Folder", title: h.title, detail: h.detail });
    for (const h of results.documents) flat.push({ key: `document-${h.id}`, type: "document", id: h.id, tag: "Document", title: h.title, detail: h.detail });
    for (const h of results.knowledge) flat.push({ key: `knowledge-${h.id}`, type: "knowledge", id: h.id, tag: "Graph", title: h.title, detail: h.detail });
    for (const h of results.canvas) flat.push({ key: `canvas-${h.id}`, type: "canvas", id: h.id, tag: "Canvas", title: h.title, detail: h.detail });
    return flat;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  useEffect(() => setCursor(0), [hits.length]);

  const activate = (hit: GlobalHit) => {
    onClose();
    if (hit.type === "tab") workspaceStore.setActiveTab(hit.id);
    if (hit.type === "workspace") workspaceStore.setActiveWorkspace(hit.id);
    if (hit.type === "folder") {
      const folder = workspaceStore.getState().folders.find((f) => f.id === hit.id);
      if (folder) workspaceStore.setActiveWorkspace(folder.workspaceId);
    }
    if (hit.type === "document") {
      const doc = workspaceStore.getState().documents.find((d) => d.id === hit.id);
      if (doc) {
        workspaceStore.setActiveWorkspace(doc.workspaceId);
        workspaceStore.setPrefs({ documentsViewOpen: true, focusDocumentId: doc.id });
      }
    }
    if (hit.type === "knowledge") {
      workspaceStore.setPrefs({ graphViewOpen: true, graphSelectedNodeId: hit.id });
    }
    if (hit.type === "canvas") {
      workspaceStore.setPrefs({ canvasViewOpen: true, focusCanvasBlockId: hit.id });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, Math.max(hits.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      const hit = hits[cursor];
      if (hit) activate(hit);
    }
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-start justify-center bg-bone/40 backdrop-blur-sm p-6 pt-[12vh] transition-opacity",
        open ? "opacity-100" : "pointer-events-none opacity-0",
      )}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-xl bg-background border border-border rounded-lg shadow-premium-lg overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <Search size={14} className="text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search sessions, workspaces, documents, folders…"
            className="w-full bg-transparent font-sans text-sm outline-none placeholder:text-muted/40"
          />
          <kbd className="font-mono text-2xs text-muted/60 border border-border rounded px-1.5 py-0.5 shrink-0">Esc</kbd>
        </div>

        <div className="max-h-[48vh] overflow-y-auto scrollbar-hide py-1.5">
          {query.trim().length === 0 ? (
            <p className="px-4 py-6 text-center font-sans text-xs text-muted/60 flex items-center justify-center gap-2">
              <Search size={13} /> Type to search across all your work
            </p>
          ) : hits.length === 0 ? (
            <p className="px-4 py-6 text-center font-sans text-xs text-muted/60 flex items-center justify-center gap-2">
              <SearchX size={13} /> No results for &ldquo;{query}&rdquo;
            </p>
          ) : (
            hits.map((hit, i) => (
              <button
                key={hit.key}
                onClick={() => activate(hit)}
                onMouseEnter={() => setCursor(i)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2 text-left transition-colors",
                  i === cursor ? "bg-bone/5" : "hover:bg-bone/3",
                )}
              >
                <HitIcon type={hit.type} />
                <div className="flex-1 min-w-0">
                  <p className="font-sans text-sm text-bone/80 truncate">{hit.title}</p>
                  <p className="font-sans text-2xs text-muted truncate mt-0.5">{hit.detail}</p>
                </div>
                <span className="font-mono text-2xs uppercase tracking-wider text-muted/50 shrink-0">{hit.tag}</span>
              </button>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border px-4 py-2 font-mono text-2xs text-muted/60">
          <span><kbd className="border border-border rounded px-1">↑</kbd> <kbd className="border border-border rounded px-1">↓</kbd> Navigate</span>
          <span><kbd className="border border-border rounded px-1">Enter</kbd> Open</span>
          <span className="flex-1" />
          <span className="flex items-center gap-1"><Layers size={10} /> {hits.length} results</span>
        </div>
      </div>
    </div>
  );
}

function HitIcon({ type }: { type: GlobalHit["type"] }) {
  const cls = "shrink-0 text-muted";
  if (type === "document") return <File size={14} className={cls} />;
  if (type === "folder") return <FolderOpen size={14} className={cls} />;
  if (type === "workspace") return <Layers size={14} className={cls} />;
  if (type === "knowledge") return <Network size={14} className={cls} />;
  if (type === "canvas") return <Layout size={14} className={cls} />;
  return <FileText size={14} className={cls} />;
}