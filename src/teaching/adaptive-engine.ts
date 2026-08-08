export type ExplanationMode = "visual" | "story" | "analogy" | "technical" | "beginner" | "exam" | "interview" | "research";

export type DifficultyLevel = "elementary" | "high-school" | "undergraduate" | "graduate" | "professional" | "research";

export interface ModeDefinition {
  id: ExplanationMode;
  label: string;
  icon: string;
  directive: string;
}

const MODE_CYCLE: ExplanationMode[] = ["visual", "story", "analogy", "technical", "beginner", "exam", "interview", "research"];

const MODE_DEFINITIONS: Record<ExplanationMode, ModeDefinition> = {
  visual: {
    id: "visual",
    label: "Visual Thinking",
    icon: "eye",
    directive: `TEACHING MODE: Visual Thinking

Teach this concept AS IF you are drawing diagrams on a whiteboard.

RULES:
- Always start by describing what the concept LOOKS LIKE
- Use spatial language: above, below, inside, connected to, flows into
- Describe flowcharts, tree diagrams, network graphs, timelines
- Use tables to compare and contrast
- Use ASCII-style diagrams where helpful
- Describe relationships as visual connections
- "Imagine a diagram where..."

OUTPUT STRUCTURE:
[Visual Overview] - What this looks like as a picture
[Diagram Description] - Step-by-step visual walkthrough
[Relationship Map] - How parts connect
[Before/After] - What changes during the process
[Visual Summary] - A table or diagram recap`,
  },
  story: {
    id: "story",
    label: "Story Mode",
    icon: "book-open",
    directive: `TEACHING MODE: Story Mode

Turn this concept into a MEMORABLE NARRATIVE.

RULES:
- Create a character who encounters this concept
- Show the problem they face BEFORE discovering this concept
- Tell the story of how the concept helps them
- Use vivid details, tension, and resolution
- Make the student feel the "aha" moment
- End with the moral: what we learn from this story

OUTPUT STRUCTURE:
[The Problem] - What our character struggles with
[The Discovery] - How they encounter this concept
[The Journey] - Step by step through the concept as a story
[The Resolution] - How everything clicks
[The Moral] - What this teaches us`,
  },
  analogy: {
    id: "analogy",
    label: "Analogy Mode",
    icon: "git-compare",
    directive: `TEACHING MODE: Analogy Mode

Explain this concept ENTIRELY through an extended analogy from everyday life.

RULES:
- Choose ONE central analogy and stick with it
- Map EVERY part of the concept to the analogy
- Common analogies: cooking, driving, sports, building, gardening, shopping
- Example: CPU → Brain, RAM → Desk, Hard Drive → Filing Cabinet
- After the analogy, briefly show the real terminology in [Brackets]
- Make the analogy memorable and vivid

OUTPUT STRUCTURE:
[The Analogy] - Present the analogy first
[Mapping] - Map every concept element to the analogy
[Real Terms] - Show the actual terminology in context
[Why It Works] - Explain why this analogy fits
[Analogy Limitations] - Where the analogy breaks down (honesty)`,
  },
  technical: {
    id: "technical",
    label: "Technical Deep Dive",
    icon: "sigma",
    directive: `TEACHING MODE: Technical Deep Dive

Explain this at university/professional level.

RULES:
- Use precise technical terminology
- Include formal definitions
- Show mathematical or formal notation where applicable
- Reference established theories, standards, or frameworks
- Discuss trade-offs, complexity, and edge cases
- Assume the student is familiar with foundational concepts
- Cite relevant research or industry standards

OUTPUT STRUCTURE:
[Formal Definition] - Precise, rigorous definition
[Theoretical Foundation] - The theory behind it
[Technical Specification] - Precise details and parameters
[Edge Cases] - What happens at boundaries
[Trade-offs] - Pros, cons, and alternatives
[Advanced Considerations] - Beyond the basics`,
  },
  beginner: {
    id: "beginner",
    label: "Beginner Friendly",
    icon: "graduation-cap",
    directive: `TEACHING MODE: Beginner Friendly

Assume the student knows ABSOLUTELY NOTHING about this topic.

RULES:
- Define EVERY term before using it
- Use the simplest possible words
- One idea per sentence
- No assumed knowledge
- Explain like you're talking to someone with no background
- Avoid all jargon. When jargon is necessary, explain it immediately.
- Use short sentences. Short paragraphs.
- Check: "Would my grandmother understand this?"

OUTPUT STRUCTURE:
[What Is This?] - One-sentence definition in plain language
[Why Should You Care?] - Why this matters to YOU
[The Simple Version] - Explain without any technical terms
[Let's Try It] - A super simple example
[Words to Know] - Simple definitions of key terms
[Your Turn] - A tiny exercise to check understanding`,
  },
  exam: {
    id: "exam",
    label: "Exam Preparation",
    icon: "clipboard-check",
    directive: `TEACHING MODE: Exam Preparation

Focus entirely on helping the student PASS AN EXAM on this topic.

RULES:
- Identify what is MOST LIKELY to be tested
- Present clear, memorizable definitions
- Highlight "examiner favorites" — things that appear frequently
- Show common exam question patterns
- Provide model answers
- Point out what students commonly get wrong in exams
- Include marks-focused tips: "This is worth understanding for long questions"
- End with practice questions at exam difficulty

OUTPUT STRUCTURE:
[Key Definitions] - Must-know terms, exam-ready definitions
[Examiner's Focus] - What tends to appear in exams
[Common Exam Questions] - Typical question patterns
[Model Answer] - A perfect exam answer
[Marks Tip] - How to get full marks
[Practice Questions] - Try these yourself
[Revision Checklist] - Quick review before the exam`,
  },
  interview: {
    id: "interview",
    label: "Interview Preparation",
    icon: "briefcase",
    directive: `TEACHING MODE: Interview Preparation

Prepare the student for a JOB INTERVIEW question on this topic.

RULES:
- Explain practical, real-world applications
- Focus on what employers actually ask about
- Include "STAR" method answers where applicable
- Mention industry best practices
- Discuss common interview pitfalls
- Show how to demonstrate depth in an interview setting
- Include both fundamental knowledge AND practical experience signals
- End with likely follow-up questions

OUTPUT STRUCTURE:
[Why This Matters in Industry] - Real-world importance
[What Interviewers Look For] - Key signals they seek
[The Perfect Answer] - Structured interview response
[Common Mistakes in Interviews] - What loses candidates points
[Deep Dive Question] - What a follow-up might be
[Practical Experience Signal] - How to show you've done this
[Practice Question] - Try answering this yourself`,
  },
  research: {
    id: "research",
    label: "Research Mode",
    icon: "flask-conical",
    directive: `TEACHING MODE: Research Mode

Provide a deep, academic, critical analysis of this topic.

RULES:
- Present MULTIPLE perspectives and schools of thought
- Include opposing viewpoints and debates in the field
- Reference key papers, researchers, and seminal works
- Discuss methodological approaches and their limitations
- Identify open questions and active research areas
- Include critical analysis: what's contested, what's settled
- Discuss evidence quality and confidence in claims
- End with research directions and further reading

OUTPUT STRUCTURE:
[Overview of the Field] - Current state of knowledge
[Key Perspectives] - Major schools of thought
[Debates & Controversies] - What researchers disagree about
[Evidence Assessment] - Quality and confidence of evidence
[Open Questions] - What we don't know yet
[Research Directions] - Where the field is going
[Further Reading] - Key papers and resources`,
  },
};

