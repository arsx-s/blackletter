import { BaseAgent } from "../base-agent";
import type { AgentId, AgentCapability, AgentContext } from "../types";

export class FactVerificationAgent extends BaseAgent {
  readonly id: AgentId = "fact-verification";
  readonly name = "Fact Verification Agent";
  readonly description = "Checks consistency, identifies unsupported claims, and assesses confidence";
  readonly capabilities: AgentCapability[] = ["fact-checking"];
  readonly systemPrompt = `You are a fact-checking and verification specialist. Your role is to assess the reliability and accuracy of information.

For any content, evaluate:

1. CONSISTENCY — Does the information contradict itself?
2. UNSUPPORTED CLAIMS — Which claims lack evidence or support?
3. HALLUCINATION RISKS — Which statements seem speculative or unreliable?
4. SOURCE QUALITY — Assess the apparent quality of sources or reasoning
5. CONFIDENCE SCORE — Rate overall confidence from 0.0 to 1.0

Be conservative. Flag anything uncertain. Better to flag a true claim than to miss a false one.

Output format:
CONSISTENCY: [assessment]

UNSUPPORTED CLAIMS:
- [Claim 1] — why unsupported

CONTRADICTIONS:
- [Contradiction 1]

HALLUCINATION RISKS:
- [Risk 1]

SOURCE QUALITY: [assessment]

CONFIDENCE: [0.0-1.0]`;

  protected async process(context: AgentContext): Promise<Partial<AgentContext>> {
    const researchAvailable = context.researchFindings
      ? `\n\nResearch findings:\n${context.researchFindings}`
      : "";
    const analysisAvailable = context.weaknesses
      ? `\n\nCritical analysis identified these weaknesses:\n${context.weaknesses.join("\n")}`
      : "";
    const docContext = context.documentText
      ? `\n\nThe user uploaded a document. Fact-check this content:\n\n${context.documentText}`
      : "";
    const prompt = `Fact-check and verify the following:\n\nQuery: ${context.query}${researchAvailable}${analysisAvailable}${docContext}`;
    const result = await this.callAI(prompt, undefined, context.documentText);

    const confidenceMatch = result.match(/CONFIDENCE:\s*([0-9.]+)/);
    const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : undefined;
    const passed =
      confidence !== undefined ? confidence >= 0.5 : undefined;

    return {
      factCheckPassed: passed,
      unsupportedClaims: this.extractBullets(result, "UNSUPPORTED CLAIMS"),
      contradictions: this.extractBullets(result, "CONTRADICTIONS"),
      hallucinationRisks: this.extractBullets(result, "HALLUCINATION RISKS"),
      confidenceScore: confidence,
      sourceQuality: this.extractLine(result, "SOURCE QUALITY"),
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

  private extractLine(text: string, sectionName: string): string | undefined {
    const match = text.match(new RegExp(`${sectionName}:\\s*(.+)$`, "m"));
    return match ? match[1].trim() : undefined;
  }

  protected getActivitySummary(updates: Partial<AgentContext>): string {
    const score = updates.confidenceScore;
    return score !== undefined
      ? `Confidence: ${(score * 100).toFixed(0)}%`
      : "Verification complete";
  }

  protected getRequiredContext() {
    return {
      required: ["query", "researchFindings"] as (keyof AgentContext)[],
      produced: ["factCheckPassed", "unsupportedClaims", "confidenceScore"] as (keyof AgentContext)[],
    };
  }
}
