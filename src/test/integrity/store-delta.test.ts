import { beforeEach, describe, expect, it } from "vitest";
import { workspaceStore as store } from "../../stores/use-workspace";

/**
 * What the change set records comes from these two store methods, so they must
 * report what actually changed: an id per added node and edge, and the memory
 * layer's own outcome. A derived idempotently repeated is not a second addition,
 * and a duplicate memory write is not a second record.
 */

beforeEach(() => {
  store.clearMemory(store.getState().activeWorkspaceId);
});

describe("store deltas", () => {
  it("reports the nodes a derivation added, and nothing when it is repeated", () => {
    const tabId = store.getState().tabs[0].id;
    store.updateTab(tabId, {
      fullText: "**Flexbox** is a layout mode. **Grid** contains Pseudo Classes.",
      title: "CSS Study",
    });

    const first = store.deriveGraphFromTab(tabId);
    expect(first.nodesAdded.length).toBeGreaterThan(0);
    expect(first.edgesAdded.length).toBeGreaterThan(0);
    // Every reported id is in the graph.
    const ids = new Set(store.getState().knowledge.nodes.map((node) => node.id));
    for (const id of first.nodesAdded) expect(ids.has(id)).toBe(true);

    // The same text again reinforces the same nodes; it does not add new ones.
    const second = store.deriveGraphFromTab(tabId);
    expect(second.nodesAdded).toEqual([]);
    expect(second.edgesAdded).toEqual([]);
  });

  it("reports the memory outcome of an exchange and refuses an empty one", () => {
    const workspaceId = store.getState().activeWorkspaceId;

    const created = store.rememberExchange(workspaceId, "What is a closure?", "A function that captures its lexical environment.");
    expect(created?.outcome).toBe("created");
    expect(created?.record?.content).toContain("What is a closure?");
    expect(created?.record?.provenance.origin).toBe("model-inference");

    const duplicate = store.rememberExchange(workspaceId, "What is a closure?", "A function that captures its lexical environment.");
    expect(duplicate?.outcome).toBe("duplicate");

    expect(store.rememberExchange(workspaceId, "", "text")).toBeNull();
    expect(store.rememberExchange(workspaceId, "question", "   ")).toBeNull();
  });
});