const DIFFICULTY_KEYWORDS: Record<DifficultyLevel, RegExp[]> = {
  elementary: [/kid|child|simple|basics|beginner|start|new to|no experience/i],
  "high-school": [/high school|introduction|overview|fundamentals|explain like/i],
  undergraduate: [/undergrad|university|college|bachelor|degree|course|module|major/i],
  graduate: [/graduate|master|phd|advanced|complex|sophisticated|rigorous|formal/i],
  professional: [/industry|professional|enterprise|production|practical|implementation|deployment/i],
  research: [/research|paper|literature|study|analysis|theory|academic|seminal|frontier/i],
};

const DIFFICULTY_TERMS: Record<string, DifficultyLevel> = {
  algorithm: "undergraduate", complexity: "graduate", theorem: "graduate",
  proof: "graduate", enterprise: "professional", deployment: "professional",
  production: "professional", quantum: "graduate", research: "research",
  frontier: "research", asymptotic: "graduate", ontology: "graduate",
  epistemology: "graduate", paradigm: "graduate", heterogeneous: "graduate",
  stochastic: "graduate", bayesian: "graduate", polymorphism: "undergraduate",
  recursion: "undergraduate", encapsulation: "undergraduate",
};

const DURATION_ESTIMATES: Record<DifficultyLevel, string> = {
  elementary: "5 min",
  "high-school": "8 min",
  undergraduate: "12 min",
  graduate: "20 min",
  professional: "15 min",
  research: "25 min",
};

