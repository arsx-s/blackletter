import { describe, it, expect } from "vitest";
import { createStateMachine } from "../../langgraph/graph";
import { createInitialState } from "../../langgraph/state";
import type { GraphDefinition, GraphState, RunContext } from "../../langgraph/types";
import { CancelledError } from "../../lib/cancellation";

function initialState() {
  return createInitialState({
    prompt: "Summarise the attached report.",
    files: [],
    history: [],
    subject: null,
    mode: null,
  });
}

function linearGraph(nodes: GraphDefinition["nodes"]): GraphDefinition {
  return {
    nodes,
    edges: [
      { from: "First", to: "Second" },
      { from: "Second", to: "Third" },
    ],
    start: "First",
    end: ["Third"],
  };
}

const noop = async () => ({});

describe("graph cancellation", () => {
  it("stops before the first node when the signal is already aborted", async () => {
    const visited: string[] = [];
    const machine = createStateMachine(
      linearGraph({
        First: async () => {
          visited.push("First");
          return {};
        },
        Second: noop,
        Third: noop,
      }),
    );

    const controller = new AbortController();
    controller.abort();
    const result = await machine.execute(initialState(), { signal: controller.signal });

    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);
    expect(result.errorCode).toBe("CANCELLED");
    expect(visited).toEqual([]);
    expect(result.visitedNodes).toEqual([]);
  });

  it("stops between nodes once the signal aborts mid-run", async () => {
    const visited: string[] = [];
    const controller = new AbortController();

    const machine = createStateMachine(
      linearGraph({
        First: async () => {
          visited.push("First");
          controller.abort();
          return {};
        },
        Second: async () => {
          visited.push("Second");
          return {};
        },
        Third: async () => {
          visited.push("Third");
          return {};
        },
      }),
    );

    const result = await machine.execute(initialState(), { signal: controller.signal });

    expect(visited).toEqual(["First"]);
    expect(result.cancelled).toBe(true);
    expect(result.finalNode).toBe("Second");
    expect(result.success).toBe(false);
  });

  it("treats a thrown CancelledError as a cancellation, not a failure", async () => {
    const machine = createStateMachine(
      linearGraph({
        First: async () => {
          throw new CancelledError();
        },
        Second: noop,
        Third: noop,
      }),
    );

    const result = await machine.execute(initialState(), {});

    expect(result.cancelled).toBe(true);
    expect(result.errorCode).toBe("CANCELLED");
    // A cancellation must not be filed as an error the operator sees.
    expect(result.state.errors).toEqual([]);
  });

  it("treats a node-level CANCELLED result as a cancellation", async () => {
    const machine = createStateMachine(
      linearGraph({
        First: async () => ({ error: "Cancelled by the operator.", errorCode: "CANCELLED" }),
        Second: noop,
        Third: noop,
      }),
    );

    const result = await machine.execute(initialState(), {});
    expect(result.cancelled).toBe(true);
    expect(result.state.errors).toEqual([]);
  });

  it("hands the run context to every node", async () => {
    const controller = new AbortController();
    const seen: Array<RunContext["signal"]> = [];

    const machine = createStateMachine(
      linearGraph({
        First: async (_state: GraphState, ctx: RunContext) => {
          seen.push(ctx.signal);
          return {};
        },
        Second: async (_state: GraphState, ctx: RunContext) => {
          seen.push(ctx.signal);
          return {};
        },
        Third: noop,
      }),
    );

    await machine.execute(initialState(), { signal: controller.signal });
    expect(seen).toHaveLength(2);
    expect(seen.every((signal) => signal === controller.signal)).toBe(true);
  });

  it("still reports an ordinary node failure as a failure", async () => {
    const machine = createStateMachine(
      linearGraph({
        First: async () => ({ error: "Upstream exploded.", errorCode: "SERVER" }),
        Second: noop,
        Third: noop,
      }),
    );

    const result = await machine.execute(initialState(), {});
    expect(result.success).toBe(false);
    expect(result.cancelled).toBeUndefined();
    expect(result.errorCode).toBe("SERVER");
    expect(result.state.errors).toEqual(["Upstream exploded."]);
  });

  it("runs to completion when no signal is supplied", async () => {
    const machine = createStateMachine(
      linearGraph({ First: noop, Second: noop, Third: noop }),
    );
    const result = await machine.execute(initialState());
    expect(result.success).toBe(true);
    expect(result.cancelled).toBeUndefined();
  });
});
