import { describe, it, expect } from "vitest";
import { evaluateToolCall } from "../../tools/policy";
import { findTool } from "../../tools/registry";
import { proposalDigest } from "../../tools/validation";
import { freshBudget, type Permission, type ToolDefinition, type ToolProposal } from "../../tools/types";

/**
 * The policy gateway is tested without the registry where possible: the caller
 * passes the tool in, so a write tool can be constructed here to prove that the
 * approval path exists and that nothing can approve it from inside a proposal.
 */

const writeTool: ToolDefinition = {
  name: "test.writer",
  description: "A high-impact tool, used only by this test to exercise approval.",
  sideEffect: "local-write",
  permission: "workspace:read",
  highImpact: ["file-write"],
  timeoutMs: 100,
  maxOutputChars: 1000,
  schema: {
    input: [{ name: "path", type: "string", required: true, description: "Where to write.", minLength: 1, maxLength: 100 }],
    outputDescription: "What was written.",
  },
  run: () => ({ summary: "wrote", data: {} }),
};

function proposal(tool: string, args: Record<string, unknown> = {}, origin: ToolProposal["origin"] = "model"): ToolProposal {
  return { tool, arguments: args, origin };
}

function evaluate(overrides: Partial<Parameters<typeof evaluateToolCall>[0]> = {}) {
  return evaluateToolCall({
    proposal: proposal("calculate", { expression: "1+1" }),
    tool: findTool("calculate"),
    grants: ["compute:local"] as Permission[],
    budget: freshBudget(),
    history: [],
    ...overrides,
  });
}

describe("policy gateway", () => {
  it("allows a read-only call the task is granted", () => {
    const result = evaluate();
    expect(result.outcome.decision).toBe("allow");
    expect(result.outcome.code).toBe("allowed");
    expect(result.args).toEqual({ expression: "1+1" });
  });

  it("denies an unknown tool outright", () => {
    const result = evaluate({ proposal: proposal("filesystem.write", { path: "/etc/hosts" }), tool: undefined });
    expect(result.outcome.decision).toBe("deny");
    expect(result.outcome.code).toBe("unknown-tool");
    expect(result.outcome.reason).toContain("cannot be added by a proposal");
  });

  it("denies a call whose arguments do not match the schema", () => {
    const invalid = evaluate({ proposal: proposal("calculate", { expression: 5 }) });
    expect(invalid.outcome.code).toBe("invalid-arguments");
  });

  it("denies a call that smuggles a permission into its arguments", () => {
    const result = evaluate({
      proposal: proposal("calculate", { expression: "1+1", grants: ["workspace:read"] }),
    });
    expect(result.outcome.decision).toBe("deny");
    expect(result.outcome.code).toBe("invalid-arguments");
  });

  it("denies a permission the task does not hold, and says arguments cannot grant it", () => {
    const result = evaluate({ grants: [] });
    expect(result.outcome.decision).toBe("deny");
    expect(result.outcome.code).toBe("permission-not-granted");
    expect(result.outcome.reason).toContain("Arguments cannot grant a permission");
  });

  it("requires an approval before a high-impact tool runs, and never self-approves", () => {
    const refused = evaluateToolCall({
      proposal: proposal("test.writer", { path: "notes.md" }),
      tool: writeTool,
      grants: ["workspace:read"],
      budget: freshBudget(),
      history: [],
    });
    expect(refused.outcome.decision).toBe("needs-approval");
    expect(refused.outcome.code).toBe("high-impact-requires-approval");
    expect(refused.args).toBeUndefined();

    // The only way through is an approval the caller supplies — and the proposal
    // itself has no field that can carry one.
    const approved = evaluateToolCall({
      proposal: proposal("test.writer", { path: "notes.md" }),
      tool: writeTool,
      grants: ["workspace:read"],
      budget: freshBudget(),
      history: [],
      approval: { by: "operator", at: Date.now() },
    });
    expect(approved.outcome.decision).toBe("allow");
    expect(approved.outcome.reason).toContain("approved by operator");
  });

  it("validates arguments before it considers approval, so a bad write is still refused", () => {
    const result = evaluateToolCall({
      proposal: proposal("test.writer", { path: 5 }),
      tool: writeTool,
      grants: ["workspace:read"],
      budget: freshBudget(),
      history: [],
      approval: { by: "operator", at: Date.now() },
    });
    expect(result.outcome.code).toBe("invalid-arguments");
  });

  it("refuses once the call budget is exhausted", () => {
    const result = evaluate({ budget: { ...freshBudget(), calls: 12 } });
    expect(result.outcome.decision).toBe("deny");
    expect(result.outcome.code).toBe("budget-exhausted");
    expect(result.outcome.reason).toContain("call budget");
  });

  it("refuses once the time, output or retry budget is exhausted", () => {
    expect(evaluate({ budget: { ...freshBudget(), wallMs: 60_000 } }).outcome.reason).toContain("time budget");
    expect(evaluate({ budget: { ...freshBudget(), outputChars: 200_000 } }).outcome.reason).toContain("output budget");

    const retry = evaluate({ budget: { ...freshBudget(), retries: 1 }, isRetry: true });
    expect(retry.outcome.code).toBe("budget-exhausted");
    expect(retry.outcome.reason).toContain("retry budget");

    // A retry flag alone is not enough to refuse the first attempt.
    expect(evaluate({ budget: { ...freshBudget(), retries: 1 }, isRetry: false }).outcome.decision).toBe("allow");
  });

  it("refuses a repeated identical call once the limit is reached", () => {
    const first = evaluate();
    expect(first.outcome.decision).toBe("allow");

    // The digest is the one the executor records, so the test cannot pass with a
    // history of values the policy would never actually see.
    const digest = proposalDigest("calculate", { expression: "1+1" });
    const accepted = evaluate({ history: [digest, digest] });
    expect(accepted.outcome.decision).toBe("allow");

    const refused = evaluate({ history: [digest, digest, digest] });
    expect(refused.outcome.decision).toBe("deny");
    expect(refused.outcome.code).toBe("repeated-call");
    expect(refused.outcome.reason).toContain("limit is 3");
  });
});
