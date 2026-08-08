import type { AgentId, AgentCapability } from "./types";
import { BaseAgent } from "./base-agent";

export class AgentRegistry {
  private agents = new Map<AgentId, BaseAgent>();

  register(agent: BaseAgent): void {
    this.agents.set(agent.id, agent);
  }

  get(id: AgentId): BaseAgent | undefined {
    return this.agents.get(id);
  }

  getAll(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  getByCapability(capability: AgentCapability): BaseAgent[] {
    return this.getAll().filter((a) => a.capabilities.includes(capability));
  }

  getByCapabilities(capabilities: AgentCapability[]): BaseAgent[] {
    return this.getAll().filter((a) => capabilities.some((c) => a.capabilities.includes(c)));
  }

  has(id: AgentId): boolean {
    return this.agents.has(id);
  }

  count(): number {
    return this.agents.size;
  }

  clear(): void {
    this.agents.clear();
  }

  getTeamForComplexity(
    complexity: "simple" | "moderate" | "complex" | "research",
  ): BaseAgent[] {
    switch (complexity) {
      case "simple":
        return this.orderedFetch(["teacher", "knowledge-graph"]);
      case "moderate":
        return this.orderedFetch([
          "research",
          "teacher",
          "knowledge-graph",
          "writing",
        ]);
      case "complex":
        return this.orderedFetch([
          "planning",
          "research",
          "critical-thinking",
          "fact-verification",
          "teacher",
          "knowledge-graph",
          "citation",
          "writing",
          "summarization",
        ]);
      case "research":
        return this.orderedFetch([
          "planning",
          "research",
          "critical-thinking",
          "fact-verification",
          "teacher",
          "knowledge-graph",
          "citation",
          "writing",
          "summarization",
          "report-generation",
        ]);
    }
  }

  private orderedFetch(ids: AgentId[]): BaseAgent[] {
    const result: BaseAgent[] = [];
    for (const id of ids) {
      const agent = this.agents.get(id);
      if (agent) result.push(agent);
    }
    return result;
  }
}

export const agentRegistry = new AgentRegistry();
