import { describe, it, expect, afterEach } from "vitest";
import {
  TOOL_REGISTRY,
  findTool,
  listTools,
  registerToolForTests,
  registeredPermissions,
  unregisterToolForTests,
} from "../../tools/registry";
import { validateArguments } from "../../tools/validation";
import type { ToolData, ToolDefinition } from "../../tools/types";

/**
 * The registry is the allowlist. These tests defend the three properties that
 * make it an allowlist rather than a wish list: it is closed, everything in it is
 * read-only, and every tool's declared contract is internally consistent.
 */

describe("tool registry", () => {
  it("registers the seven documented read-only tools", () => {
    expect(listTools().map((tool) => tool.name).sort()).toEqual([
      "calculate",
      "evidence.retrieve",
      "memory.search",
      "numbers.stats",
      "workspace.read",
      "workspace.search",
      "workspace.status",
    ]);
    expect(TOOL_REGISTRY.size).toBe(7);
    expect(registeredPermissions()).toEqual(["compute:local", "evidence:read", "workspace:read"]);
  });

  it("reads memory without ever writing to it", async () => {
    const tool = findTool("memory.search") as ToolDefinition<{ query: string; limit?: number }>;
    expect(tool.sideEffect).toBe("none");
    expect(tool.permission).toBe("workspace:read");

    const data: ToolData = {
      documents: [],
      notes: [],
      knowledge: [],
      memory: {
        total: 1,
        byStatus: { supported: 1 },
        records: [
          {
            id: "mem-1",
            category: "semantic",
            content: "Coolant loop B was restarted at 14:02 on 14 March 2023.",
            status: "supported",
            origin: "external",
            originNote: "taken from the incident report",
            retention: "keep",
            tags: ["reactor"],
            updatedAt: 10,
          },
        ],
      },
      tabCount: 0,
      lastRun: null,
    };

    const result = await tool.run({ query: "coolant loop" }, { workspaceId: "w1", data });
    const hits = (result.data as { hits: Array<Record<string, unknown>> }).hits;
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ id: "mem-1", status: "supported", origin: "external" });
    expect(hits[0].originNote).toBe("taken from the incident report");
    expect(result.summary).toContain("1 memory record(s) matched");

    // The record is left exactly as it was: no retrieval timestamp, no mutation.
    expect(data.memory.records[0]).not.toHaveProperty("lastRetrievedAt");
    expect(data.memory.records[0].updatedAt).toBe(10);
  });

  it("gives every tool a description, a schema, a timeout and an output cap", () => {
    for (const tool of listTools()) {
      expect(tool.description.length, tool.name).toBeGreaterThan(20);
      expect(tool.timeoutMs, tool.name).toBeGreaterThan(0);
      expect(tool.timeoutMs, tool.name).toBeLessThanOrEqual(30_000);
      expect(tool.maxOutputChars, tool.name).toBeGreaterThan(0);
      expect(tool.maxOutputChars, tool.name).toBeLessThanOrEqual(200_000);
      expect(tool.schema.outputDescription.length, tool.name).toBeGreaterThan(10);
      expect(["workspace:read", "evidence:read", "compute:local"]).toContain(tool.permission);
    }
  });

  it("registers nothing that writes, installs, sends or deploys", () => {
    for (const tool of listTools()) {
      expect(tool.sideEffect, tool.name).toBe("none");
      expect(tool.highImpact, tool.name).toEqual([]);
    }
  });

  it("gives every field a description and a bound", () => {
    for (const tool of listTools()) {
      for (const field of tool.schema.input) {
        expect(field.description.length, `${tool.name}.${field.name}`).toBeGreaterThan(5);
        if (field.type === "string") expect(field.maxLength, `${tool.name}.${field.name}`).toBeGreaterThan(0);
        if (field.type === "number") {
          expect(field.min, `${tool.name}.${field.name}`).not.toBeUndefined();
          expect(field.max, `${tool.name}.${field.name}`).not.toBeUndefined();
        }
        if (field.type === "string[]" || field.type === "number[]") {
          expect(field.maxItems, `${tool.name}.${field.name}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("finds tools by name and reports unknown names as unknown", () => {
    expect(findTool("calculate")?.name).toBe("calculate");
    expect(findTool("filesystem.write")).toBeUndefined();
    expect(findTool("shell.exec")).toBeUndefined();
  });
});

describe("argument validation", () => {
  it("accepts a valid call and returns only the declared fields", () => {
    const tool = findTool("workspace.search");
    expect(tool).toBeDefined();
    const result = validateArguments(tool as ToolDefinition, { query: "reactor", limit: 3 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.args).toEqual({ query: "reactor", limit: 3 });
  });

  it("fills nothing in for a missing optional field", () => {
    const tool = findTool("workspace.search") as ToolDefinition;
    const result = validateArguments(tool, { query: "reactor" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(Object.keys(result.args)).toEqual(["query"]);
  });

  it("refuses a missing required field instead of defaulting it", () => {
    const tool = findTool("workspace.search") as ToolDefinition;
    const result = validateArguments(tool, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("query");
  });

  it("refuses unknown fields, which is what blocks argument-level escalation", () => {
    const tool = findTool("workspace.search") as ToolDefinition;
    const result = validateArguments(tool, { query: "a", permissions: ["workspace:write"] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("unknown argument \"permissions\"");
  });

  it("refuses a permission-shaped envelope smuggled into arguments", () => {
    const tool = findTool("calculate") as ToolDefinition;
    for (const key of ["grants", "approved", "bypass", "allowNonLoopback"]) {
      const result = validateArguments(tool, { expression: "1+1", [key]: true });
      expect(result.ok, key).toBe(false);
    }
  });

  it("does not coerce types", () => {
    const search = findTool("workspace.search") as ToolDefinition;
    expect(validateArguments(search, { query: 5 }).ok).toBe(false);
    expect(validateArguments(search, { query: "a", limit: "3" }).ok).toBe(false);

    const stats = findTool("numbers.stats") as ToolDefinition;
    expect(validateArguments(stats, { values: ["1", "2"] }).ok).toBe(false);
    expect(validateArguments(stats, { values: [1, Number.NaN] }).ok).toBe(false);
    expect(validateArguments(stats, { values: [1, Infinity] }).ok).toBe(false);
  });

  it("enforces every declared bound", () => {
    const search = findTool("workspace.search") as ToolDefinition;
    expect(validateArguments(search, { query: "" }).ok).toBe(false);
    expect(validateArguments(search, { query: "x".repeat(201) }).ok).toBe(false);
    expect(validateArguments(search, { query: "a", limit: 0 }).ok).toBe(false);
    expect(validateArguments(search, { query: "a", limit: 21 }).ok).toBe(false);
    expect(validateArguments(search, { query: "a", limit: 2.5 }).ok).toBe(true);

    const stats = findTool("numbers.stats") as ToolDefinition;
    expect(validateArguments(stats, { values: Array.from({ length: 501 }, (_, i) => i) }).ok).toBe(false);
  });

  it("refuses arguments that are not an object at all", () => {
    const tool = findTool("calculate") as ToolDefinition;
    for (const raw of [null, [], "expression=1", 42]) {
      expect(validateArguments(tool, raw).ok, JSON.stringify(raw)).toBe(false);
    }
  });
});

describe("test seam", () => {
  afterEach(() => {
    unregisterToolForTests("test.fake-write");
  });

  it("can register a fixture tool because this is a test build", () => {
    const fixture: ToolDefinition = {
      name: "test.fake-write",
      description: "A write tool that only exists so the approval path can be exercised.",
      sideEffect: "local-write",
      permission: "workspace:read",
      highImpact: ["file-write"],
      timeoutMs: 100,
      maxOutputChars: 100,
      schema: { input: [], outputDescription: "Nothing." },
      run: () => ({ summary: "wrote", data: {} }),
    };
    registerToolForTests(fixture);
    expect(findTool("test.fake-write")).toBe(fixture);
    unregisterToolForTests("test.fake-write");
    expect(findTool("test.fake-write")).toBeUndefined();
  });
});
