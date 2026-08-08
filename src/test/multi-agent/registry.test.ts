import { describe, it, expect, beforeEach } from "vitest";
import { AgentRegistry } from "../../multi-agent/registry";
import { BaseAgent } from "../../multi-agent/base-agent";
import type { AgentId, AgentCapability, AgentContext } from "../../multi-agent/types";

class TestAgent extends BaseAgent {
  readonly id: AgentId;
  readonly name: string;
  readonly description: string;
  readonly capabilities: AgentCapability[];
  readonly systemPrompt = "test prompt";

  constructor(id: AgentId, name: string, capabilities: AgentCapability[]) {
    super();
    this.id = id;
    this.name = name;
    this.description = `${name} description`;
    this.capabilities = capabilities;
  }

  protected async process(_context: AgentContext): Promise<Partial<AgentContext>> {
    return { finalResponse: `response from ${this.id}` };
  }
}

describe("AgentRegistry", () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  it("starts empty", () => {
    expect(registry.count()).toBe(0);
    expect(registry.getAll()).toEqual([]);
  });

  it("registers a single agent", () => {
    const agent = new TestAgent("teacher", "Teacher", ["teaching"]);
    registry.register(agent);
    expect(registry.count()).toBe(1);
    expect(registry.has("teacher")).toBe(true);
  });

  it("retrieves agent by id", () => {
    const agent = new TestAgent("research", "Research", ["research"]);
    registry.register(agent);
    expect(registry.get("research")).toBe(agent);
  });

  it("returns undefined for unknown id", () => {
    expect(registry.get("planning" as AgentId)).toBeUndefined();
  });

  it("finds agents by capability", () => {
    const teacher = new TestAgent("teacher", "Teacher", ["teaching"]);
    const writer = new TestAgent("writing", "Writer", ["writing"]);
    registry.register(teacher);
    registry.register(writer);

    const teachers = registry.getByCapability("teaching");
    expect(teachers).toHaveLength(1);
    expect(teachers[0].id).toBe("teacher");
  });

  it("finds agents by multiple capabilities", () => {
    const teacher = new TestAgent("teacher", "Teacher", ["teaching", "writing"]);
    const researcher = new TestAgent("research", "Research", ["research"]);
    registry.register(teacher);
    registry.register(researcher);

    const result = registry.getByCapabilities(["teaching", "research"]);
    expect(result).toHaveLength(2);
  });

  it("clears all agents", () => {
    const agent = new TestAgent("teacher", "Teacher", ["teaching"]);
    registry.register(agent);
    registry.clear();
    expect(registry.count()).toBe(0);
  });

  it("getTeamForComplexity returns only registered agents in order", () => {
    const teacher = new TestAgent("teacher", "Teacher", ["teaching"]);
    const knowledge = new TestAgent("knowledge-graph", "Knowledge Graph", ["knowledge-graph"]);
    registry.register(teacher);
    registry.register(knowledge);

    const team = registry.getTeamForComplexity("simple");
    expect(team).toHaveLength(2);
    expect(team[0].id).toBe("teacher");
    expect(team[1].id).toBe("knowledge-graph");
  });

  it("getTeamForComplexity returns moderate team", () => {
    const research = new TestAgent("research", "Research", ["research"]);
    const teacher = new TestAgent("teacher", "Teacher", ["teaching"]);
    const knowledge = new TestAgent("knowledge-graph", "Knowledge Graph", ["knowledge-graph"]);
    const writing = new TestAgent("writing", "Writing", ["writing"]);
    registry.register(research);
    registry.register(teacher);
    registry.register(knowledge);
    registry.register(writing);

    const team = registry.getTeamForComplexity("moderate");
    expect(team).toHaveLength(4);
    expect(team.map((a) => a.id)).toEqual(["research", "teacher", "knowledge-graph", "writing"]);
  });

  it("getTeamForComplexity skips unregistered agents", () => {
    const teacher = new TestAgent("teacher", "Teacher", ["teaching"]);
    registry.register(teacher);

    const team = registry.getTeamForComplexity("complex");
    expect(team.length).toBeLessThan(9);
    expect(team.map((a) => a.id)).not.toContain("planning");
  });

  it("getTeamForComplexity returns research team with all 10 agents", () => {
    const ids: AgentId[] = ["planning", "research", "critical-thinking", "fact-verification", "teacher", "knowledge-graph", "citation", "writing", "summarization", "report-generation"];
    for (const id of ids) {
      registry.register(new TestAgent(id, id, [id as AgentCapability]));
    }

    const team = registry.getTeamForComplexity("research");
    expect(team).toHaveLength(10);
  });

  it("getAll returns all registered agents", () => {
    registry.register(new TestAgent("planning", "Planning", ["planning"]));
    registry.register(new TestAgent("research", "Research", ["research"]));
    expect(registry.getAll()).toHaveLength(2);
  });
});
