import { useEffect, useRef, useState } from "react";
import {
  BookMarked, CalendarClock, Check, Code, File, FileEdit, FileText, GitBranch, Grid3X3, Image, Loader2,
  MessageSquare, Network, Pin, Sparkles, StickyNote, Workflow, Send, X,
} from "lucide-react";
import { useWorkspaceStore, workspaceStore } from "../../stores/use-workspace";
import type { CanvasBlock, CanvasBlockType } from "../../types/canvas";
import type { TimelineEvent } from "../../lib/research";
import { ResearchReport } from "../research/ResearchReport";
import { IntelligenceStrip } from "../research/IntelligenceStrip";
import { Timeline } from "../research/Timeline";
import { KnowledgeCanvas } from "../knowledge/KnowledgeCanvas";
import { generateResponse } from "../../services/ai";
import { useChatTurn } from "./use-chat-turn";
import { AiErrorBanner } from "../ui/ai-error-banner";
import { cn } from "../../lib/utils";

export const BLOCK_TYPE_LABEL: Record<CanvasBlockType, string> = {
  chat: "AI Chat",
  report: "Report",
  document: "Document",
  note: "Note",
  knowledge: "Knowledge",
  sticky: "Sticky",
  diagram: "Diagram",
  timeline: "Timeline",
  code: "Code",
  summary: "AI Summary",
  mindmap: "Mind Map",
  table: "Table",
  image: "Image",
  pdf: "PDF Viewer",
};

export const BLOCK_TYPE_ICON: Record<CanvasBlockType, typeof MessageSquare> = {
  chat: MessageSquare,
  report: FileText,
  document: File,
  note: FileEdit,
  knowledge: Network,
  sticky: StickyNote,
  diagram: Workflow,
  timeline: CalendarClock,
  code: Code,
  summary: Sparkles,
  mindmap: GitBranch,
  table: Grid3X3,
  image: Image,
  pdf: FileText,
};

interface BlockSurfaceProps {
  block: CanvasBlock;
  selected: boolean;
  connectSource: boolean;
  onSelect: () => void;
  onDragStart: (e: React.PointerEvent) => void;
  onResizeStart: (e: React.PointerEvent) => void;
  onBeginConnect: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onRename: (title: string) => void;
  children: React.ReactNode;
}

