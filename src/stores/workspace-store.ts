import { loadPersisted, persistState } from "../lib/db";
import { getModel } from "../config/models";
import { CANVAS_BLOCK_DEFAULT_SIZE, canvasEdgeId } from "../types/canvas";
import type { CanvasBlock, CanvasBlockType, CanvasBlockData, CanvasEdge, CanvasSnapshot } from "../types/canvas";
import {
  applyDerivations,
  connectedSubgraph,
  emptyGraph,
  graphStats,
  mergeNodes,
  nodesFromDocuments,
  nodesFromTabs,
  removeEdge,
  removeNode,
  searchNodes,
} from "../knowledge/graph";
import { contextForQuery, gapHitsForQuery, ingestDocumentText, ingestText } from "../knowledge/ingest";
import type {
  KnowledgeDerivation,
  KnowledgeGraphData,
  KnowledgeNode,
  KnowledgeNodeInput,
} from "../types/knowledge";
import { KNOWLEDGE_NODE_LABELS } from "../types/knowledge";
import type {
  AppState,
  PersistedState,
  Workspace,
  Folder,
  WorkspaceDocument,
  WorkspaceNote,
  ResearchTab,
  Prefs,
  SearchResults,
  SearchHit,
  TabError,
  WorkspaceSnapshot,
  TabEvent,
} from "../types/workspace";
import type { WorkspaceMemory, FollowupResolution } from "../lib/memory";
import { emptyMemory, formatMemoryContext, rememberExchange, resolveFollowup } from "../lib/memory";
import { loadObservability } from "../observability/metrics";

const STORE_VERSION = 2;
const AUTOSAVE_DEBOUNCE_MS = 600;
const AUTOSAVE_INTERVAL_MS = 5000;
const MAX_WORKSPACE_SNAPSHOTS = 10;
const MAX_TEMPLATES = 20;
const CANVAS_CONTEXT_MAX_CHARS = 6000;

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function now(): number {
  return Date.now();
}

const CANVAS_BLOCK_TITLES: Record<CanvasBlockType, string> = {
  chat: "AI Session",
  report: "Research Report",
  document: "Document",
  note: "Note",
  knowledge: "Knowledge Graph",
  sticky: "Sticky Note",
  diagram: "Diagram",
  timeline: "Timeline",
  code: "Code Block",
  summary: "AI Summary",
  mindmap: "Mind Map",
  table: "Table",
  image: "Image",
  pdf: "PDF Viewer",
};

function defaultPrefs(): Prefs {
  return {
    sidebarOpen: true,
    sidebarWidth: 260,
    inspectorOpen: true,
    inspectorWidth: 300,
    defaultModel: getModel("research"),
    graphViewOpen: false,
    graphSelectedNodeId: null,
    canvasViewOpen: false,
    focusCanvasBlockId: null,
    workshopViewOpen: false,
    documentsViewOpen: false,
    focusDocumentId: null,
    fontSize: "medium",
    spellcheck: true,
    wordWrap: true,
    autosave: true,
    defaultMode: "deep-research",
    temperature: 0.7,
    maxTokens: 4096,
    developerMode: false,
    splitView: false,
    splitTabId: null,
    floatingChatOpen: false,
    floatingChatTabId: null,
  };
}

function createTab(workspaceId: string): ResearchTab {
  const ts = now();
  return {
    id: generateId(),
    workspaceId,
    folderId: null,
    title: "Untitled Research",
    subject: null,
    mode: null,
    model: "",
    phase: "idle",
    topic: "",
    pipelineStage: -1,
    streaming: false,
    docStage: "idle",
    difficulty: "intermediate",
    teachingMode: "analogy",
    sections: [],
    fullText: "",
    entities: [],
    timelineEvents: [],
    notes: [],
    followUps: [],
    messages: [],
    documentIds: [],
    error: null,
    pinned: false,
    unsaved: false,
    createdAt: ts,
    updatedAt: ts,
    lastOpenedAt: ts,
    scrollTop: 0,
    history: [{ id: generateId(), kind: "created", at: ts, detail: "Session created" }],
  };
}

function createWorkspace(name: string): Workspace {
  const ts = now();
  return { id: generateId(), name, favorite: false, archived: false, order: 0, createdAt: ts, updatedAt: ts };
}

function createFolder(workspaceId: string, name: string): Folder {
  const ts = now();
  return { id: generateId(), workspaceId, name, color: "", collapsed: false, order: 0, createdAt: ts, updatedAt: ts };
}

function defaultState(): AppState {
  const workspace = createWorkspace("Personal");
  const tab = createTab(workspace.id);
  return {
    version: STORE_VERSION,
    workspaces: [workspace],
    folders: [],
    documents: [],
    tabs: [tab],
  notes: [],
  knowledge: emptyGraph(),
  canvasBlocks: [],
  canvasEdges: [],
  canvasSnapshots: [],
  workspaceSnapshots: [],
  templates: [],
  memory: {},
  activeWorkspaceId: workspace.id,
    activeTabId: tab.id,
    prefs: defaultPrefs(),
    navHistory: [tab.id],
    navIndex: 0,
    saveState: "saved",
    lastSavedAt: now(),
    pendingRenameWorkspaceId: null,
  };
}

export class WorkspaceStore {
  state: AppState = defaultState();

  private listeners = new Set<() => void>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private hydrated = false;
  private saving = false;

