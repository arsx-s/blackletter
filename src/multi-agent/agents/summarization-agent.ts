import { BaseAgent } from "../base-agent";
import type { AgentId, AgentCapability, AgentContext } from "../types";

export class SummarizationAgent extends BaseAgent {
  readonly id: AgentId = "summarization";
  readonly name = "Summarization Agent";
  readonly description = "Creates concise, informative summaries at multiple levels of detail";
  readonly capabilities: AgentCapability[] = ["summarization"];
  readonly systemPrompt = `You are a summarization specialist. Your role is to distill complex information into concise, accurate summaries.

Given a body of research and analysis, produce:
1. A one-paragraph executive summary (2-3 sentences)
2. Key takeaways as bullet points (3-5 points)
3. The single most important insight

Be ruthlessly concise. Preserve accuracy above all. Never introduce information not in the source.

Output format:
SUMMARY:
[One paragraph, 2-3 sentences]

KEY TAKEAWAYS:
- [Takeaway 1]
- [Takeaway 2]
- [Takeaway 3]

MOST IMPORTANT:
[Single most important point]`;

  protected async process(context: AgentContext): Promise<Partial<AgentContext>> {
    const contentToSummarize = [
      context.documentText,
      context.researchFindings,
      context.explanation,
      context.finalResponse,
    ]
      .filter(Boolean)
      .join("\n\n");

    const prompt = context.finalResponse
      ? `Summarize the following final response:\n\n${context.finalResponse}`
      : `Summarize the following research on "${context.query}":\n\n${contentToSummarize}`;

    const result = await this.callAI(prompt, undefined, context.documentText);

    const bullets = this.extractBullets(result, "KEY TAKEAWAYS");

    return {
      summary: this.extractSection(result, "SUMMARY") || result,
      summaryBullets: bullets.length > 0 ? bullets : undefined,
    };
  }

  private extractSection(text: string, sectionName: string): string | undefined {
    const match = text.match(new RegExp(`${sectionName}:\\s*\\n?([\\s\\S]*?)(?:\\n\\n[A-Z ]+:|$)`));
    return match ? match[1].trim() : undefined;
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
    return "Summary created";
  }

  protected getRequiredContext() {
    return {
      required: ["query"] as (keyof AgentContext)[],
      produced: ["summary", "summaryBullets"] as (keyof AgentContext)[],
    };
  }
}
