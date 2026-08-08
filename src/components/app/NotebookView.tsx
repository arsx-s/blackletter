import { useState, useRef, useCallback, useEffect } from "react";
import {
  Plus, Trash2, Bold, Italic, Heading1, Heading2, List,
  ListOrdered, Code, Quote, Search, BookMarked, FileEdit, FileText,
} from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { useWorkspaceStore, workspaceStore } from "../../stores/use-workspace";
import type { WorkspaceNote } from "../../types/workspace";

function ToolbarButton({ icon: Icon, onClick, tooltip }: { icon: typeof Bold; onClick: () => void; tooltip: string }) {
  return (
    <button onClick={onClick} title={tooltip}
      className="p-1 rounded hover:bg-bone/10 text-muted hover:text-bone/70 transition-colors"
    ><Icon size={13} /></button>
  );
}

function Editor({ entry, onUpdate, onDelete, spellcheck, wordWrap }: {
  entry: WorkspaceNote;
  onUpdate: (id: string, data: Partial<WorkspaceNote>) => void;
  onDelete: (id: string) => void;
  spellcheck: boolean;
  wordWrap: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const wrapSelection = useCallback((left: string, right?: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const r = right ?? left;
    ta.value = ta.value.slice(0, start) + left + ta.value.slice(start, end) + r + ta.value.slice(end);
    onUpdate(entry.id, { content: ta.value });
    setTimeout(() => { ta.selectionStart = start + left.length; ta.selectionEnd = end + left.length; ta.focus(); }, 0);
  }, [entry.id, onUpdate]);

  const addHeading = useCallback((level: number) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf("\n", start - 1) + 1;
    ta.value = ta.value.slice(0, lineStart) + "#".repeat(level) + " " + ta.value.slice(lineStart);
    onUpdate(entry.id, { content: ta.value });
    ta.focus();
  }, [entry.id, onUpdate]);

  const insertList = useCallback((ordered: boolean) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf("\n", start - 1) + 1;
    ta.value = ta.value.slice(0, lineStart) + (ordered ? "1. " : "- ") + ta.value.slice(lineStart);
    onUpdate(entry.id, { content: ta.value });
    ta.focus();
  }, [entry.id, onUpdate]);

  useEffect(() => {
    if (!entry.content || entry.content.length < 8) return;
    const timer = setTimeout(() => {
      workspaceStore.deriveGraphFromNote(entry.id);
    }, 900);
    return () => clearTimeout(timer);
  }, [entry.id, entry.content]);

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <input value={entry.title} onChange={(e) => onUpdate(entry.id, { title: e.target.value })}
          placeholder="Note title..."
          className="flex-1 bg-transparent font-display text-base font-medium outline-none placeholder:text-muted/40"
        />
        <Button size="sm" variant="ghost" onClick={() => onDelete(entry.id)}><Trash2 size={13} className="text-muted hover:text-red-400" /></Button>
      </div>

      <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border bg-bone/[0.02]">
        <ToolbarButton icon={Bold} onClick={() => wrapSelection("**")} tooltip="Bold" />
        <ToolbarButton icon={Italic} onClick={() => wrapSelection("_")} tooltip="Italic" />
        <div className="w-px h-4 mx-1 bg-border" />
        <ToolbarButton icon={Heading1} onClick={() => addHeading(1)} tooltip="H1" />
        <ToolbarButton icon={Heading2} onClick={() => addHeading(2)} tooltip="H2" />
        <div className="w-px h-4 mx-1 bg-border" />
        <ToolbarButton icon={List} onClick={() => insertList(false)} tooltip="Bullet list" />
        <ToolbarButton icon={ListOrdered} onClick={() => insertList(true)} tooltip="Numbered list" />
        <ToolbarButton icon={Quote} onClick={() => { const ta = textareaRef.current; if (!ta) return; const s = ta.selectionStart; const ls = ta.value.lastIndexOf("\n", s - 1) + 1; ta.value = ta.value.slice(0, ls) + "> " + ta.value.slice(ls); onUpdate(entry.id, { content: ta.value }); ta.focus(); }} tooltip="Blockquote" />
        <ToolbarButton icon={Code} onClick={() => wrapSelection("`")} tooltip="Code" />
      </div>

      <div className="flex-1 p-4">
        <textarea ref={textareaRef} value={entry.content} onChange={(e) => onUpdate(entry.id, { content: e.target.value })}
          spellCheck={spellcheck}
          wrap={wordWrap ? "soft" : "off"}
          className="w-full h-full bg-transparent font-sans bl-prose text-bone/70 outline-none resize-none scrollbar-hide placeholder:text-muted/30"
          placeholder="Start writing in markdown..."
        />
      </div>

      <div className="px-4 py-3 border-t border-border flex items-center gap-2 text-2xs text-muted">
        Updated {new Date(entry.updatedAt).toLocaleString()}
        {entry.linkedTabId && <span className="flex items-center gap-1"><FileText size={10} /> linked to session</span>}
      </div>
    </div>
  );
}