  private notify = (): void => {
    this.listeners.forEach((listener) => listener());
  };

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => void this.saveNow());
      document?.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") void this.saveNow();
      });
      this.flushInterval = setInterval(() => {
        if (this.state.prefs.autosave && this.state.saveState === "unsaved") void this.saveNow();
      }, AUTOSAVE_INTERVAL_MS);
    }
  }

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;
    try {
      const saved = await loadPersisted<PersistedState>();
      if (saved && Array.isArray(saved.workspaces) && saved.workspaces.length > 0) {
        const prefs = { ...defaultPrefs(), ...saved.prefs };
        const tabs = (saved.tabs ?? []).map((t) => ({
          ...t,
          lastOpenedAt: t.lastOpenedAt ?? t.updatedAt ?? 0,
          scrollTop: t.scrollTop ?? 0,
        }));
        this.state = { ...defaultState(), ...saved, tabs, prefs, saveState: "saved", lastSavedAt: now() };
        this.state.memory = saved.memory || {};
        this.state.workspaceSnapshots = saved.workspaceSnapshots || [];
        this.state.templates = saved.templates || [];
        this.state.tabs = tabs.map((t) =>
          t.phase === "researching" && t.streaming
            ? { ...t, phase: "idle" as const, streaming: false, error: { code: "INTERRUPTED", message: "The last research run was interrupted by a reload. Run it again." } }
            : t,
        );
        if (!this.state.tabs.some((t) => t.id === this.state.activeTabId)) {
          this.state.activeTabId = this.state.tabs[0]?.id ?? this.state.activeTabId;
        }
        if (!this.state.workspaces.some((w) => w.id === this.state.activeWorkspaceId)) {
          this.state.activeWorkspaceId = this.state.workspaces[0].id;
        }
      }
    } catch {
      this.state = defaultState();
    }
    void loadObservability().catch(() => undefined);
    this.notify();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): AppState => this.state;

  getTab(): ResearchTab | null {
    const id = this.state.activeTabId ?? this.state.tabs[0]?.id ?? null;
    return this.state.tabs.find((t) => t.id === id) ?? null;
  }

  getActiveWorkspace(): Workspace | null {
    return this.state.workspaces.find((w) => w.id === this.state.activeWorkspaceId) ?? null;
  }

  requestSave = (): void => {
    this.state = { ...this.state, saveState: "unsaved" };
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (this.state.prefs.autosave) {
      this.saveTimer = setTimeout(() => void this.saveNow(), AUTOSAVE_DEBOUNCE_MS);
    }
    this.notify();
  };

  async saveNow(): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    this.state = { ...this.state, saveState: "saving" };
    this.notify();
    const persisted: PersistedState = {
      version: STORE_VERSION,
      workspaces: this.state.workspaces,
      folders: this.state.folders,
      documents: this.state.documents,
      tabs: this.state.tabs.map((t) => ({ ...t, unsaved: false })),
      notes: this.state.notes,
      knowledge: this.state.knowledge,
      canvasBlocks: this.state.canvasBlocks,
      canvasEdges: this.state.canvasEdges,
      canvasSnapshots: this.state.canvasSnapshots,
      workspaceSnapshots: this.state.workspaceSnapshots,
      templates: this.state.templates,
      memory: this.state.memory,
      activeWorkspaceId: this.state.activeWorkspaceId,
      activeTabId: this.state.activeTabId,
      prefs: this.state.prefs,
      navHistory: this.state.navHistory,
      navIndex: this.state.navIndex,
    };
    try {
      await persistState(persisted);
      this.state = { ...persisted, saveState: "saved", lastSavedAt: now(), pendingRenameWorkspaceId: this.state.pendingRenameWorkspaceId };
    } catch {
      this.state = { ...this.state, saveState: "unsaved" };
    }
    this.saving = false;
    this.notify();
  }

  pushNav(tabId: string): void {
    if (this.state.navHistory[this.state.navIndex] === tabId) return;
    const next = this.state.navHistory.slice(0, this.state.navIndex + 1);
    next.push(tabId);
    this.state = { ...this.state, navHistory: next.slice(-100), navIndex: next.length - 1 };
    this.notify();
  }

  navBack(): void {
    if (this.state.navIndex <= 0) return;
    const index = this.state.navIndex - 1;
    this.state = { ...this.state, navIndex: index, activeTabId: this.state.navHistory[index] ?? this.state.activeTabId };
    this.notify();
  }

  navForward(): void {
    if (this.state.navIndex >= this.state.navHistory.length - 1) return;
    const index = this.state.navIndex + 1;
    this.state = { ...this.state, navIndex: index, activeTabId: this.state.navHistory[index] ?? this.state.activeTabId };
    this.notify();
  }

  createWorkspace(name: string): string {
    const workspace = createWorkspace(name || "Untitled Workspace");
    this.state = {
      ...this.state,
      workspaces: [...this.state.workspaces, workspace],
      activeWorkspaceId: workspace.id,
      activeTabId: null,
      prefs: { ...this.state.prefs, splitView: false, splitTabId: null },
    };
    this.requestSave();
    return workspace.id;
  }

  beginRenameWorkspace(id: string): void {
    this.state = { ...this.state, pendingRenameWorkspaceId: id };
    this.notify();
  }

  takePendingRenameWorkspace(): string | null {
    const id = this.state.pendingRenameWorkspaceId;
    if (!id) return null;
    this.state = { ...this.state, pendingRenameWorkspaceId: null };
    this.notify();
    return id;
  }

  renameWorkspace(id: string, name: string): void {
    const trimmed = name.trim();
    this.state = {
      ...this.state,
      workspaces: this.state.workspaces.map((w) => (w.id === id ? { ...w, name: trimmed || w.name, updatedAt: now() } : w)),
    };
    this.requestSave();
  }

  toggleFavoriteWorkspace(id: string): void {
    this.state = {
      ...this.state,
      workspaces: this.state.workspaces.map((w) => (w.id === id ? { ...w, favorite: !w.favorite } : w)),
    };
    this.requestSave();
  }

  archiveWorkspace(id: string): void {
    this.softDeleteWorkspace(id, "archived");
  }

  restoreWorkspace(id: string): void {
    this.state = {
      ...this.state,
      workspaces: this.state.workspaces.map((w) => (w.id === id ? { ...w, archived: false } : w)),
    };
    this.requestSave();
  }

  deleteWorkspace(id: string): void {
    this.softDeleteWorkspace(id, "deleted");
  }

  private softDeleteWorkspace(id: string, kind: "archived" | "deleted"): void {
    const stub: Workspace = {
      id,
      name: this.state.workspaces.find((w) => w.id === id)?.name ?? "Workspace",
      favorite: false,
      archived: kind === "archived",
      order: 0,
      createdAt: now(),
      updatedAt: now(),
    };
    if (kind === "archived") {
      this.state = {
        ...this.state,
        workspaces: this.state.workspaces.map((w) => (w.id === id ? { ...w, archived: true } : w)),
      };
    } else {
      this.state = {
        ...this.state,
        workspaces: this.state.workspaces.filter((w) => w.id !== id),
        folders: this.state.folders.filter((f) => f.workspaceId !== id),
        documents: this.state.documents.filter((d) => d.workspaceId !== id),
        tabs: this.state.tabs.filter((t) => t.workspaceId !== id),
        notes: this.state.notes.filter((n) => n.workspaceId !== id),
      };
      if (this.state.activeWorkspaceId === id) {
        const next = this.state.workspaces[0] ?? stub;
        this.state.activeWorkspaceId = next.id;
        this.state.activeTabId = null;
        this.state.navHistory = [];
        this.state.navIndex = 0;
      }
    }
    this.requestSave();
  }

  duplicateWorkspace(id: string): void {
    const source = this.state.workspaces.find((w) => w.id === id);
    if (!source) return;
    const copy = createWorkspace(`${source.name} Copy`);
    const folderMap: Record<string, string> = {};
    for (const folder of this.state.folders.filter((f) => f.workspaceId === id)) {
      const clone = { ...folder, id: generateId(), workspaceId: copy.id, collapsed: false };
      folderMap[folder.id] = clone.id;
      this.state = { ...this.state, folders: [...this.state.folders, clone] };
    }
    for (const doc of this.state.documents.filter((d) => d.workspaceId === id)) {
      const clone = { ...doc, id: generateId(), workspaceId: copy.id, folderId: doc.folderId ? folderMap[doc.folderId] ?? null : null };
      this.state = { ...this.state, documents: [...this.state.documents, clone] };
    }
    for (const tab of this.state.tabs.filter((t) => t.workspaceId === id)) {
      const clone: ResearchTab = { ...tab, id: generateId(), workspaceId: copy.id, folderId: tab.folderId ? folderMap[tab.folderId] ?? null : null, pinned: false, createdAt: now(), updatedAt: now() };
      this.state = { ...this.state, tabs: [...this.state.tabs, clone] };
    }
    for (const note of this.state.notes.filter((n) => n.workspaceId === id)) {
      const clone: WorkspaceNote = { ...note, id: generateId(), workspaceId: copy.id, linkedTabId: null };
      this.state = { ...this.state, notes: [...this.state.notes, clone] };
    }
    this.state = { ...this.state, workspaces: [...this.state.workspaces, copy] };
    this.requestSave();
  }

  setActiveWorkspace(id: string): void {
    if (this.state.activeWorkspaceId === id) return;
    const tab = this.state.tabs.find((t) => t.workspaceId === id);
    this.state = {
      ...this.state,
      activeWorkspaceId: id,
      activeTabId: tab?.id ?? null,
    };
    if (tab) this.pushWorkspaceNav(tab.id);
    this.requestSave();
  }

  createFolder(workspaceId: string, name: string): string {
    const folder = { ...createFolder(workspaceId, name), order: this.state.folders.filter((f) => f.workspaceId === workspaceId).length };
    this.state = { ...this.state, folders: [...this.state.folders, folder] };
    this.requestSave();
    return folder.id;
  }

  renameFolder(id: string, name: string): void {
    this.state = {
      ...this.state,
      folders: this.state.folders.map((f) => (f.id === id ? { ...f, name } : f)),
    };
    this.requestSave();
  }

  deleteFolder(id: string): void {
    this.state = {
      ...this.state,
      folders: this.state.folders.filter((f) => f.id !== id),
      tabs: this.state.tabs.map((t) => (t.folderId === id ? { ...t, folderId: null, unsaved: true } : t)),
      documents: this.state.documents.map((d) => (d.folderId === id ? { ...d, folderId: null } : d)),
    };
    this.requestSave();
  }

  setFolderColor(id: string, color: string): void {
    this.state = {
      ...this.state,
      folders: this.state.folders.map((f) => (f.id === id ? { ...f, color } : f)),
    };
    this.requestSave();
  }

  toggleFolderCollapsed(id: string): void {
    this.state = {
      ...this.state,
      folders: this.state.folders.map((f) => (f.id === id ? { ...f, collapsed: !f.collapsed } : f)),
    };
    this.requestSave();
  }

  createTab(workspaceId?: string): string {
    const targetWorkspaceId = workspaceId ?? this.state.activeWorkspaceId;
    const tab = createTab(targetWorkspaceId);
    tab.model = this.state.prefs.defaultModel;
    this.state = {
      ...this.state,
      tabs: [...this.state.tabs, tab],
      activeTabId: tab.id,
      activeWorkspaceId: targetWorkspaceId,
    };
    this.pushWorkspaceNav(tab.id);
    this.requestSave();
    return tab.id;
  }

  createSession(input: { workspaceId?: string; name?: string; folderId?: string | null; model?: string }): string {
    const targetWorkspaceId = input.workspaceId ?? this.state.activeWorkspaceId;
    const tab = createTab(targetWorkspaceId);
    tab.title = (input.name ?? "").trim() || "Untitled Research";
    tab.folderId = input.folderId ?? null;
    tab.model = input.model ?? this.state.prefs.defaultModel;
    this.state = {
      ...this.state,
      tabs: [...this.state.tabs, tab],
      activeTabId: tab.id,
      activeWorkspaceId: targetWorkspaceId,
    };
    this.pushWorkspaceNav(tab.id);
    this.requestSave();
    return tab.id;
  }

  duplicateTab(id: string): string {
    const source = this.state.tabs.find((t) => t.id === id);
    if (!source) return "";
    const clone: ResearchTab = {
      ...source,
      id: generateId(),
      title: `${source.title} Copy`,
      pinned: false,
      unsaved: true,
      createdAt: now(),
      updatedAt: now(),
    };
    this.state = {
      ...this.state,
      tabs: [...this.state.tabs, clone],
      activeTabId: clone.id,
    };
    this.pushWorkspaceNav(clone.id);
    this.requestSave();
    return clone.id;
  }

  closeTab(id: string): void {
    const index = this.state.tabs.findIndex((t) => t.id === id);
    if (index < 0) return;
    const remaining = this.state.tabs.filter((t) => t.id !== id);
    this.state = { ...this.state, tabs: remaining };
    if (this.state.prefs.splitTabId === id) {
      this.state = { ...this.state, prefs: { ...this.state.prefs, splitView: false, splitTabId: null } };
    }
    if (this.state.activeTabId === id) {
      const next = remaining[index] ?? remaining[index - 1] ?? remaining[remaining.length - 1] ?? null;
      this.state = { ...this.state, activeTabId: next?.id ?? null };
      if (next) this.pushWorkspaceNav(next.id);
    }
    this.requestSave();
  }

  pinTab(id: string, pinned?: boolean): void {
    this.state = {
      ...this.state,
      tabs: this.state.tabs.map((t) => (t.id === id ? { ...t, pinned: pinned ?? !t.pinned } : t)),
    };
    this.requestSave();
  }

  renameTab(id: string, title: string): void {
    this.state = {
      ...this.state,
      tabs: this.state.tabs.map((t) => (t.id === id ? { ...t, title: title || "Untitled Research", updatedAt: now() } : t)),
    };
    this.requestSave();
  }

  moveTabToFolder(id: string, folderId: string | null): void {
    this.state = {
      ...this.state,
      tabs: this.state.tabs.map((t) => (t.id === id ? { ...t, folderId, updatedAt: now() } : t)),
    };
    this.requestSave();
  }

  reorderTab(id: string, toIndex: number, workspaceId: string): void {
    const workspaceTabs = this.state.tabs.filter((t) => t.workspaceId === workspaceId);
    const fromIndex = workspaceTabs.findIndex((t) => t.id === id);
    if (fromIndex < 0) return;
    const reordered = [...workspaceTabs];
    reordered.splice(fromIndex, 1);
    reordered.splice(Math.max(0, Math.min(toIndex, reordered.length)), 0, workspaceTabs[fromIndex]);
    const orderById = new Map(reordered.map((t, i) => [t.id, i]));
    this.state = {
      ...this.state,
      tabs: [...this.state.tabs].sort((a, b) => {
        const ia = orderById.get(a.id) ?? 999;
        const ib = orderById.get(b.id) ?? 999;
        return ia - ib;
      }),
    };
    this.requestSave();
  }

  setActiveTab(id: string): void {
    if (this.state.activeTabId === id) return;
    this.state = { ...this.state, activeTabId: id };
    this.state = {
      ...this.state,
      tabs: this.state.tabs.map((t) => (t.id === id ? { ...t, lastOpenedAt: now() } : t)),
    };
    const tab = this.state.tabs.find((t) => t.id === id);
    if (tab) this.state = { ...this.state, activeWorkspaceId: tab.workspaceId };
    this.pushWorkspaceNav(id);
    this.requestSave();
  }

  updateTab(id: string, patch: Partial<ResearchTab>): void {
    this.state = {
      ...this.state,
      tabs: this.state.tabs.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: now(), unsaved: true } : t)),
    };
    this.requestSave();
  }

  setTabScrollTop(id: string, scrollTop: number): void {
    this.state = {
      ...this.state,
      tabs: this.state.tabs.map((t) => (t.id === id ? { ...t, scrollTop } : t)),
    };
    this.notify();
  }

  setTabError(id: string, error: TabError | null): void {
    this.state = {
      ...this.state,
      tabs: this.state.tabs.map((t) => (t.id === id ? { ...t, error, updatedAt: now() } : t)),
    };
    this.requestSave();
  }

  addDocument(input: {
    workspaceId: string;
    folderId?: string | null;
    name: string;
    extension: string;
    size: number;
    pageCount: number | null;
    content: string;
  }): string {
    const doc: WorkspaceDocument = {
      id: generateId(),
      workspaceId: input.workspaceId,
      folderId: input.folderId ?? null,
      name: input.name,
      extension: input.extension,
      size: input.size,
      pageCount: input.pageCount,
      addedAt: now(),
      status: input.content ? "ready" : "failed",
      content: input.content,
    };
    this.state = { ...this.state, documents: [...this.state.documents, doc] };
    this.requestSave();
    return doc.id;
  }

  renameDocument(id: string, name: string): void {
    this.state = {
      ...this.state,
      documents: this.state.documents.map((d) => (d.id === id ? { ...d, name } : d)),
    };
    this.requestSave();
  }

  deleteDocument(id: string): void {
    this.state = {
      ...this.state,
      documents: this.state.documents.filter((d) => d.id !== id),
      tabs: this.state.tabs.map((t) =>
        t.documentIds.includes(id) ? { ...t, documentIds: t.documentIds.filter((x) => x !== id), unsaved: true } : t,
      ),
    };
    this.requestSave();
  }

  moveDocument(id: string, folderId: string | null): void {
    this.state = {
      ...this.state,
      documents: this.state.documents.map((d) => (d.id === id ? { ...d, folderId } : d)),
    };
    this.requestSave();
  }

  attachDocumentToTab(tabId: string, documentId: string): void {
    this.state = {
      ...this.state,
      tabs: this.state.tabs.map((t) =>
        t.id === tabId && !t.documentIds.includes(documentId)
          ? { ...t, documentIds: [...t.documentIds, documentId], unsaved: true }
          : t,
      ),
    };
    this.requestSave();
  }

  setPrefs(patch: Partial<Prefs>): void {
    this.state = { ...this.state, prefs: { ...this.state.prefs, ...patch } };
    this.requestSave();
  }

  pushTabEvent(tabId: string, kind: TabEvent["kind"], detail?: string): void {
    const event: TabEvent = { id: generateId(), kind, at: now(), detail };
    this.state = {
      ...this.state,
      tabs: this.state.tabs.map((t) =>
        t.id === tabId ? { ...t, history: [...(t.history ?? []), event].slice(-60) } : t,
      ),
    };
    this.requestSave();
  }

  getMemory(workspaceId: string): WorkspaceMemory {
    return this.state.memory[workspaceId] ?? emptyMemory();
  }

  setMemory(workspaceId: string, memory: WorkspaceMemory): void {
    this.state = { ...this.state, memory: { ...this.state.memory, [workspaceId]: memory } };
    this.requestSave();
  }

  clearMemory(workspaceId: string): void {
    if (!this.state.memory[workspaceId]) return;
    const memory = { ...this.state.memory };
    delete memory[workspaceId];
    this.state = { ...this.state, memory };
    this.requestSave();
  }

  rememberExchange(workspaceId: string, question: string, answer: string): void {
    if (!question.trim() || !answer.trim()) return;
    const current = this.getMemory(workspaceId);
    const next = rememberExchange(current, question, answer);
    this.setMemory(workspaceId, next);
  }

  memoryContextFor(workspaceId: string): string {
    const memory = this.getMemory(workspaceId);
    if (!memory.entries.length && !memory.goals.length && !memory.concepts.length && !memory.gaps.length) return "";
    return formatMemoryContext(memory);
  }

  resolveFollowupQuery(workspaceId: string, query: string): FollowupResolution {
    const memory = this.getMemory(workspaceId);
    const latest = this.state.tabs
      .filter((t) => t.workspaceId === workspaceId && t.fullText)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const latestTopic = latest ? (latest.topic || latest.title || latest.fullText.slice(0, 4000)) : "";
    return resolveFollowup(query, memory, latestTopic);
  }

  canvasContextFor(workspaceId: string): string {
    const blocks = this.state.canvasBlocks.filter((b) => b.workspaceId === workspaceId);
    if (!blocks.length) return "";
    const docs = this.state.documents.filter((d) => d.workspaceId === workspaceId);
    const parts: string[] = [];
    for (const block of blocks) {
      if (block.type === "chat" || block.type === "report" || block.type === "summary" || block.type === "knowledge") continue;
      const title = CANVAS_BLOCK_TITLES[block.type] ?? block.type;
      let text = "";
      if (block.type === "document" || block.type === "pdf") {
        const doc = docs.find((d) => d.id === block.data.documentId);
        if (doc) text = `${doc.name}:\n${doc.content.slice(0, 500)}`;
      } else if (block.type === "code") {
        text = block.data.code ?? "";
      } else if (block.type === "timeline") {
        text = (block.data.events ?? []).map((e) => `- ${e.date ?? ""}: ${e.event}${e.description ? ` — ${e.description}` : ""}`).join("\n");
      } else {
        text = block.data.text ?? "";
      }
      if (text.trim()) parts.push(`[${title}]\n${text.trim()}`);
    }
    const joined = parts.join("\n\n");
    return joined.slice(0, CANVAS_CONTEXT_MAX_CHARS);
  }

  snapshotsForWorkspace(workspaceId: string, kind: "snapshot" | "template" = "snapshot"): WorkspaceSnapshot[] {
    const all = kind === "template" ? this.state.templates : this.state.workspaceSnapshots;
    return all.filter((s) => s.workspaceId === workspaceId).sort((a, b) => b.at - a.at);
  }

  addWorkspaceSnapshot(workspaceId: string, label?: string): string {
    const s: WorkspaceSnapshot = {
      id: generateId(),
      workspaceId,
      kind: "snapshot",
      label: label || `Snapshot ${new Date().toLocaleString()}`,
      at: now(),
      tabs: this.state.tabs.filter((t) => t.workspaceId === workspaceId),
      documents: this.state.documents.filter((d) => d.workspaceId === workspaceId),
      folders: this.state.folders.filter((f) => f.workspaceId === workspaceId),
      notes: this.state.notes.filter((n) => n.workspaceId === workspaceId),
      canvasBlocks: this.state.canvasBlocks.filter((b) => b.workspaceId === workspaceId),
      canvasEdges: this.state.canvasEdges.filter((e) => e.workspaceId === workspaceId),
      knowledge: this.state.knowledge,
      memory: this.state.memory[workspaceId] ?? null,
    };
    const snapshots = [s, ...this.state.workspaceSnapshots.filter((x) => x.workspaceId !== workspaceId)].slice(0, MAX_WORKSPACE_SNAPSHOTS);
    this.state = { ...this.state, workspaceSnapshots: snapshots };
    this.requestSave();
    return s.id;
  }

  deleteWorkspaceSnapshot(workspaceId: string, snapshotId: string): void {
    this.state = {
      ...this.state,
      workspaceSnapshots: this.state.workspaceSnapshots.filter((s) => !(s.workspaceId === workspaceId && s.id === snapshotId)),
    };
    this.requestSave();
  }

  restoreWorkspaceSnapshot(workspaceId: string, snapshotId: string): void {
    const snapshot = this.state.workspaceSnapshots.find((s) => s.workspaceId === workspaceId && s.id === snapshotId);
    if (!snapshot) return;
    this.state = {
      ...this.state,
      tabs: [...this.state.tabs.filter((t) => t.workspaceId !== workspaceId), ...snapshot.tabs],
      documents: [...this.state.documents.filter((d) => d.workspaceId !== workspaceId), ...snapshot.documents],
      folders: [...this.state.folders.filter((f) => f.workspaceId !== workspaceId), ...snapshot.folders],
      notes: [...this.state.notes.filter((n) => n.workspaceId !== workspaceId), ...snapshot.notes],
      canvasBlocks: [...this.state.canvasBlocks.filter((b) => b.workspaceId !== workspaceId), ...snapshot.canvasBlocks],
      canvasEdges: [...this.state.canvasEdges.filter((e) => e.workspaceId !== workspaceId), ...snapshot.canvasEdges],
      knowledge: snapshot.knowledge,
    };
    if (snapshot.memory) this.setMemory(workspaceId, snapshot.memory);
    this.requestSave();
  }

  addTemplate(workspaceId: string, label?: string): string {
    const base: WorkspaceSnapshot = {
      id: generateId(),
      workspaceId,
      kind: "template",
      label: label || `Template ${new Date().toLocaleString()}`,
      at: now(),
      tabs: [],
      documents: [],
      folders: this.state.folders.filter((f) => f.workspaceId === workspaceId),
      notes: this.state.notes.filter((n) => n.workspaceId === workspaceId),
      canvasBlocks: this.state.canvasBlocks.filter((b) => b.workspaceId === workspaceId && b.type !== "chat" && b.type !== "report"),
      canvasEdges: this.state.canvasEdges.filter((e) => e.workspaceId === workspaceId),
      knowledge: this.state.knowledge,
      memory: null,
    };
    const templates = [base, ...this.state.templates.filter((t) => t.workspaceId !== workspaceId)].slice(0, MAX_TEMPLATES);
    this.state = { ...this.state, templates };
    this.requestSave();
    return base.id;
  }

  deleteTemplate(templateId: string): void {
    this.state = { ...this.state, templates: this.state.templates.filter((t) => t.id !== templateId) };
    this.requestSave();
  }

  createWorkspaceFromTemplate(templateId: string, name: string): string {
    const template = this.state.templates.find((t) => t.id === templateId);
    if (!template) return "";
    const workspace = createWorkspace(name || "From Template");
    const tab = createTab(workspace.id);
    const notes = template.notes.map((n) => ({ ...n, id: generateId(), workspaceId: workspace.id }));
    const blocks = template.canvasBlocks.map((b) => ({ ...b, id: generateId(), workspaceId: workspace.id }));
    const edges = template.canvasEdges
      .filter((e) => template.canvasBlocks.some((b) => b.id === e.fromBlockId) || template.canvasBlocks.some((b) => b.id === e.toBlockId))
      .map((e) => ({ ...e, id: generateId(), workspaceId: workspace.id }));
    this.state = {
      ...this.state,
      workspaces: [...this.state.workspaces, workspace],
      folders: [...this.state.folders, ...template.folders.map((f) => ({ ...f, id: generateId(), workspaceId: workspace.id }))],
      notes: [...this.state.notes, ...notes],
      canvasBlocks: [...this.state.canvasBlocks, ...blocks],
      canvasEdges: [...this.state.canvasEdges, ...edges],
      tabs: [...this.state.tabs, tab],
      activeWorkspaceId: workspace.id,
      activeTabId: tab.id,
      navHistory: [tab.id],
      navIndex: 0,
    };
    this.requestSave();
    return workspace.id;
  }

  addNote(workspaceId: string, title: string, content: string, linkedTabId?: string | null): string {
    const note: WorkspaceNote = {
      id: generateId(),
      workspaceId,
      title: title || "Untitled Note",
      content,
      linkedTabId: linkedTabId ?? null,
      createdAt: now(),
      updatedAt: now(),
    };
    this.state = { ...this.state, notes: [note, ...this.state.notes] };
    this.requestSave();
    return note.id;
  }

  updateNote(id: string, patch: Partial<WorkspaceNote>): void {
    this.state = {
      ...this.state,
      notes: this.state.notes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: now() } : n)),
    };
    this.requestSave();
  }

  deleteNote(id: string): void {
    this.state = { ...this.state, notes: this.state.notes.filter((n) => n.id !== id) };
    this.requestSave();
  }

  toggleSidebar(): void {
    this.setPrefs({ sidebarOpen: !this.state.prefs.sidebarOpen });
  }

  toggleInspector(): void {
    this.setPrefs({ inspectorOpen: !this.state.prefs.inspectorOpen });
  }

  private pushWorkspaceNav(tabId: string): void {
    if (this.state.navHistory[this.state.navIndex] === tabId) return;
    const next = this.state.navHistory.slice(0, this.state.navIndex + 1);
    next.push(tabId);
    this.state = { ...this.state, navHistory: next.slice(-100), navIndex: next.length - 1 };
  }

  search(query: string): SearchResults {
  const q = query.trim().toLowerCase();
  const empty: SearchResults = { tabs: [], workspaces: [], folders: [], documents: [], knowledge: [], canvas: [] };
    if (!q) return empty;
    const matches = (value: string, detail = ""): boolean => {
      const hay = `${value} ${detail}`.toLowerCase();
      return q.split(/\s+/).every((term) => hay.includes(term));
    };
    const results: SearchResults = { ...empty };

    for (const tab of this.state.tabs) {
      const workspace = this.state.workspaces.find((w) => w.id === tab.workspaceId);
      if (matches(tab.title, `${tab.fullText} ${tab.messages.map((m) => m.content).join(" ")}`)) {
        results.tabs.push({
          type: "tab",
          id: tab.id,
          workspaceId: tab.workspaceId,
          title: tab.title,
          detail: workspace ? `${workspace.name} · ${new Date(tab.updatedAt).toLocaleString()}` : "Session",
          updatedAt: tab.updatedAt,
        });
      }
    }

    for (const w of this.state.workspaces) {
      if (matches(w.name)) {
        results.workspaces.push({
          type: "workspace",
          id: w.id,
          workspaceId: w.id,
          title: w.name,
          detail: w.archived ? "Archived" : `${this.state.tabs.filter((t) => t.workspaceId === w.id).length} sessions`,
          updatedAt: w.updatedAt,
        });
      }
    }

    for (const folder of this.state.folders) {
      if (matches(folder.name)) {
        results.folders.push({
          type: "folder",
          id: folder.id,
          workspaceId: folder.workspaceId,
          title: folder.name,
          detail: `${this.state.tabs.filter((t) => t.folderId === folder.id).length} tabs`,
          updatedAt: 0,
        });
      }
    }

    for (const doc of this.state.documents) {
      if (matches(doc.name) || matches(doc.content)) {
        results.documents.push({
          type: "document",
          id: doc.id,
          workspaceId: doc.workspaceId,
          title: doc.name,
          detail: `${formatBytes(doc.size)} · ${doc.extension.toUpperCase()}`,
          updatedAt: doc.addedAt,
        });
      }
    }

    const nodeHits = searchNodes(this.state.knowledge, query, 8);
    for (const n of nodeHits) {
  results.knowledge.push({
    type: "knowledge",
    id: n.id,
    workspaceId: this.state.activeWorkspaceId,
    title: n.label,
    detail: KNOWLEDGE_NODE_LABELS[n.type] ?? n.type,
    updatedAt: n.updatedAt,
  });
}

for (const block of this.state.canvasBlocks) {
  if (matches(block.title, block.data.text ?? block.data.code ?? "")) {
    results.canvas.push({
      type: "canvas",
      id: block.id,
      workspaceId: block.workspaceId,
      title: block.title,
      detail: `${block.type} block · ${this.state.workspaces.find((w) => w.id === block.workspaceId)?.name ?? "Workspace"}`,
      updatedAt: block.updatedAt,
    });
  }
}
return results;
}