export function BlockSurface({
  block, selected, connectSource, onSelect, onDragStart, onResizeStart,
  onBeginConnect, onContextMenu, onRename, children,
}: BlockSurfaceProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const Icon = BLOCK_TYPE_ICON[block.type];

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={onContextMenu}
      style={{ width: block.w, height: block.h, zIndex: 10 + block.z }}
      className={cn(
        "absolute flex flex-col bg-background/95 backdrop-blur-sm border transition-shadow duration-150 overflow-hidden select-none",
        block.type === "sticky" ? "border-border/70" : "border-border",
        selected
          ? "border-accent/50 shadow-[0_0_24px_rgba(114,56,61,0.25)]"
          : "shadow-premium",
      )}
    >
      <div
        onPointerDown={onDragStart}
        onDoubleClick={(e) => { e.stopPropagation(); setEditingTitle(true); }}
        className="flex items-center gap-1.5 h-7 px-2 border-b border-border/70 bg-bone/[0.02] cursor-grab active:cursor-grabbing shrink-0"
      >
        <Icon size={10} className="text-muted shrink-0" />
        {editingTitle ? (
          <input
            autoFocus
            defaultValue={block.title}
            onBlur={(e) => { onRename(e.target.value.trim() || block.title); setEditingTitle(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditingTitle(false);
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 bg-transparent font-sans text-2xs text-bone outline-none"
          />
        ) : (
          <span className="flex-1 min-w-0 truncate font-sans text-2xs text-bone/70">{block.title}</span>
        )}
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted/50 shrink-0">{BLOCK_TYPE_LABEL[block.type]}</span>
        {block.pinned && <Pin size={9} className="text-accent shrink-0" />}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden" onPointerDown={(e) => e.stopPropagation()}>
        {children}
      </div>

      <div
        onPointerDown={onResizeStart}
        className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-nwse-resize opacity-0 hover:opacity-100 transition-opacity"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" className="text-muted/60">
          <path d="M9 1 L9 9 L1 9" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
      </div>

      {connectSource && (
        <div
          onPointerDown={onBeginConnect}
          title="Drag to connect blocks"
          className="absolute top-1/2 -right-1.5 w-3 h-3 rounded-full bg-accent/80 border border-background cursor-crosshair hover:scale-125 transition-transform z-10"
        />
      )}
    </div>
  );
}

function EmptySession({ tabId }: { tabId?: string }) {
  const create = () => {
    const id = workspaceStore.createTab();
    workspaceStore.ensureSessionOnCanvas(id);
    if (tabId) workspaceStore.updateCanvasBlock(tabId, { data: { tabId: id } });
  };
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
      <MessageSquare size={18} className="text-muted/40" />
      <p className="font-sans text-2xs text-muted leading-relaxed">This block is not linked to a session.</p>
      <button onClick={create} className="px-3 py-1.5 rounded-sm bg-accent text-surface font-sans text-2xs font-medium">
        Create session
      </button>
    </div>
  );
}

export function ChatBlockContent({ block }: { block: CanvasBlock }) {
  const state = useWorkspaceStore();
  const { running, run } = useChatTurn();
  const [input, setInput] = useState("");
  const tab = state.tabs.find((t) => t.id === block.data.tabId) ?? null;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [tab?.messages.length, running]);

  if (!tab) return <EmptySession tabId={block.id} />;

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hide px-3 py-2 space-y-2">
        {tab.error && (
          <AiErrorBanner
            error={{ code: tab.error.code, message: tab.error.message }}
            onRetry={() => void run(tab.id, tab.topic || "Continue")}
            onDismiss={() => workspaceStore.updateTab(tab.id, { error: null })}
            onOpenSettings={() => workspaceStore.setPrefs({ workshopViewOpen: true })}
          />
        )}
        {tab.messages.length === 0 && (
          <p className="font-sans text-2xs text-muted/60 text-center mt-6">Ask anything — this session keeps its own memory.</p>
        )}
        {tab.messages.map((m, i) => (
          <div key={i} className={cn("max-w-[92%]", m.role === "user" ? "ml-auto" : "mr-auto")}>
            <div
              className={cn(
                "px-2.5 py-1.5 rounded-sm font-sans text-2xs leading-relaxed whitespace-pre-wrap break-words",
                m.role === "user" ? "bg-accent/15 border border-accent/25 text-bone/85" : "bg-bone/5 border border-border/60 text-bone/70",
              )}
            >
              {m.content.length > 600 ? m.content.slice(0, 600) + "…" : m.content}
            </div>
          </div>
        ))}
        {running && (
          <div className="flex items-center gap-2 px-1">
            <Loader2 size={11} className="animate-spin text-accent" />
            <span className="font-sans text-2xs text-muted">Researching…</span>
          </div>
        )}
        {tab.intelligence && (
          <div className="pt-1">
            <IntelligenceStrip intelligence={tab.intelligence} />
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 p-2 border-t border-border/70">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (input.trim() && !running) { void run(tab.id, input.trim()); setInput(""); }
            }
          }}
          placeholder="Ask this session…"
          rows={2}
          className="flex-1 min-w-0 bg-bone/[0.03] border border-border px-2.5 py-1.5 font-sans text-2xs outline-none focus:border-accent/40 transition-colors resize-none placeholder:text-muted/40"
        />
        <button
          onClick={() => { if (input.trim() && !running) { void run(tab.id, input.trim()); setInput(""); } }}
          disabled={running || !input.trim()}
          className="p-2 rounded-sm bg-accent text-surface disabled:opacity-40 shrink-0"
          title="Send"
        >
          {running ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
        </button>
      </div>
    </div>
  );
}

