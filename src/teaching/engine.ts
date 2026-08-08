import { SubjectDetector } from "../engine/detection/detector";
import { ProfileRegistry } from "../engine/profiles/registry";
import { generateStream } from "../providers/provider";
import { TeachingModeRegistry } from "./modes/registry";
import { ResponseStructureBuilder } from "./pipeline/response-structure";
import { VisualThinkingEngine } from "./pipeline/visual-engine";
import type { TeachingModeId, TeachingRequest, TeachingResponse } from "./types";

export class TeachingEngine {
  private subjectDetector = SubjectDetector;
  private profileRegistry = ProfileRegistry;
  private modeRegistry = TeachingModeRegistry;
  private responseStructureBuilder = new ResponseStructureBuilder();
  private visualEngine = new VisualThinkingEngine();

  private buildSystemPrompt(request: TeachingRequest): string {
    const classification = request.subjectClassification ?? this.subjectDetector.detect(request.query);
    const profile = request.subjectProfile ?? this.profileRegistry.get(classification.primaryId) ?? this.profileRegistry.getDefault();
    const mode = this.modeRegistry.get(request.modeId) ?? this.modeRegistry.getDefault();
    const p = profile.teachingPhilosophy;

    const sections: string[] = [
      `You are BlackLetter's Teaching Engine — not a chatbot, not a search engine, not a content generator. You are a teaching system with one purpose: to make people genuinely understand difficult ideas.`,

      `You are an expert in ${profile.name}, and you are teaching through the "${mode.name}" mode.`,
      ``,
      `## TEACHING MODE: ${mode.name.toUpperCase()}`,
      mode.instructions.openingDirective,
      ``,
      `### Your Role`,
      mode.instructions.role,
      ``,
      `### Core Principles`,
      mode.instructions.corePrinciples.map((pr, i) => `${i + 1}. ${pr}`).join("\n"),
      ``,
      `### Reasoning Approach`,
      mode.instructions.reasoningApproach,
      ``,
      `### Knowledge Assumptions`,
      mode.instructions.knowledgeAssumptions,
      ``,
      `### Language Style`,
      mode.instructions.languageStyle,
      ``,
      `### Depth Level`,
      `${mode.instructions.depthLevel}/5 — ${this.describeDepth(mode.instructions.depthLevel)}`,
      ``,
      `### Pacing`,
      mode.instructions.pacing,
      ``,
      `### Focus Areas`,
      mode.instructions.focusAreas.map((f, i) => `${i + 1}. ${f}`).join("\n"),
      ``,
      `### Prohibitions`,
      mode.instructions.prohibitions.map((pr) => `- ${pr}`).join("\n"),
      ``,
      `### Example Style`,
      mode.instructions.exampleStyle,
      ``,
    ];

    sections.push(`## SUBJECT PROFILE: ${profile.name}`);
    sections.push(``);
    sections.push(`Subject: ${classification.primary}${classification.subdiscipline ? ` > ${classification.subdiscipline}` : ""}`);
    sections.push(`Confidence: ${Math.round(classification.confidence * 100)}%`);
    sections.push(``);
    sections.push(`### Teaching Philosophy`);
    sections.push(p.coreBelief);
    sections.push(``);

    if (p.explanationOrder.length > 0) {
      sections.push(`### Explanation Order`);
      sections.push(p.explanationOrder.map((e, i) => `${i + 1}. ${e}`).join("\n"));
      sections.push(``);
    }

    if (p.importantTerminology.length > 0) {
      sections.push(`### Key Terminology`);
      sections.push(p.importantTerminology.map((t) => `- ${t}`).join("\n"));
      sections.push(``);
    }

    if (p.commonMisconceptions.length > 0) {
      sections.push(`### Subject Misconceptions`);
      sections.push(p.commonMisconceptions.map((m) => `- ${m}`).join("\n"));
      sections.push(``);
    }

    if (p.difficultyProgression.length > 0) {
      sections.push(`### Difficulty Progression`);
      sections.push(p.difficultyProgression.map((d, i) => `${i + 1}. ${d}`).join("\n"));
      sections.push(``);
    }

    const structureDirective = this.responseStructureBuilder.buildDirective(
      mode.responseStructure,
      mode.visualPreferences,
      mode.understandingCheck,
    );
    sections.push(structureDirective);

    const visualDirective = this.visualEngine.buildInstruction(mode.visualPreferences);
    if (visualDirective) {
      sections.push(visualDirective);
    }

    sections.push(`## BLACKLETTER DESIGN PRINCIPLES`);
    sections.push(`- Never produce information dumps`);
    sections.push(`- Never sound robotic`);
    sections.push(`- Never copy textbook language`);
    sections.push(`- Never write Wikipedia-style explanations`);
    sections.push(`- Teach naturally`);
    sections.push(`- Teach progressively`);
    sections.push(`- Teach beautifully`);
    sections.push(``);
    sections.push(`Every response must feel like sitting with one of the world's best professors — someone who loves their subject and loves helping others understand it.`);

    if (request.documents && request.documents.length > 0) {
      sections.push(``);
      sections.push(`## UPLOADED DOCUMENTS`);
      sections.push(`The learner has provided the following source material. Integrate insights from these documents into your teaching:`);
      request.documents.forEach((doc, i) => {
        sections.push(``);
        sections.push(`### Document ${i + 1}`);
        sections.push(doc.slice(0, 4000));
      });
    }

    if (request.previousMessages && request.previousMessages.length > 0) {
      sections.push(``);
      sections.push(`## RECENT CONVERSATION`);
      const recent = request.previousMessages.slice(-8);
      recent.forEach((m) => {
        const label = m.role === "user" ? "Learner" : "You";
        sections.push(`${label}: ${m.content.slice(0, 500)}`);
      });
    }

    return sections.join("\n");
  }

  async teach(request: TeachingRequest, onChunk?: (chunk: string) => void): Promise<TeachingResponse> {
    const classification = request.subjectClassification ?? this.subjectDetector.detect(request.query);
    const profile = request.subjectProfile ?? this.profileRegistry.get(classification.primaryId) ?? this.profileRegistry.getDefault();
    const mode = this.modeRegistry.get(request.modeId) ?? this.modeRegistry.getDefault();

    const systemPrompt = this.buildSystemPrompt({
      ...request,
      subjectClassification: classification,
      subjectProfile: profile,
    });

    const docText = request.documents?.length
      ? request.documents.join("\n\n---\n\n")
      : undefined;

    let fullText = "";

    for await (const chunk of generateStream({ prompt: request.query, systemInstruction: systemPrompt, fileContent: docText })) {
      fullText += chunk;
      onChunk?.(chunk);
    }

    return {
      query: request.query,
      modeId: mode.id,
      subjectName: profile.name,
      subjectId: profile.id,
      fullText,
    };
  }

  getMode(modeId: TeachingModeId) {
    return this.modeRegistry.get(modeId);
  }

  getAllModes() {
    return this.modeRegistry.getAll();
  }

  getDefaultMode() {
    return this.modeRegistry.getDefault();
  }

  private describeDepth(level: number): string {
    const descriptions: Record<number, string> = {
      1: "Beginner — foundational concepts, simple language, no prerequisites",
      2: "Intermediate — assumes some familiarity, introduces standard terminology",
      3: "Advanced — assumes solid foundation, covers nuanced understanding",
      4: "Expert — assumes deep knowledge, explores edge cases and research frontiers",
      5: "Research — graduate-level depth, examines open questions and debates",
    };
    return descriptions[level] || "General understanding level";
  }
}
