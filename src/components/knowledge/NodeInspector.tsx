import { useState } from "react";
import {
  BookMarked, Check, FileText, Lightbulb, Loader2, MessageSquare, Pencil, Pin,
  Star, Trash2, X,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { workspaceStore } from "../../stores/workspace-store";
import type { KnowledgeGraphData, KnowledgeNode, KnowledgeEdge } from "../../types/knowledge";
import { KNOWLEDGE_EDGE_LABELS, KNOWLEDGE_NODE_LABELS } from "../../types/knowledge";
import { generateResponse } from "../../services/ai";

const SWATCHES = ["", "#E8E6E1", "#72383D", "#6B7A52", "#3D4E72", "#5C5A7A", "#7A5C3D", "#3D7272"];

interface NeighborGroup {
  node: KnowledgeNode;
  edge: KnowledgeEdge;
  direction: "in" | "out";
}

export function NodeInspector({ node, graph, onClose, onNavigate }: {
  node: KnowledgeNode;
  graph: KnowledgeGraphData;
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(node.label);
  const [noteDraft, setNoteDraft] = useState(node.description);
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [explainError, setExplainError] = useState("");
  const state = workspaceStore.getState();

  const neighbors: NeighborGroup[] = [];
  for (const e of graph.edges) {
    if (e.sourceId === node.id) {
      const t = graph.nodes.find((n) => n.id === e.targetId);
      if (t) neighbors.push({ node: t, edge: e, direction: "out" });
    } else if (e.targetId === node.id) {
      const s = graph.nodes.find((n) => n.id === e.sourceId);
      if (s) neighbors.push({ node: s, edge: e, direction: "in" });
    }
  }
  const connected = neighbors.sort((a, b) => b.edge.weight - a.edge.weight).slice(0, 24);

  const relatedTabs = state.tabs.filter((t) => node.sourceTabIds.includes(t.id));
  const relatedDocs = state.documents.filter((d) => node.sourceDocumentIds.includes(d.id));
  const relatedNotes = state.notes.filter((n) => node.sourceNoteIds.includes(n.id));

  const saveLabel = () => {
    const clean = labelDraft.trim();
    if (clean && clean !== node.label) {
      workspaceStore.updateKnowledgeNode(node.id, { label: clean });
    }
    setEditingLabel(false);
  };

  const runExplain = async () => {
    setExplaining(true);
    setExplainError("");
    setExplanation("");
    try {
      const res = await generateResponse({
        prompt: `Explain the concept "${node.label}" clearly. Cover: what it is, why it matters, one concrete example, and how it connects to ${connected.slice(0, 5).map((c) => c.node.label).join(", ") || "related ideas"}. Keep it under 220 words.`,
        systemInstruction: "You are BlackLetter's knowledge graph explainer. Be precise, structured, and concise. Plain prose with short paragraphs, no markdown headers.",
        model: state.prefs.defaultModel,
      });
      setExplanation(res.text.trim());
    } catch (e) {
      setExplainError((e as { message?: string }).message ?? "Explanation failed — check your API connection.");
    } finally {
      setExplaining(false);
    }
  };

  const pct = Math.round(node.strength * 100);

  return (
    <div className="flex h-full w-full flex-col bg-background border-l border-border overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <div className="w-6 h-6 rounded-full border border-bone/25 bg-bone/5 flex items-center justify-center">
          <Lightbulb size={11} className="text-bone/60" />
        </div>
        <div className="flex-1 min-w-0">
          {editingLabel ? (
            <input
              autoFocus
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={saveLabel}
              onKeyDown={(e) => { if (e.key === "Enter") saveLabel(); if (e.key === "Escape") setEditingLabel(false); }}
              className="w-full bg-bone/[0.04] border border-border px-1.5 py-0.5 font-sans text-xs text-bone outline-none"
            />
          ) : (
            <button onClick={() => { setLabelDraft(node.label); setEditingLabel(true); }} className="w-full text-left font-sans text-xs font-medium text-bone truncate hover:text-bone/70" title="Rename node">
              {node.label}
            </button>
          )}
          <p className="font-mono text-2xs uppercase tracking-ultra text-muted">{KNOWLEDGE_NODE_LABELS[node.type] ?? node.type}</p>
        </div>
        <button onClick={() => workspaceStore.toggleKnowledgeNode(node.id, "pinned")} className={cn("p-1 rounded-sm hover:bg-bone/5", node.pinned ? "text-bone" : "text-muted")} title="Pin">
          <Pin size={12} />
        </button>
        <button onClick={() => workspaceStore.toggleKnowledgeNode(node.id, "favorite")} className={cn("p-1 rounded-sm hover:bg-bone/5", node.favorite ? "text-bone" : "text-muted")} title="Favorite">
          <Star size={12} fill={node.favorite ? "currentColor" : "none"} />
        </button>
        <button
          onClick={() => {
            const id = workspaceStore.addCanvasBlock({
              workspaceId: workspaceStore.getState().activeWorkspaceId,
              type: "sticky",
              title: node.label,
              x: 240,
              y: 200,
              data: { text: `${node.label} — ${node.summary || node.description || ""}`.trim() },
            });
            workspaceStore.setPrefs({ canvasViewOpen: true, focusCanvasBlockId: id });
          }}
          className="p-1 rounded-sm hover:bg-bone/5 text-muted"
          title="Open on research canvas"
        >
          <BookMarked size={12} />
        </button>
        <button onClick={() => { workspaceStore.removeKnowledgeNode(node.id); onClose(); }} className="p-1 rounded-sm hover:bg-bone/5 text-muted hover:text-red-400" title="Delete node">
          <Trash2 size={12} />
        </button>
        <button onClick={onClose} className="p-1 rounded-sm hover:bg-bone/5 text-muted" title="Close">
          <X size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {node.definition && (
          <section className="px-3 pt-3">
            <SectionLabel>Definition</SectionLabel>
            <p className="font-sans text-xs leading-relaxed text-bone/80">{node.definition}</p>
          </section>
        )}
        {node.summary && (
          <section className="px-3 pt-3">
            <SectionLabel>Summary</SectionLabel>
            <p className="font-sans text-xs leading-relaxed text-bone/70">{node.summary}</p>
          </section>
        )}
        {node.example && (
          <section className="px-3 pt-3">
            <SectionLabel>Example</SectionLabel>
            <p className="font-sans text-xs leading-relaxed text-bone/70">{node.example}</p>
          </section>
        )}

        <section className="px-3 pt-3">
          <SectionLabel>Knowledge</SectionLabel>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1 bg-bone/8 rounded-full overflow-hidden">
                <div className="h-full bg-bone/70 rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <span className="font-mono text-2xs text-muted w-9 text-right">{pct}%</span>
            </div>
            <div className="flex flex-wrap gap-1">
              <MetaChip>{node.strength >= 0.6 ? "strong" : node.strength >= 0.3 ? "familiar" : "new"}</MetaChip>
              <MetaChip>{node.occurrences}×</MetaChip>
              <MetaChip>{node.aiGenerated ? "ai" : "manual"}</MetaChip>
              {node.difficulty}
              {node.color && <MetaChip>colored</MetaChip>}
            </div>
          </div>
        </section>

        <section className="px-3 pt-3">
          <SectionLabel>Appearance</SectionLabel>
          <div className="flex items-center gap-1.5">
            {SWATCHES.map((c) => (
              <button
                key={c || "none"}
                onClick={() => workspaceStore.setKnowledgeNodeColor(node.id, c)}
                className={cn(
                  "w-5 h-5 rounded-full border transition-transform hover:scale-110",
                  c ? "" : "bg-transparent",
                  node.color === c ? "border-bone" : "border-border",
                )}
                style={c ? { backgroundColor: c } : undefined}
                title={c ? c : "Default"}
              >
                {c === "" && !node.color && <Check size={10} className="mx-auto text-bone/60" />}
              </button>
            ))}
          </div>
        </section>

        {explanation && (
          <section className="px-3 pt-3">
            <SectionLabel>AI Explanation</SectionLabel>
            <p className="font-sans text-xs leading-relaxed text-bone/70 whitespace-pre-wrap">{explanation}</p>
          </section>
        )}
        {explainError && <p className="px-3 pt-2 font-sans text-2xs text-red-400/80">{explainError}</p>}
        <div className="px-3 pt-2">
          <button
            onClick={runExplain}
            disabled={explaining}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm border border-border hover:border-bone/30 font-sans text-2xs text-bone/70 hover:text-bone transition-colors disabled:opacity-50"
          >
            {explaining ? <Loader2 size={11} className="animate-spin" /> : <Lightbulb size={11} />}
            {explaining ? "Generating…" : "Explain with AI"}
          </button>
        </div>

        {connected.length > 0 && (
          <section className="px-3 pt-3">
            <SectionLabel>Connected ({connected.length})</SectionLabel>
            <div className="space-y-1">
              {connected.map(({ node: n, edge, direction }) => (
                <button
                  key={edge.id}
                  onClick={() => onNavigate(n.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm border border-border/50 bg-bone/[0.02] hover:bg-bone/[0.05] text-left transition-colors"
                >
                  <span className="font-mono text-2xs text-muted w-20 shrink-0 truncate">
                    {direction === "in" ? "← " : "→ "}{KNOWLEDGE_EDGE_LABELS[edge.type]}
                  </span>
                  <span className="font-sans text-xs text-bone/75 truncate flex-1">{n.label}</span>
                  <span className="font-mono text-2xs text-muted/60">{Math.round(edge.weight * 100)}%</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {(relatedTabs.length > 0 || relatedDocs.length > 0 || relatedNotes.length > 0) && (
          <section className="px-3 pt-3">
            <SectionLabel>Mentioned in</SectionLabel>
            <div className="space-y-1">
              {relatedTabs.slice(0, 6).map((t) => (
                <button key={t.id} onClick={() => workspaceStore.setActiveTab(t.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-bone/5 text-left">
                  <MessageSquare size={11} className="text-muted shrink-0" />
                  <span className="font-sans text-xs text-bone/70 truncate flex-1">{t.title}</span>
                </button>
              ))}
              {relatedDocs.slice(0, 4).map((d) => (
                <button key={d.id} onClick={() => workspaceStore.setActiveWorkspace(d.workspaceId)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-bone/5 text-left">
                  <FileText size={11} className="text-muted shrink-0" />
                  <span className="font-sans text-xs text-bone/70 truncate flex-1">{d.name}</span>
                </button>
              ))}
              {relatedNotes.slice(0, 4).map((n) => (
                <div key={n.id} className="flex items-center gap-2 px-2 py-1.5">
                  <BookMarked size={11} className="text-muted shrink-0" />
                  <span className="font-sans text-xs text-bone/70 truncate flex-1">{n.title}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="px-3 pt-3 pb-2">
          <SectionLabel>Notes</SectionLabel>
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={() => { if (noteDraft !== node.description) workspaceStore.updateKnowledgeNode(node.id, { description: noteDraft }); }}
            placeholder="Write notes about this concept…"
            className="w-full min-h-16 bg-bone/[0.03] border border-border px-2 py-1.5 font-sans text-xs text-bone/70 outline-none focus:border-bone/30 resize-none rounded-sm"
          />
        </section>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-2xs uppercase tracking-ultra text-muted mb-1.5">{children}</p>;
}

function MetaChip({ children }: { children: React.ReactNode }) {
  return <span className="px-1.5 py-0.5 rounded-sm bg-bone/[0.05] border border-border/60 font-mono text-2xs text-muted">{children}</span>;
}