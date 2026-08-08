import type { PipelineContext } from "./types";

const INTENT_MODE: Record<string, string> = {
  teach: "teach", research: "research", summarize: "teach", analyze: "analyze",
  compare: "compare", quiz: "teach", flashcards: "teach", "study-plan": "plan",
  "assignment-help": "analyze", "interview-prep": "teach",
  roadmap: "plan", "document-analysis": "research",
  debug: "analyze", brainstorm: "research", revision: "teach",
};

const MODE_LABELS: Record<string, string> = {
  visual: "Visual Thinking", story: "Story Mode", analogy: "Analogy Mode",
  technical: "Technical Deep Dive", beginner: "Beginner Friendly",
  exam: "Exam Preparation", interview: "Interview Preparation",
  research: "Research Mode",
};

const DIFFICULTY_DEPTH: Record<string, number> = {
  beginner: 1, intermediate: 2, advanced: 3,
  university: 4, graduate: 5, professional: 5, research: 5,
};

const DIFFICULTY_DESC: Record<string, string> = {
  beginner: "Assume ZERO prior knowledge. Use simple language, avoid jargon.",
  intermediate: "Assume basic familiarity. Define specialized terms.",
  advanced: "Assume solid foundation. Focus on nuances and trade-offs.",
  university: "Undergraduate level. Include formal definitions and derivations.",
  graduate: "Graduate level. Cover state-of-the-art and open questions.",
  professional: "Industry level. Focus on practical implementation and best practices.",
  research: "Research level. Include mathematical formalisms and recent literature.",
};

export interface PromptBuildResult {
  prompt: string;
  systemInstruction: string;
  promptSize: number;
}

export async function executePromptBuilder(ctx: PipelineContext): Promise<PromptBuildResult> {
  const intent = ctx.intent;
  const subject = ctx.primarySubject;
  const difficulty = ctx.difficulty || "intermediate";
  const profile = ctx.learnerProfile;

  const mode = INTENT_MODE[intent] || "teach";
  const depth = DIFFICULTY_DEPTH[difficulty] || 3;
  const diffDesc = DIFFICULTY_DESC[difficulty] || DIFFICULTY_DESC.intermediate;
  const modeLabel = MODE_LABELS[ctx.input.mode || "analogy"] || "Adaptive Explanation";

  const parts: string[] = [];
  parts.push(`TEACHING MODE: ${modeLabel}`);
  parts.push(`DIFFICULTY LEVEL: ${difficulty} (depth ${depth}/5)`);
  parts.push(`DIFFICULTY GUIDELINES: ${diffDesc}`);

  if (subject !== "general") {
    parts.push(`SUBJECT: ${subject.replace(/-/g, " ")}`);
  }

  if (profile) {
    const notes: string[] = [];
    if (profile.analogies) notes.push("Use analogies to connect new concepts to familiar ideas");
    if (profile.examples > 0) notes.push(`Include ${profile.examples}+ concrete examples`);
    if (profile.weakConcepts.length > 0) notes.push(`Learner struggles with: ${profile.weakConcepts.join(", ")}. Explain these carefully.`);
    if (notes.length > 0) parts.push(`LEARNER PREFERENCES: ${notes.join(". ")}.`);
  }

  if (ctx.knowledgeGapDirective) {
    parts.push(`PREREQUISITE GUIDANCE: ${ctx.knowledgeGapDirective}`);
  }

  if (ctx.documentText) {
    parts.push(`UPLOADED DOCUMENT: The following document is the PRIMARY topic. Teach its content. Answer questions based on this document.`);
  }

  const outputStructure = `OUTPUT STRUCTURE:
1. OBJECTIVE — What the learner will understand after this
2. FOUNDATION — Prerequisite knowledge required
3. PRINCIPLES — The core concepts
4. ARGUMENT — Step-by-step breakdown
5. DEMONSTRATIONS — Concrete, worked examples (${profile?.examples || 3}+)
6. VERDICT — Bullet summary of what was learned
7. PITFALLS — Edge cases and common errors
8. DRILL — A problem to solve
9. REFERENCES — Where to go next`;

  parts.push(outputStructure);

  parts.push(`QUALITY RULES:
- Every response must be self-contained. Do not assume prior context.
- Define every technical term the first time it appears.
- Use headings and subheadings to organize content.
- Use bullet points for lists, numbered steps for procedures.
- Include at least one concrete example.
- Break content into digestible sections. No walls of text.`);

  const systemInstruction = `You are BlackLetter, an intelligence layer — NOT a chatbot.

You are an adaptive reasoning engine. Follow the TEACHING MODE and DIFFICULTY LEVEL exactly.
Adapt to the learner's profile preferences.
Teach the uploaded document if one is provided.
Structure your response according to the OUTPUT STRUCTURE.
Follow all QUALITY RULES.

${subject !== "general" ? `You are teaching ${subject.replace(/-/g, " ")}. Ensure accuracy for this domain.` : ""}
${ctx.documentText ? `CRITICAL: An uploaded document is the topic. Teach its contents. Do not treat the user's typed message as the subject.` : ""}`;

  const userPrompt = `Query: ${ctx.normalizedPrompt}

${ctx.documentText ? `\n--- DOCUMENT CONTENT ---\n${ctx.documentText}\n--- END DOCUMENT ---\n` : ""}

${parts.join("\n\n")}`;

  return {
    prompt: userPrompt,
    systemInstruction: systemInstruction.trim(),
    promptSize: userPrompt.length + systemInstruction.length,
  };
}
