import type { LearnerProfile } from "../types";
import { CONFIDENCE_ORDER } from "../types";

export interface CognitiveNextStep {
  label: string;
  description: string;
  type: "next-topic" | "deepen" | "practice" | "connect" | "review";
  conceptId?: string;
  confidence?: string;
}

export class CognitiveSmartContinuations {
  generateNextSteps(
    profile: LearnerProfile,
    currentQuery: string,
    currentSubject: string,
    detectedConcepts: string[],
  ): CognitiveNextStep[] {
    const steps: CognitiveNextStep[] = [];
    const knowledge = Object.values(profile.knowledgeState);

    const introducedRecently = knowledge.filter(
      (c) => c.level === "introduced" && Date.now() - c.lastInteraction < 30 * 60 * 1000,
    );

    for (const concept of introducedRecently.slice(0, 2)) {
      const nextLevel = this.suggestNextForConcept(concept.conceptLabel, currentSubject);
      if (nextLevel) {
        steps.push({
          label: `Next: ${nextLevel}`,
          description: `You now understand ${concept.conceptLabel}. The next logical topic is ${nextLevel}.`,
          type: "next-topic",
          conceptId: concept.conceptId,
          confidence: concept.level,
        });
      }
    }

    const atLearning = knowledge.filter((c) => c.level === "learning");
    for (const concept of atLearning.slice(0, 2)) {
      steps.push({
        label: `Deepen: ${concept.conceptLabel}`,
        description: `You have been introduced to ${concept.conceptLabel}. Strengthen your understanding with a deeper explanation.`,
        type: "deepen",
        conceptId: concept.conceptId,
        confidence: concept.level,
      });
    }

    const atComfortable = knowledge.filter((c) => c.level === "comfortable");
    for (const concept of atComfortable.slice(0, 1)) {
      steps.push({
        label: `Practice: ${concept.conceptLabel}`,
        description: `Test your understanding of ${concept.conceptLabel} with challenging questions.`,
        type: "practice",
        conceptId: concept.conceptId,
        confidence: concept.level,
      });
    }

    if (detectedConcepts.length >= 2) {
      const connection = this.findConnectionSuggestion(detectedConcepts, currentSubject);
      if (connection) {
        steps.push({
          label: `Connect: ${connection}`,
          description: `Explore how these concepts relate to each other for a more complete picture.`,
          type: "connect",
        });
      }
    }

    if (knowledge.some((c) => c.level === "introduced" && Date.now() - c.lastInteraction > 60 * 60 * 1000)) {
      steps.push({
        label: "Review Earlier Topics",
        description: "Some concepts may benefit from a quick review to reinforce your understanding.",
        type: "review",
      });
    }

    return steps;
  }

  private suggestNextForConcept(concept: string, _subject: string): string | null {
    const nextMap: Record<string, string> = {
      "Recursion": "Dynamic Programming",
      "Variables": "Functions",
      "Functions": "Higher-Order Functions",
      "Arrays": "Data Structures",
      "Vectors": "Matrices",
      "Matrices": "Linear Transformations",
      "Offer": "Acceptance",
      "Offer and Acceptance": "Consideration",
      "Demand": "Supply",
      "Supply and Demand": "Market Equilibrium",
      "Neurons": "Neural Networks",
      "Neural Networks": "Deep Learning",
      "Gradient Descent": "Optimization Algorithms",
      "Probability": "Bayesian Inference",
      "Statistics": "Hypothesis Testing",
      "SQL": "Database Normalization",
      "HTTP": "REST APIs",
      "Git": "Version Control Workflows",
      "HTML": "CSS",
      "CSS": "Responsive Design",
      "React": "State Management",
    };

    return nextMap[concept] ?? null;
  }

  private findConnectionSuggestion(concepts: string[], _subject: string): string | null {
    if (concepts.length >= 3) {
      return `${concepts[0]} ↔ ${concepts[1]} ↔ ${concepts[2]}`;
    }
    if (concepts.length === 2) {
      return `How ${concepts[0]} relates to ${concepts[1]}`;
    }
    return null;
  }
}
