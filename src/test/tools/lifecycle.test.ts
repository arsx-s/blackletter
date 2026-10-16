import { afterEach, describe, expect, it } from "vitest";
import { createToolTask, emptyToolData, runProposal } from "../../tools/executor";
import { registerToolForTests, unregisterToolForTests } from "../../tools/registry";
import { resetToolAuditForTests, toolAuditEntries } from "../../tools/audit";
import type { ToolDefinition, ToolProposal } from "../../tools/types";

/**
 * Honest tool reporting (Mission 10): "requested", "started", "finished" and
 * "verified" must not collapse into each other.
 *
 * The first three are states on the audit entry, and these tests check that a
 * call which never ran has no start, that a call which ran has both timestamps in
 * order, and that the times agree with the recorded duration.
 *
 * "Verified" is not a state at all: nothing in the tool layer may claim a result
 * was verified, because a tool returning data is not evidence that the data is
 * true. That is asserted on the serialised entry, so a future field named
 * `verified` would fail this file rather than quietly appear in the panel.
 */

const FIXTURES = ["test.lifecycle-writer", "test.lifecycle-slow"];

afterEach(() => {
  for (const name of FIXTURES) unregisterToolForTests(name);
  resetToolAuditForTests();
});

function task(grants: Array<"workspace:read" | "compute:local" | "evidence:read"> = ["workspace:read", "compute:local"]) {
  return createToolTask({ workspaceId: "w1", data: emptyToolData(), grants });
}

function proposal(tool: string, args: Record<string, unknown> = {}): ToolProposal {
  return { tool, arguments: args, origin: "model" };
}

describe("tool call lifecycle", () => {
  it("records requested, started and finished, with times that agree with the duration", async () => {
    const outcome = await runProposal(task(), proposal("workspace.search", { query: "coolant" }));
    expect(outcome.status).toBe("ok");

    const entry = toolAuditEntries()[0];
    expect(typeof entry.at).toBe("number");
    expect(typeof entry.startedAt).toBe("number");
    expect(typeof entry.finishedAt).toBe("number");
    expect(entry.startedAt!).toBeGreaterThanOrEqual(entry.at);
    expect(entry.finishedAt!).toBeGreaterThanOrEqual(entry.startedAt!);
    expect(entry.result?.durationMs).toBe(entry.finishedAt! - entry.startedAt!);
  });

  it("records only the request for a call the policy refuses", async () => {
    // No permission for `workspace.search`, and arguments cannot grant one.
    const outcome = await runProposal(task(["compute:local"]), proposal("workspace.search", { query: "coolant" }));
    expect(outcome.status).toBe("denied");

    const entry = toolAuditEntries()[0];
    expect(entry.code).toBe("permission-not-granted");
    expect(entry.startedAt).toBeUndefined();
    expect(entry.finishedAt).toBeUndefined();
    expect(entry.result).toBeUndefined();
  });

  it("records only the request for a call that needs approval and did not run", async () => {
    const writer: ToolDefinition = {
      name: "test.lifecycle-writer",
      description: "A fixture tool that would write something.",
      sideEffect: "write",
      permission: "workspace:read",
      highImpact: [],
      timeoutMs: 500,
      maxOutputChars: 1000,
      schema: {
        input: [{ name: "value", type: "string", required: true, description: "A value.", minLength: 1, maxLength: 50 }],
        outputDescription: "Echoed value.",
      },
      run: () => ({ summary: "wrote", data: {} }),
    };
    registerToolForTests(writer);

    const noApproval = await runProposal(task(), proposal(writer.name, { value: "x" }));
    expect(noApproval.status).toBe("needs-approval");
    expect(toolAuditEntries()[0].startedAt).toBeUndefined();
    expect(toolAuditEntries()[0].result).toBeUndefined();

    // The same call with the operator's approval runs, and then has a start.
    const approved = await runProposal(task(), proposal(writer.name, { value: "x" }), { approve: { by: "operator" } });
    expect(approved.status).toBe("ok");
    expect(typeof toolAuditEntries()[0].startedAt).toBe("number");
  });

  it("records a start and a finish for a call that times out", async () => {
    const slow: ToolDefinition = {
      name: "test.lifecycle-slow",
      description: "A fixture tool that never finishes in time.",
      sideEffect: "none",
      permission: "workspace:read",
      highImpact: [],
      timeoutMs: 20,
      maxOutputChars: 100,
      schema: { input: [], outputDescription: "Nothing." },
      run: () => new Promise(() => undefined) as never,
    };
    registerToolForTests(slow);

    const outcome = await runProposal(task(), proposal(slow.name));
    expect(outcome.status).toBe("timeout");

    const entry = toolAuditEntries()[0];
    expect(entry.result?.status).toBe("timeout");
    expect(typeof entry.startedAt).toBe("number");
    expect(typeof entry.finishedAt).toBe("number");
  });

  it("never reports a tool result as verified", async () => {
    await runProposal(task(), proposal("workspace.search", { query: "coolant" }));
    const entry = toolAuditEntries()[0];

    expect(entry.result?.status).toBe("ok");
    expect(Object.keys(entry)).not.toContain("verified");
    expect(Object.keys(entry.result ?? {})).not.toContain("verified");
    expect(JSON.stringify(entry)).not.toMatch(/verif/i);
  });
});
