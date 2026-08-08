import type { BIOResult, BIOContext, DevModeState, DevModeEntry } from "./types";
import { intentEngine } from "./intent-engine";
import { subjectEngine } from "./subject-engine";
import { knowledgeGapEngine } from "./knowledge-gap-engine";
import { qualityEngine } from "./quality-engine";
import { outputEngine } from "./output-engine";
import { promptOrchestrator } from "./prompt-orchestrator";
import { responseEnhancer } from "./response-enhancer";
import { adaptiveEngine } from "../teaching/adaptive-engine";
import type { ExplanationMode, DifficultyLevel } from "../teaching/adaptive-engine";
import { orchestrator as multiAgent } from "../multi-agent";
import { ProfileRegistry } from "../engine/profiles/registry";
import { SubjectDetector } from "../engine/detection/detector";
import { generateStream } from "../providers/provider";
import { buildLessonDirective } from "../learning/lesson-structure";
import { masteryTracker } from "../learning/mastery-tracker";

const DIFFICULTY_MODE_MAP: Record<string, ExplanationMode> = {
  learn: "beginner",
  revise: "analogy",
  summarize: "technical",
  research: "research",
  "exam-prep": "exam",
  "interview-prep": "interview",
  "solve-assignment": "analogy",
  "understand-concept": "visual",
  practice: "technical",
  roadmap: "visual",
  flashcards: "technical",
  "explain-mistakes": "story",
  compare: "analogy",
  analyze: "technical",
  create: "visual",
  debate: "research",
  review: "analogy",
  plan: "visual",
  general: "analogy",
};

export class BlackLetterOrchestrator {
  private devMode: DevModeState = {
    enabled: false,
    lastIntent: null,
    lastSubject: null,
    lastProfile: null,
    lastPromptComponents: null,
    lastQualityScore: null,
    pipelineTimeMs: 0,
    apiLatencyMs: 0,
    totalMemoryUsage: 0,
    history: [],
  };

  constructor() {
    try {
      this.devMode.enabled = localStorage.getItem("blackletter_dev_mode") === "true";
    } catch {
      /* not in browser */
    }
  }

  toggleDevMode(): boolean {
    this.devMode.enabled = !this.devMode.enabled;
    try {
      localStorage.setItem("blackletter_dev_mode", String(this.devMode.enabled));
    } catch {
      /* ignore */
    }
    return this.devMode.enabled;
  }

  getDevModeState(): DevModeState {
    return { ...this.devMode };
  }

