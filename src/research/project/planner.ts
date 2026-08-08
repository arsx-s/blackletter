import { SubjectDetector } from "../../engine/detection/detector";
import { ProfileRegistry } from "../../engine/profiles/registry";
import type { ResearchPlannerOutput } from "../types";

export class ResearchPlanner {
  private subjectDetector = SubjectDetector;
  private profileRegistry = ProfileRegistry;

  generatePlan(query: string): ResearchPlannerOutput {
    const classification = this.subjectDetector.detect(query);
    const profile = this.profileRegistry.get(classification.primaryId)
      ?? this.profileRegistry.getDefault();

    const now = Date.now();
    const topicClean = query
      .replace(/^(i want to research|research|study|learn|explain|tell me about|what is|how does|why does)\s+/i, "")
      .replace(/[?.!]+$/, "")
      .trim();

    return {
      researchGoal: this.generateGoal(topicClean, profile.name),
      learningObjectives: this.generateObjectives(topicClean, profile),
      researchQuestions: this.generateQuestions(topicClean, profile),
      keyConcepts: this.generateKeyConcepts(topicClean, profile),
      areasToInvestigate: this.generateAreas(topicClean, profile),
      potentialChallenges: this.generateChallenges(topicClean, profile),
      futureTopics: this.generateFutureTopics(topicClean, profile),
      generatedAt: now,
    };
  }

  private generateGoal(topic: string, subjectName: string): string {
    return `Develop a comprehensive understanding of ${topic} within the field of ${subjectName}, covering foundational principles through advanced applications and current research.`;
  }

  private generateObjectives(topic: string, profile: { name: string; keywords: string[]; subdisciplines: string[] }): string[] {
    const objectives: string[] = [
      `Define ${topic} and explain its core principles`,
      `Understand how ${topic} fits within the broader field of ${profile.name}`,
      `Identify the key methodologies and approaches used in ${topic}`,
      `Analyze real-world applications and implications of ${topic}`,
    ];

    if (profile.subdisciplines.length > 0) {
      const relevant = profile.subdisciplines.slice(0, 2);
      objectives.push(`Explore connections between ${topic} and ${relevant.join(" and ")}`);
    }

    objectives.push(`Evaluate current research, debates, and open questions in ${topic}`);
    return objectives;
  }

  private generateQuestions(topic: string, profile: { keywords: string[]; subdisciplines: string[] }): string[] {
    const questions: string[] = [
      `What is ${topic} and why does it matter?`,
      `What are the fundamental principles underlying ${topic}?`,
      `How has understanding of ${topic} evolved over time?`,
    ];

    const keywords = profile.keywords?.slice(0, 3) ?? [];
    for (const kw of keywords) {
      questions.push(`How does ${kw} relate to ${topic}?`);
    }

    questions.push(`What are the current limitations or open challenges in ${topic}?`);
    questions.push(`How is ${topic} applied in practice across different domains?`);

    return questions.slice(0, 8);
  }

  private generateKeyConcepts(
    topic: string,
    profile: { name: string; keywords: string[]; subdisciplines: string[] },
  ): { term: string; definition: string }[] {
    const concepts: { term: string; definition: string }[] = [];
    const seen = new Set<string>();

    const addConcept = (term: string, definition: string) => {
      const key = term.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        concepts.push({ term, definition });
      }
    };

    addConcept(
      topic.charAt(0).toUpperCase() + topic.slice(1),
      `The central subject of this research project within ${profile.name}`,
    );

    const primaryKeywords = profile.keywords?.slice(0, 5) ?? [];
    for (const kw of primaryKeywords) {
      addConcept(
        kw.charAt(0).toUpperCase() + kw.slice(1),
        `A key concept in ${profile.name} related to ${topic}`,
      );
    }

    const primarySubs = profile.subdisciplines?.slice(0, 3) ?? [];
    for (const sub of primarySubs) {
      addConcept(
        sub.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
        `A subfield of ${profile.name} connected to ${topic}`,
      );
    }

    return concepts.slice(0, 8);
  }

  private generateAreas(topic: string, profile: { name: string; subdisciplines: string[] }): string[] {
    const areas = [
      `Foundational principles and theoretical background of ${topic}`,
      `Historical development and evolution of ideas in ${topic}`,
      `Current state-of-the-art and latest developments`,
      `Practical applications and case studies`,
    ];

    const subs = profile.subdisciplines?.slice(0, 3) ?? [];
    for (const sub of subs) {
      areas.push(`Connections between ${topic} and ${sub}`);
    }

    areas.push(`Ethical considerations and societal impact`);
    areas.push(`Future directions and emerging trends`);

    return areas;
  }

  private generateChallenges(topic: string, _profile: { name: string }): string[] {
    return [
      `Complexity: ${topic} may involve interconnected concepts that require understanding multiple layers simultaneously`,
      `Prerequisites: Some aspects of ${topic} may require foundational knowledge from related areas`,
      `Rapidly evolving field: Keeping up with the latest developments and shifting consensus`,
      `Information overload: Distinguishing essential from peripheral information`,
      `Practical application: Bridging theoretical understanding with real-world implementation`,
    ];
  }

  private generateFutureTopics(topic: string, profile: { name: string; subdisciplines: string[] }): string[] {
    const topics = [
      `Advanced applications of ${topic} in industry`,
      `Cutting-edge research directions in ${topic}`,
      `Interdisciplinary connections between ${topic} and other fields`,
    ];

    const subs = profile.subdisciplines?.slice(0, 2) ?? [];
    for (const sub of subs) {
      topics.push(`Deep dive into ${sub} as it relates to ${topic}`);
    }

    return topics.slice(0, 6);
  }
}
