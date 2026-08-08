import { describe, it, expect, beforeEach } from "vitest";
import { WorkspaceStore } from "../../stores/workspace-store";

function freshStore(): WorkspaceStore {
  return new WorkspaceStore();
}

describe("workspace store", () => {
  let store: WorkspaceStore;

  beforeEach(() => {
    store = freshStore();
  });

  it("boots with a default workspace and tab", () => {
    const state = store.getState();
    expect(state.workspaces.length).toBe(1);
    expect(state.tabs.length).toBe(1);
    expect(state.tabs[0].workspaceId).toBe(state.activeWorkspaceId);
    expect(state.activeTabId).toBe(state.tabs[0].id);
  });

  it("creates and activates tabs independently", () => {
    const first = store.getState().tabs[0].id;
    const second = store.createTab();
    const third = store.createTab();
    const state = store.getState();
    expect(state.tabs).toHaveLength(3);
    expect(state.activeTabId).toBe(third);
    store.setActiveTab(first);
    expect(store.getState().activeTabId).toBe(first);
    expect(store.getState().activeTabId).not.toBe(second);
  });

  it("tabs keep independent state", () => {
    const first = store.getState().tabs[0].id;
    const second = store.createTab();
    store.updateTab(first, { topic: "alpha", fullText: "report alpha", title: "Alpha" });
    store.updateTab(second, { topic: "beta", fullText: "report beta", title: "Beta" });
    const state = store.getState();
    const a = state.tabs.find((t) => t.id === first)!;
    const b = state.tabs.find((t) => t.id === second)!;
    expect(a.fullText).toBe("report alpha");
    expect(b.fullText).toBe("report beta");
    expect(a.topic).not.toBe(b.topic);
  });

  it("closes tabs and falls back to a remaining tab", () => {
    const first = store.getState().tabs[0].id;
    const second = store.createTab();
    store.closeTab(second);
    expect(store.getState().tabs).toHaveLength(1);
    expect(store.getState().activeTabId).toBe(first);
  });

  it("duplicates tabs with new ids and unsaved state", () => {
    const first = store.getState().tabs[0].id;
    store.updateTab(first, { title: "Original", fullText: "content" });
    const copyId = store.duplicateTab(first);
    const state = store.getState();
    const copy = state.tabs.find((t) => t.id === copyId)!;
    expect(copyId).not.toBe(first);
    expect(copy.title).toContain("Original");
    expect(copy.fullText).toBe("content");
    expect(copy.unsaved).toBe(true);
  });

  it("renames and pins tabs", () => {
    const id = store.getState().tabs[0].id;
    store.renameTab(id, "Contract Law Notes");
    store.pinTab(id);
    const tab = store.getState().tabs.find((t) => t.id === id)!;
    expect(tab.title).toBe("Contract Law Notes");
    expect(tab.pinned).toBe(true);
  });

  it("reorders tabs within a workspace", () => {
    const a = store.getState().tabs[0].id;
    const b = store.createTab();
    const c = store.createTab();
    store.reorderTab(a, 2, store.getState().activeWorkspaceId);
    const ids = store.getState().tabs.map((t) => t.id);
    expect(ids[0]).toBe(b);
    expect(ids[1]).toBe(c);
    expect(ids[2]).toBe(a);
  });

  it("creates, renames, colors, collapses and deletes folders", () => {
    const ws = store.getState().activeWorkspaceId;
    const folderId = store.createFolder(ws, "Constitutional Law");
    store.setFolderColor(folderId, "#72383D");
    store.toggleFolderCollapsed(folderId);
    store.renameFolder(folderId, "Tort");
    const folder = store.getState().folders.find((f) => f.id === folderId)!;
    expect(folder.name).toBe("Tort");
    expect(folder.color).toBe("#72383D");
    expect(folder.collapsed).toBe(true);
    store.deleteFolder(folderId);
    expect(store.getState().folders).toHaveLength(0);
  });

  it("moves tabs into folders and clears folderId on folder delete", () => {
    const ws = store.getState().activeWorkspaceId;
    const folderId = store.createFolder(ws, "React");
    const tabId = store.getState().tabs[0].id;
    store.moveTabToFolder(tabId, folderId);
    expect(store.getState().tabs.find((t) => t.id === tabId)?.folderId).toBe(folderId);
    store.deleteFolder(folderId);
    expect(store.getState().tabs.find((t) => t.id === tabId)?.folderId).toBeNull();
  });

  it("adds, renames, moves and deletes documents", () => {
    const ws = store.getState().activeWorkspaceId;
    const docId = store.addDocument({
      workspaceId: ws,
      name: "brief.pdf",
      extension: "pdf",
      size: 2048,
      pageCount: 12,
      content: "extracted text",
    });
    store.renameDocument(docId, "brief-final.pdf");
    const folderId = store.createFolder(ws, "Evidence");
    store.moveDocument(docId, folderId);
    const doc = store.getState().documents.find((d) => d.id === docId)!;
    expect(doc.name).toBe("brief-final.pdf");
    expect(doc.folderId).toBe(folderId);
    store.deleteDocument(docId);
    expect(store.getState().documents).toHaveLength(0);
  });

  it("attaches documents to tabs", () => {
    const ws = store.getState().activeWorkspaceId;
    const tabId = store.getState().tabs[0].id;
    const docId = store.addDocument({ workspaceId: ws, name: "a.txt", extension: "txt", size: 10, pageCount: null, content: "x" });
    store.attachDocumentToTab(tabId, docId);
    expect(store.getState().tabs.find((t) => t.id === tabId)?.documentIds).toContain(docId);
    store.deleteDocument(docId);
    expect(store.getState().tabs.find((t) => t.id === tabId)?.documentIds).not.toContain(docId);
  });

  it("creates, archives, restores, duplicates and deletes workspaces", () => {
    const wsId = store.createWorkspace("Legal Research");
    store.toggleFavoriteWorkspace(wsId);
    expect(store.getState().workspaces.find((w) => w.id === wsId)?.favorite).toBe(true);
    store.archiveWorkspace(wsId);
    expect(store.getState().workspaces.find((w) => w.id === wsId)?.archived).toBe(true);
    store.restoreWorkspace(wsId);
    expect(store.getState().workspaces.find((w) => w.id === wsId)?.archived).toBe(false);
    store.duplicateWorkspace(wsId);
    const names = store.getState().workspaces.map((w) => w.name);
    expect(names).toContain("Legal Research Copy");
    store.deleteWorkspace(wsId);
    expect(store.getState().workspaces.some((w) => w.id === wsId)).toBe(false);
  });

  it("deleting a workspace cascades tabs, folders, documents and notes", () => {
    const wsId = store.createWorkspace("Finance");
    const tabId = store.createTab(wsId);
    store.createFolder(wsId, "Reports");
    store.addDocument({ workspaceId: wsId, name: "r.txt", extension: "txt", size: 1, pageCount: null, content: "r" });
    store.addNote(wsId, "Note", "content");
    store.deleteWorkspace(wsId);
    const state = store.getState();
    expect(state.tabs.some((t) => t.id === tabId)).toBe(false);
    expect(state.folders.some((f) => f.workspaceId === wsId)).toBe(false);
    expect(state.documents.some((d) => d.workspaceId === wsId)).toBe(false);
    expect(state.notes.some((n) => n.workspaceId === wsId)).toBe(false);
  });

  it("adds, updates and deletes notes", () => {
    const ws = store.getState().activeWorkspaceId;
    const id = store.addNote(ws, "Idea", "content");
    store.updateNote(id, { content: "updated" });
    const note = store.getState().notes.find((n) => n.id === id)!;
    expect(note.content).toBe("updated");
    store.deleteNote(id);
    expect(store.getState().notes).toHaveLength(0);
  });

  it("searches across tabs, workspaces, folders and documents", () => {
    const ws = store.getState().activeWorkspaceId;
    const tabId = store.getState().tabs[0].id;
    store.updateTab(tabId, { title: "Machine Learning Basics" });
    const legalWs = store.createWorkspace("Legal Research");
    const folderId = store.createFolder(legalWs, "Constitutional Law");
    store.addDocument({ workspaceId: legalWs, name: "brief.pdf", extension: "pdf", size: 2, pageCount: null, content: "" });
    store.moveTabToFolder(tabId, folderId);

    const results = store.search("machine");
    expect(results.tabs.length).toBeGreaterThan(0);
    expect(results.tabs[0].title).toBe("Machine Learning Basics");

    const legal = store.search("legal");
    expect(legal.workspaces.length).toBeGreaterThan(0);

    const constitutional = store.search("constitutional");
    expect(constitutional.folders.length).toBeGreaterThan(0);

    const brief = store.search("brief");
    expect(brief.documents.length).toBeGreaterThan(0);
  });

  it("search returns empty results for blank queries", () => {
    const results = store.search("");
    expect(results.tabs).toHaveLength(0);
    expect(results.workspaces).toHaveLength(0);
    expect(results.folders).toHaveLength(0);
    expect(results.documents).toHaveLength(0);
  });

  it("navigates back and forward through tab history", () => {
    const a = store.getState().tabs[0].id;
    const b = store.createTab();
    const c = store.createTab();
    store.setActiveTab(a);
    expect(store.getState().activeTabId).toBe(a);
    store.navBack();
    expect(store.getState().activeTabId).toBe(c);
    store.navForward();
    expect(store.getState().activeTabId).toBe(a);
    store.setActiveTab(b);
    expect(store.getState().activeTabId).toBe(b);
  });

  it("prefs can be toggled and persisted to state", () => {
    store.toggleSidebar();
    store.toggleInspector();
    store.setPrefs({ defaultModel: "deepseek/deepseek-r1" });
    const prefs = store.getState().prefs;
    expect(prefs.sidebarOpen).toBe(false);
    expect(prefs.inspectorOpen).toBe(false);
    expect(prefs.defaultModel).toBe("deepseek/deepseek-r1");
  });

  it("derives knowledge from completed research tabs", () => {
    const tabId = store.getState().tabs[0].id;
    store.updateTab(tabId, { fullText: "**Flexbox** is a layout mode. **Grid** contains Pseudo Classes.", title: "CSS Study" });
    store.deriveGraphFromTab(tabId);
    const graph = store.getState().knowledge;
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.nodes.some((n) => n.label === "Flexbox")).toBe(true);
    expect(graph.nodes.some((n) => n.sourceTabIds.includes(tabId))).toBe(true);
    expect(graph.edges.some((e) => e.type === "contains")).toBe(true);
  });

  it("derives knowledge from uploaded documents", () => {
    const ws = store.getState().activeWorkspaceId;
    const docId = store.addDocument({
      workspaceId: ws,
      name: "intro.txt",
      extension: "txt",
      size: 10,
      pageCount: null,
      content: "# Overview\n## Core Concepts\n\n**Contract** requires Offer.",
    });
    store.deriveGraphFromDocument(docId);
    const graph = store.getState().knowledge;
    expect(graph.nodes.some((n) => n.label === "intro.txt" && n.type === "document")).toBe(true);
    expect(graph.nodes.some((n) => n.label === "Contract" && n.sourceDocumentIds.includes(docId))).toBe(true);
  });

  it("derives knowledge from notes", () => {
    const ws = store.getState().activeWorkspaceId;
    const noteId = store.addNote(ws, "Idea", "**Closures** capture their lexical environment.");
    store.deriveGraphFromNote(noteId);
    const graph = store.getState().knowledge;
    expect(graph.nodes.some((n) => n.label === "Closures" && n.sourceNoteIds.includes(noteId))).toBe(true);
  });

  it("builds graph context and gap hits from queries", () => {
    const tabId = store.getState().tabs[0].id;
    store.updateTab(tabId, { fullText: "**Flexbox** is a CSS layout model. **Flexbox** requires Understanding of CSS Grid.", title: "Study" });
    store.deriveGraphFromTab(tabId);
    const context = store.graphContextFor("explain flexbox");
    expect(context).toContain("Flexbox");
    const gaps = store.graphGapHits("flexbox");
    expect(Array.isArray(gaps)).toBe(true);
  });

  it("searches knowledge nodes", () => {
    const tabId = store.getState().tabs[0].id;
    store.updateTab(tabId, { fullText: "**Promises** are async. **Closures** capture scope.", title: "JS" });
    store.deriveGraphFromTab(tabId);
    const hits = store.searchKnowledgeNodes("promise");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("supports pinning, favoring, editing and deleting nodes", () => {
    store.addKnowledgeNode({ label: "Tort", type: "concept", definition: "A civil wrong." });
    const node = store.getState().knowledge.nodes.find((n) => n.label === "Tort")!;
    store.toggleKnowledgeNode(node.id, "pinned");
    store.toggleKnowledgeNode(node.id, "favorite");
    store.updateKnowledgeNode(node.id, { difficulty: "advanced" });
    store.setKnowledgeNodeColor(node.id, "#72383D");
    const current = store.getState().knowledge.nodes.find((n) => n.id === node.id)!;
    expect(current.pinned).toBe(true);
    expect(current.favorite).toBe(true);
    expect(current.difficulty).toBe("advanced");
    expect(current.color).toBe("#72383D");
    store.removeKnowledgeNode(node.id);
    expect(store.getState().knowledge.nodes.find((n) => n.id === node.id)).toBeUndefined();
  });

  it("merges knowledge nodes through the store", () => {
    store.addKnowledgeNode({ label: "React", type: "technology" });
    store.addKnowledgeNode({ label: "ReactJS", type: "concept" });
    const graph = store.getState().knowledge;
    const [a, b] = graph.nodes.filter((n) => n.label === "React" || n.label === "ReactJS");
    store.mergeKnowledgeNodes([a.id, b.id]);
    const after = store.getState().knowledge;
    expect(after.nodes.find((n) => n.id === a.id)!.aliases).toContain("ReactJS");
    expect(after.nodes.some((n) => n.id === b.id)).toBe(false);
  });

  it("returns tab-scoped knowledge subgraphs", () => {
    const tabId = store.getState().tabs[0].id;
    store.updateTab(tabId, { fullText: "**Hooks** are functions. **Hooks** includes useState.", title: "React" });
    store.deriveGraphFromTab(tabId);
    const sub = store.knowledgeForTab(tabId);
    expect(sub.nodes.length).toBeGreaterThan(0);
    expect(sub.edges.every((e) => sub.nodes.some((n) => n.id === e.sourceId) && sub.nodes.some((n) => n.id === e.targetId))).toBe(true);
  });

  describe("research canvas", () => {
    it("adds, updates and removes blocks scoped to a workspace", () => {
      const ws = store.getState().activeWorkspaceId;
      const id = store.addCanvasBlock({ workspaceId: ws, type: "sticky", title: "Idea", x: 10, y: 20, data: { text: "hi" } });
      let blocks = store.canvasBlocksFor(ws);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].z).toBe(1);

      store.updateCanvasBlock(id, { x: 100, y: 200, title: "Renamed" });
      store.bringCanvasBlockToFront(id);
      blocks = store.canvasBlocksFor(ws);
      expect(blocks[0].x).toBe(100);
      expect(blocks[0].y).toBe(200);
      expect(blocks[0].title).toBe("Renamed");
      expect(blocks[0].z).toBe(2);

      store.duplicateCanvasBlock(id);
      expect(store.canvasBlocksFor(ws)).toHaveLength(2);

      store.removeCanvasBlock(id);
      expect(store.canvasBlocksFor(ws)).toHaveLength(1);
    });

    it("adds and removes edges between blocks", () => {
      const ws = store.getState().activeWorkspaceId;
      const a = store.addCanvasBlock({ workspaceId: ws, type: "note", title: "A", x: 0, y: 0 });
      const b = store.addCanvasBlock({ workspaceId: ws, type: "note", title: "B", x: 200, y: 0 });
      store.addCanvasEdge(ws, a, b);
      const edges = store.canvasEdgesFor(ws);
      expect(edges).toHaveLength(1);
      expect(edges[0].fromBlockId).toBe(a);
      expect(edges[0].toBlockId).toBe(b);
      store.removeCanvasEdge(edges[0].id);
      expect(store.canvasEdgesFor(ws)).toHaveLength(0);
    });

    it("keeps a capped snapshot history and restores it", () => {
      const ws = store.getState().activeWorkspaceId;
      const id = store.addCanvasBlock({ workspaceId: ws, type: "sticky", title: "Before", x: 0, y: 0 });
      store.addCanvasSnapshot(ws, "v1");
      store.updateCanvasBlock(id, { title: "After" });
      store.addCanvasSnapshot(ws, "v2");
      store.restoreCanvasSnapshot(ws, store.snapshotsFor(ws).find((s) => s.label === "v1")!.id);
      const block = store.canvasBlocksFor(ws).find((b) => b.id === id)!;
      expect(block.title).toBe("Before");
      const many = 35;
      for (let i = 0; i < many; i++) store.addCanvasSnapshot(ws, `v${i}`);
      expect(store.snapshotsFor(ws).length).toBe(30);
    });

    it("creates a linked session block and reuses it", () => {
      const ws = store.getState().activeWorkspaceId;
      const tabId = store.createTab();
      store.ensureSessionOnCanvas(tabId);
      const block = store.canvasBlocksFor(ws).find((b) => b.type === "chat")!;
      expect(block.data.tabId).toBe(tabId);
      store.ensureSessionOnCanvas(tabId);
      expect(store.canvasBlocksFor(ws).filter((b) => b.type === "chat")).toHaveLength(1);
    });

    it("pins blocks in place", () => {
      const ws = store.getState().activeWorkspaceId;
      const id = store.addCanvasBlock({ workspaceId: ws, type: "sticky", title: "Pin me", x: 0, y: 0 });
      store.toggleCanvasBlockPin(id);
      expect(store.canvasBlocksFor(ws)[0].pinned).toBe(true);
      store.toggleCanvasBlockPin(id);
      expect(store.canvasBlocksFor(ws)[0].pinned).toBe(false);
    });

    it("returns canvas hits from global search", () => {
      const ws = store.getState().activeWorkspaceId;
      store.addCanvasBlock({ workspaceId: ws, type: "sticky", title: "Napoleonic Campaign Notes", x: 0, y: 0 });
      const results = store.search("napoleonic");
      expect(results.canvas.some((h) => h.title.includes("Napoleonic"))).toBe(true);
    });
  });
});
