export interface JourneyStep {
  id: string;
  title: string;
  description: string;
  concepts: string[];
  prerequisites: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedMinutes: number;
  type: "concept" | "exercise" | "project" | "review" | "assessment";
}

export interface LearningJourney {
  title: string;
  subject: string;
  totalEstimatedMinutes: number;
  steps: JourneyStep[];
}

const JOURNEY_TRIGGERS = [
  /learn\s+(\w+(?:\s+\w+){0,3})/i,
  /teach\s+me\s+(\w+(?:\s+\w+){0,3})/i,
  /i\s+want\s+to\s+(?:learn|master|understand)\s+(\w+(?:\s+\w+){0,3})/i,
  /course\s+(?:on|in|for)\s+(\w+(?:\s+\w+){0,3})/i,
  /guide\s+(?:to|for|on)\s+(\w+(?:\s+\w+){0,3})/i,
  /roadmap\s+(?:for|to|in)\s+(\w+(?:\s+\w+){0,3})/i,
  /curriculum\s+(?:for|in|on)\s+(\w+(?:\s+\w+){0,3})/i,
  /syllabus\s+(?:for|in|on)\s+(\w+(?:\s+\w+){0,3})/i,
  /from\s+(?:scratch|zero|the\s+beginning)\s+(?:to\s+)?(?:learn\s+)?(\w+(?:\s+\w+){0,3})/i,
];

export class JourneyEngine {
  detectJourneyIntent(query: string): string | null {
    for (const trigger of JOURNEY_TRIGGERS) {
      const match = query.match(trigger);
      if (match) return match[1].trim();
    }
    return null;
  }

  buildJourneyDirective(topic: string): string {
    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LEARNING JOURNEY GENERATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The user wants to learn "${topic}" as a complete journey, not just a single lesson.

Generate a comprehensive learning roadmap.

JOURNEY STRUCTURE:

## 🎯 Journey Title: [Creative, memorable title for "${topic}"]

## 📊 Overview
- What the student will achieve by the end
- How many lessons/steps in the journey
- Total estimated time
- Prerequisites (what they need to know before starting)

## 🗺 The Learning Path

Generate 5-10 steps ordered from foundational to advanced.

Each step MUST include:
- **Step N: [Title]** — A clear, engaging name
- **Description** — What this step covers (2-3 sentences)
- **Key Concepts** — 3-5 specific concepts taught in this step
- **Prerequisites** — Which previous steps are required
- **Difficulty** — Beginner / Intermediate / Advanced
- **Estimated Time** — In minutes
- **Type** — concept / exercise / project / review / assessment
- **Learning Outcome** — What the student can do after this step

MAKE IT FEEL LIKE A REAL COURSE SYLLABUS:
- Use creative, engaging step titles
- Cover concepts in a pedagogically sound order
- Include at least one project step and one review step
- The last step should tie everything together

FORMAT AS CLEAN MARKDOWN.
DO NOT use generic language. Make each step specific to "${topic}".`;
  }

  isJourneyQuery(query: string): boolean {
    return this.detectJourneyIntent(query) !== null;
  }
}

export const journeyEngine = new JourneyEngine();