export function ReportBlockContent({ block }: { block: CanvasBlock }) {
  const state = useWorkspaceStore();
  const tab = state.tabs.find((t) => t.id === block.data.tabId) ?? null;
  if (!tab || !tab.fullText) {
    return (
      <div className="h-full flex items-center justify-center px-6 text-center">
        <p className="font-sans text-2xs text-muted/60">No report yet. Run a session to generate one.</p>
      </div>
    );
  }
  return (
    <div className="h-full overflow-y-auto scrollbar-hide">
      <div className="px-4 py-3">
        <ResearchReport sections={tab.sections} isStreaming={false} fullText={tab.fullText} />
        {tab.intelligence && (
          <div className="mt-4">
            <IntelligenceStrip intelligence={tab.intelligence} />
          </div>
        )}
      </div>
    </div>
  );
}

export function DocumentBlockContent({ block }: { block: CanvasBlock }) {
  const state = useWorkspaceStore();
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const doc = state.documents.find((d) => d.id === block.data.documentId) ?? null;

  if (!doc) {
    const docs = state.documents.filter((d) => d.workspaceId === block.workspaceId);
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 px-4 text-center">
        <File size={18} className="text-muted/40" />
        <p className="font-sans text-2xs text-muted">No document linked.</p>
        {docs.length > 0 ? (
          <select
            onChange={(e) => { if (e.target.value) workspaceStore.updateCanvasBlock(block.id, { data: { documentId: e.target.value } }); }}
            className="bg-bone/[0.04] border border-border font-sans text-2xs px-2 py-1 rounded-sm outline-none max-w-44"
          >
            <option value="">Link a document…</option>
            {docs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        ) : (
          <p className="font-sans text-2xs text-muted/50">Upload documents in a session first.</p>
        )}
      </div>
    );
  }

  const summarize = async () => {
    setBusy(true);
    setSummary(null);
    try {
      const res = await generateResponse({
        prompt: "Summarize this document in a few concise paragraphs. Cover the main topics, key terms, and any definitions found.",
        fileContent: doc.content.slice(0, 12000),
      });
      setSummary(res.text.trim());
    } catch {
      setSummary("Could not generate a summary right now.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/70">
        <div className="min-w-0 flex-1">
          <p className="font-sans text-2xs text-bone/80 truncate">{doc.name}</p>
          <p className="font-mono text-[9px] text-muted/60">{doc.extension.toUpperCase()} · {(doc.size / 1024).toFixed(1)} KB · {doc.content.length.toLocaleString()} chars</p>
        </div>
        <button
          onClick={() => void summarize()}
          disabled={busy}
          className="flex items-center gap-1 px-2 py-1 rounded-sm border border-border hover:border-accent/40 font-sans text-2xs text-bone/70 disabled:opacity-40 shrink-0"
        >
          {busy ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
          {summary ? "Re-summarize" : "AI Summary"}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-hide px-3 py-2">
        {summary ? (
          <p className="font-sans text-2xs leading-relaxed text-bone/70 whitespace-pre-wrap">{summary}</p>
        ) : (
          <pre className="font-mono text-[10px] leading-relaxed text-muted/70 whitespace-pre-wrap">{doc.content.slice(0, 1800)}{doc.content.length > 1800 ? "\n…" : ""}</pre>
        )}
      </div>
    </div>
  );
}

export function NoteBlockContent({ block }: { block: CanvasBlock }) {
  const state = useWorkspaceStore();
  const note = block.data.noteId ? state.notes.find((n) => n.id === block.data.noteId) ?? null : null;
  const [text, setText] = useState(block.data.text ?? "");

  if (note) {
    return (
      <div className="h-full flex flex-col">
        <input
          value={note.title}
          onChange={(e) => workspaceStore.updateNote(note.id, { title: e.target.value })}
          className="w-full bg-transparent px-3 pt-2 pb-1 font-sans text-xs font-medium text-bone outline-none border-b border-border/50"
          placeholder="Note title"
        />
        <textarea
          value={note.content}
          onChange={(e) => workspaceStore.updateNote(note.id, { content: e.target.value })}
          className="flex-1 w-full bg-transparent px-3 py-2 font-sans text-2xs leading-relaxed text-bone/70 outline-none resize-none scrollbar-hide"
          placeholder="Write in markdown…"
        />
      </div>
    );
  }

  const save = () => {
    const id = workspaceStore.addNote(block.workspaceId, block.title, text, null);
    workspaceStore.updateCanvasBlock(block.id, { data: { noteId: id, text } });
  };

  return (
    <div className="h-full flex flex-col">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="flex-1 w-full bg-transparent px-3 py-2 font-sans text-2xs leading-relaxed text-bone/70 outline-none resize-none scrollbar-hide"
        placeholder="Write a note…"
      />
      <div className="flex items-center justify-between px-3 pb-2">
        <span className="font-mono text-[9px] text-muted/50">Inline note</span>
        <button onClick={save} className="flex items-center gap-1 px-2 py-1 rounded-sm border border-border hover:border-accent/40 font-sans text-2xs text-bone/70">
          <BookMarked size={10} /> Save as note
        </button>
      </div>
    </div>
  );
}

export function KnowledgeBlockContent({ block }: { block: CanvasBlock }) {
  const state = useWorkspaceStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const graph = block.data.tabId ? workspaceStore.knowledgeForTab(block.data.tabId) : state.knowledge;

  return (
    <div className="h-full w-full" onPointerDown={(e) => e.stopPropagation()}>
      <KnowledgeCanvas graph={graph} selectedId={selectedId} onSelect={setSelectedId} />
    </div>
  );
}

export function StickyBlockContent({ block }: { block: CanvasBlock }) {
  const [text, setText] = useState(block.data.text ?? "");
  return (
    <textarea
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        workspaceStore.updateCanvasBlock(block.id, { data: { text: e.target.value } });
      }}
      className="w-full h-full bg-transparent px-3 py-2 font-sans text-xs leading-relaxed text-bone/80 outline-none resize-none scrollbar-hide"
      placeholder="Sticky note…"
    />
  );
}

interface DiagNode { id: string; label: string; depth: number; index: number; }
interface DiagEdge { from: string; to: string; label: string; }

export function parseDiagram(text: string): { nodes: DiagNode[]; edges: DiagEdge[] } {
  const edgeList: Array<{ from: string; to: string; label: string }> = [];
  const seen = new Set<string>();
  const register = (label: string): string => {
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `node-${seen.size}`;
    seen.add(label);
    return id;
  };
  const clean = (s: string) => s.replace(/^["']|["']$/g, "").trim();

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const labeled = line.match(/^(.+?)\s*-{2}([^-].*?)-{2}->\s*(.+)$/);
    if (labeled) {
      edgeList.push({ from: clean(labeled[1]), to: clean(labeled[3]), label: clean(labeled[2]) });
      continue;
    }
    const parts = line.split(/\s*->\s*/).map(clean).filter(Boolean);
    for (let i = 0; i + 1 < parts.length; i++) {
      edgeList.push({ from: parts[i], to: parts[i + 1], label: "" });
    }
  }
  if (edgeList.length === 0) return { nodes: [], edges: [] };

  const ids = new Map<string, string>();
  for (const e of edgeList) {
    if (!ids.has(e.from)) ids.set(e.from, register(e.from));
    if (!ids.has(e.to)) ids.set(e.to, register(e.to));
  }
  const incoming = new Map<string, number>();
  for (const e of edgeList) incoming.set(ids.get(e.to)!, (incoming.get(ids.get(e.to)!) ?? 0) + 1);
  const depthOf = new Map<string, number>();
  const computeDepth = (id: string): number => {
    if (depthOf.has(id)) return depthOf.get(id)!;
    const parents = edgeList.filter((e) => ids.get(e.to) === id).map((e) => ids.get(e.from)!);
    const d = parents.length === 0 ? 0 : 1 + Math.max(...parents.map(computeDepth));
    depthOf.set(id, d);
    return d;
  };
  const nodes: DiagNode[] = [];
  const counters = new Map<number, number>();
  for (const [label, id] of ids) {
    const d = computeDepth(id);
    const idx = counters.get(d) ?? 0;
    counters.set(d, idx + 1);
    nodes.push({ id, label, depth: d, index: idx });
  }
  return { nodes, edges: edgeList.map((e) => ({ from: ids.get(e.from)!, to: ids.get(e.to)!, label: e.label })) };
}

export function DiagramBlockContent({ block }: { block: CanvasBlock }) {
  const [text, setText] = useState(block.data.text ?? "");
  const { nodes, edges } = parseDiagram(text);
  const W = Math.max(120, Math.max(...nodes.map((n) => n.depth), 0) * 200 + 140);
  const H = Math.max(120, (Math.max(...nodes.map((n) => n.index), 0) + 1) * 88 + 60);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-auto scrollbar-hide bg-bone/[0.015]">
        {nodes.length === 0 ? (
          <div className="h-full flex items-center justify-center px-6 text-center">
            <p className="font-sans text-2xs text-muted/50 leading-relaxed">Write a flow below.<br />Example: <span className="font-mono text-muted/70">{`Research -> Draft -> Review`}</span></p>
          </div>
        ) : (
          <svg width={W} height={H} className="block">
            {edges.map((e, i) => {
              const a = nodes.find((n) => n.id === e.from)!;
              const b = nodes.find((n) => n.id === e.to)!;
              const ax = a.depth * 200 + 70, ay = a.index * 88 + 40;
              const bx = b.depth * 200 + 70, by = b.index * 88 + 40;
              return (
                <g key={i}>
                  <line x1={ax} y1={ay} x2={bx} y2={by} stroke="rgba(232,230,225,0.25)" strokeWidth="1" />
                  <path d={`M ${bx - 8} ${by} L ${bx} ${by} L ${bx - 8} ${by - 4} M ${bx - 8} ${by} L ${bx} ${by} L ${bx - 8} ${by + 4}`} fill="none" stroke="rgba(232,230,225,0.35)" strokeWidth="1" />
                  {e.label && (
                    <text x={(ax + bx) / 2} y={(ay + by) / 2 - 6} fill="rgba(232,230,225,0.4)" fontSize="9" textAnchor="middle" fontFamily="monospace">{e.label}</text>
                  )}
                </g>
              );
            })}
            {nodes.map((n) => (
              <g key={n.id}>
                <rect x={n.depth * 200 + 10} y={n.index * 88 + 20} width={120} height={40} rx={2} fill="rgba(232,230,225,0.04)" stroke="rgba(232,230,225,0.25)" />
                <text x={n.depth * 200 + 70} y={n.index * 88 + 44} fill="rgba(232,230,225,0.8)" fontSize="11" textAnchor="middle" fontFamily="sans-serif">{n.label}</text>
              </g>
            ))}
          </svg>
        )}
      </div>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          workspaceStore.updateCanvasBlock(block.id, { data: { text: e.target.value } });
        }}
        rows={3}
        placeholder={"A -> B -> C\nB --depends on--> D"}
        className="shrink-0 bg-bone/[0.03] border-t border-border px-3 py-2 font-mono text-[10px] text-bone/60 outline-none resize-none"
      />
    </div>
  );
}

