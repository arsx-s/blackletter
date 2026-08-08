import { BaseAgent } from "../base-agent";
import type { AgentId, AgentCapability, AgentContext } from "../types";

export class ResearchAgent extends BaseAgent {
  readonly id: AgentId = "research";
  readonly name = "Research Agent";
  readonly description = "Finds information, identifies key concepts and terminology, builds context";
  readonly capabilities: AgentCapability[] = ["research"];
  readonly systemPrompt = `You are a research specialist. Your job is to gather comprehensive information and identify the most important concepts.

For any query, produce:
1. A thorough explanation of the topic with key facts
2. Key concepts and their definitions
3. Important terminology and jargon
4. Context and background information
5. Research direction — what to explore next

Be thorough but precise. Focus on accuracy over breadth.

Output format:
FINDINGS:
[Detailed research findings]

KEY CONCEPTS:
- [Concept 1]: [Brief definition]
- [Concept 2]: [Brief definition]

TERMINOLOGY:
- [Term 1]: [Definition]
- [Term 2]: [Definition]

CONTEXT:
[Broader context and background]

DIRECTION:
[Suggested research direction]`;

  protected async process(context: AgentContext): Promise<Partial<AgentContext>> {
    const planContext = context.plan ? `\n\nResearch plan to follow:\n${context.plan}` : "";
    const docDirective = context.documentText
      ? `\n\n[UPLOADED DOCUMENT is attached above as file content — analyze it thoroughly instead of researching general knowledge. The attached document IS the topic.]`
      : "";
    const prompt = `Research the following topic thoroughly:\n\n${context.query}${planContext}${docDirective}`;
    const result = await this.callAI(prompt, undefined, context.documentText);

    const concepts: string[] = [];
    const terms: string[] = [];
    const lines = result.split("\n");
    let section = "";

    for (const line of lines) {
      if (line.match(/^KEY CONCEPTS:/i)) section = "concepts";
      else if (line.match(/^TERMINOLOGY:/i)) section = "terms";
      else if (line.match(/^CONTEXT:/i)) section = "context";
      else if (line.match(/^DIRECTION:/i)) section = "direction";
      else if (line.match(/^FINDINGS:/i)) section = "findings";
      else if (section === "concepts" && line.match(/^- /)) concepts.push(line.replace(/^- /, "").trim());
      else if (section === "terms" && line.match(/^- /)) terms.push(line.replace(/^- /, "").trim());
    }

    return {
      researchFindings: result,
      keyConcepts: concepts.length > 0 ? concepts : undefined,
      terminology: terms.length > 0 ? terms : undefined,
      researchDirection: this.extractSection(result, "DIRECTION"),
      researchContext: this.extractSection(result, "CONTEXT"),
    };
  }

  private extractSection(text: string, sectionName: string): string | undefined {
    const match = text.match(new RegExp(`${sectionName}:\\s*\\n?([\\s\\S]*?)(?:\\n\\n[A-Z]+:|$)`));
    return match ? match[1].trim() : undefined;
  }

  protected getActivitySummary(): string {
    return "Key concepts and context identified";
  }

  protected getRequiredContext() {
    return { required: ["query"] as (keyof AgentContext)[], produced: ["researchFindings", "keyConcepts", "terminology"] as (keyof AgentContext)[] };
  }
}
