import { describe, expect, it } from "vitest";
import { findTool } from "../../tools/registry";
import { arithmeticIn, buildPlan, goalTerms, planBudget } from "../../tasks/planner";

/**
 * The planner is deterministic on purpose, and these tests hold it to that: same
 * request, same plan, and every step names a tool that is really in the registry.
 */

const request = (goal: string, level: 0 | 1 | 2 = 1) => ({ goal, constraints: [], level });

describe("goal understanding", () => {
  it("takes distinctive terms and drops filler", () => {
    const terms = goalTerms("What did the regulator say about coolant loop B in March 2023?");
    expect(terms).toContain("regulator");
    expect(terms).toContain("coolant");
    expect(terms.split(" ")).not.toContain("what");
    expect(terms.split(" ").length).toBeLessThanOrEqual(6);
  });

  it("finds the arithmetic a goal states, and nothing when it states none", () => {
    expect(arithmeticIn("Work out (1200*3)/7 and report it")).toBe("(1200*3)/7");
    expect(arithmeticIn("Summarise the report")).toBeNull();
  });
});

describe("plan", () => {
  it("is the same for the same request", () => {
    const first = buildPlan(request("What is known about coolant loop B?"));
    const second = buildPlan(request("What is known about coolant loop B?"));
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("names only tools that exist in the registry", () => {
    const plan = buildPlan(request("Report the figures for 1200*3 and anything about licensing"));
    expect(plan.steps.length).toBeGreaterThan(2);
    for (const step of plan.steps) {
      expect(findTool(step.tool), step.tool).toBeDefined();
      expect(step.because.length, step.id).toBeGreaterThan(10);
    }
  });

  it("orders the steps so each one can resolve what the next needs", () => {
    const plan = buildPlan(request("What does the workspace say about the coolant loop B incident?"));
    const tools = plan.steps.map((step) => step.tool);
    expect(tools.indexOf("workspace.search")).toBeLessThan(tools.indexOf("workspace.read"));
    expect(tools.indexOf("workspace.status")).toBe(0);

    const search = plan.steps.find((step) => step.tool === "workspace.search");
    // workspace.search matches literally, so the plan resolves a single term.
    expect(search?.resolve).toEqual({ query: "topTerm" });
    expect(search?.because).toContain("literally");

    const read = plan.steps.find((step) => step.tool === "workspace.read");
    expect(read?.optional).toBe(true);
    expect(read?.resolve).toEqual({ id: "previousHitId" });
  });

  it("retrieves memory as well as evidence, after the item has been read", () => {
    const plan = buildPlan(request("What does this workspace say about the coolant loop B incident?"));
    const tools = plan.steps.map((step) => step.tool);
    expect(tools).toContain("memory.search");
    expect(tools.indexOf("memory.search")).toBeGreaterThan(tools.indexOf("workspace.read"));
    expect(tools.indexOf("memory.search")).toBeLessThan(tools.indexOf("evidence.retrieve"));

    const memory = plan.steps.find((step) => step.tool === "memory.search");
    expect(memory?.resolve).toEqual({ query: "terms" });
    expect(memory?.because).toContain("epistemic status");
  });

  it("adds a calculate step only when the goal states an expression", () => {
    const withArithmetic = buildPlan(request("Check whether 640*2 is the fleet total"));
    expect(withArithmetic.steps.some((step) => step.tool === "calculate")).toBe(true);

    const without = buildPlan(request("Summarise the licensing correspondence"));
    expect(without.steps.some((step) => step.tool === "calculate")).toBe(false);
  });

  it("plans nothing at level 0, and says what it will do instead", () => {
    const plan = buildPlan(request("Explain the coolant loop", 0));
    expect(plan.steps).toEqual([]);
    expect(plan.estimate.risk).toBe("none");
    expect(plan.estimate.note).toContain("Level 0 plans and explains");
    expect(plan.successCriteria.map((criterion) => criterion.id)).toEqual(["steps-completed", "no-tool-calls"]);
  });

  it("carries operator criteria into the plan rather than dropping them", () => {
    const plan = buildPlan({ ...request("Summarise the incident"), criteria: ["cite at least two documents"] });
    expect(plan.successCriteria.some((criterion) => criterion.text === "cite at least two documents")).toBe(true);
  });

  it("states the uncertainty instead of a confident guess", () => {
    const plan = buildPlan(request("Summarise the incident"));
    expect(plan.estimate.uncertainty).toContain("does not know");
  });
});

describe("budgets", () => {
  it("takes the level default and refuses to exceed the ceiling", () => {
    const defaulted = planBudget(request("Summarise the incident", 1));
    expect(defaulted.maxSteps).toBeGreaterThan(0);
    expect(defaulted.maxToolCalls).toBeGreaterThan(0);

    const greedy = planBudget({ ...request("Summarise the incident", 1), budget: { maxSteps: 10_000, maxToolCalls: 10_000 } });
    expect(greedy.maxSteps).toBeLessThanOrEqual(16);
    expect(greedy.maxToolCalls).toBeLessThanOrEqual(24);
  });

  it("gives level 0 no tool calls at all", () => {
    const budget = planBudget(request("Explain the coolant loop", 0));
    expect(budget.maxToolCalls).toBe(0);
  });
});
