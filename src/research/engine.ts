import { SubjectDetector } from "../engine/detection/detector";
import { ProfileRegistry } from "../engine/profiles/registry";
import { TeachingEngine } from "../teaching/engine";
import { TeachingModeRegistry } from "../teaching/modes/registry";
import { ResearchProjectManager } from "./project/project";
import { ResearchPlanner } from "./project/planner";
import { DocumentIntelligence } from "./document/document-intelligence";
import { SourceIntelligence } from "./document/source-intelligence";
import { OpenQuestionsEngine } from "./analysis/open-questions";
import { KnowledgeSynthesisEngine } from "./analysis/knowledge-synthesis";
import { InsightGenerator } from "./analysis/insight-generator";
import { ReportGenerator } from "./output/report-generator";
import { TimelineEngine } from "./output/timeline-engine";
import { BookmarkEngine } from "./bookmarks/bookmark-engine";
import type {
  ResearchConfig,
  ResearchResponse,
  ResearchDocument,
  ResearchMessage,
} from "./types";

export class ResearchEngine {
  private subjectDetector = SubjectDetector;
  private profileRegistry = ProfileRegistry;
  private teachingEngine = new TeachingEngine();
  private modeRegistry = TeachingModeRegistry;
  private projectManager: ResearchProjectManager;
  private planner = new ResearchPlanner();
  private documentIntelligence = new DocumentIntelligence();
  private sourceIntelligence = new SourceIntelligence();
  private openQuestionsEngine = new OpenQuestionsEngine();
  private synthesisEngine = new KnowledgeSynthesisEngine();
  private insightGenerator = new InsightGenerator();
  private reportGenerator = new ReportGenerator();
  private timelineEngine = new TimelineEngine();
  private bookmarkEngine = new BookmarkEngine();

  constructor() {
    this.projectManager = new ResearchProjectManager();
  }

  async research(
    query: string,
    config: ResearchConfig,
  ): Promise<ResearchResponse> {
    const classification = this.subjectDetector.detect(query);
    const profile = this.profileRegistry.get(classification.primaryId)
      ?? this.profileRegistry.getDefault();
    const mode = this.modeRegistry.get(config.modeId)
      ?? this.modeRegistry.getDefault();

    const project = this.projectManager.getOrCreateProject(
      query,
      profile.id,
      profile.name,
      config.modeId,
      config.projectId,
    );

    const plannerOutput = this.planner.generatePlan(query);
    this.projectManager.setPlannerOutput(plannerOutput, project.id);
    this.projectManager.setGoal(plannerOutput.researchGoal, project.id);

    this.timelineEngine.addEvent(project, "project-created", "Research Started", `Began researching: ${query}`, { milestone: true });

    const processedDocs: ResearchDocument[] = [];
    if (config.documents && config.documents.length > 0) {
      for (const docInput of config.documents) {
        const doc = this.documentIntelligence.processDocument(
          docInput.fileName,
          docInput.fileType,
          docInput.content,
        );
        const evaluated = this.sourceIntelligence.evaluateSource(doc.source);
        doc.source = evaluated;

        this.projectManager.addDocument(
          {
            fileName: doc.fileName,
            fileType: doc.fileType,
            content: doc.content,
            extractedConcepts: doc.extractedConcepts,
            extractedEntities: doc.extractedEntities,
            summary: doc.summary,
            source: doc.source,
            wordCount: doc.wordCount,
            language: doc.language,
          },
          project.id,
        );

        processedDocs.push(doc);

        this.timelineEngine.addEvent(
          project,
          "document-added",
          `Document Added: ${doc.fileName}`,
          `${doc.fileName} (${doc.wordCount} words, ${doc.extractedConcepts.length} concepts extracted)`,
          { documentIds: [doc.id], milestone: false },
        );
      }
    }

    const systemContext = this.buildResearchSystemContext(
      query,
      plannerOutput,
      processedDocs,
      project,
    );

    const researchPrompt = `${systemContext}\n\nResearch Question: ${query}`;

    let fullText = "";
    await this.teachingEngine.teach(
      {
        query: researchPrompt,
        modeId: config.modeId,
        subjectClassification: classification,
        subjectProfile: profile,
        documents: processedDocs.map((d) => d.content),
        previousMessages: project.messages.slice(-6).map((m) => ({
          role: m.role,
          content: m.content,
        })),
      },
      (chunk) => {
        fullText += chunk;
        config.onChunk?.(chunk);
      },
    );

    const message = this.projectManager.addMessage(
      {
        role: "user",
        content: query,
        modeId: config.modeId,
        documentIds: processedDocs.map((d) => d.id),
        sourceIds: processedDocs.map((d) => d.source.id),
        conceptIds: processedDocs.flatMap((d) =>
          d.extractedConcepts.map((c) => `concept_${c.replace(/\s+/g, "_")}`),
        ),
      },
      project.id,
    );

    const responseMsg = this.projectManager.addMessage(
      {
        role: "assistant",
        content: fullText,
        modeId: config.modeId,
        documentIds: processedDocs.map((d) => d.id),
        sourceIds: processedDocs.map((d) => d.source.id),
        conceptIds: [],
      },
      project.id,
    );

    const newQuestions = this.openQuestionsEngine.generateFromQuery(
      query,
      fullText,
      project.openQuestions,
    );
    for (const q of newQuestions) {
      this.projectManager.addOpenQuestion(q, project.id);
    }

    if (newQuestions.length > 0) {
      this.timelineEngine.addEvent(
        project,
        "question-identified",
        `${newQuestions.length} Open Question(s) Identified`,
        `New research questions emerged from the analysis of "${query}"`,
        { milestone: false },
      );
    }

    const allDocs = processedDocs.length > 0
      ? processedDocs
      : [this.createDerivedDocument(fullText, query)];
    const allMessages = [message!, responseMsg!].filter(Boolean) as ResearchMessage[];

    const insights = this.insightGenerator.generateAll(
      allDocs,
      allMessages,
      project.openQuestions,
      project.sources,
    );
    for (const ins of insights) {
      this.projectManager.addInsight(ins, project.id);
    }

    const insightEvent = this.timelineEngine.addEvent(
      project,
      "insight-generated",
      `${insights.length} Insight(s) Generated`,
      `Generated insights from research on "${query}"`,
      { insightIds: insights.map((i) => i.id), milestone: insights.length > 3 },
    );

    const unresolved = this.projectManager.getUnresolvedQuestions(project.id);

    return {
      query,
      fullText,
      project,
      openQuestions: unresolved,
      insights,
      timeline: this.timelineEngine.getTimeline(project, { limit: 10 }),
      sources: project.sources,
    };
  }

