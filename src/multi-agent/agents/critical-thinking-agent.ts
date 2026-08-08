import { BaseAgent } from "../base-agent";
import type { AgentId, AgentCapability, AgentContext } from "../types";

export class CriticalThinkingAgent extends BaseAgent {
  readonly id: AgentId = "critical-thinking";
  readonly name = "Critical Thinking Agent";
  readonly description = "Questions assumptions, finds logical weaknesses, and identifies alternative viewpoints";
  readonly capabilities: AgentCapability[] = ["critical-analysis"];
  readonly systemPrompt = `You are a critical thinking and analysis specialist. Your role is to rigorously examine information.

For any query or research findings, identify:

1. ASSUMPTIONS — What unstated assumptions are being made?
2. LOGICAL WEAKNESSES — Are there gaps or flaws in reasoning?
3. ALTERNATIVE VIEWPOINTS — What other perspectives exist?
4. BIAS — What biases might be present (confirmation bias, selection bias, etc.)?
5. MISSING EVIDENCE — What evidence would strengthen or challenge the conclusions?
6. COUNTERARGUMENTS — What are the strongest counterarguments?

Be precise and constructive. Focus on strengthening understanding, not just criticizing.

Output format:
ASSUMPTIONS:
- [Assumption 1]
- [Assumption 2]

WEAKNESSES:
- [Weakness 1]

ALTERNATIVES:
- [Alternative viewpoint 1]

BIAS:
- [Potential bias 1]

MISSING EVIDENCE:
- [Missing evidence 1]

COUNTERARGUMENTS:
- [Counterargument 1]`;

  protected async process(context: AgentContext): Promise<Partial<AgentContext>> {
    const researchAvailable = context.researchFindings
      ? `\n\nResearch findings to analyze:\n${context.researchFindings}`
      : "";
    const docContext = context.documentText
      ? `\n\nThe user uploaded a document. Critically analyze this content:\n\n${context.documentText}`
      : "";
    const prompt = `Critically analyze the following:\n\nQuery: ${context.query}${researchAvailable}${docContext}`;
    const result = await this.callAI(prompt, undefined, context.documentText);

    return {
      researchFindings: context.researchFindings,
      assumptions: this.extractBullets(result, "ASSUMPTIONS"),
      weaknesses: this.extractBullets(result, "WEAKNESSES"),
      alternativeViewpoints: this.extractBullets(result, "ALTERNATIVES"),
      biases: this.extractBullets(result, "BIAS"),
      missingEvidence: this.extractBullets(result, "MISSING EVIDENCE"),
      counterarguments: this.extractBullets(result, "COUNTERARGUMENTS"),
    };
  }

  private extractBullets(text: string, sectionName: string): string[] {
    const match = text.match(new RegExp(`${sectionName}:\\s*\\n?([\\s\\S]*?)(?:\\n\\n[A-Z]+:|$)`));
    if (!match) return [];
    return match[1]
      .split("\n")
      .filter((l) => l.match(/^- /))
      .map((l) => l.replace(/^- /, "").trim());
  }

  protected getActivitySummary(): string {
    return "Critical analysis complete";
  }

  protected getRequiredContext() {
    return { required: ["query"] as (keyof AgentContext)[], produced: ["assumptions", "weaknesses", "alternativeViewpoints", "biases"] as (keyof AgentContext)[] };
  }
}
