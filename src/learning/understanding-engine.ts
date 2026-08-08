const CONFUSION_PATTERNS = [
  /(don't|do not|can't|cannot|didn't|doesn't)\s+(understand|get|follow|grasp|comprehend)/i,
  /\b(confus|unclear|confusing|complicated|too complex|too hard|difficult)\b/i,
  /(explain|say|tell)\s+(again|differently|simpler|in another way)/i,
  /(simplify|simpler|simplest|dumb it down|el?i5|plain english|plain language)/i,
  /\b(still|yet|even after)\s+(don't|do not|can't|cannot)\s+(understand|get|follow)/i,
  /(what does|what's|what is)\s+.*\b(mean|means?)\??$/i,
  /(i'm|i am)\s+(lost|confused|struggling|stuck|not getting)\b/i,
  /(rephrase|reword|put differently|another way|different way)/i,
];

const CONFUSION_STYLES = [
  {
    name: "child",
    label: "Explain Like I'm Five",
    directive: "Use the simplest possible language. Short sentences. One idea at a time. Use a concrete example from a child's everyday life.",
  },
  {
    name: "analogy",
    label: "Everyday Analogy",
    directive: "Abandon all technical language. Find an analogy from everyday life (cooking, sports, driving, shopping) that perfectly maps to this concept. Build the entire explanation around the analogy.",
  },
  {
    name: "story",
    label: "Real-Life Story",
    directive: "Tell a short story about someone who encountered this concept in real life. Show the problem they faced, how they discovered this concept, and how it helped them.",
  },
  {
    name: "visual",
    label: "Visual Description",
    directive: "Describe the concept visually. Use spatial metaphors, before/after descriptions, and concrete imagery. Describe what it would look like if you could see it.",
  },
  {
    name: "practical",
    label: "Hands-On Approach",
    directive: "Focus entirely on doing. Give a step-by-step hands-on exercise. Skip theory. Show exactly what to do, in order, with clear outcomes at each step.",
  },
  {
    name: "prerequisite",
    label: "Start from Fundamentals",
    directive: "The user is missing prerequisites. Start from the absolute beginning. Identify and explain the foundational knowledge needed, then build up step by step.",
  },
  {
    name: "exam",
    label: "Exam-Focused",
    directive: "Explain this as if preparing for an exam. Focus on what is most likely to be tested. Use a question-answer format. Highlight what to memorize vs what to understand.",
  },
];

export class UnderstandingEngine {
  detectConfusion(query: string): { isConfused: boolean; strategy?: string; directive?: string } {
    const matched = CONFUSION_PATTERNS.some((p) => p.test(query));
    if (!matched) return { isConfused: false };

    const style = CONFUSION_STYLES[Math.floor(Math.random() * CONFUSION_STYLES.length)];
    return {
      isConfused: true,
      strategy: style.name,
      directive: `The user is confused. Generate an ENTIRELY NEW teaching strategy. Do not repeat anything from the previous explanation. Use this approach instead:\n\nStrategy: ${style.label}\n\n${style.directive}`,
    };
  }

  getAlternativeStrategies(): typeof CONFUSION_STYLES {
    return CONFUSION_STYLES;
  }
}

export const understandingEngine = new UnderstandingEngine();
