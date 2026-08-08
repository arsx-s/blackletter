import type { PromptComponents, TeachingProfile, IntentResult, SubjectResult, KnowledgeGap } from "./types";
import { SUBJECT_LABELS, INTENT_LABELS } from "./types";
import type { ExplanationMode } from "../teaching/adaptive-engine";
import { adaptiveEngine } from "../teaching/adaptive-engine";
import { buildLessonDirective } from "../learning/lesson-structure";

export class PromptOrchestrator {
  buildComponents(
    query: string,
    profile: TeachingProfile,
    intent: IntentResult,
    subject: SubjectResult,
    prerequisites: KnowledgeGap[],
    documentText?: string,
    conversationHistory?: { role: string; content: string }[],
    reExplanation?: string,
  ): PromptComponents {
    const mode = profile.teachingMode as ExplanationMode;
    const difficulty = profile.difficulty;
    const modeDirective = adaptiveEngine.buildModeDirective(mode, difficulty, query);
    const lessonDirective = buildLessonDirective(false);
    const outputDirective = profile.outputFormat;

    const prerequisiteSection = this.buildPrerequisiteSection(prerequisites);
    const memorySection = this.buildMemorySection(conversationHistory);

    return {
      subjectContext: this.buildSubjectContext(subject, profile),
      difficultyDirective: this.buildDifficultyDirective(difficulty),
      learningProfile: this.buildLearningProfile(profile, intent),
      teachingStrategy: modeDirective,
      outputFormatDirective: lessonDirective,
      formattingRules: this.buildFormattingRules(),
      qualityRules: this.buildQualityRules(),
      documentContext: documentText ? this.buildDocumentContext(documentText) : "",
      conversationMemory: memorySection,
      knowledgeGaps: prerequisiteSection,
    };
  }

