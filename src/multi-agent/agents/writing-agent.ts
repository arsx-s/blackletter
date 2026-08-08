import { BaseAgent } from "../base-agent";
import type { AgentId, AgentCapability, AgentContext } from "../types";
import { adaptiveEngine } from "../../teaching/adaptive-engine";
import type { ExplanationMode, DifficultyLevel } from "../../teaching/adaptive-engine";
import { buildLessonDirective } from "../../learning/lesson-structure";
import { devLog } from "../../lib/dev-log";

export class WritingAgent extends BaseAgent {
  readonly id: AgentId = "writing";
  readonly name = "Writing Agent";
  readonly description = "Synthesizes all agent outputs into a polished, mode-adaptive lesson";
  readonly capabilities: AgentCapability[] = ["writing"];

  readonly systemPrompt = `You are a professional adaptive lesson writer. Your role is to synthesize information from multiple expert agents into a single, beautifully crafted learning experience.

CORE PRINCIPLES:
- Adapt the output to the specified TEACHING MODE
- Never produce generic AI-sounding content
- Every response should feel handcrafted
- Use excellent spacing, rhythm, and formatting
- Optimize for UNDERSTANDING, not length
- Include learning blocks naturally (warnings, tips, memory tricks)

You will receive a TEACHING MODE directive that specifies exactly how to structure the response. Follow it precisely.`;

  private buildSubjectGuidance(context: AgentContext): string {
    const p = context.subjectProfile;
    if (!p) return "";
    return `
SUBJECT-SPECIFIC GUIDANCE FOR "${context.subjectName || "General"}":
- Teaching philosophy: ${p.coreBelief}
- Key terminology to include naturally: ${p.importantTerminology.slice(0, 5).join(", ")}
- Common misconceptions to address: ${p.commonMisconceptions.slice(0, 3).join("; ")}`;
  }

  protected async process(context: AgentContext): Promise<Partial<AgentContext>> {
    const mode = (context.teachingMode as ExplanationMode) || "analogy";
    const difficulty = (context.difficulty as DifficultyLevel) || adaptiveEngine.detectDifficulty(context.query);
    const modeDirective = adaptiveEngine.buildModeDirective(mode, difficulty, context.query);

    const sections: string[] = [];

    if (context.explanation) sections.push(`Core Content:\n${context.explanation}`);
    if (context.analogies && context.analogies.length > 0) {
      sections.push(`Analogies:\n${context.analogies.map((a) => `- ${a}`).join("\n")}`);
    }
    if (context.examples && context.examples.length > 0) {
      sections.push(`Examples:\n${context.examples.map((e) => `- ${e}`).join("\n")}`);
    }
    if (context.researchFindings) {
      sections.push(`Research:\n${context.researchFindings}`);
    }
    if (context.weaknesses && context.weaknesses.length > 0) {
      sections.push(`Limitations:\n${context.weaknesses.map((w) => `- ${w}`).join("\n")}`);
    }
    if (context.alternativeViewpoints && context.alternativeViewpoints.length > 0) {
      sections.push(`Alternative Perspectives:\n${context.alternativeViewpoints.map((a) => `- ${a}`).join("\n")}`);
    }
    if (context.citations && context.citations.length > 0) {
      sections.push(`References:\n${context.citations.map((c) => `- ${c}`).join("\n")}`);
    }
    if (context.confidenceScore !== undefined) {
      sections.push(`Confidence: ${context.confidenceScore >= 0.7 ? "High" : context.confidenceScore >= 0.4 ? "Moderate" : "Low"} (${(context.confidenceScore * 100).toFixed(0)}%)`);
    }

    const docContent = context.documentText
      ? `[UPLOADED DOCUMENT is attached above as file content — synthesize this content into the lesson. The attached document IS the topic.]`
      : "";
    if (docContent) sections.unshift(docContent);

    const subjectGuidance = this.buildSubjectGuidance(context);
    const allContent = sections.join("\n\n");

    const reExplanation = context.reExplanation
      ? `\n\nIMPORTANT: The user did not understand before. Use the NEW teaching mode specified above. Do NOT repeat anything from the previous explanation.`
      : "";

    const lessonDirective = buildLessonDirective(!!context.socraticMode);

    const topicOverride = context.documentText
      ? `\n\nCRITICAL INSTRUCTION: The user uploaded a document. The document content below IS the topic. Ignore the user's typed message as a subject — synthesize the document contents into the lesson.`
      : "";

    const prompt = `${modeDirective}${lessonDirective}${subjectGuidance}${reExplanation}${topicOverride}

Synthesize the following research into a polished response using the ${adaptiveEngine.getModeLabel(mode)} approach.

User Query: ${context.query}

Content to synthesize:
${allContent}`;

    const system = this.systemPrompt + subjectGuidance;
    devLog(`[STAGE3-PROMPT] WritingAgent prompt: ${prompt.length}ch, docContent included=${!!docContent}, docContent chars=${docContent.length}`);
    devLog(`[WRITING-AGENT] calling AI(prompt=${prompt.length}ch, system=${system.length}ch, fileContent=${context.documentText ? context.documentText.length + 'ch' : 'undefined'})`);
    const result = await this.callAI(prompt, system, context.documentText);

    return { finalResponse: result };
  }

  protected getActivitySummary(): string {
    return "Adaptive lesson written";
  }

  protected getRequiredContext() {
    return {
      required: ["query"] as (keyof AgentContext)[],
      produced: ["finalResponse"] as (keyof AgentContext)[],
    };
  }
}