export function TimelineBlockContent({ block }: { block: CanvasBlock }) {
  const state = useWorkspaceStore();
  const tab = block.data.tabId ? state.tabs.find((t) => t.id === block.data.tabId) ?? null : null;
  const raw = tab?.timelineEvents ?? (block.data.events ?? []);
  const events: TimelineEvent[] = raw.map((e) => ({
    id: `${e.date}-${"event" in e ? e.event : e.title}`,
    date: e.date,
    title: "event" in e ? e.event : e.title,
    description: e.description ?? "",
  }));
  if (events.length === 0) {
    return (
      <div className="h-full flex items-center justify-center px-6 text-center">
        <p className="font-sans text-2xs text-muted/60">No timeline events yet. Link this block to a session with research.</p>
      </div>
    );
  }
  return (
    <div className="h-full overflow-y-auto scrollbar-hide">
      <Timeline events={events} />
    </div>
  );
}

export function CodeBlockContent({ block }: { block: CanvasBlock }) {
  const [code, setCode] = useState(block.data.code ?? "");
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/70 bg-bone/[0.02]">
        <Code size={10} className="text-muted" />
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted/60">{block.data.language ?? "text"}</span>
      </div>
      <textarea
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          workspaceStore.updateCanvasBlock(block.id, { data: { code: e.target.value } });
        }}
        spellCheck={false}
        className="flex-1 w-full bg-transparent px-3 py-2 font-mono text-[11px] leading-relaxed text-bone/75 outline-none resize-none scrollbar-hide"
        placeholder="// paste or write code"
      />
    </div>
  );
}

