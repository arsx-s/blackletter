import type { QualityScore } from "./types";

export class QualityEngine {
  evaluate(response: string): QualityScore {
    const issues: string[] = [];
    const scores: Record<string, number> = {};

    scores.readability = this.scoreReadability(response, issues);
    scores.structure = this.scoreStructure(response, issues);
    scores.logicalFlow = this.scoreLogicalFlow(response, issues);
    scores.examples = this.scoreExamples(response, issues);
    scores.formatting = this.scoreFormatting(response, issues);
    scores.completeness = this.scoreCompleteness(response, issues);
    scores.correctness = this.scoreCorrectness(response, issues);

    const overall = Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length;

    const passed = overall >= 0.6 && issues.length <= 3;

    return {
      overall: Math.round(overall * 100) / 100,
      correctness: scores.correctness,
      completeness: scores.completeness,
      readability: scores.readability,
      structure: scores.structure,
      logicalFlow: scores.logicalFlow,
      examples: scores.examples,
      formatting: scores.formatting,
      issues,
      passed,
    };
  }

  private scoreReadability(response: string, issues: string[]): number {
    const words = response.split(/\s+/).length;
    const sentences = response.split(/[.!?]+/).filter(Boolean).length;
    const avgWordsPerSentence = sentences > 0 ? words / sentences : 0;
    const paragraphs = response.split(/\n\s*\n/).length;
    const avgParagraphWords = paragraphs > 0 ? words / paragraphs : words;

    let score = 0.5;

    if (avgWordsPerSentence >= 8 && avgWordsPerSentence <= 25) score += 0.3;
    else if (avgWordsPerSentence > 30) {
      score -= 0.2;
      issues.push("Sentences are too long — consider shorter sentences for better readability");
    }

    if (avgParagraphWords >= 30 && avgParagraphWords <= 150) score += 0.2;
    else if (avgParagraphWords > 200) {
      score -= 0.1;
      issues.push("Paragraphs are too dense — break them into smaller chunks");
    }

    return Math.max(0, Math.min(1, score));
  }

