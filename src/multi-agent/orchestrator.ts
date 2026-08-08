import { AgentRegistry, agentRegistry } from "./registry";
import type {
  AgentContext,
  AgentResult,
  OrchestratorResult,
  QueryComplexity,
  AgentId,
} from "./types";
import { devLog } from "../lib/dev-log";

const COMPLEXITY_PATTERNS: Record<
  QueryComplexity,
  { minWords: number; signals: RegExp[] }
> = {
  simple: { minWords: 0, signals: [/^(what|who|when|where)\s/i, /^(hi|hello|hey)\b/i] },
  moderate: { minWords: 0, signals: [/^(how|why)\s/i, /explain/i, /describe/i] },
  complex: { minWords: 15, signals: [/analyze/i, /compare/i, /evaluate/i, /contrast/i, /discuss/i] },
  research: { minWords: 0, signals: [/research/i, /investigate/i, /literature review/i, /paper on/i, /report on/i] },
};

function analyzeComplexity(query: string): QueryComplexity {
  const wordCount = query.split(/\s+/).length;

  for (const [level, config] of Object.entries(COMPLEXITY_PATTERNS).reverse()) {
    if (level === "simple") continue;
    const c = config as typeof COMPLEXITY_PATTERNS["complex"];
    if (c.signals.some((s) => s.test(query)) && wordCount >= c.minWords) {
      return level as QueryComplexity;
    }
  }

  if (wordCount >= 12) return "complex";
  if (wordCount >= 5) return "moderate";
  return "simple";
}

function createContext(
  query: string,
  overrides?: Partial<AgentContext>,
): AgentContext {
  return {
    query,
    activityLog: [],
    transparency: overrides?.transparency ?? true,
    ...overrides,
  };
}

export class Orchestrator {
  private registry: AgentRegistry;

  constructor(registry?: AgentRegistry) {
    this.registry = registry ?? agentRegistry;
  }

  getRegistry(): AgentRegistry {
    return this.registry;
  }

  async processQuery(
    query: string,
    overrides?: Partial<AgentContext>,
  ): Promise<OrchestratorResult> {
    const startTime = performance.now();
    const context = createContext(query, overrides);
    const complexity = overrides?.researchFindings
      ? "complex"
      : analyzeComplexity(query);

    const team = this.registry.getTeamForComplexity(complexity);

    if (context.transparency) {
      devLog(
        `[Orchestrator] Complexity: ${complexity}, Team: ${team.map((a) => a.name).join(", ")}`,
      );
    }

    const phaseSchedule = this.buildPhaseSchedule(complexity);

    const teamIds = new Set(team.map((t) => t.id));

    for (const phase of phaseSchedule) {
      const phaseAgents = phase
        .filter((id) => teamIds.has(id))
        .map((id) => this.registry.get(id))
        .filter((a): a is NonNullable<typeof a> => a !== undefined);

      if (phaseAgents.length === 0) continue;

      const results = await Promise.all(
        phaseAgents.map((agent) => agent.execute(context)),
      );

      for (const result of results) {
        this.applyResult(context, result);
      }
    }

    const elapsed = performance.now() - startTime;

    const successfulAgents = context.activityLog.filter(
      (a) => a.status === "success",
    ).length;
    const failedAgents = context.activityLog.filter(
      (a) => a.status === "error",
    ).length;

    const finalResponse = context.finalResponse;
    if (!finalResponse || typeof finalResponse !== "string" || finalResponse.length === 0) {
      const errors = context.activityLog
        .filter((a) => a.status === "error")
        .map((a) => `${a.agentName}: ${a.summary || "unknown reason"}`);
      const errorSummary = errors.length > 0
        ? `All agents failed: ${errors.join("; ")}`
        : "No agent produced a finalResponse. The pipeline produced zero output.";
      console.error(`[Orchestrator] ${errorSummary}`);
    }

    return {
      finalResponse: finalResponse ?? "",
      activityLog: context.activityLog,
      complexity,
      agentCount: context.activityLog.length,
      successfulAgents,
      failedAgents,
      processingTimeMs: Math.round(elapsed),
    };
  }

  private buildPhaseSchedule(complexity: QueryComplexity): AgentId[][] {
    if (complexity === "simple") {
      return [["teacher"], ["knowledge-graph"]];
    }

    if (complexity === "moderate") {
      return [
        ["research"],
        ["teacher"],
        ["knowledge-graph"],
        ["writing"],
      ];
    }

    return [
      ["planning"],
      ["research"],
      ["critical-thinking", "citation", "knowledge-graph"],
      ["fact-verification"],
      ["teacher"],
      ["writing"],
      ["summarization", "report-generation"],
    ];
  }

  private applyResult(context: AgentContext, result: AgentResult): void {
    if (!result.success) {
      console.warn(`[Orchestrator] Agent ${result.agentId} failed: ${result.error}`);
      return;
    }
    Object.assign(context, result.contextUpdates);
  }

  getComplexity(query: string): QueryComplexity {
    return analyzeComplexity(query);
  }
}

export const orchestrator = new Orchestrator();
