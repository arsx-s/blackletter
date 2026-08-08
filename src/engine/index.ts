import { SubjectDetector } from "./detection/detector";
import { ProfileRegistry } from "./profiles/registry";
import { PromptBuilder } from "./pipeline/builder";
import { generateStream } from "../providers/provider";
import type { SubjectProfile, SubjectClassification, LearningRequest } from "./types";

interface EngineConfig {
  onChunk?: (chunk: string) => void;
}

interface EngineResult {
  subject: SubjectClassification;
  profileId: string;
  fullText: string;
}

export class LearningEngine {
  private detector = SubjectDetector;
  private promptBuilder = new PromptBuilder();

  async learn(request: LearningRequest, config?: EngineConfig): Promise<EngineResult> {
    const classification = this.detector.detect(request.query);
    const profile = ProfileRegistry.get(classification.primaryId) || ProfileRegistry.getDefault();

    const systemPrompt = this.promptBuilder.buildSystemPrompt(
      classification,
      profile,
      request.query,
      request.documents,
      request.previousMessages,
    );

    const docText = request.documents?.length
      ? request.documents.join("\n\n---\n\n")
      : undefined;

    let fullText = "";

    for await (const chunk of generateStream({ prompt: request.query, systemInstruction: systemPrompt, fileContent: docText })) {
      fullText += chunk;
      config?.onChunk?.(chunk);
    }

    return {
      subject: classification,
      profileId: profile.id,
      fullText,
    };
  }

  detectSubject(query: string): SubjectClassification {
    return this.detector.detect(query);
  }

  getProfile(subjectId: string): SubjectProfile | undefined {
    return ProfileRegistry.get(subjectId);
  }

  getDefaultProfile(): SubjectProfile {
    return ProfileRegistry.getDefault();
  }

  buildSystemPrompt(
    query: string,
    profileId?: string,
    documents?: string[],
    previousMessages?: { role: "user" | "assistant"; content: string }[],
  ): { systemPrompt: string; classification: SubjectClassification; profile: SubjectProfile } {
    const classification = this.detector.detect(query);
    const profile = ProfileRegistry.get(profileId || classification.primaryId) || ProfileRegistry.getDefault();
    const systemPrompt = this.promptBuilder.buildSystemPrompt(
      classification,
      profile,
      query,
      documents,
      previousMessages,
    );
    return { systemPrompt, classification, profile };
  }
}
