import { SubjectDetector } from "../engine/detection/detector";
import { ProfileRegistry } from "../engine/profiles/registry";
import { TeachingEngine } from "../teaching/engine";
import { TeachingModeRegistry } from "../teaching/modes/registry";
import { KnowledgeGraph } from "./graph/knowledge-graph";
import { SessionStore } from "./graph/session-store";
import { LearningPathEngine } from "./path/learning-path";
import { TopicBreakdownEngine } from "./path/topic-breakdown";
import { PrerequisiteDetector } from "./path/prerequisite-detector";
import { ProgressionTracker } from "./progression/progression-tracker";
import { SmartContinuationGenerator } from "./progression/smart-continuations";
import { MultiDisciplineConnector } from "./connections/discipline-connector";
import { MicrolessonGenerator } from "./connections/microlesson";
import type {
  ArchitectResponse,
  ArchitectConfig,
  LearningEvent,
  ConceptNode,
  Tier,
} from "./types";

export class LearningArchitect {
  private subjectDetector = SubjectDetector;
  private profileRegistry = ProfileRegistry;
  private teachingEngine = new TeachingEngine();
  private modeRegistry = TeachingModeRegistry;
  private sessionStore: SessionStore;
  private learningPathEngine = new LearningPathEngine();
  private topicBreakdown = new TopicBreakdownEngine();
  private prerequisiteDetector = new PrerequisiteDetector();
  private progressionTracker = new ProgressionTracker();
  private continuationGenerator = new SmartContinuationGenerator();
  private disciplineConnector = new MultiDisciplineConnector();
  private microlessonGenerator = new MicrolessonGenerator();

  private graph: KnowledgeGraph | null = null;

  constructor() {
    this.sessionStore = new SessionStore();
  }

  async learn(
    query: string,
    config: ArchitectConfig,
  ): Promise<ArchitectResponse> {
    const classification = this.subjectDetector.detect(query);
    const profile = this.profileRegistry.get(classification.primaryId)
      ?? this.profileRegistry.getDefault();
    const mode = this.modeRegistry.get(config.modeId)
      ?? this.modeRegistry.getDefault();

    const session = this.sessionStore.getOrCreateSession(
      profile.id,
      profile.name,
      config.modeId,
      config.sessionId,
    );

    this.graph = this.sessionStore.getGraph(session.sessionId)
      ?? new KnowledgeGraph(profile.id, classification.primary);

    const detectedConcepts = this.topicBreakdown.breakdown(query, profile);
    const detectedTier = config.modeId === "exam-preparation" || config.modeId === "quick-review"
      ? "intermediate" as Tier
      : this.topicBreakdown.classifyQuery(query, profile);

    for (const concept of detectedConcepts) {
      this.graph.addNode(concept);
    }

    const knownLabels = Array.from(this.graph.nodes.values()).map((n) => n.label);
    const prerequisites = this.prerequisiteDetector.detectPrerequisites(
      query,
      profile,
      knownLabels,
    );

    for (const prereq of prerequisites) {
      const found = this.graph.findConceptByLabel(prereq.conceptLabel);
      if (!found) {
        this.graph.addNode({
          id: prereq.conceptId,
          label: prereq.conceptLabel,
          description: `Prerequisite: ${prereq.briefExplanation}`,
          subjectId: profile.id,
          tier: prereq.tier,
          keywords: [prereq.conceptLabel.toLowerCase()],
          estimatedMinutes: prereq.estimatedMinutes,
          confidence: 0.5,
        });
      }
    }

    const learningPath = this.generateLearningPath(query, profile.id);

    const event: LearningEvent = {
      query,
      timestamp: Date.now(),
      conceptIds: detectedConcepts.map((c) => c.id),
      tier: detectedTier,
      subjectId: profile.id,
      modeId: config.modeId,
    };
    this.sessionStore.addEvent(event, session.sessionId);

    const updatedProgress = this.progressionTracker.recordEvent(
      new Map(Object.entries(session.progress)),
      detectedConcepts,
      event,
    );

    const nextTier = this.progressionTracker.suggestNextTier(
      detectedTier,
      updatedProgress,
      detectedConcepts,
    );

    const continuationPrompt = this.buildContinuationPrompt(
      query,
      detectedTier,
      learningPath,
      prerequisites,
    );

    let fullText = "";
    await this.teachingEngine.teach(
      {
        query: continuationPrompt,
        modeId: config.modeId,
        subjectClassification: classification,
        subjectProfile: profile,
        documents: undefined,
        previousMessages: session.events.slice(-6).map((e) => ({
          role: "user" as const,
          content: e.query,
        })),
      },
      (chunk) => {
        fullText += chunk;
        config.onChunk?.(chunk);
      },
    );

    this.sessionStore.saveGraph(this.graph, session.sessionId);

    for (const concept of detectedConcepts) {
      this.sessionStore.updateProgress(
        concept.id,
        { status: "explored", notes: [`Queried about "${query}"`] },
        session.sessionId,
      );
    }

    const continuations = this.continuationGenerator.generate(
      query,
      detectedTier,
      profile.id,
      false,
      nextTier,
    );

    const crossConnections = this.disciplineConnector.getStrongestConnections(profile.id, 3);

    const microlesson = this.microlessonGenerator.generate(query, profile, detectedTier);

    const progress = this.sessionStore.getProgress(session.sessionId);

    return {
      query,
      modeId: config.modeId,
      subjectName: profile.name,
      subjectId: profile.id,
      fullText,
      tier: detectedTier,
      detectedConcepts,
      prerequisites,
      learningPath: learningPath ?? null,
      continuations,
      microlesson,
      crossDisciplineConnections: crossConnections,
      progress,
    };
  }

  getGraph(): KnowledgeGraph | null {
    return this.graph;
  }

  getSessionStore(): SessionStore {
    return this.sessionStore;
  }

  getLearningPath(topic: string, subjectId?: string) {
    return this.generateLearningPath(topic, subjectId);
  }

  getProgression(sessionId?: string) {
    return this.sessionStore.getProgress(sessionId);
  }

  private generateLearningPath(topic: string, subjectId?: string) {
    return this.learningPathEngine.generatePath(topic, subjectId);
  }

  private buildContinuationPrompt(
    query: string,
    tier: Tier,
    path: import("./types").LearningPath | null,
    prerequisites: import("./types").PrerequisiteInfo[],
  ): string {
    const parts: string[] = [query];

    const unknownPrereqs = prerequisites.filter((p) => !p.isCovered);
    if (unknownPrereqs.length > 0) {
      const intro = unknownPrereqs
        .map((p) => `${p.conceptLabel}: ${p.briefExplanation}`)
        .join("\n");
      parts.push(
        `\n\n[Context: Before diving deep, briefly touch on these related concepts naturally:\n${intro}\nIntroduced naturally, without blocking the main explanation.]`,
      );
    }

    if (path) {
      const currentTierConcepts = path.tiers.find((t) => t.tier === tier);
      if (currentTierConcepts && currentTierConcepts.concepts.length > 0) {
        const conceptLabels = currentTierConcepts.concepts.map((c) => c.label).join(", ");
        parts.push(
          `\n\n[Learning context: The user is currently exploring ${tier} level concepts related to ${query}. Relevant concepts include: ${conceptLabels}. Position the explanation within this context.]`,
        );
      }
    }

    return parts.join("\n");
  }
}
