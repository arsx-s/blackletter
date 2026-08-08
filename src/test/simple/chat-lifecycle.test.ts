import { describe, it, expect, beforeEach } from "vitest";
import { WorkspaceStore } from "../../stores/workspace-store";

function freshStore(): WorkspaceStore {
  return new WorkspaceStore();
}

function addMessage(store: WorkspaceStore, tabId: string, role: "user" | "assistant", content: string) {
  const tab = store.getState().tabs.find((t) => t.id === tabId);
  store.updateTab(tabId, { messages: [...(tab?.messages ?? []), { role, content, timestamp: Date.now() }] });
}

describe("simple chat lifecycle", () => {
  let store: WorkspaceStore;

  beforeEach(() => {
    store = freshStore();
  });

  it("boots in Default Mode by default", () => {
    expect(store.getState().prefs.developerMode).toBe(false);
  });

  it("creates a chat immediately and makes it active", () => {
    const id = store.createTab();
    expect(store.getState().activeTabId).toBe(id);
    expect(store.getState().tabs.find((t) => t.id === id)).toBeDefined();
  });

  it("keeps chat histories separate when switching chats", () => {
    const chatA = store.getState().tabs[0].id;
    const chatB = store.createTab();
    const chatC = store.createTab();

    addMessage(store, chatA, "user", "Explain the EU AI Act");
    addMessage(store, chatA, "assistant", "The EU AI Act is…");
    addMessage(store, chatB, "user", "What is the Napoleonic Code?");

    store.setActiveTab(chatB);
    store.setActiveTab(chatC);
    store.setActiveTab(chatA);

    const a = store.getState().tabs.find((t) => t.id === chatA)!;
    const b = store.getState().tabs.find((t) => t.id === chatB)!;
    const c = store.getState().tabs.find((t) => t.id === chatC)!;

    expect(a.messages).toHaveLength(2);
    expect(a.messages[0].content).toBe("Explain the EU AI Act");
    expect(b.messages).toHaveLength(1);
    expect(b.messages[0].content).toBe("What is the Napoleonic Code?");
    expect(c.messages).toHaveLength(0);
    expect(store.getState().activeTabId).toBe(chatA);
  });

  it("renames a chat persistently in state", () => {
    const id = store.getState().tabs[0].id;
    store.renameTab(id, "My Diplomacy Notes");
    expect(store.getState().tabs.find((t) => t.id === id)?.title).toBe("My Diplomacy Notes");
  });

  it("deletes a chat permanently from state", () => {
    const chatA = store.getState().tabs[0].id;
    const chatB = store.createTab();
    addMessage(store, chatA, "user", "keep me");
    store.closeTab(chatA);
    expect(store.getState().tabs.find((t) => t.id === chatA)).toBeUndefined();
    expect(store.getState().activeTabId).toBe(chatB);
  });

  it("does not resurrect deleted chats on subsequent operations", () => {
    const chatA = store.getState().tabs[0].id;
    store.closeTab(chatA);
    const afterClose = store.getState().tabs.map((t) => t.id);
    store.createTab();
    expect(store.getState().tabs.map((t) => t.id)).not.toContain(chatA);
    expect(store.getState().tabs.length).toBe(afterClose.length + 1);
  });

  it("workspace deletion removes its chats and switches elsewhere", () => {
    const firstWorkspace = store.getState().activeWorkspaceId;
    const second = store.createWorkspace("Archive Two");
    store.createTab();
    const tabsOfSecond = store.getState().tabs.filter((t) => t.workspaceId === second).length;
    expect(tabsOfSecond).toBeGreaterThan(0);

    store.deleteWorkspace(second);
    expect(store.getState().workspaces.find((w) => w.id === second)).toBeUndefined();
    expect(store.getState().tabs.filter((t) => t.workspaceId === second)).toHaveLength(0);
    expect(store.getState().activeWorkspaceId).not.toBe(second);
    expect(store.getState().activeWorkspaceId).toBe(firstWorkspace);
  });

  it("renames a workspace in state", () => {
    const id = store.getState().activeWorkspaceId;
    store.renameWorkspace(id, "Treaty Research");
    expect(store.getState().workspaces.find((w) => w.id === id)?.name).toBe("Treaty Research");
  });

  it("persists the mode switch in prefs", () => {
    store.setPrefs({ developerMode: true });
    expect(store.getState().prefs.developerMode).toBe(true);
    store.setPrefs({ developerMode: false });
    expect(store.getState().prefs.developerMode).toBe(false);
  });
});