import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock, ChevronDown, Download, Network, Search, Star, TrendingUp, Zap,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useWorkspaceStore, workspaceStore } from "../../stores/use-workspace";
import type { KnowledgeGraphData, KnowledgeNodeType } from "../../types/knowledge";
import { KNOWLEDGE_NODE_LABELS } from "../../types/knowledge";
import { layoutKnowledge } from "../../knowledge/layout";
import { growthByDay, searchNodes, studyPath } from "../../knowledge/graph";
import {
  downloadTextFile, exportGraphCsv, exportGraphGraphML, exportGraphJson,
  exportGraphMarkdown, exportGraphPng, exportGraphSvg,
} from "../../knowledge/exporter";
import { KnowledgeCanvas } from "./KnowledgeCanvas";
import { NodeInspector } from "./NodeInspector";

type OriginFilter = "all" | "ai" | "manual";
type TimeFilter = "all" | "24h" | "7d";

const DAY_MS = 24 * 60 * 60 * 1000;

export function GraphView() {
  const state = useWorkspaceStore();
  const graph = state.knowledge;
  const stats = useMemo(() => workspaceStore.knowledgeStats(), [state.knowledge]);

  const [selectedId, setSelectedId] = useState<string | null>(() => workspaceStore.getState().prefs.graphSelectedNodeId);

  useEffect(() => {
    if (workspaceStore.getState().prefs.graphSelectedNodeId) {
      workspaceStore.setPrefs({ graphSelectedNodeId: null });
    }
  }, []);
  const [typeFilter, setTypeFilter] = useState<KnowledgeNodeType | null>(null);
  const [origin, setOrigin] = useState<OriginFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [navAnchor, setNavAnchor] = useState<string | null>(null);
  const [timelineMode, setTimelineMode] = useState(false);
  const [learningMode, setLearningMode] = useState(false);
  const [showGrowth, setShowGrowth] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const filtered = useMemo(() => {
    const now = Date.now();
    let nodes = graph.nodes;
    if (typeFilter) nodes = nodes.filter((n) => n.type === typeFilter);
    if (origin === "ai") nodes = nodes.filter((n) => n.aiGenerated && !n.manual);
    if (origin === "manual") nodes = nodes.filter((n) => n.manual);
    if (favoritesOnly) nodes = nodes.filter((n) => n.favorite);
    if (pinnedOnly) nodes = nodes.filter((n) => n.pinned);
    if (timeFilter === "24h") nodes = nodes.filter((n) => n.lastSeenAt >= now - DAY_MS);
    if (timeFilter === "7d") nodes = nodes.filter((n) => n.lastSeenAt >= now - 7 * DAY_MS);
    if (query.trim()) nodes = searchNodes({ ...graph, nodes, edges: [] }, query, 200);
    return nodes;
  }, [graph, typeFilter, origin, timeFilter, favoritesOnly, pinnedOnly, query]);

  const subgraph = useMemo(() => {
    const ids = new Set(filtered.map((n) => n.id));
    return {
      version: graph.version,
      nodes: filtered,
      edges: graph.edges.filter((e) => ids.has(e.sourceId) && ids.has(e.targetId)),
    };
  }, [filtered, graph.edges, graph.version]);

  useEffect(() => {
    if (selectedId && !filtered.some((n) => n.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filtered, selectedId]);

  useEffect(() => {
    if (query.trim()) {
      const hits = searchNodes(graph, query, 1);
      setNavAnchor(hits[0]?.id ?? null);
    } else {
      setNavAnchor(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const layout = useMemo(
    () => layoutKnowledge(subgraph, { anchorId: navAnchor ?? undefined, timeline: timelineMode }),
    [subgraph, navAnchor, timelineMode],
  );

  const searchResults = useMemo(
    () => (query.trim() ? searchNodes(graph, query, 8) : []),
    [graph, query],
  );

  const selectedNode = graph.nodes.find((n) => n.id === selectedId) ?? null;
  const knownIds = useMemo(
    () => new Set(graph.nodes.filter((n) => n.strength >= 0.3).map((n) => n.id)),
    [graph],
  );
  const path = useMemo(
    () => (selectedNode ? studyPath(graph, selectedNode.id, knownIds) : []),
    [graph, selectedNode, knownIds],
  );
  const growth = useMemo(() => growthByDay(graph, 30), [graph]);
  const growthMax = Math.max(1, ...growth.map((g) => g.count));

  const exportGraph = (kind: "json" | "csv" | "md" | "graphml" | "svg" | "png") => {
    const stamp = new Date().toISOString().slice(0, 10);
    const name = `blackletter-graph-${stamp}`;
    const svg = exportGraphSvg(subgraph, layout);
    switch (kind) {
      case "json": downloadTextFile(`${name}.json`, exportGraphJson(subgraph), "application/json"); break;
      case "csv": downloadTextFile(`${name}.csv`, exportGraphCsv(subgraph), "text/csv"); break;
      case "md": downloadTextFile(`${name}.md`, exportGraphMarkdown(subgraph), "text/markdown"); break;
      case "graphml": downloadTextFile(`${name}.graphml`, exportGraphGraphML(subgraph), "application/xml"); break;
      case "svg": downloadTextFile(`${name}.svg`, svg, "image/svg+xml"); break;
      case "png": void exportGraphPng(svg, `${name}.png`); break;
    }
    setExportOpen(false);
  };

  const typeCounts = Object.entries(stats.typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <div className="h-full flex flex-col min-h-0 bg-background">
      <div className="flex items-center gap-2 h-11 px-4 border-b border-border shrink-0">
        <Network size={13} className="text-muted" />
        <span className="font-mono text-2xs uppercase tracking-ultra text-muted">Knowledge Graph</span>
        <span className="font-mono text-2xs text-muted/60">{stats.nodeCount} nodes · {stats.edgeCount} edges</span>

        <div className="flex-1" />

        <div className="relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
            onFocus={() => setShowResults(true)}
            onBlur={() => setTimeout(() => setShowResults(false), 150)}
            placeholder="Search the graph…"
            className="w-48 bg-bone/[0.04] border border-border pl-7 pr-3 py-1 font-sans text-xs outline-none focus:border-bone/30 transition-colors rounded-sm placeholder:text-muted/40"
          />
          {showResults && searchResults.length > 0 && (
            <div className="absolute top-full left-0 mt-1 z-40 w-64 max-h-64 overflow-y-auto scrollbar-hide bg-background border border-border rounded-sm shadow-premium-lg">
              {searchResults.map((n) => (
                <button
                  key={n.id}
                  onMouseDown={() => { setQuery(n.label); setSelectedId(n.id); setNavAnchor(n.id); setShowResults(false); }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-bone/5 text-left"
                >
                  <span className="font-sans text-xs text-bone/75 truncate">{n.label}</span>
                  <span className="font-mono text-2xs text-muted shrink-0">{KNOWLEDGE_NODE_LABELS[n.type]}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 ml-1">
          <button onClick={() => setLearningMode((v) => !v)} className={cn(toolBtn, learningMode && "bg-bone/10 text-bone border-bone/30")} title="Learning mode">
            <Zap size={11} /> Learning
          </button>
          <button onClick={() => setTimelineMode((v) => !v)} className={cn(toolBtn, timelineMode && "bg-bone/10 text-bone border-bone/30")} title="Timeline layout">
            <CalendarClock size={11} /> Timeline
          </button>
          <button onClick={() => setShowGrowth((v) => !v)} className={cn(toolBtn, showGrowth && "bg-bone/10 text-bone border-bone/30")} title="Graph growth">
            <TrendingUp size={11} />
          </button>
          <div className="relative">
            <button onClick={() => setExportOpen((v) => !v)} className={cn(toolBtn, exportOpen && "bg-bone/10 text-bone border-bone/30")} title="Export graph">
              <Download size={11} /> Export <ChevronDown size={9} />
            </button>
            {exportOpen && (
              <div className="absolute top-full right-0 mt-1 z-40 w-40 py-1 bg-background border border-border rounded-sm shadow-premium-lg">
                {([["json", "JSON"], ["csv", "CSV"], ["md", "Markdown"], ["graphml", "GraphML"], ["svg", "SVG"], ["png", "PNG"]] as const).map(([id, label]) => (
                  <button key={id} onClick={() => exportGraph(id)} className="w-full px-3 py-1.5 font-sans text-xs text-bone/70 hover:bg-bone/5 hover:text-bone text-left">
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-border shrink-0 overflow-x-auto scrollbar-hide">
        <FilterChip active={typeFilter === null} onClick={() => setTypeFilter(null)}>All ({stats.nodeCount})</FilterChip>
        {typeCounts.map(([type, count]) => (
          <FilterChip key={type} active={typeFilter === type} onClick={() => setTypeFilter(typeFilter === type ? null : (type as KnowledgeNodeType))}>
            {KNOWLEDGE_NODE_LABELS[type as keyof typeof KNOWLEDGE_NODE_LABELS] ?? type} ({count})
          </FilterChip>
        ))}
        <div className="w-px h-4 bg-border mx-1 shrink-0" />
        {(["all", "ai", "manual"] as const).map((o) => (
          <FilterChip key={o} active={origin === o} onClick={() => setOrigin(o)}>{o === "all" ? "All origins" : o}</FilterChip>
        ))}
        {(["all", "24h", "7d"] as const).map((t) => (
          <FilterChip key={t} active={timeFilter === t} onClick={() => setTimeFilter(t)}>{t === "all" ? "All time" : `Seen ${t}`}</FilterChip>
        ))}
        <FilterChip active={favoritesOnly} onClick={() => setFavoritesOnly((v) => !v)}><Star size={9} fill={favoritesOnly ? "currentColor" : "none"} /> Favorites</FilterChip>
        <FilterChip active={pinnedOnly} onClick={() => setPinnedOnly((v) => !v)}>Pinned</FilterChip>
      </div>

      {learningMode && (
        <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-bone/[0.02] shrink-0">
          <LearningStat label="Strong" value={stats.strongCount} tone="text-bone" />
          <LearningStat label="Known" value={stats.knownCount} tone="text-bone/70" />
          <LearningStat label="Weak" value={stats.weakCount} tone="text-bone/40" />
          <LearningStat label="Unknown" value={stats.unknownCount} tone="text-muted" />
          {selectedNode && (
            <div className="flex items-center gap-2 ml-auto min-w-0">
              <span className="font-mono text-2xs uppercase tracking-ultra text-muted shrink-0">Study path</span>
              {path.length === 0 ? (
                <span className="font-sans text-2xs text-muted">Nothing to review — {selectedNode.label} is ready.</span>
              ) : (
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
                  {path.map((n, i) => (
                    <button key={n.id} onClick={() => setSelectedId(n.id)} className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-sm bg-bone/[0.05] border border-border font-sans text-2xs text-bone/60 hover:text-bone">
                      {i > 0 && <span className="text-muted/50">→</span>}
                      {n.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showGrowth && (
        <div className="px-4 py-3 border-b border-border shrink-0 bg-bone/[0.02]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-2xs uppercase tracking-ultra text-muted">Graph growth — last 30 days</span>
            <span className="font-mono text-2xs text-muted/60">total {stats.nodeCount} nodes</span>
          </div>
          <svg viewBox="0 0 600 80" className="w-full h-20" preserveAspectRatio="none">
            <defs>
              <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(232,230,225,0.25)" />
                <stop offset="100%" stopColor="rgba(232,230,225,0)" />
              </linearGradient>
            </defs>
            {growth.map((g, i) => {
              const x = (i / Math.max(1, growth.length - 1)) * 600;
              const y = 78 - (g.count / growthMax) * 70;
              const next = growth[i + 1];
              const x2 = next ? ((i + 1) / Math.max(1, growth.length - 1)) * 600 : x;
              const y2 = next ? 78 - (next.count / growthMax) * 70 : y;
              return <line key={i} x1={x} y1={y} x2={x2} y2={y2} stroke="rgba(232,230,225,0.5)" strokeWidth={1.5} />;
            })}
            <rect x={0} y={0} width={600} height={78} fill="url(#growthFill)" />
          </svg>
        </div>
      )}

      <div className="flex-1 relative min-h-0">
        {subgraph.nodes.length === 0 ? (
          <EmptyGraph hasAny={graph.nodes.length > 0} />
        ) : (
          <KnowledgeCanvas
            graph={subgraph}
            layout={layout}
            selectedId={selectedId}
            onSelect={setSelectedId}
            anchorId={navAnchor}
            timelineMode={timelineMode}
            learningMode={learningMode}
            navAnchor={navAnchor}
          />
        )}
        {selectedNode && (
          <div className="absolute top-0 right-0 bottom-0 w-[340px] z-30 border-l border-border bg-background">
            <NodeInspector
              key={selectedNode.id}
              node={selectedNode}
              graph={graph}
              onClose={() => setSelectedId(null)}
              onNavigate={(id) => { setSelectedId(id); setNavAnchor(id); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const toolBtn = "flex items-center gap-1.5 px-2 py-1 rounded-sm border border-border text-muted hover:text-bone hover:border-bone/30 font-sans text-2xs transition-colors";

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 flex items-center gap-1 px-2 py-1 rounded-sm border font-sans text-2xs transition-colors",
        active ? "bg-bone/10 border-bone/30 text-bone" : "border-transparent text-muted hover:text-bone hover:bg-bone/5",
      )}
    >
      {children}
    </button>
  );
}

function LearningStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("font-mono text-sm font-medium", tone)}>{value}</span>
      <span className="font-mono text-2xs uppercase tracking-wider text-muted/60">{label}</span>
    </div>
  );
}

function EmptyGraph({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-sm">
        <div className="w-14 h-14 rounded-xl border border-border bg-bone/[0.03] flex items-center justify-center mx-auto mb-5">
          <Network size={24} className="text-muted/70" />
        </div>
        {hasAny ? (
          <>
            <p className="font-display text-lg font-medium text-bone/80 mb-2">Nothing matches the filters</p>
            <p className="font-sans text-sm text-muted">Clear a filter to reveal more of the knowledge network.</p>
          </>
        ) : (
          <>
            <p className="font-display text-lg font-medium text-bone/80 mb-2">The graph is empty</p>
            <p className="font-sans text-sm text-muted leading-relaxed">
              Run research, upload documents, or write notes — every interaction automatically grows this knowledge
              network. Concepts, definitions, people, cases, laws and relationships appear here as nodes and edges.
            </p>
          </>
        )}
      </div>
    </div>
  );
}