export function NotebookView() {
  const state = useWorkspaceStore();
  const notes = state.notes.filter((n) => n.workspaceId === state.activeWorkspaceId);
  const sessionNotes = state.tabs
    .filter((t) => t.workspaceId === state.activeWorkspaceId)
    .flatMap((tab) => tab.notes.map((n) => ({ ...n, tabId: tab.id, tabTitle: tab.title })));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const activeEntry = notes.find((n) => n.id === activeId) ?? null;

  const handleNew = useCallback(() => {
    const id = workspaceStore.addNote(state.activeWorkspaceId, "Untitled Note", "");
    setActiveId(id);
  }, [state.activeWorkspaceId]);

  const handleDelete = useCallback((id: string) => {
    workspaceStore.deleteNote(id);
    if (activeId === id) setActiveId(null);
  }, [activeId]);

  const filtered = notes.filter((n) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
  });

  if (notes.length === 0 && sessionNotes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 rounded-xl border border-border bg-bone/[0.03] flex items-center justify-center mx-auto mb-5">
            <BookMarked size={24} className="text-muted/70" />
          </div>
          <p className="font-display text-xl font-medium text-bone/80 mb-2">No notes yet</p>
          <p className="font-sans text-sm text-muted mb-6 max-w-xs mx-auto leading-relaxed">Create your first note to capture thoughts, ideas, and research insights.</p>
          <Button onClick={handleNew}><Plus size={14} className="mr-1" /> Create note</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="w-60 border-r border-border flex flex-col shrink-0">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <span className="font-sans text-xs text-muted">{notes.length} note{notes.length !== 1 ? "s" : ""}</span>
          <Button size="sm" variant="ghost" onClick={handleNew}><Plus size={14} /></Button>
        </div>
        <div className="p-3">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes..."
              className="w-full bg-bone/[0.04] border border-border pl-8 pr-3 py-1.5 font-sans text-xs outline-none focus:border-bone/30 transition-colors rounded placeholder:text-muted/40"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {filtered.map((n) => (
            <div key={n.id} className="px-3 pb-1">
              <button onClick={() => setActiveId(n.id)}
                className={cn("w-full text-left p-2.5 rounded-lg transition-all duration-150 border",
                  activeId === n.id
                    ? "bg-bone/[0.06] border-border"
                    : "border-transparent hover:bg-bone/[0.03]"
                )}>
                <p className="font-sans text-xs font-medium text-bone/70 truncate">{n.title}</p>
                <p className="font-sans text-2xs text-muted mt-0.5">{new Date(n.updatedAt).toLocaleDateString()}</p>
              </button>
            </div>
          ))}
          {sessionNotes.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border">
              <p className="px-3 pb-1 font-mono text-2xs uppercase tracking-ultra text-muted/60">From Sessions</p>
              {sessionNotes.map((n, i) => (
                <div key={i} className="px-3 pb-1">
                  <button
                    onClick={() => workspaceStore.setActiveTab(n.tabId)}
                    className="w-full text-left p-2.5 rounded-lg border border-transparent hover:bg-bone/[0.03] transition-all"
                  >
                    <p className="font-sans text-xs text-bone/60 leading-relaxed line-clamp-2">{n.content}</p>
                    <p className="font-sans text-2xs text-muted mt-1">from {n.tabTitle}</p>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {activeEntry ? (
        <Editor key={activeEntry.id} entry={activeEntry} onUpdate={(id, data) => workspaceStore.updateNote(id, data)} onDelete={handleDelete} spellcheck={state.prefs.spellcheck} wordWrap={state.prefs.wordWrap} />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <FileEdit size={40} className="mx-auto text-muted/20 mb-4" />
            <p className="font-sans text-sm text-muted">Select a note or create a new one</p>
          </div>
        </div>
      )}
    </div>
  );
}