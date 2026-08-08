import { useState } from "react";
import { Activity, CalendarClock, ChevronLeft, ChevronRight, Info, Network } from "lucide-react";
import { cn } from "../../lib/utils";
import { workspaceStore } from "../../stores/workspace-store";
import { KnowledgeCanvas } from "../knowledge/KnowledgeCanvas";
import { Timeline } from "../research/Timeline";
import { MODE_LABELS } from "../../lib/research";

type InspectorView = "graph" | "timeline" | "metadata";

export function InspectorPanel() {
  const state = workspaceStore.getState();
  const tab = state.tabs.find((t) => t.id === state.activeTabId) ?? null;
  const [view, setView] = useState<InspectorView>("graph");
  const workspace = state.workspaces.find((w) => w.id === tab?.workspaceId) ?? null;

  if (!state.prefs.inspectorOpen) return null;

  return (
    <aside className="flex h-full w-full flex-col bg-sidebar/40 border-l border-border overflow-hidden">
      <div className="flex items-center gap-1 px-2 pt-2 pb-1.5 border-b border-border shrink-0">
        {(
          [
            { id: "graph" as const, icon: Network, label: "Graph" },
            { id: "timeline" as const, icon: CalendarClock, label: "Timeline" },
            { id: "metadata" as const, icon: Info, label: "Meta" },
          ]
        ).map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-md font-sans text-2xs transition-colors",
              view === id ? "bg-bone/8 text-bone" : "text-muted hover:text-bone hover:bg-bone/5",
            )}
          >
            <Icon size={11} /> {label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => workspaceStore.toggleInspector()}
          className="p-1 rounded-md text-muted hover:text-bone hover:bg-bone/5"
          title="Close inspector"
          aria-label="Close inspector"
        >
          <ChevronRight size={13} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {!tab ? (
          <EmptyInspector message="Open a session to inspect its knowledge graph, timeline, and metadata." />
        ) : view === "graph" ? (
          <SessionGraph tabId={tab.id} />
        ) : view === "timeline" ? (
          <div className="h-full overflow-y-auto scrollbar-hide">
            <div className="px-3 pt-3 pb-1 flex items-center justify-between">
              <p className="font-mono text-2xs uppercase tracking-ultra text-muted">Timeline</p>
              <span className="font-mono text-2xs text-muted/60">{tab.timelineEvents.length}</span>
            </div>
            <Timeline events={tab.timelineEvents} />
          </div>
        ) : (
          <MetadataView tabId={tab.id} />
        )}
      </div>

      <div className="px-3 py-2 border-t border-border shrink-0">
        <div className="flex items-center justify-between font-sans text-2xs text-muted">
          <span className="truncate">{workspace ? workspace.name : "Workspace"}</span>
          {tab && (
            <span className="flex items-center gap-1 shrink-0">
              <Activity size={10} />
              {new Date(tab.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}

function SessionGraph({ tabId }: { tabId: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const session = workspaceStore.knowledgeForTab(tabId);
  const count = session.nodes.length;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-3 pt-3 pb-1 flex items-center justify-between shrink-0">
        <p className="font-mono text-2xs uppercase tracking-ultra text-muted">Live Graph</p>
        <div className="flex items-center gap-2">
          <span className="font-mono text-2xs text-muted/60">{count} node{count !== 1 ? "s" : ""}</span>
          <button
            onClick={() => {
              const id = workspaceStore.addCanvasBlock({
                workspaceId: tabId ? workspaceStore.getState().tabs.find((t) => t.id === tabId)?.workspaceId ?? workspaceStore.getState().activeWorkspaceId : workspaceStore.getState().activeWorkspaceId,
                type: "knowledge",
                title: "Knowledge graph block",
                data: { tabId },
                x: 260,
                y: 260,
              });
              workspaceStore.setPrefs({ canvasViewOpen: true, focusCanvasBlockId: id });
            }}
            className="px-2 py-1 rounded-sm border border-border text-muted hover:text-bone hover:border-bone/30 font-mono text-2xs transition-colors"
            title="Open this graph as a block on the research canvas"
          >
            In canvas
          </button>
          <button
            onClick={() => {
              workspaceStore.setPrefs({
                graphViewOpen: true,
                graphSelectedNodeId: selectedId,
              });
            }}
            className="px-2 py-1 rounded-sm border border-border text-muted hover:text-bone hover:border-bone/30 font-mono text-2xs transition-colors"
            title="Open full knowledge graph"
          >
            Open full graph
          </button>
        </div>
      </div>
      <div className="flex-1 relative min-h-0">
        <KnowledgeCanvas
          graph={session}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>
    </div>
  );
}

function MetadataView({ tabId }: { tabId: string }) {
  const tab = workspaceStore.getState().tabs.find((t) => t.id === tabId);
  if (!tab) return null;
  const docs = tab.documentIds
    .map((id) => workspaceStore.getState().documents.find((d) => d.id === id))
    .filter((d) => d !== undefined);

  const rows: Array<[string, string]> = [
    ["Status", tab.phase === "complete" ? "Complete" : tab.phase === "researching" ? "Running" : "Draft"],
    ["Subject", tab.subject ? tab.subject.charAt(0).toUpperCase() + tab.subject.slice(1) : "—"],
    ["Mode", tab.mode ? (MODE_LABELS[tab.mode as keyof typeof MODE_LABELS] ?? tab.mode) : "—"],
    ["Model", tab.model || "Default"],
    ["Documents", docs.length > 0 ? docs.map((d) => d.name).join(", ") : "None"],
    ["Created", new Date(tab.createdAt).toLocaleString()],
    ["Modified", new Date(tab.updatedAt).toLocaleString()],
    ["Report", tab.fullText ? `${tab.fullText.length.toLocaleString()} chars` : "—"],
    ["Entities", `${tab.entities.length}`],
    ["Timeline events", `${tab.timelineEvents.length}`],
    ["Conversation turns", `${tab.messages.length}`],
    ["Difficulty", tab.difficulty],
  ];

  return (
    <div className="p-3 space-y-2 overflow-y-auto scrollbar-hide">
      {rows.map(([label, value]) => (
        <div key={label} className="border border-border/50 rounded-md px-2.5 py-1.5 bg-bone/[0.02]">
          <p className="font-mono text-2xs uppercase tracking-wider text-muted/60">{label}</p>
          <p className="font-sans text-xs text-bone/80 break-words mt-0.5">{value}</p>
        </div>
      ))}
    </div>
  );
}

function EmptyInspector({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center px-6 text-center">
      <p className="font-sans text-2xs text-muted/60 leading-relaxed">{message}</p>
    </div>
  );
}

export function InspectorToggle() {
  const open = workspaceStore.getState().prefs.inspectorOpen;
  return (
    <button
      onClick={() => workspaceStore.toggleInspector()}
      className="flex items-center gap-1 px-2 py-1 rounded-md text-muted hover:text-bone hover:bg-bone/5 font-sans text-2xs transition-colors"
      title="Toggle inspector"
    >
      {open ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      Inspector
    </button>
  );
}