  private buildResearchSystemContext(
    query: string,
    plan: import("./types").ResearchPlannerOutput,
    documents: ResearchDocument[],
    project: import("./types").ResearchProject,
  ): string {
    const parts: string[] = [
      `## RESEARCH PROJECT: ${query}`,
      ``,
      `### Research Goal`,
      plan.researchGoal,
      ``,
    ];

    if (plan.learningObjectives.length > 0) {
      parts.push(`### Learning Objectives`);
      parts.push(plan.learningObjectives.map((o, i) => `${i + 1}. ${o}`).join("\n"));
      parts.push(``);
    }

    if (plan.researchQuestions.length > 0) {
      parts.push(`### Research Questions`);
      parts.push(plan.researchQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n"));
      parts.push(``);
    }

    if (plan.keyConcepts.length > 0) {
      parts.push(`### Key Concepts`);
      parts.push(plan.keyConcepts.map((c) => `- **${c.term}**: ${c.definition}`).join("\n"));
      parts.push(``);
    }

    if (plan.areasToInvestigate.length > 0) {
      parts.push(`### Areas to Investigate`);
      parts.push(plan.areasToInvestigate.map((a, i) => `${i + 1}. ${a}`).join("\n"));
      parts.push(``);
    }

    if (documents.length > 0) {
      parts.push(`### Source Documents`);
      for (const doc of documents) {
        parts.push(`**${doc.fileName}** (${doc.wordCount} words, ${doc.extractedConcepts.length} concepts)`);
        parts.push(`Summary: ${doc.summary}`);
        parts.push(`Source: ${doc.source.sourceType.replace("-", " ")} — Credibility: ${Math.round(doc.source.credibilityScore * 100)}%`);
        parts.push(``);
      }
    }

    if (project.openQuestions.length > 0) {
      const unresolved = project.openQuestions.filter((q) => !q.isResolved);
      if (unresolved.length > 0) {
        parts.push(`### Open Questions`);
        parts.push(unresolved.map((q, i) => `${i + 1}. ${q.question}`).join("\n"));
        parts.push(``);
      }
    }

    parts.push(`## RESEARCH INSTRUCTION`);
    parts.push(`You are a professional researcher. Structure your response to include:`);
    parts.push(`1. Direct answer to the research question`);
    parts.push(`2. Key evidence and reasoning`);
    parts.push(`3. Connections to broader context`);
    parts.push(`4. Any limitations or alternative viewpoints`);
    parts.push(`5. Suggestions for further investigation`);
    parts.push(``);
    parts.push(`Always cite sources where applicable using APA format.`);
    parts.push(`Maintain a professional, rigorous tone appropriate for academic or professional research.`);

    return parts.join("\n");
  }

  private createDerivedDocument(content: string, sourceQuery: string): ResearchDocument {
    return this.documentIntelligence.processDocument(
      `Research: ${sourceQuery}`,
      "text/plain",
      content,
      {
        title: `Research output for "${sourceQuery}"`,
        sourceType: "research-organization",
        credibilityScore: 0.7,
        authorityScore: 0.6,
        relevanceScore: 0.9,
      },
    );
  }

  getProjectManager(): ResearchProjectManager {
    return this.projectManager;
  }

  getDocumentIntelligence(): DocumentIntelligence {
    return this.documentIntelligence;
  }

  getSourceIntelligence(): SourceIntelligence {
    return this.sourceIntelligence;
  }

  getOpenQuestionsEngine(): OpenQuestionsEngine {
    return this.openQuestionsEngine;
  }

  getSynthesisEngine(): KnowledgeSynthesisEngine {
    return this.synthesisEngine;
  }

  getInsightGenerator(): InsightGenerator {
    return this.insightGenerator;
  }

  getReportGenerator(): ReportGenerator {
    return this.reportGenerator;
  }

  getTimelineEngine(): TimelineEngine {
    return this.timelineEngine;
  }

  getBookmarkEngine(): BookmarkEngine {
    return this.bookmarkEngine;
  }
}