export function SummaryBlockContent({ block }: { block: CanvasBlock }) {
  const state = useWorkspaceStore();
  const tab = state.tabs.find((t) => t.id === block.data.tabId) ?? null;
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState("");
  const ranRef = useRef(false);

  const run = async (prompt: string) => {
    if (!tab || !tab.fullText) return;
    setBusy(true);
    try {
      const res = await generateResponse({
        prompt,
        systemInstruction: "You are BlackLetter's research summarizer. Be concise and precise.",
        fileContent: tab.fullText.slice(0, 16000),
      });
      setSummary(res.text.trim());
    } catch {
      setSummary("Could not generate a summary right now.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!ranRef.current && tab?.fullText && summary === null && !busy) {
      ranRef.current = true;
      void run("Summarize this research report into a concise overview with the key takeaways.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab?.fullText]);

  if (!tab) return <EmptySession tabId={block.id} />;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto scrollbar-hide px-3 py-2">
        {busy ? (
          <div className="flex items-center gap-2 h-full justify-center">
            <Loader2 size={12} className="animate-spin text-accent" />
            <span className="font-sans text-2xs text-muted">Summarizing…</span>
          </div>
        ) : summary ? (
          <p className="font-sans text-2xs leading-relaxed text-bone/70 whitespace-pre-wrap">{summary}</p>
        ) : (
          <p className="font-sans text-2xs text-muted/60">Run a session first, then this block summarizes it automatically.</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 p-2 border-t border-border/70">
        <input
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && ask.trim()) { void run(ask.trim()); setAsk(""); } }}
          placeholder="Ask a different angle…"
          className="flex-1 min-w-0 bg-bone/[0.03] border border-border px-2.5 py-1 font-sans text-2xs outline-none focus:border-accent/40 placeholder:text-muted/40"
        />
        <button onClick={() => { if (ask.trim()) { void run(ask.trim()); setAsk(""); } }} disabled={busy} className="p-1.5 rounded-sm bg-accent text-surface disabled:opacity-40 shrink-0">
          <Sparkles size={10} />
        </button>
      </div>
    </div>
  );
}

export function BlockContent({ block }: { block: CanvasBlock }) {
  switch (block.type) {
    case "chat": return <ChatBlockContent block={block} />;
    case "report": return <ReportBlockContent block={block} />;
    case "document": return <DocumentBlockContent block={block} />;
    case "note": return <NoteBlockContent block={block} />;
    case "knowledge": return <KnowledgeBlockContent block={block} />;
    case "sticky": return <StickyBlockContent block={block} />;
    case "diagram": return <DiagramBlockContent block={block} />;
    case "timeline": return <TimelineBlockContent block={block} />;
    case "code": return <CodeBlockContent block={block} />;
    case "summary": return <SummaryBlockContent block={block} />;
    case "mindmap": return <MindMapBlockContent block={block} />;
    case "table": return <TableBlockContent block={block} />;
    case "image": return <ImageBlockContent block={block} />;
    case "pdf": return <PdfBlockContent block={block} />;
  }
}

export function MindMapBlockContent({ block }: { block: CanvasBlock }) {
  const [text, setText] = useState(block.data.text ?? "");
  const [editing, setEditing] = useState(!block.data.text);

  const pairs: Array<{ from: string; to: string }> = [];
  let root = "";
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\s*[:>]\s*/).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      if (!root) root = parts[0];
      pairs.push({ from: parts[0], to: parts.slice(1).join(" → ") });
    } else if (parts.length === 1) {
      if (!root) root = parts[0];
    }
  }

  const commit = (value: string) => {
    setText(value);
    workspaceStore.updateCanvasBlock(block.id, { data: { text: value } });
  };

  if (editing) {
    return (
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => { commit(e.target.value); setEditing(false); }}
        onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
        className="w-full h-full bg-transparent px-3 py-2 font-mono text-[10px] text-bone/80 outline-none resize-none scrollbar-hide leading-relaxed"
        placeholder={"center > branch\ncenter > child\nchild > detail"}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-hide px-4 py-3" onPointerDown={(e) => e.stopPropagation()}>
      {!root && (
        <button
          onClick={() => setEditing(true)}
          className="font-sans text-2xs text-muted/70 border border-dashed border-border px-3 py-2 rounded-sm hover:border-accent/40"
        >
          Add mind map… (e.g. {"\"Topic > Subtopic\""})
        </button>
      )}
      {root && (
        <div className="space-y-1.5">
          <div className="inline-block px-2.5 py-1.5 rounded-sm bg-accent/15 border border-accent/30 font-sans text-xs font-medium text-bone">
            {root}
          </div>
          <div className="pl-3 border-l-2 border-accent/30 space-y-1.5 ml-1">
            {pairs.map((p, i) => (
              <div key={i} className="pl-2 border-l border-border/50">
                <span className="font-sans text-2xs text-bone/70">{p.from}</span>
                <span className="ml-1 font-mono text-[9px] text-muted/50">→</span>
                <span className="ml-1 font-sans text-2xs text-bone/70">{p.to}</span>
              </div>
            ))}
          </div>
          <button onClick={() => setEditing(true)} className="font-mono text-[9px] uppercase tracking-wider text-muted/60 hover:text-bone/70">
            Edit map
          </button>
        </div>
      )}
    </div>
  );
}