  private scoreStructure(response: string, issues: string[]): number {
    let score = 0.3;

    const hasHeaders = /#{1,6}\s+\w+|^[A-Z][A-Z\s]{3,}$|^━━━/m.test(response);
    if (hasHeaders) score += 0.2;
    else issues.push("Missing section headers — use headers to organize content");

    const hasLists = /^[-*]\s/m.test(response) || /^\d+\.\s/m.test(response);
    if (hasLists) score += 0.2;

    const hasSeparator = /━|─|___/m.test(response);
    if (hasSeparator) score += 0.15;

    const hasIntro = /^(#{1,3}\s+)?(introduction|overview|learning goal|what is|concept)/im.test(response);
    const hasConclusion = /^(#{1,3}\s+)?(summary|conclusion|key takeaway|checkpoint|recap)/im.test(response);
    if (hasIntro && hasConclusion) score += 0.15;
    else if (!hasIntro || !hasConclusion) {
      issues.push("Response should have both an introduction and a summary section");
    }

    return Math.max(0, Math.min(1, score));
  }

  private scoreLogicalFlow(response: string, issues: string[]): number {
    let score = 0.5;

    const transitions = ["therefore", "however", "for example", "in addition", "furthermore", "moreover", "consequently", "as a result", "specifically", "in particular", "on the other hand", "first", "second", "third", "finally", "next", "then", "because", "since", "although", "while"];
    const transitionCount = transitions.filter((t) => new RegExp(`\\b${t}\\b`, "i").test(response)).length;

    if (transitionCount >= 3) score += 0.2;
    else if (transitionCount < 2) {
      issues.push("Missing transitional phrases — use 'however', 'for example', 'therefore' to improve flow");
    }

    const progressionSteps = [
      /(first|to start|begin|initially)/im,
      /(second|next|then|after)/im,
      /(third|finally|lastly|in conclusion)/im,
    ];
    const hasProgression = progressionSteps.filter((p) => p.test(response)).length >= 2;
    if (hasProgression) score += 0.15;
    else issues.push("Response lacks clear progression structure — use 'first, second, finally' ordering");

    const hasSequencing = /step\s+\d|stage\s+\d|phase\s+\d|part\s+\d/i.test(response);
    if (hasSequencing) score += 0.15;

    return Math.max(0, Math.min(1, score));
  }

  private scoreExamples(response: string, issues: string[]): number {
    let score = 0.3;

    const hasExampleMarker = /(example|for instance|such as|e\.g\.|like|specifically|imagine|consider)/i.test(response);
    if (hasExampleMarker) score += 0.2;
    else issues.push("No examples found — include at least one concrete example");

    const hasRealWorld = /(real world|real[- ]world|practical|actual|specific|company|case\s+study)/i.test(response);
    if (hasRealWorld) score += 0.2;

    const hasCodeOrDiagram = /```/m.test(response) || /(diagram|flowchart|table\s+\|)/i.test(response);
    if (hasCodeOrDiagram) score += 0.15;

    const exampleCount = (response.match(/(example|for instance|such as|e\.g\.|like)/gi) || []).length;
    if (exampleCount >= 3) score += 0.15;

    return Math.max(0, Math.min(1, score));
  }

  private scoreFormatting(response: string, issues: string[]): number {
    let score = 0.4;

    if (response.length > 500) score += 0.1;

    const hasBold = /\*\*.*\*\*/m.test(response);
    if (hasBold) score += 0.1;

    const hasCode = /`[^`]+`/m.test(response);
    if (hasCode) score += 0.1;

    const hasEmojiIcons = /[🎯⏱📋🧠💡⚠📝🎓🏆🥇🥈🥉]/mu.test(response);
    if (hasEmojiIcons) score += 0.15;

    const hasTable = /\|.+\|.+\|/m.test(response);
    if (hasTable) score += 0.1;

    const lineBreaks = response.split(/\n/).length;
    if (lineBreaks > 10 && lineBreaks < 200) score += 0.15;
    else if (lineBreaks <= 5) {
      score -= 0.1;
      issues.push("Too few line breaks — use more whitespace for readability");
    }

    return Math.max(0, Math.min(1, score));
  }

  private scoreCompleteness(response: string, issues: string[]): number {
    let score = 0.4;

    if (response.length > 1000) score += 0.15;
    else if (response.length > 300) score += 0.1;
    else if (response.length < 100) {
      score -= 0.2;
      issues.push("Response is too short — provide a more complete explanation");
    }

    const hasDefinition = /(is\s+a|are\s+|refers?\s+to|defined\s+as|means?|describes?)/i.test(response);
    if (hasDefinition) score += 0.1;

    const hasPurpose = /(used\s+to|purpose|goal|objective|function|role\s+of|why|because)/i.test(response);
    if (hasPurpose) score += 0.1;

    const hasApplication = /(applied|application|use\s+case|used\s+in|implement|practical|real[- ]world)/i.test(response);
    if (hasApplication) score += 0.1;

    const hasComparison = /(differs?|difference|compared?\s+to|unlike|similar|alternative|instead)/i.test(response);
    if (hasComparison) score += 0.1;

    const hasLimitation = /(limitation|drawback|trade-off|caveat|caution|warning|however|but|challenge)/i.test(response);
    if (hasLimitation) score += 0.1;

    return Math.max(0, Math.min(1, score));
  }

  private scoreCorrectness(response: string, issues: string[]): number {
    let score = 0.7;

    const hedgeWords = ["might", "maybe", "perhaps", "possibly", "i think", "i believe", "probably", "could be", "sort of", "kind of", "it seems"];
    const hedgeCount = hedgeWords.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(response)).length;

    if (hedgeCount >= 3) {
      score -= 0.15;
      issues.push("Response contains too many hedging words — be more definitive");
    }

    const contradiction = /on\s+one\s+hand.*on\s+the\s+other\s+hand|however.*however/i.test(response);
    if (!contradiction) score += 0.1;

    const confidenceIndicators = /(always|never|definitely|certainly|absolutely|undoubtedly|in\s+fact|indeed)/gi;
    const confidenceCount = (response.match(confidenceIndicators) || []).length;
    if (confidenceCount > 5) {
      score -= 0.1;
      issues.push("Too many absolute statements — be more nuanced");
    }

    return Math.max(0, Math.min(1, score));
  }

  generateRegenerationPrompt(response: string, qualityScore: QualityScore): string {
    const worstIssues = qualityScore.issues.slice(0, 3);

    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUALITY IMPROVEMENT REQUIRED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The previous response received a quality score of ${(qualityScore.overall * 100).toFixed(0)}%. This is below the acceptable threshold.

Issues to fix:
${worstIssues.map((i) => `- ${i}`).join("\n")}

REQUIREMENTS FOR THE NEW RESPONSE:
- ${worstIssues.map((i) => this.systemGenerateFixSuggestion(i)).join("\n- ")}

${this.buildQualityRules()}
Regenerate the response addressing ALL of the above issues. Do NOT repeat the same structure or approach.`;
  }

  private systemGenerateFixSuggestion(issue: string): string {
    if (issue.includes("section headers")) return "Use clear section headers like ## Concept, ## Example, ## Summary";
    if (issue.includes("introduction") && issue.includes("summary")) return "Start with a learning objective and end with key takeaways";
    if (issue.includes("transition")) return "Use 'therefore', 'for example', 'however' to connect ideas smoothly";
    if (issue.includes("progression")) return "Organize content in logical order: first → second → finally";
    if (issue.includes("examples")) return "Include at least one concrete, specific example with real-world context";
    if (issue.includes("short")) return "Expand the response with deeper explanation and more examples";
    if (issue.includes("long sentences") || issue.includes("too long")) return "Break long sentences into shorter, clearer ones";
    if (issue.includes("hedging")) return "Be confident and definitive — avoid 'I think', 'maybe', 'perhaps'";
    if (issue.includes("dense")) return "Add more paragraph breaks and whitespace";
    if (issue.includes("absolute")) return "Use nuanced language — acknowledge exceptions and edge cases";
    if (issue.includes("breaks")) return "Add paragraph breaks every 3-5 sentences for better readability";
    if (issue.includes("headers") || issue.includes("organize")) return "Use a clear hierarchical structure with headers and subheaders";
    return `Address this issue: ${issue.toLowerCase()}`;
  }

  buildQualityRules(): string {
    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUALITY STANDARDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every response MUST meet these standards:

1. STRUCTURE:
   - Clear section headers using ## or bold text
   - Logical progression: introduction → body → summary
   - Each section has a clear purpose

2. CONTENT:
   - Define key terms before using them
   - Include at least one concrete example
   - Explain why this matters (practical relevance)
   - Address common misconceptions

3. READABILITY:
   - Short to medium-length sentences (15-25 words)
   - Short paragraphs (3-5 sentences)
   - Use transition words between ideas

4. FORMATTING:
   - Bold for key terms
   - Bullet points for lists
   - Code blocks for technical content
   - Tables for comparisons
   - Proper spacing between sections

5. TONE:
   - Professional but approachable
   - Confident and precise
   - Never hedging or uncertain
   - Educational, not conversational

6. COMPLETENESS:
   - Cover the topic thoroughly
   - Include practical applications
   - Mention limitations and alternatives
   - Provide actionable takeaways`;
  }
}

export const qualityEngine = new QualityEngine();
