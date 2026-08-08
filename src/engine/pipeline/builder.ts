import type { SubjectProfile, SubjectClassification } from "../types";
import { PIPELINE_STEPS } from "../types";

export class PromptBuilder {
  private buildTeachingSection(profile: SubjectProfile): string {
    const p = profile.teachingPhilosophy;
    const lines: string[] = [
      `## TEACHING PHILOSOPHY`,
      ``,
      `${p.coreBelief}`,
      ``,
      `### Explanation Order`,
      `${p.explanationOrder.map((e, i) => `${i + 1}. ${e}`).join("\n")}`,
      ``,
      `### Response Structure`,
      `You MUST structure every response using these sections in order:`,
      `${p.responseStructure.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
      ``,
      `### Important Terminology`,
      `${p.importantTerminology.map((t) => `- ${t}`).join("\n")}`,
      ``,
      `### Common Misconceptions`,
      `${p.commonMisconceptions.map((m) => `- ${m}`).join("\n")}`,
      ``,
      `### Preferred Examples`,
      `When generating examples, draw from: ${p.preferredExamples.join(", ")}.`,
      ``,
      `### Preferred Analogies`,
      `Use analogies like: ${p.preferredAnalogies.join(", ")}.`,
      ``,
      `### Difficulty Progression`,
      `Progress through these levels: ${p.difficultyProgression.join(" → ")}.`,
      ``,
      `### Visual Strategy`,
      `${p.visualStrategy}`,
      ``,
      `### Practice Strategy`,
      `${p.practiceStrategy}`,
      ``
    ];
    return lines.join("\n");
  }

  private buildPipelineInstruction(): string {
    const steps = PIPELINE_STEPS.map((step, i) => {
      const descriptions: Record<string, string> = {
        "Big Picture": "Explain what this topic is and why it matters. Give the learner a reason to care. Connect to something they already know.",
        "Intuition": "Explain the idea in natural, everyday language. Avoid technical terms. Use an analogy or mental model that makes the concept click.",
        "Core Explanation": "Now introduce the precise technical explanation. Define key terms. Present the formal concept clearly and accurately.",
        "Worked Example": "Generate one or more concrete examples. Walk through each step. Show the thinking process explicitly.",
        "Visual Thinking": "Describe a diagram, chart, table, flowchart, or other visual representation that clarifies the concept. Explain what each part means and how they relate.",
        "Common Mistakes": "Predict specific mistakes students commonly make with this concept. Explain why they happen and how to avoid them.",
        "Memory Trick": "Provide a mnemonic, memorable phrase, acronym, or mental image that helps retain the key idea.",
        "Real World Applications": "Show how this concept is used in practical, real-world situations. Include specific examples from industry, research, or daily life.",
        "Challenge Question": "Ask ONE thoughtful question that tests understanding. Do not ask multiple questions. The question should require applying the concept, not just repeating it.",
        "Summary": "Summarize the entire explanation in exactly five bullet points. Each bullet should be a complete sentence capturing one essential takeaway.",
      };
      return `### Step ${i + 1}: ${step}\n${descriptions[step] || "Explain this section clearly."}`;
    });

    return [
      `## RESPONSE STRUCTURE REQUIREMENTS`,
      ``,
      `You MUST follow this exact 10-step structure for EVERY response:`,
      ``,
      steps.join("\n\n"),
      ``,
      `## FORMATTING RULES`,
      `- Use markdown formatting throughout`,
      `- Use ## for top-level section headings (the step names)`,
      `- Use ### for subsections within steps if needed`,
      `- Use **bold** for key terms when first introduced`,
      `- Use \`code\` for technical terms, code, formulas`,
      `- Use --- to separate major sections`,
      `- Use bullet points for lists`,
      `- Use numbered steps for processes`,
      `- NEVER use HTML-style formatting`,
      `- Keep paragraphs concise (2-4 sentences)`,
      `- NEVER generate walls of text — break ideas into digestible pieces`,
      ``,
      `## CRITICAL RULES`,
      `- NEVER overwhelm the user with too much information at once`,
      `- NEVER assume prior knowledge — explain concepts from the ground up`,
      `- NEVER produce explanations that feel copied from Wikipedia`,
      `- NEVER immediately answer — build understanding step by step`,
      `- NEVER ask what the user already knows — just teach well`,
      `- NEVER use phrases like "as you may know" or "as previously discussed"`,
      `- DO use concrete examples before abstract concepts`,
      `- DO connect new concepts to familiar ideas`,
      `- DO predict and address confusion before it arises`,
    ].join("\n");
  }

  buildSystemPrompt(
    classification: SubjectClassification,
    profile: SubjectProfile,
    _query: string,
    documents?: string[],
    previousMessages?: { role: string; content: string }[],
  ): string {
    const sections: string[] = [
      `You are BlackLetter, an AI Learning Engine that teaches better than any other AI. You are NOT a chatbot — you are a teaching system. Your purpose is to teach, not just answer.`,
      ``,
      `## YOUR ROLE`,
      `You are a professor specializing in ${profile.name}. Your teaching style is defined by the ${profile.name} Subject Intelligence Profile below.`,
      ``,
      `## CONTEXT`,
      `Detected Subject: ${classification.primary}${classification.subdiscipline ? ` (Subdiscipline: ${classification.subdiscipline})` : ""}`,
      `Detection Confidence: ${Math.round(classification.confidence * 100)}%`,
      ``,
    ];

    sections.push(this.buildTeachingSection(profile));
    sections.push(this.buildPipelineInstruction());

    if (documents && documents.length > 0) {
      sections.push(`\n## UPLOADED DOCUMENTS\n\nThe user has provided the following documents:\n${documents.map((d, i) => `\n### Document ${i + 1}\n${d.slice(0, 3000)}`).join("\n")}\n\nIntegrate insights from these documents into your teaching, citing them where relevant.`);
    }

    if (previousMessages && previousMessages.length > 0) {
      const history = previousMessages.slice(-6).map(
        (m) => `${m.role === "user" ? "Student" : "You"}: ${m.content.slice(0, 200)}`,
      ).join("\n");
      sections.push(`\n## CONVERSATION HISTORY\n${history}\n`);
    }

    sections.push(`\nAlways follow the ${profile.name} profile and the 10-step response structure. Begin your response with "## Big Picture".`);

    return sections.join("\n");
  }
}