export function TableBlockContent({ block }: { block: CanvasBlock }) {
  const [text, setText] = useState(block.data.text ?? "");
  const [editing, setEditing] = useState(!block.data.text?.trim());

  const rows = text.split("\n").map((l) => l.split("|").map((c) => c.trim())).filter((r) => r.length > 0);
  const commitBlur = (value: string) => {
    setText(value);
    workspaceStore.updateCanvasBlock(block.id, { data: { text: value } });
  };

  if (editing) {
    return (
      <div className="h-full flex flex-col">
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { setEditing(false); } }}
          onBlur={(e) => { commitBlur(e.target.value); setEditing(false); }}
          className="flex-1 bg-transparent px-3 py-2 font-mono text-[10px] text-bone/80 outline-none resize-none scrollbar-hide leading-relaxed"
          placeholder={"Header | Header2\nvalue | value2"}
        />
        <div className="px-3 pb-2">
          <button onClick={() => { commitBlur(text); setEditing(false); }} className="font-mono text-[10px] uppercase tracking-wider text-accent">Done</button>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="h-full flex items-center justify-center px-4">
        <button onClick={() => setEditing(true)} className="font-sans text-2xs text-muted/70 border border-dashed border-border rounded-lg px-3 py-2 hover:border-accent/40">
          Add a table… (use "|" to separate columns)
        </button>
      </div>
    );
  }

  const cols = Math.max(...rows.map((r) => r.length));
  return (
    <div className="h-full overflow-auto scrollbar-hide p-2" onPointerDown={(e) => e.stopPropagation()}>
      <table className="w-full border-collapse font-sans text-[10px]">
        <thead>
          <tr>
            {rows[0].map((c, i) => (
              <th key={i} className="border border-border/60 px-2 py-1 text-left font-medium text-bone/80 bg-bone/[0.04]">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1).map((r, ri) => (
            <tr key={ri}>
              {Array.from({ length: cols }).map((_, ci) => (
                <td key={ci} className="border border-border/50 px-2 py-1 text-bone/70">{r[ci] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => setEditing(true)} className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted/60 hover:text-bone/70">
        Edit table
      </button>
    </div>
  );
}

export function ImageBlockContent({ block }: { block: CanvasBlock }) {
  const [draft, setDraft] = useState(block.data.imageSrc ?? "");
  const fileRef = useRef<HTMLInputElement>(null);

  const setImage = (src: string | null) => {
    workspaceStore.updateCanvasBlock(block.id, { data: { imageSrc: src ?? undefined } });
  };

  if (!block.data.imageSrc) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 px-4">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => setImage(typeof reader.result === "string" ? reader.result : null);
            reader.readAsDataURL(file);
          }}
        />
        <Image size={20} className="text-muted/40" />
        <button onClick={() => fileRef.current?.click()} className="px-3 py-1.5 rounded-sm bg-accent text-surface font-sans text-2xs font-medium">
          Upload image
        </button>
        <div className="flex items-center gap-1.5 w-full">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) setImage(draft.trim()); }}
            placeholder="…or paste an image URL"
            className="flex-1 min-w-0 bg-bone/[0.03] border border-border px-2 py-1.5 font-sans text-2xs outline-none focus:border-accent/40 placeholder:text-muted/30"
          />
          <button onClick={() => draft.trim() && setImage(draft.trim())} className="p-1.5 rounded-sm bg-bone/5 border border-border text-bone/70" title="Load URL">
            <Check size={10} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full group" onPointerDown={(e) => e.stopPropagation()}>
      <img src={block.data.imageSrc} alt="canvas" className="w-full h-full object-contain" />
      <button
        onClick={() => { setImage(null); setDraft(""); }}
        className="absolute top-2 right-2 p-1.5 rounded-sm bg-background/90 border border-border text-muted hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity"
        title="Remove image"
      >
        <X size={10} />
      </button>
    </div>
  );
}