export class AdaptiveTeachingEngine {
  detectDifficulty(query: string): DifficultyLevel {
    const lower = query.toLowerCase();
    const words = lower.split(/\s+/);

    for (const level of ["research", "professional", "graduate", "undergraduate", "high-school", "elementary"] as DifficultyLevel[]) {
      if (DIFFICULTY_KEYWORDS[level].some((p) => p.test(lower))) return level;
    }

    const matchedTerms = words.filter((w) => DIFFICULTY_TERMS[w]);
    if (matchedTerms.length >= 2) return DIFFICULTY_TERMS[matchedTerms[0]];

    if (words.length >= 25) return "undergraduate";
    if (words.length >= 12) return "high-school";
    return "elementary";
  }

  getMode(id: ExplanationMode): ModeDefinition {
    return MODE_DEFINITIONS[id];
  }

  getNextMode(usedModes: ExplanationMode[]): ExplanationMode {
    const available = MODE_CYCLE.filter((m) => !usedModes.includes(m));
    if (available.length === 0) {
      const fresh = [...MODE_CYCLE];
      const last = usedModes[usedModes.length - 1];
      const idx = fresh.indexOf(last);
      return fresh[(idx + 1) % fresh.length];
    }
    return available[0];
  }

  getAllModes(): ModeDefinition[] {
    return Object.values(MODE_DEFINITIONS);
  }

  getModeLabel(id: ExplanationMode): string {
    return MODE_DEFINITIONS[id].label;
  }

  getModeIcon(id: ExplanationMode): string {
    return MODE_DEFINITIONS[id].icon;
  }

  getDuration(difficulty: DifficultyLevel): string {
    return DURATION_ESTIMATES[difficulty];
  }

  buildModeDirective(mode: ExplanationMode, difficulty: DifficultyLevel, query: string): string {
    const modeDef = MODE_DEFINITIONS[mode];
    const duration = this.getDuration(difficulty);
    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ADAPTIVE TEACHING MODE: ${modeDef.label}
DIFFICULTY LEVEL: ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
ESTIMATED STUDY TIME: ${duration}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${modeDef.directive}

INTERACTIVE TEACHING GUIDELINES:
- Occasionally ask micro-questions: "What do you think happens next?" or "Can you predict what this does?"
- Only use 1-2 micro-questions in this response. Do not overuse.
- Place questions at natural learning moments, not randomly.
- If asking a question, provide the answer right after.

LEARNING BLOCKS — automatically include where appropriate:
- ⚠️ WARNING: Highlight a common pitfall or dangerous assumption
- 💡 TIP: A practical tip that makes things easier
- 🧠 MEMORY TRICK: A mnemonic or mental hook
- 🎯 KEY INSIGHT: The single most important thing to remember
- ✋ COMMON MISTAKE: What beginners get wrong

QUALITY STANDARDS:
- Never sound generic or like an AI chatbot
- Every paragraph should feel handcrafted
- Use good spacing and rhythm
- Format beautifully with proper Markdown
- Be thoughtful, calm, professional, and highly educational
- Optimize for UNDERSTANDING, not length`;
  }
}

export const adaptiveEngine = new AdaptiveTeachingEngine();
