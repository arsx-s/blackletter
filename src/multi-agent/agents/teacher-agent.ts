import { BaseAgent } from "../base-agent";
import type { AgentId, AgentCapability, AgentContext } from "../types";
import { adaptiveEngine } from "../../teaching/adaptive-engine";
import type { ExplanationMode, DifficultyLevel } from "../../teaching/adaptive-engine";
import { buildLessonDirective } from "../../learning/lesson-structure";
import { devLog } from "../../lib/dev-log";

export class TeacherAgent extends BaseAgent {
  readonly id: AgentId = "teacher";
  readonly name = "Teacher Agent";
  readonly description = "Teaches any topic using 8 adaptive explanation modes, with automatic difficulty detection and mode cycling";
  readonly capabilities: AgentCapability[] = ["teaching"];

  readonly systemPrompt = `You are a world-class adaptive professor. Your single mission is to ensure the student truly understands — no matter what it takes.

CORE PRINCIPLES:
- Never optimize for length. Optimize for understanding.
- If the student does not understand, you have failed.
- Adapt your teaching style to each student and situation.
- Never repeat the same explanation twice.
- Be thoughtful, calm, professional, and highly educational.
- Never sound robotic, generic, or like an AI chatbot.

You will receive a TEACHING MODE directive. Follow its rules and output structure EXACTLY.`;

  private buildSubjectSection(context: AgentContext): string {
    const p = context.subjectProfile;
    if (!p) return "";
    return `
SUBJECT: ${context.subjectName || "General"}

TEACHING PHILOSOPHY FOR THIS SUBJECT:
${p.coreBelief}

EXPLANATION ORDER FOR THIS SUBJECT:
${p.explanationOrder.map((e, i) => `${i + 1}. ${e}`).join("\n")}

KEY TERMINOLOGY:
${p.importantTerminology.map((t) => `- ${t}`).join("\n")}

COMMON MISCONCEPTIONS IN THIS SUBJECT:
${p.commonMisconceptions.map((m) => `- ${m}`).join("\n")}

VISUAL STRATEGY:
${p.visualStrategy}

PRACTICE STRATEGY:
${p.practiceStrategy}`;
  }

  protected async process(context: AgentContext): Promise<Partial<AgentContext>> {
    const mode = (context.teachingMode as ExplanationMode) || "analogy";
    const difficulty = (context.difficulty as DifficultyLevel) || adaptiveEngine.detectDifficulty(context.query);
    const modeDirective = adaptiveEngine.buildModeDirective(mode, difficulty, context.query);

    if (context.documentText) {
      devLog(`[TeacherAgent] Document received: ${context.documentText.length} chars`);
    }

    const subjectSection = this.buildSubjectSection(context);

    const researchAvailable = context.researchFindings
      ? `\n\nRESEARCH CONTEXT:\n${context.researchFindings}`
      : "";

    const criticalContext =
      context.assumptions || context.counterarguments
        ? `\n\nCRITICAL PERSPECTIVES TO INCLUDE:\n${[
            ...(context.assumptions?.map((a) => `Assumption: ${a}`) ?? []),
            ...(context.counterarguments?.map((c) => `Counterargument: ${c}`) ?? []),
          ].join("\n")}`
      : "";

    const factNote =
      context.confidenceScore !== undefined
        ? `\n\nCONFIDENCE LEVEL: ${context.confidenceScore >= 0.7 ? "High" : context.confidenceScore >= 0.4 ? "Moderate" : "Low"}`
        : "";

    const docContext = context.documentText
      ? `\n\n[UPLOADED DOCUMENT is attached above as file content — teach this content using the specified mode. The attached document IS the topic.]`
      : "";

    const reExplanation = context.reExplanation
      ? `\n\nIMPORTANT: The user did not understand the previous explanation. Generate an ENTIRELY NEW explanation using the teaching mode specified above. Do NOT repeat anything from before.`
      : "";

    const lessonDirective = buildLessonDirective(!!context.socraticMode);

    const effectiveTopic = context.documentText
      ? `[Based on the uploaded document]`
      : context.query;

    const topicOverride = context.documentText
      ? `\n\nCRITICAL INSTRUCTION: The user has uploaded a document. The document IS the topic. Ignore the user's typed message as a topic — the document content is what you must teach. Focus all explanation on the document contents above.`
      : "";

    const prompt = `${modeDirective}${lessonDirective}${subjectSection}${researchAvailable}${criticalContext}${factNote}${docContext}${reExplanation}${topicOverride}

Now teach this topic using the ${adaptiveEngine.getModeLabel(mode)} approach:

Topic: ${effectiveTopic}`;

    devLog(`[STAGE3-PROMPT] TeacherAgent prompt: ${prompt.length}ch, includes docText=${!!context.documentText}, docText chars in prompt=${context.documentText ? context.documentText.length : 0}`);
    devLog(`[STAGE3-PROMPT] TeacherAgent effectiveTopic="${effectiveTopic}", topicOverride="${topicOverride ? 'SET' : 'NOT SET'}"`);

    const system = this.systemPrompt + subjectSection;
    devLog(`[TEACHER-AGENT] calling AI(prompt=${prompt.length}ch, system=${system.length}ch, fileContent=${context.documentText ? context.documentText.length + 'ch' : 'undefined'})`);
    const result = await this.callAI(prompt, system, context.documentText);

    return {
      explanation: this.extractSection(result, this.getSectionName(mode)) || result,
      examples: this.extractBullets(result, "WORKED EXAMPLE") || this.extractBullets(result, "PRACTICE") || this.extractBullets(result, "MAPPING"),
      analogies: this.extractBullets(result, "INTUITION") || this.extractBullets(result, "THE ANALOGY"),
      learningProgression: this.extractSection(result, "BIG PICTURE") || this.extractSection(result, "VISUAL OVERVIEW") || this.extractSection(result, "THE PROBLEM"),
      researchFindings: context.researchFindings,
    };
  }

  private getSectionName(mode: ExplanationMode): string {
    switch (mode) {
      case "visual": return "DIAGRAM DESCRIPTION";
      case "story": return "THE RESOLUTION";
      case "analogy": return "REAL TERMS";
      case "technical": return "FORMAL DEFINITION";
      case "beginner": return "WHAT IS THIS";
      case "exam": return "KEY DEFINITIONS";
      case "interview": return "WHY THIS MATTERS IN INDUSTRY";
      case "research": return "OVERVIEW OF THE FIELD";
    }
  }

  private extractSection(text: string, sectionName: string): string | undefined {
    const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`${escaped}:\\s*\\n?([\\s\\S]*?)(?:\\n\\n[A-Z ]+:|\n━━|$)`));
    return match ? match[1].trim() : undefined;
  }

  private extractBullets(text: string, sectionName: string): string[] {
    const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`${escaped}:\\s*\\n?([\\s\\S]*?)(?:\\n\\n[A-Z]+:|$)`));
    if (!match) return [];
    return match[1]
      .split("\n")
      .filter((l) => l.match(/^- /) || l.match(/^\d+\. /))
      .map((l) => l.replace(/^[-•*\d]+\.\s*/, "").trim());
  }

  protected getActivitySummary(): string {
    return "Adaptive lesson prepared";
  }

  protected getRequiredContext() {
    return {
      required: ["query"] as (keyof AgentContext)[],
      produced: ["explanation", "examples", "analogies"] as (keyof AgentContext)[],
    };
  }
}