export function PdfBlockContent({ block }: { block: CanvasBlock }) {
  const state = useWorkspaceStore();
  const doc = state.documents.find((d) => d.id === block.data.documentId) ?? null;
  const docs = state.documents.filter((d) => d.workspaceId === block.workspaceId);

  if (!doc) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 px-4 text-center">
        <File size={16} className="text-muted/40" />
        <p className="font-sans text-2xs text-muted">No PDF linked.</p>
        {docs.length > 0 ? (
          <select
            onChange={(e) => { if (e.target.value) workspaceStore.updateCanvasBlock(block.id, { data: { documentId: e.target.value, tabId: undefined } }); }}
            className="bg-bone/[0.04] border border-border font-sans text-2xs px-2 py-1 rounded-sm outline-none max-w-44"
          >
            <option value="">Link a document…</option>
            {docs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        ) : (
          <p className="font-sans text-[10px] text-muted/50">Upload documents in the Documents view to link them here.</p>
        )}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-hide px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted mb-2">{doc.name}</p>
      <div className="font-sans text-2xs text-bone/70 whitespace-pre-wrap break-words leading-relaxed">{doc.content}</div>
    </div>
  );
}

export function BlockRenderer({ block, ...surface }: {
  block: CanvasBlock;
  selected: boolean;
  connectSource: boolean;
  onSelect: () => void;
  onDragStart: (e: React.PointerEvent) => void;
  onResizeStart: (e: React.PointerEvent) => void;
  onBeginConnect: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onRename: (title: string) => void;
}) {
  return (
    <BlockSurface block={block} {...surface}>
      <BlockContent block={block} />
    </BlockSurface>
  );
}