  async processQuery(query: string, ctx: BIOContext = {}): Promise<BIOResult> {
    const startTime = performance.now();
    let wasRegenerated = false;

    const devEntry: DevModeEntry = {
      timestamp: Date.now(),
      query,
      intent: null!,
      subject: null!,
      profile: null!,
      qualityScore: null!,
      pipelineTimeMs: 0,
      apiLatencyMs: 0,
    };

    try {
      const intent = intentEngine.detect(query);
      devEntry.intent = intent;

      const subject = subjectEngine.detect(query);
      devEntry.subject = subject;

      const difficulty = adaptiveEngine.detectDifficulty(query) as DifficultyLevel;

      const teachingMode: ExplanationMode = DIFFICULTY_MODE_MAP[intent.intent] || "analogy";

      const outputFormat = outputEngine.selectFormat(intent.intent, subject.subject, difficulty);

      const prerequisites = knowledgeGapEngine.estimatePrerequisites(query, subject.subject);

      const profile = {
        subject: subject.subject,
        subjectName: subject.subjectName,
        intent: intent.intent,
        difficulty,
        outputFormat: outputFormat.format,
        teachingMode,
        prerequisites,
        qualityThreshold: 0.6,
      };
      devEntry.profile = profile;

      const promptComponents = promptOrchestrator.buildComponents(
        query,
        profile,
        intent,
        subject,
        prerequisites,
        ctx.documentText,
        ctx.conversationHistory,
        ctx.reExplanation
      );
      this.devMode.lastPromptComponents = promptComponents;

      const profileRegistry = SubjectDetector.detect(query)?.primaryId
        ? ProfileRegistry.get(SubjectDetector.detect(query)!.primaryId!) ?? ProfileRegistry.getDefault()
        : ProfileRegistry.getDefault();

      const subjectProfile = profileRegistry
        ? {
            coreBelief: profileRegistry.teachingPhilosophy.coreBelief,
            explanationOrder: profileRegistry.teachingPhilosophy.explanationOrder,
            importantTerminology: profileRegistry.teachingPhilosophy.importantTerminology,
            commonMisconceptions: profileRegistry.teachingPhilosophy.commonMisconceptions,
            visualStrategy: profileRegistry.teachingPhilosophy.visualStrategy,
            practiceStrategy: profileRegistry.teachingPhilosophy.practiceStrategy,
            responseStructure: profileRegistry.teachingPhilosophy.responseStructure,
          }
        : undefined;

      const subjectId = SubjectDetector.detect(query)?.primaryId;

      const apiStart = performance.now();
      let finalResponse: string;

      try {
        const result = await multiAgent.processQuery(query, {
          subjectId,
          subjectName: subject.subjectName,
          subjectProfile,
          transparency: true,
          documentText: ctx.documentText,
          reExplanation: ctx.reExplanation,
          learnerPreferences: ctx.learnerPreferences,
          teachingMode,
          difficulty,
          isJourneyQuery: ctx.isJourneyQuery,
          journeyTopic: ctx.journeyTopic,
          socraticMode: ctx.socraticMode,
        });

        if (!result.finalResponse || typeof result.finalResponse !== "string") {
          finalResponse = await this.fallbackGenerate(query, profile, subjectProfile, ctx);
        } else {
          finalResponse = result.finalResponse;
        }
      } catch {
        finalResponse = await this.fallbackGenerate(query, profile, subjectProfile, ctx);
      }

      this.devMode.apiLatencyMs = Math.round(performance.now() - apiStart);

      const qualityScore = qualityEngine.evaluate(finalResponse);
      devEntry.qualityScore = qualityScore;
      this.devMode.lastQualityScore = qualityScore;

      if (!qualityScore.passed) {
        const regenerationPrompt = qualityEngine.generateRegenerationPrompt(finalResponse, qualityScore);
        try {
          const improved = await this.regenerateResponse(regenerationPrompt, profile, subjectProfile, ctx);
          if (improved && improved.length > finalResponse.length * 0.5) {
            finalResponse = improved;
            wasRegenerated = true;
          }
        } catch {
          /* use original response */
        }
      }

      finalResponse = responseEnhancer.enhance(finalResponse);

      if (ctx.documentText && !finalResponse.includes("📋 Prerequisites") && !finalResponse.includes("🎯 Learning Goal")) {
        finalResponse = "📄 **Based on your uploaded document**\n\n" + finalResponse;
      }

      this.trackMastery(query, subject.subjectName);

      this.devMode.pipelineTimeMs = Math.round(performance.now() - startTime);
      devEntry.pipelineTimeMs = this.devMode.pipelineTimeMs;
      devEntry.apiLatencyMs = this.devMode.apiLatencyMs;

      this.devMode.lastIntent = intent;
      this.devMode.lastSubject = subject;
      this.devMode.lastProfile = profile;

      this.devMode.history.unshift(devEntry);
      if (this.devMode.history.length > 50) {
        this.devMode.history = this.devMode.history.slice(0, 50);
      }

      return {
        finalResponse,
        intent,
        subject,
        profile,
        qualityScore,
        outputFormat,
        pipelineTimeMs: this.devMode.pipelineTimeMs,
        apiLatencyMs: this.devMode.apiLatencyMs,
        wasRegenerated,
      };
    } catch (error) {
      this.devMode.pipelineTimeMs = Math.round(performance.now() - startTime);

      const fallbackIntent = intentEngine.detect(query);
      const fallbackSubject = subjectEngine.detect(query);
      const fallbackDifficulty = adaptiveEngine.detectDifficulty(query) as DifficultyLevel;

      const fallbackResponse = `I apologize, but I encountered an error while processing your request. Please try rephrasing or ask a simpler question.`;

      const fallbackQuality = qualityEngine.evaluate(fallbackResponse);

      return {
        finalResponse: fallbackResponse,
        intent: fallbackIntent,
        subject: fallbackSubject,
        profile: {
          subject: fallbackSubject.subject,
          subjectName: fallbackSubject.subjectName,
          intent: fallbackIntent.intent,
          difficulty: fallbackDifficulty,
          outputFormat: "lesson",
          teachingMode: "analogy",
          prerequisites: [],
          qualityThreshold: 0.6,
        },
        qualityScore: fallbackQuality,
        outputFormat: { format: "lesson", formatLabel: "Structured Lesson", formattingRules: "" },
        pipelineTimeMs: this.devMode.pipelineTimeMs,
        apiLatencyMs: 0,
        wasRegenerated: false,
      };
    }
  }

