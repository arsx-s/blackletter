import { afterEach, describe, expect, it } from "vitest";
import {
  MAX_TOOL_AUDIT,
  appendToolAudit,
  clearToolAudit,
  loadToolAudit,
  resetToolAuditForTests,
  subscribeToolAudit,
  toolAuditDroppedCount,
  toolAuditEntries,
  type ToolAuditInput,
} from "../../tools/audit";

afterEach(async () => {
  resetToolAuditForTests();
  await clearToolAudit();
});

function entry(overrides: Partial<ToolAuditInput> = {}): ToolAuditInput {
  return {
    at: 1_000,
    taskId: "task-1",
    workspaceId: "w1",
    tool: "workspace.search",
    by: "model",
    argsDigest: "digest",
    argSummary: 'query="coolant"',
    decision: "allow",
    code: "allowed",
    reason: "read-only tool ran",
    ...overrides,
  };
}

describe("tool audit trail", () => {
  it("appends a frozen entry with a monotonic sequence and a digest", () => {
    const first = appendToolAudit(entry());
    const second = appendToolAudit(entry({ tool: "calculate" }));

    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
    expect(first.digest).toMatch(/^fnv1a32:/);
    expect(Object.isFrozen(first)).toBe(true);
    expect(toolAuditEntries().map((e) => e.seq)).toEqual([2, 1]);
  });

  it("freezes the nested result and approval objects too", () => {
    const record = appendToolAudit(
      entry({
        approval: { by: "operator", at: 5 },
        result: { status: "ok", summary: "done", outputChars: 10, durationMs: 3 },
      }),
    );
    expect(Object.isFrozen(record.result)).toBe(true);
    expect(Object.isFrozen(record.approval)).toBe(true);
  });

  it("changes the digest when anything about the entry changes", () => {
    const a = appendToolAudit(entry({ reason: "one" }));
    const b = appendToolAudit(entry({ reason: "two" }));
    expect(a.digest).not.toBe(b.digest);
  });

  it("notifies subscribers", () => {
    let calls = 0;
    const unsubscribe = subscribeToolAudit(() => {
      calls += 1;
    });
    appendToolAudit(entry());
    expect(calls).toBe(1);
    unsubscribe();
    appendToolAudit(entry());
    expect(calls).toBe(1);
  });

  it("caps the trail and counts what fell off", () => {
    for (let i = 0; i < MAX_TOOL_AUDIT + 7; i++) appendToolAudit(entry({ at: i }));

    expect(toolAuditEntries()).toHaveLength(MAX_TOOL_AUDIT);
    expect(toolAuditDroppedCount()).toBe(7);
    // The newest entries survive; the oldest were dropped.
    expect(toolAuditEntries()[0].at).toBe(MAX_TOOL_AUDIT + 6);
  });

  it("keeps the sequence monotonic across a reload", async () => {
    appendToolAudit(entry());
    appendToolAudit(entry());
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Simulate a reload: memory is forgotten, the persisted trail is not.
    resetToolAuditForTests();
    expect(toolAuditEntries()).toHaveLength(0);
    await loadToolAudit();

    expect(toolAuditEntries().map((e) => e.seq)).toEqual([2, 1]);
    const next = appendToolAudit(entry());
    expect(next.seq).toBe(3);
  });

  it("reads a corrupt persisted trail without throwing", async () => {
    localStorage.setItem("tool-audit", JSON.stringify([{ nope: true }, null, { seq: 4, tool: "calculate" }]));
    resetToolAuditForTests();
    await loadToolAudit();
    expect(toolAuditEntries().map((e) => e.tool)).toEqual(["calculate"]);
  });
});
