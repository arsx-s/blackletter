import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createToolTask, emptyToolData, previewDecision, runProposal } from "../../tools/executor";
import { evaluateToolCall } from "../../tools/policy";
import { registerToolForTests, unregisterToolForTests } from "../../tools/registry";
import { resetToolAuditForTests, toolAuditEntries } from "../../tools/audit";
import { freshBudget, type Permission, type ToolDefinition, type ToolProposal, type ToolRunOutput } from "../../tools/types";
import { createTask, stepTask, type TaskRecord } from "../../tasks";
import { engageStop, releaseStop, resetControlForTests } from "../../control";

/**
 * The stop, at each gate the pack names: the policy gateway, the executor, and the
 * task step. The evidence for each claim is a spy (was the tool called?) or an
 * audit entry (what was recorded?), never a reading of the implementation.
 */

const FIXTURES = ["test.slow", "test.spy"];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function spyTool(overrides: Partial<ToolDefinition> & { name: string }): ToolDefinition {
  return {
    description: "A fixture tool for the control-plane tests.",
    sideEffect: "none",
    permission: "workspace:read",
    highImpact: [],
    timeoutMs: 500,
    maxOutputChars: 1000,
    schema: {
      input: [{ name: "value", type: "string", required: false, description: "A value.", minLength: 1, maxLength: 50 }],
      outputDescription: "Echoed value.",
    },
    run: () => ({ summary: "ran", data: {} }),
    ...overrides,
  };
}

function data() {
  return {
    ...emptyToolData(),
    documents: [
      {
        id: "doc-1",
        workspaceId: "w1",
        name: "reactor-log.md",
        content: "The reactor spiked at 14:02 today. Coolant loop B was restarted.",
        status: "ready" as const,
        addedAt: 1,
      },
    ],
  };
}

function toolTask(grants: Permission[] = ["workspace:read"]) {
  return createToolTask({ workspaceId: "w1", data: data(), grants });
}

function proposal(tool: string, args: Record<string, unknown> = {}): ToolProposal {
  return { tool, arguments: args, origin: "model" };
}

beforeEach(() => {
  localStorage.clear();
  resetControlForTests();
  resetToolAuditForTests();
});

afterEach(() => {
  for (const name of FIXTURES) unregisterToolForTests(name);
  resetControlForTests();
  resetToolAuditForTests();
  vi.restoreAllMocks();
});

describe("the stop at the policy gateway", () => {
  it("denies before it even looks up the tool", () => {
    const evaluation = evaluateToolCall({
      proposal: proposal("workspace.search", { query: "coolant" }),
      tool: undefined,
      grants: ["workspace:read"],
      budget: freshBudget(),
      history: [],
      stopped: true,
    });

    expect(evaluation.outcome.decision).toBe("deny");
    expect(evaluation.outcome.code).toBe("stopped");
    expect(evaluation.outcome.reason).toContain("global stop");
    expect(evaluation.args, "no validated arguments are produced for a refused call").toBeUndefined();
  });

  it("makes the preview a stopped one too, so the panel cannot say a call is fine", () => {
    engageStop({ reason: "drill", at: 1000 });
    const preview = previewDecision(toolTask(), proposal("workspace.search", { query: "coolant" }));
    expect(preview.decision).toBe("deny");
    expect(preview.code).toBe("stopped");
  });
});

describe("the stop at the executor", () => {
  it("does not call the tool, and records one refusal", async () => {
    const run = vi.fn(() => ({ summary: "ran", data: {} }));
    registerToolForTests(spyTool({ name: "test.spy", run }));

    engageStop({ reason: "drill", at: 1000 });
    const outcome = await runProposal(toolTask(), proposal("test.spy", { value: "x" }));

    expect(outcome.status).toBe("denied");
    expect(outcome.code).toBe("stopped");
    expect(run).not.toHaveBeenCalled();

    const entries = toolAuditEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].decision).toBe("deny");
    expect(entries[0].reason).toContain("global stop");
    expect(entries[0].by).toBe("model");
  });

  it("aborts a call that is already running, and discards whatever it returns", async () => {
    const run = vi.fn(
      () =>
        new Promise<ToolRunOutput>((resolve) => {
          setTimeout(() => resolve({ summary: "late", data: { late: true } }), 60);
        }),
    );
    registerToolForTests(spyTool({ name: "test.slow", timeoutMs: 5000, run }));

    const pending = runProposal(toolTask(), proposal("test.slow", { value: "x" }));
    await sleep(10);
    engageStop({ reason: "drill", at: 1000 });
    const outcome = await pending;

    expect(run, "the call had already started; JavaScript cannot un-start it").toHaveBeenCalledTimes(1);
    expect(outcome.status).toBe("cancelled");
    expect(outcome.result, "the result that arrived later is discarded").toBeUndefined();
    expect(toolAuditEntries()[0].reason).toContain("global stop");

    // The tool's promise settling afterwards must not produce an unhandled rejection
    // or a second audit entry.
    await sleep(80);
    expect(toolAuditEntries()).toHaveLength(1);
  });

  it("runs the same call again once the stop is released", async () => {
    engageStop({ reason: "drill", at: 1000 });
    const blocked = await runProposal(toolTask(), proposal("workspace.search", { query: "coolant" }));
    expect(blocked.code).toBe("stopped");

    releaseStop({ at: 2000 });
    const allowed = await runProposal(toolTask(), proposal("workspace.search", { query: "coolant" }));
    expect(allowed.status).toBe("ok");
    expect(allowed.code).toBe("allowed");
  });
});

describe("the stop at the task step", () => {
  it("refuses the step and names the stop, not the task's state", async () => {
    const created = createTask({
      workspaceId: "w1",
      goal: "Summarise the coolant loop B incident",
      constraints: ["read-only"],
      level: 1,
      now: () => 1000,
    });
    if (!created.ok) throw new Error(created.reason);
    // PAUSED is the state a stopped task is left in, and it is also a state the
    // machine refuses to step from: whichever refusal comes back says which check
    // ran first.
    const paused: TaskRecord = { ...created.task, status: "PAUSED" };

    engageStop({ reason: "drill", at: 1000 });
    const blocked = await stepTask(paused, { data: data() });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.reason).toContain("global stop");

    // Released, the same task gets the ordinary refusal for its status: the stop
    // check is what changed, not the status machine.
    releaseStop({ at: 2000 });
    const after = await stepTask(paused, { data: data() });
    expect(after.ok).toBe(false);
    if (after.ok) return;
    expect(after.reason).not.toContain("global stop");
    expect(after.reason).toContain("RUNNING");
  });
});