// ---------- Knowledge engine ----------

  graph(): KnowledgeGraphData {
    return this.state.knowledge;
  }

  applyKnowledgeDerivation(derivation: KnowledgeDerivation): void {
    this.state = { ...this.state, knowledge: applyDerivations(this.state.knowledge, [derivation]) };
    this.requestSave();
  }

  addKnowledgeNode(input: KnowledgeNodeInput): void {
    this.state = { ...this.state, knowledge: applyDerivations(this.state.knowledge, [{ nodes: [input], edges: [] }]) };
    this.requestSave();
  }

  updateKnowledgeNode(id: string, patch: Partial<Omit<KnowledgeNode, "id">>): void {
    this.state = {
      ...this.state,
      knowledge: {
        ...this.state.knowledge,
        nodes: this.state.knowledge.nodes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: now() } : n)),
      },
    };
    this.requestSave();
  }

  removeKnowledgeNode(id: string): void {
    this.state = { ...this.state, knowledge: removeNode(this.state.knowledge, id) };
    this.requestSave();
  }

  mergeKnowledgeNodes(ids: string[]): void {
    this.state = { ...this.state, knowledge: mergeNodes(this.state.knowledge, ids) };
    this.requestSave();
  }

  removeKnowledgeEdge(id: string): void {
    this.state = { ...this.state, knowledge: removeEdge(this.state.knowledge, id) };
    this.requestSave();
  }

  toggleKnowledgeNode(id: string, key: "pinned" | "favorite"): void {
    this.state = {
      ...this.state,
      knowledge: {
        ...this.state.knowledge,
        nodes: this.state.knowledge.nodes.map((n) => (n.id === id ? { ...n, [key]: !n[key], updatedAt: now() } : n)),
      },
    };
    this.requestSave();
  }

  setKnowledgeNodeColor(id: string, color: string): void {
    this.state = {
      ...this.state,
      knowledge: {
        ...this.state.knowledge,
        nodes: this.state.knowledge.nodes.map((n) => (n.id === id ? { ...n, color, updatedAt: now() } : n)),
      },
    };
    this.requestSave();
  }

  deriveGraphFromTab(tabId: string): void {
    const tab = this.state.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const parts: KnowledgeDerivation[] = [];
    if (tab.fullText.trim()) {
      parts.push(ingestText(tab.fullText, { tabId, sources: [tab.title] }));
    }
    for (const m of tab.messages) {
      if (m.content && m.content.length > 40) {
        parts.push(ingestText(m.content, { tabId, sources: [tab.title] }));
      }
    }
    if (parts.length === 0) return;
    this.state = { ...this.state, knowledge: applyDerivations(this.state.knowledge, parts) };
    this.requestSave();
  }

  deriveGraphFromDocument(documentId: string): void {
    const doc = this.state.documents.find((d) => d.id === documentId);
    if (!doc || !doc.content.trim()) return;
    const derivation = ingestDocumentText(doc.name, doc.content, { documentId, sources: [doc.name] });
    this.state = { ...this.state, knowledge: applyDerivations(this.state.knowledge, [derivation]) };
    this.requestSave();
  }

  deriveGraphFromNote(noteId: string): void {
    const note = this.state.notes.find((n) => n.id === noteId);
    if (!note || !note.content.trim()) return;
    const derivation = ingestText(note.content, { noteId, tabId: note.linkedTabId ?? undefined, sources: [note.title] });
    this.state = { ...this.state, knowledge: applyDerivations(this.state.knowledge, [derivation]) };
    this.requestSave();
  }

  graphContextFor(query: string): string {
    return contextForQuery(this.state.knowledge, query);
  }

  graphGapHits(query: string) {
    return gapHitsForQuery(this.state.knowledge, query);
  }

  knowledgeStats() {
    return graphStats(this.state.knowledge);
  }

  knowledgeForTab(tabId: string): KnowledgeGraphData {
    const tab = this.state.tabs.find((t) => t.id === tabId);
    if (!tab) return { version: this.state.knowledge.version, nodes: [], edges: [] };
    const tabNodes = nodesFromTabs(this.state.knowledge, [tabId]);
    const docNodes = nodesFromDocuments(this.state.knowledge, tab.documentIds);
    const merged = new Map<string, KnowledgeNode>();
    for (const n of [...tabNodes, ...docNodes]) merged.set(n.id, n);
    const sub = connectedSubgraph(this.state.knowledge, Array.from(merged.values()));
    return { version: this.state.knowledge.version, ...sub };
  }

  searchKnowledgeNodes(query: string, limit?: number) {
    return searchNodes(this.state.knowledge, query, limit);
  }

  // ---------- Research canvas ----------

  canvasBlocksFor(workspaceId: string): CanvasBlock[] {
    return this.state.canvasBlocks.filter((b) => b.workspaceId === workspaceId);
  }

  canvasEdgesFor(workspaceId: string): CanvasEdge[] {
    return this.state.canvasEdges.filter((e) => e.workspaceId === workspaceId);
  }

  addCanvasBlock(input: {
    workspaceId: string;
    type: CanvasBlockType;
    title?: string;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    data?: CanvasBlockData;
    color?: string | null;
  }): string {
    const size = CANVAS_BLOCK_DEFAULT_SIZE[input.type];
    const ts = now();
    const maxZ = this.state.canvasBlocks.reduce((max, b) => Math.max(max, b.z), 0);
    const block: CanvasBlock = {
      id: generateId(),
      workspaceId: input.workspaceId,
      type: input.type,
      title: input.title ?? CANVAS_BLOCK_TITLES[input.type],
      x: Math.round(input.x ?? 80),
      y: Math.round(input.y ?? 80),
      w: input.w ?? size.w,
      h: input.h ?? size.h,
      z: maxZ + 1,
      pinned: false,
      color: input.color ?? null,
      createdAt: ts,
      updatedAt: ts,
      data: input.data ?? {},
    };
    this.state = { ...this.state, canvasBlocks: [...this.state.canvasBlocks, block] };
    this.requestSave();
    return block.id;
  }

  updateCanvasBlock(id: string, patch: Partial<Omit<CanvasBlock, "id">>): void {
    this.state = {
      ...this.state,
      canvasBlocks: this.state.canvasBlocks.map((b) => (b.id === id ? { ...b, ...patch, updatedAt: now() } : b)),
    };
    this.requestSave();
  }

  removeCanvasBlock(id: string): void {
    this.state = {
      ...this.state,
      canvasBlocks: this.state.canvasBlocks.filter((b) => b.id !== id),
      canvasEdges: this.state.canvasEdges.filter((e) => e.fromBlockId !== id && e.toBlockId !== id),
    };
    this.requestSave();
  }

  duplicateCanvasBlock(id: string): string {
    const block = this.state.canvasBlocks.find((b) => b.id === id);
    if (!block) return "";
    const maxZ = this.state.canvasBlocks.reduce((max, b) => Math.max(max, b.z), 0);
    const copy: CanvasBlock = {
      ...block,
      id: generateId(),
      title: `${block.title} Copy`,
      x: block.x + 32,
      y: block.y + 32,
      z: maxZ + 1,
      pinned: false,
      createdAt: now(),
      updatedAt: now(),
      data: { ...block.data },
    };
    this.state = { ...this.state, canvasBlocks: [...this.state.canvasBlocks, copy] };
    this.requestSave();
    return copy.id;
  }

  addCanvasEdge(workspaceId: string, fromBlockId: string, toBlockId: string, label = ""): void {
    if (fromBlockId === toBlockId) return;
    const exists = this.state.canvasEdges.some(
      (e) =>
        e.workspaceId === workspaceId &&
        ((e.fromBlockId === fromBlockId && e.toBlockId === toBlockId) ||
          (e.fromBlockId === toBlockId && e.toBlockId === fromBlockId)),
    );
    if (exists) return;
    const edge: CanvasEdge = {
      id: canvasEdgeId(fromBlockId, toBlockId),
      workspaceId,
      fromBlockId,
      toBlockId,
      label,
      createdAt: now(),
    };
    this.state = { ...this.state, canvasEdges: [...this.state.canvasEdges, edge] };
    this.requestSave();
  }

  removeCanvasEdge(id: string): void {
    this.state = { ...this.state, canvasEdges: this.state.canvasEdges.filter((e) => e.id !== id) };
    this.requestSave();
  }

  snapshotsFor(workspaceId: string): CanvasSnapshot[] {
    return this.state.canvasSnapshots
      .filter((s) => s.workspaceId === workspaceId)
      .sort((a, b) => b.at - a.at);
  }

  addCanvasSnapshot(workspaceId: string, label = "Snapshot"): void {
    const snap: CanvasSnapshot = {
      id: generateId(),
      workspaceId,
      at: now(),
      label,
      blocks: this.state.canvasBlocks.filter((b) => b.workspaceId === workspaceId),
      edges: this.state.canvasEdges.filter((e) => e.workspaceId === workspaceId),
    };
    const kept = [snap, ...this.state.canvasSnapshots.filter((s) => s.workspaceId === workspaceId)].slice(0, 30);
    const others = this.state.canvasSnapshots.filter((s) => s.workspaceId !== workspaceId);
    this.state = { ...this.state, canvasSnapshots: [...others, ...kept] };
    this.requestSave();
  }

  restoreCanvasSnapshot(workspaceId: string, snapshotId: string): void {
    const snap = this.state.canvasSnapshots.find((s) => s.id === snapshotId && s.workspaceId === workspaceId);
    if (!snap) return;
    this.state = {
      ...this.state,
      canvasBlocks: [
        ...this.state.canvasBlocks.filter((b) => b.workspaceId !== workspaceId),
        ...snap.blocks,
      ],
      canvasEdges: [
        ...this.state.canvasEdges.filter((e) => e.workspaceId !== workspaceId),
        ...snap.edges,
      ],
    };
    this.requestSave();
  }

  ensureSessionOnCanvas(tabId: string): void {
    const tab = this.state.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const ws = tab.workspaceId;
    const has = (type: CanvasBlockType) =>
      this.state.canvasBlocks.some(
        (b) => b.workspaceId === ws && b.type === type && b.data.tabId === tabId,
      );
    if (has("chat") && has("report") && has("knowledge")) return;
    const existing = this.state.canvasBlocks.filter((b) => b.workspaceId === ws);
    const maxX = existing.reduce((max, b) => Math.max(max, b.x + b.w), 0);
    const maxY = existing.reduce((max, b) => Math.max(max, b.y + b.h), 0);
    const slotX = Math.round((maxX > 0 ? maxX + 120 : 80) / 8) * 8;
    const slotY = Math.round((maxY > 0 ? maxY + 60 : 80) / 8) * 8;
    if (!has("chat")) {
      this.addCanvasBlock({ workspaceId: ws, type: "chat", title: tab.title || "AI Session", x: slotX, y: slotY, data: { tabId } });
    }
    if (!has("report")) {
      this.addCanvasBlock({ workspaceId: ws, type: "report", title: `${tab.title || "Research"} — Report`, x: slotX + 460, y: slotY, data: { tabId } });
    }
    if (!has("knowledge")) {
      this.addCanvasBlock({ workspaceId: ws, type: "knowledge", title: `${tab.title || "Session"} — Knowledge`, x: slotX + 260, y: slotY + 420, data: { tabId } });
    }
  }

  toggleCanvasBlockPin(id: string): void {
    const block = this.state.canvasBlocks.find((b) => b.id === id);
    if (block) this.updateCanvasBlock(id, { pinned: !block.pinned });
  }

  bringCanvasBlockToFront(id: string): void {
    const maxZ = this.state.canvasBlocks.reduce((m, b) => Math.max(m, b.z), 0);
    this.updateCanvasBlock(id, { z: maxZ + 1 });
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const workspaceStore = new WorkspaceStore();
export { generateId, defaultPrefs, getModel };
export type { SearchResults, SearchHit };