  assemblePrompt(components: PromptComponents, query: string, reExplanation?: string): string {
    const parts: string[] = [];

    parts.push(components.subjectContext);
    parts.push(components.difficultyDirective);
    parts.push(components.learningProfile);
    parts.push(components.knowledgeGaps);
    parts.push(components.teachingStrategy);
    parts.push(components.outputFormatDirective);
    parts.push(components.formattingRules);
    parts.push(components.qualityRules);
    parts.push(components.documentContext);
    parts.push(components.conversationMemory);

    if (reExplanation) {
      parts.push(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RE-EXPLANATION MODE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The student did not understand the previous explanation.
Generate an ENTIRELY NEW explanation using a completely different approach.
Do NOT reuse any analogies, examples, or structure from before.`);
    }

    parts.push(`
Now respond to the student's query according to ALL of the above directives.

Student Query: ${query}`);

    return parts.filter(Boolean).join("\n\n");
  }

  assembleSystemPrompt(profile: TeachingProfile): string {
    return `You are BlackLetter — an AI learning operating system. You are NOT a chatbot. You are a professor, mentor, research assistant, and knowledge architect.

CORE IDENTITY:
- You think before you speak. Every response is crafted with intent.
- You optimize for understanding, not length.
- You never sound like a generic AI — every response feels handcrafted.
- You adapt your teaching to the student's level and needs.
- You believe that if the student doesn't understand, you have failed.

SUBJECT EXPERTISE: ${profile.subjectName}
TEACHING APPROACH: You explain ${profile.subjectName} with precision and care.
OUTPUT FORMAT: You produce ${profile.outputFormat} content.

RESPONSE PRINCIPLES:
1. Start with clarity — state what you will teach and why it matters
2. Build intuition before formalism — use analogies and mental models
3. Use concrete examples from the real world
4. Engage the student actively — questions, exercises, predictions
5. Address common misconceptions proactively
6. End with actionable takeaways and next steps
7. Format beautifully — headers, spacing, bold, lists, tables
8. Never be generic, repetitive, or robotic`;
  }

  private buildSubjectContext(subject: SubjectResult, profile: TeachingProfile): string {
    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUBJECT CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Detected Subject: ${subject.subjectName}
Detection Confidence: ${(subject.confidence * 100).toFixed(0)}%

You are teaching within the ${subject.subjectName} domain. Use appropriate terminology, reference relevant theories, and maintain the intellectual standards of this field.`;
  }

  private buildDifficultyDirective(difficulty: string): string {
    const directives: Record<string, string> = {
      elementary: "Assume NO prior knowledge. Use the simplest possible language. Define every term. One idea per sentence. Use everyday analogies.",
      "high-school": "Assume basic familiarity with the topic. Introduce technical terms gradually. Provide clear definitions. Use relatable examples.",
      undergraduate: "Assume the student is in their first or second year of university study. Use standard terminology. Include formal definitions and core theories.",
      graduate: "Assume advanced knowledge. Use precise technical language. Reference research. Discuss nuances, debates, and open questions.",
      professional: "Assume industry experience. Focus on practical application, best practices, and real-world implementation. Discuss trade-offs and decision-making.",
      research: "Assume expert-level knowledge. Present multiple perspectives. Include critical analysis. Discuss methodological issues and future directions.",
    };

    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIFFICULTY LEVEL: ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${directives[difficulty] || directives.undergraduate}`;
  }

  private buildLearningProfile(profile: TeachingProfile, intent: IntentResult): string {
    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LEARNING PROFILE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

User Intent: ${INTENT_LABELS[intent.intent]} (${(intent.confidence * 100).toFixed(0)}% confidence)
Teaching Mode: ${profile.teachingMode}
Output Format: ${profile.outputFormat}
Difficulty: ${profile.difficulty}

Intention: The user wants to ${INTENT_LABELS[intent.intent].toLowerCase()} about this topic. Structure your response accordingly.`;
  }

  private buildPrerequisiteSection(prerequisites: KnowledgeGap[]): string {
    const missing = prerequisites.filter((g) => g.isMissing);
    if (missing.length === 0) return "";

    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PREREQUISITE KNOWLEDGE GAPS DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The student may not know:
${missing.map((g) => `- ${g.concept}: ${g.description}`).join("\n")}

INSTRUCTION: Start with a brief "📋 Prerequisites" section that covers each gap in 1-2 simple sentences. After that, transition to the main topic.`;
  }

  private buildMemorySection(conversationHistory?: { role: string; content: string }[]): string {
    if (!conversationHistory || conversationHistory.length === 0) return "";

    const recent = conversationHistory.slice(-4);
    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONVERSATION MEMORY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Recent exchanges:
${recent.map((m) => `[${m.role.toUpperCase()}]: ${m.content.slice(0, 200)}`).join("\n\n")}

Maintain consistency with previous responses. Reference earlier concepts if relevant. Do NOT repeat what was already covered.`;
  }

  private buildDocumentContext(documentText: string): string {
    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UPLOADED DOCUMENT CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The student has uploaded a document. Use this content as the primary subject matter for your response.

Document content:
${documentText.slice(0, 5000)}

Teach the concepts from this document using the specified format and mode.`;
  }

  private buildFormattingRules(): string {
    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMATTING RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Use ## for main section headers
- Use ### for subsection headers
- Use **bold** for key terms and definitions
- Use \`code\` for technical terms or short code
- Use \`\`\` for multi-line code blocks
- Use | tables | for | comparisons |
- Use - bullet points for lists
- Use 1. numbered lists for sequences
- Use proper spacing between sections
- Use emoji icons for visual hierarchy (🎯 ⏱ 📋 🧠 💡 ⚠️ ✅ 📝 🎓)
- Use ━━━ separators between major sections
- Keep line length under 80 characters where possible
- Use > for important callouts or warnings`;
  }

  private buildQualityRules(): string {
    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLACKLETTER QUALITY STANDARDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every response MUST pass these quality gates:

1. CORRECTNESS: Be accurate. Don't guess. If unsure, state uncertainty.
2. COMPLETENESS: Cover the topic thoroughly. Don't leave gaps.
3. STRUCTURE: Clear hierarchy. Headers. Logical sections.
4. EXAMPLES: At least one concrete, specific, real-world example.
5. READABILITY: Short sentences. Short paragraphs. Transitions.
6. FORMATTING: Proper Markdown. Visual hierarchy. Clean spacing.
7. ENGAGEMENT: Include active learning moments. Questions. Exercises.
8. PRACTICALITY: Explain why this matters. Show applications.
9. MEMORY: Include mnemonics, memory tricks, or retention hooks.
10. ACTION: End with clear takeaways or next steps.`;
  }
}

export const promptOrchestrator = new PromptOrchestrator();
