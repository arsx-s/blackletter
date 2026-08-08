import type { ReportSection, Entity, TimelineEvent, ResearchNote } from "../lib/research";
import type { KnowledgeGraphData } from "./knowledge";
import type { CanvasBlock, CanvasEdge, CanvasSnapshot } from "./canvas";
import type { ScoredChunk, GroundedSource, FaithfulnessResult, HallucinationResult, ConfidenceResult } from "../pipeline/scoring";
import type { TraceStage, PipelineTelemetry } from "../pipeline/trace";
import type { WorkspaceMemory } from "../lib/memory";

export type TabPhase = "idle" | "selecting-subject" | "selecting-mode" | "researching" | "complete";

export type TabFontSize = "small" | "medium" | "large";

export type TabMessageRole = "user" | "assistant";

export interface TabMessage {
  role: TabMessageRole;
  content: string;
  timestamp: number;
}

export interface TabError {
  code: string;
  message: string;
}

export interface TabIntelligence {
  confidence: ConfidenceResult | null;
  faithfulness: FaithfulnessResult | null;
  hallucination: HallucinationResult | null;
  groundedSources: GroundedSource[];
  retrievedChunks: ScoredChunk[];
  trace: TraceStage[];
  telemetry: PipelineTelemetry | null;
}

export interface TabEvent {
  id: string;
  kind: "created" | "started" | "completed" | "failed" | "uploaded" | "reset";
  at: number;
  detail?: string;
}

export interface ResearchTab {
  id: string;
  workspaceId: string;
  folderId: string | null;
  title: string;
  subject: string | null;
  mode: string | null;
  model: string;
  phase: TabPhase;
  topic: string;
  pipelineStage: number;
  streaming: boolean;
  docStage: "idle" | "extracting" | "analyzing";
  difficulty: string;
  teachingMode: string;
  sections: ReportSection[];
  fullText: string;
  entities: Entity[];
  timelineEvents: TimelineEvent[];
  notes: ResearchNote[];
  followUps: string[];
  messages: TabMessage[];
  documentIds: string[];
  error: TabError | null;
  pinned: boolean;
  unsaved: boolean;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  scrollTop: number;
  intelligence?: TabIntelligence;
  history?: TabEvent[];
}

export interface Folder {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  collapsed: boolean;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface Workspace {
  id: string;
  name: string;
  favorite: boolean;
  archived: boolean;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceDocument {
  id: string;
  workspaceId: string;
  folderId: string | null;
  name: string;
  extension: string;
  size: number;
  pageCount: number | null;
  addedAt: number;
  status: "processing" | "ready" | "failed";
  content: string;
  error?: string;
}

export interface WorkspaceNote {
  id: string;
  workspaceId: string;
  title: string;
  content: string;
  linkedTabId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Prefs {
  sidebarOpen: boolean;
  sidebarWidth: number;
  inspectorOpen: boolean;
  inspectorWidth: number;
  defaultModel: string;
  graphViewOpen: boolean;
  graphSelectedNodeId: string | null;
  canvasViewOpen: boolean;
  focusCanvasBlockId: string | null;
  workshopViewOpen: boolean;
  documentsViewOpen: boolean;
  focusDocumentId: string | null;
  fontSize: TabFontSize;
  spellcheck: boolean;
  wordWrap: boolean;
  autosave: boolean;
  defaultMode: string;
  temperature: number;
  maxTokens: number;
  developerMode: boolean;
  splitView: boolean;
  splitTabId: string | null;
  floatingChatOpen: boolean;
  floatingChatTabId: string | null;
}

export interface WorkspaceSnapshot {
  id: string;
  workspaceId: string;
  kind: "snapshot" | "template";
  label: string;
  at: number;
  tabs: ResearchTab[];
  documents: WorkspaceDocument[];
  folders: Folder[];
  notes: WorkspaceNote[];
  canvasBlocks: CanvasBlock[];
  canvasEdges: CanvasEdge[];
  knowledge: KnowledgeGraphData;
  memory: WorkspaceMemory | null;
}

export interface PersistedState {
  version: number;
  workspaces: Workspace[];
  folders: Folder[];
  documents: WorkspaceDocument[];
  tabs: ResearchTab[];
  notes: WorkspaceNote[];
  knowledge: KnowledgeGraphData;
  canvasBlocks: CanvasBlock[];
  canvasEdges: CanvasEdge[];
  canvasSnapshots: CanvasSnapshot[];
  workspaceSnapshots: WorkspaceSnapshot[];
  templates: WorkspaceSnapshot[];
  memory: Record<string, WorkspaceMemory>;
  activeWorkspaceId: string;
  activeTabId: string | null;
  prefs: Prefs;
  navHistory: string[];
  navIndex: number;
}

export interface AppState extends PersistedState {
  saveState: "saved" | "unsaved" | "saving";
  lastSavedAt: number;
  pendingRenameWorkspaceId: string | null;
}

export interface SearchHit {
  type: "tab" | "workspace" | "folder" | "document" | "knowledge" | "canvas";
  id: string;
  workspaceId: string;
  title: string;
  detail: string;
  updatedAt: number;
}

export interface SearchResults {
  tabs: SearchHit[];
  workspaces: SearchHit[];
  folders: SearchHit[];
  documents: SearchHit[];
  knowledge: SearchHit[];
  canvas: SearchHit[];
}
