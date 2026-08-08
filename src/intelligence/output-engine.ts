import type { OutputFormat, OutputFormatResult, UserIntent, SubjectId } from "./types";
import { OUTPUT_LABELS } from "./types";

interface FormatRule {
  format: OutputFormat;
  appliesTo: { intents: UserIntent[]; subjects: SubjectId[] };
  priority: number;
  directive: string;
}

const FORMAT_RULES: FormatRule[] = [
  {
    format: "lesson",
    priority: 10,
    appliesTo: { intents: ["learn", "understand-concept", "revise", "explain-mistakes"], subjects: [] },
    directive: `OUTPUT FORMAT: Structured Lesson

Produce a structured lesson with:
• 🎯 Learning Goal — what the student will achieve
• 📋 Prerequisites — what they need to know
• Core Concept — precise definition and explanation
• Intuition — build mental model with analogy
• Visual Description — describe as a diagram
• Real World Example — practical application
• Interactive Exercise — active learning moment
• Common Mistakes — what to watch out for
• 🧠 Memory Trick — how to remember
• ✅ Checkpoint — quick understanding check
• 📝 Summary — key takeaways

Each lesson must feel like a private tutoring session, not a textbook chapter.`,
  },
  {
    format: "research-report",
    priority: 8,
    appliesTo: { intents: ["research"], subjects: [] },
    directive: `OUTPUT FORMAT: Research Report

Produce a formal research report with:
• Abstract — brief summary of findings
• Introduction — context and importance
• Current State of Knowledge — what is known
• Key Perspectives — major schools of thought
• Evidence Assessment — quality of supporting evidence
• Debates and Controversies — what researchers disagree about
• Open Questions — what remains unknown
• Research Directions — where the field is going
• References — key papers and resources

Use academic tone. Cite specific researchers and papers where possible.`,
  },
  {
    format: "mind-map",
    priority: 5,
    appliesTo: { intents: ["learn", "understand-concept", "revise", "roadmap"], subjects: [] },
    directive: `OUTPUT FORMAT: Mind Map Description

Present the information as a mind map structure:
• Center node: the main topic
• Primary branches: 4-7 main categories
• Secondary branches: specific details under each category
• Tertiary branches: examples, facts, or sub-details

Use indentation to show hierarchy:
🌳 CENTRAL TOPIC
├── 🌿 Branch 1
│   ├── Leaf 1.1
│   └── Leaf 1.2
├── 🌿 Branch 2
│   ├── Leaf 2.1
│   └── Leaf 2.2

Describe the visual layout so the student can draw it.`,
  },
  {
    format: "timeline",
    priority: 5,
    appliesTo: { intents: ["learn", "research", "revise"], subjects: ["history", "computer-science", "artificial-intelligence"] },
    directive: `OUTPUT FORMAT: Timeline

Present the information as a chronological timeline:
• Date/Period: Event or Milestone
• Significance: Why this matters
• Context: What led to this
• Impact: What changed because of it

Format:
━━ 1900 — Title
   Description of what happened and why it matters.
━━ 1920 — Title
   Description...

Use consistent spacing. Bold key dates.`,
  },
  {
    format: "comparison-table",
    priority: 7,
    appliesTo: { intents: ["compare"], subjects: [] },
    directive: `OUTPUT FORMAT: Comparison Table

Present the comparison as a structured table:

| Feature | Option A | Option B | Winner |
|---------|----------|----------|--------|
| Aspect 1 | Detail 1 | Detail 2 | A/B    |

After the table, provide:
• Summary of key differences
• When to choose each option
• Common misconceptions about the comparison
• Recommendation based on use case

Use | columns | for | the | table | format.`,
  },
  {
    format: "case-analysis",
    priority: 7,
    appliesTo: { intents: ["analyze", "learn", "understand-concept"], subjects: ["law", "business", "medicine"] },
    directive: `OUTPUT FORMAT: Case Analysis

Analyze the case/situation using this structure:
• Facts — relevant facts of the case
• Issue — what needs to be decided
• Analysis — apply relevant principles
• Conclusion — outcome and reasoning
• Implications — broader significance`,
  },
  {
    format: "legal-irac",
    priority: 9,
    appliesTo: { intents: ["analyze", "learn", "solve-assignment"], subjects: ["law"] },
    directive: `OUTPUT FORMAT: Legal IRAC Analysis

Use the IRAC framework:
ISSUE: State the legal question precisely.
RULE: Identify the relevant legal principles, statutes, and precedents.
APPLICATION: Apply the rules to the facts. Analyze both sides.
CONCLUSION: State the likely outcome and reasoning.

After IRAC, include:
• Key cases cited
• Alternative arguments
• Practical implications`,
  },
  {
    format: "business-swot",
    priority: 9,
    appliesTo: { intents: ["analyze", "plan", "create"], subjects: ["business", "marketing"] },
    directive: `OUTPUT FORMAT: Business SWOT Analysis

| | Positive | Negative |
|---|---|---|
| Internal | Strengths | Weaknesses |
| External | Opportunities | Threats |

After the table, provide:
• Strategic recommendations based on the SWOT
• Priority actions
• Risk mitigation strategies`,
  },
  {
    format: "flowchart-description",
    priority: 5,
    appliesTo: { intents: ["learn", "understand-concept", "explain-mistakes"], subjects: ["computer-science", "engineering"] },
    directive: `OUTPUT FORMAT: Flowchart Description

Describe the process as a flowchart:
• Start → Decision → Action → End
• Use indentation to show branches
• Describe conditions at each decision point
• Show loop backs for repetition

Format:
[Start] → [Step 1] → [Decision: Condition?]
  ├── Yes → [Step 2A] → [End]
  └── No → [Step 2B] → [Back to Step 1]

Provide the flowchart as ASCII art.`,
  },
  {
    format: "algorithm-walkthrough",
    priority: 6,
    appliesTo: { intents: ["learn", "understand-concept", "practice"], subjects: ["computer-science", "mathematics"] },
    directive: `OUTPUT FORMAT: Algorithm Walkthrough

Explain the algorithm with:
• Purpose — what problem this solves
• Input/Output — what goes in and comes out
• Steps — pseudocode or clear step description
• Example Trace — walk through with specific input
• Complexity Analysis — time and space
• Edge Cases — what happens at boundaries
• Optimizations — how to improve`,
  },
  {
    format: "project-guide",
    priority: 6,
    appliesTo: { intents: ["create", "plan", "solve-assignment"], subjects: [] },
    directive: `OUTPUT FORMAT: Project Guide

Provide a complete project guide:
• Project Overview — what we're building
• Prerequisites — tools and knowledge needed
• Step-by-Step Instructions — numbered steps
• Code/Templates — ready-to-use code
• Expected Output — what the result looks like
• Testing — how to verify it works
• Extensions — how to take it further`,
  },
  {
    format: "notebook",
    priority: 4,
    appliesTo: { intents: ["learn", "understand-concept", "revise"], subjects: [] },
    directive: `OUTPUT FORMAT: Notebook Entry

Write as a personal study note:
• Date and Topic header
• Key Concepts — concise definitions
• My Understanding — in your own words
• Important Details — formulas, rules, exceptions
• Questions I Have — things to look up
• Summary — what I learned today

Keep it personal and conversational.`,
  },
  {
    format: "revision-notes",
    priority: 8,
    appliesTo: { intents: ["revise", "summarize", "exam-prep"], subjects: [] },
    directive: `OUTPUT FORMAT: Revision Notes

Create concise revision notes:
• Topic header with key formula/definition
• Bullet points — only the essential information
• Memory aids — mnemonics and triggers
• Quick reference table
• Common exam mistakes
• "At a glance" summary

Optimize for quick scanning. Use bold for key terms. Keep each point to one line.`,
  },
  {
    format: "flashcards",
    priority: 9,
    appliesTo: { intents: ["flashcards", "practice", "revise", "exam-prep"], subjects: [] },
    directive: `OUTPUT FORMAT: Flashcards

Generate a set of flashcards in this format:

Flashcard 1
Front: Question or term
Back: Answer or definition

Flashcard 2
Front: Question or term
Back: Answer or definition

Generate 10-20 flashcards covering:
• Key definitions (What is X?)
• Core concepts (Explain X)
• Comparisons (Compare X and Y)
• Examples (What is an example of X?)
• Applications (When would you use X?)

Group them by difficulty: Basic, Intermediate, Advanced.`,
  },
  {
    format: "quiz",
    priority: 8,
    appliesTo: { intents: ["practice", "exam-prep"], subjects: [] },
    directive: `OUTPUT FORMAT: Quiz

Generate a quiz with mixed question types:

Section 1: Multiple Choice (3-5 questions)
Q1: Question text
A) Option 1
B) Option 2
C) Option 3
D) Option 4
Correct: [Letter] — Explanation

Section 2: True/False (2-3 questions)
Q: Statement
Answer: True/False — Explanation

Section 3: Short Answer (2-3 questions)
Q: Question
Answer: [Model answer]

Include answers and explanations after each section.`,
  },
  {
    format: "exam-guide",
    priority: 9,
    appliesTo: { intents: ["exam-prep"], subjects: [] },
    directive: `OUTPUT FORMAT: Exam Guide

Create a comprehensive exam preparation guide:
• Topic Overview — what's covered
• Key Concepts — must-know material
• Exam Format — question types and marks
• Study Strategy — how to prepare efficiently
• Common Pitfalls — what loses marks
• Practice Questions — with model answers
• Last-Minute Revision — quick reference

Optimize for exam success. Include marks allocation tips.`,
  },
];

export class OutputEngine {
  selectFormat(intent: UserIntent, subject: SubjectId, _difficulty: string): OutputFormatResult {
    let bestMatch: FormatRule | null = null;
    let bestPriority = -1;

    for (const rule of FORMAT_RULES) {
      const intentMatch = rule.appliesTo.intents.length === 0 || rule.appliesTo.intents.includes(intent);
      const subjectMatch = rule.appliesTo.subjects.length === 0 || rule.appliesTo.subjects.includes(subject);

      if (intentMatch && subjectMatch) {
        if (rule.priority > bestPriority) {
          bestPriority = rule.priority;
          bestMatch = rule;
        }
      }
    }

    if (!bestMatch) {
      return {
        format: "lesson",
        formatLabel: "Structured Lesson",
        formattingRules: "Use clear Markdown formatting with headers, bullet points, and examples.",
      };
    }

    return {
      format: bestMatch.format,
      formatLabel: OUTPUT_LABELS[bestMatch.format],
      formattingRules: bestMatch.directive,
    };
  }
}

export const outputEngine = new OutputEngine();