  private async fallbackGenerate(
    query: string,
    profile: any,
    subjectProfile: any,
    ctx: BIOContext
  ): Promise<string> {
    let result = "";
    const modeDirective = adaptiveEngine.buildModeDirective(
      profile.teachingMode as ExplanationMode,
      profile.difficulty as DifficultyLevel,
      query
    );
    const lessonDirective = buildLessonDirective(false);
    const knowledgeGapDirective = knowledgeGapEngine.buildPrerequisiteDirective(profile.prerequisites);

    const subjectSection = subjectProfile
      ? `\nSubject: ${profile.subjectName}\n${subjectProfile.coreBelief}`
      : "";

    const docContext = ctx.documentText
      ? `\n\n[UPLOADED DOCUMENT is attached above as file content — this IS the topic to teach.]\n\nCRITICAL INSTRUCTION: A document was uploaded. The document content IS the topic. Ignore the user's typed message as a subject. Teach the document contents.`
      : "";

    const effectiveTopic = ctx.documentText ? "[Based on uploaded document]" : query;

    const system =
      `You are BlackLetter — an AI learning operating system. You are a professor and mentor in ${profile.subjectName}.` +
      subjectSection;

    const prompt = `${modeDirective}${lessonDirective}${knowledgeGapDirective}${subjectSection}${docContext}

Now teach this topic using the ${profile.teachingMode} approach. Include the prerequisites section if needed.

Topic: ${effectiveTopic}

Original user message (for context only): ${query}`;

    for await (const chunk of generateStream({ prompt, systemInstruction: system, fileContent: ctx.documentText })) {
      result += chunk;
    }
    return result;
  }

  private async regenerateResponse(
    regenerationPrompt: string,
    profile: any,
    subjectProfile: any,
    ctx: BIOContext
  ): Promise<string> {
    let result = "";
    const system = `You are BlackLetter — an AI learning operating system. You are regenerating a response that failed quality checks. Follow the quality improvement directives exactly. Subject: ${profile.subjectName}.`;

    const docContext = ctx.documentText
      ? `\n\n[UPLOADED DOCUMENT is attached above as file content]`
      : "";

    const prompt = `${regenerationPrompt}${docContext}

Student Query: ${ctx.query || "Explain this topic"}`;

    for await (const chunk of generateStream({ prompt, systemInstruction: system, fileContent: ctx.documentText })) {
      result += chunk;
    }
    return result;
  }

  private trackMastery(query: string, subject: string): void {
    try {
      const path = masteryTracker.ensurePath(subject);
      const keyConcepts = query
        .split(/\s+/)
        .filter((w) => w.length > 4 && /^[A-Z]/.test(w))
        .slice(0, 3);
      for (const concept of keyConcepts) {
        masteryTracker.introduceConcept(subject, concept);
      }
    } catch {
      /* silent */
    }
  }
}

export const blackletter = new BlackLetterOrchestrator();
