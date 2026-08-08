import type { KnowledgeGap, SubjectId } from "./types";

interface PrerequisiteMap {
  concept: string;
  subject: SubjectId[];
  prerequisites: { concept: string; description: string }[];
}

const PREREQUISITE_KNOWLEDGE: PrerequisiteMap[] = [
  {
    concept: "neural network",
    subject: ["artificial-intelligence", "machine-learning"],
    prerequisites: [
      { concept: "Linear Algebra", description: "Matrices, vectors, and matrix multiplication" },
      { concept: "Calculus", description: "Derivatives and chain rule for backpropagation" },
      { concept: "Probability", description: "Basic probability and statistics" },
      { concept: "Python Programming", description: "Basic programming skills" },
    ],
  },
  {
    concept: "deep learning",
    subject: ["artificial-intelligence", "machine-learning"],
    prerequisites: [
      { concept: "Neural Networks", description: "Basic neural network architecture" },
      { concept: "Backpropagation", description: "How gradients flow through networks" },
      { concept: "Linear Algebra", description: "Matrix operations and tensors" },
    ],
  },
  {
    concept: "transformer",
    subject: ["artificial-intelligence", "machine-learning"],
    prerequisites: [
      { concept: "Neural Networks", description: "Basic neural network concepts" },
      { concept: "Attention Mechanism", description: "How attention works in sequence models" },
      { concept: "Word Embeddings", description: "Vector representations of words" },
      { concept: "Sequence Models", description: "RNNs, LSTMs, and sequential data" },
    ],
  },
  {
    concept: "reinforcement learning",
    subject: ["artificial-intelligence", "machine-learning"],
    prerequisites: [
      { concept: "Markov Decision Processes", description: "States, actions, and rewards" },
      { concept: "Dynamic Programming", description: "Bellman equations and value iteration" },
      { concept: "Probability Theory", description: "Expected values and probability distributions" },
    ],
  },
  {
    concept: "graph neural network",
    subject: ["artificial-intelligence", "machine-learning", "computer-science"],
    prerequisites: [
      { concept: "Graph Theory", description: "Nodes, edges, adjacency matrices" },
      { concept: "Neural Networks", description: "Basic feedforward neural networks" },
      { concept: "Linear Algebra", description: "Matrix operations" },
      { concept: "Message Passing", description: "How information flows in graphs" },
    ],
  },
  {
    concept: "encryption",
    subject: ["cybersecurity", "computer-science"],
    prerequisites: [
      { concept: "Number Theory", description: "Prime numbers, modular arithmetic" },
      { concept: "Basic Cryptography", description: "Symmetric and asymmetric encryption concepts" },
    ],
  },
  {
    concept: "blockchain",
    subject: ["computer-science", "cybersecurity"],
    prerequisites: [
      { concept: "Cryptography", description: "Hash functions and digital signatures" },
      { concept: "Distributed Systems", description: "Consensus algorithms and networking" },
      { concept: "Data Structures", description: "Merkle trees and linked lists" },
    ],
  },
  {
    concept: "quantum computing",
    subject: ["computer-science", "physics", "mathematics"],
    prerequisites: [
      { concept: "Linear Algebra", description: "Complex vector spaces and matrices" },
      { concept: "Quantum Mechanics", description: "Superposition and entanglement" },
      { concept: "Complex Numbers", description: "Complex arithmetic and phases" },
    ],
  },
  {
    concept: "calculus",
    subject: ["mathematics", "physics", "engineering"],
    prerequisites: [
      { concept: "Algebra", description: "Equations, functions, and graphing" },
      { concept: "Trigonometry", description: "Sine, cosine, tangent functions" },
      { concept: "Limits", description: "Concept of approaching a value" },
    ],
  },
  {
    concept: "linear algebra",
    subject: ["mathematics", "computer-science", "physics", "engineering"],
    prerequisites: [
      { concept: "Algebra", description: "Basic equation solving" },
      { concept: "Coordinate Geometry", description: "Points, lines, and planes" },
    ],
  },
  {
    concept: "machine learning",
    subject: ["artificial-intelligence", "computer-science", "statistics"],
    prerequisites: [
      { concept: "Statistics", description: "Probability distributions and hypothesis testing" },
      { concept: "Linear Algebra", description: "Matrices and vectors" },
      { concept: "Calculus", description: "Derivatives and gradient descent" },
      { concept: "Programming", description: "Ability to implement algorithms" },
    ],
  },
  {
    concept: "contract law",
    subject: ["law", "business"],
    prerequisites: [
      { concept: "Legal Systems", description: "Common law vs civil law" },
      { concept: "Offer and Acceptance", description: "Basic contract formation" },
    ],
  },
  {
    concept: "option pricing",
    subject: ["finance", "mathematics", "economics"],
    prerequisites: [
      { concept: "Probability", description: "Distributions and expected values" },
      { concept: "Calculus", description: "Stochastic calculus for Black-Scholes" },
      { concept: "Financial Markets", description: "How stocks and options trade" },
    ],
  },
  {
    concept: "time series analysis",
    subject: ["statistics", "machine-learning", "economics", "finance"],
    prerequisites: [
      { concept: "Regression", description: "Linear and multiple regression" },
      { concept: "Probability", description: "Stationarity and correlation" },
      { concept: "Basic Statistics", description: "Mean, variance, covariance" },
    ],
  },
  {
    concept: "bayesian statistics",
    subject: ["statistics", "machine-learning", "mathematics"],
    prerequisites: [
      { concept: "Probability Theory", description: "Conditional probability and Bayes rule" },
      { concept: "Calculus", description: "Integration for posterior computation" },
      { concept: "Frequentist Statistics", description: "Traditional statistical inference" },
    ],
  },
  {
    concept: "organic chemistry",
    subject: ["chemistry", "biology", "medicine"],
    prerequisites: [
      { concept: "General Chemistry", description: "Atomic structure and bonding" },
      { concept: "Chemical Bonding", description: "Covalent and ionic bonds" },
    ],
  },
  {
    concept: "genetics",
    subject: ["biology", "medicine"],
    prerequisites: [
      { concept: "Cell Biology", description: "Cell structure and function" },
      { concept: "DNA Structure", description: "Double helix and base pairing" },
    ],
  },
  {
    concept: "macroeconomics",
    subject: ["economics", "business", "finance"],
    prerequisites: [
      { concept: "Microeconomics", description: "Supply, demand, and market equilibrium" },
      { concept: "Basic Algebra", description: "Graphing and equation solving" },
    ],
  },
  {
    concept: "financial accounting",
    subject: ["accounting", "business", "finance"],
    prerequisites: [
      { concept: "Basic Math", description: "Arithmetic and percentages" },
      { concept: "Business Fundamentals", description: "Basic business operations" },
    ],
  },
  {
    concept: "machine learning",
    subject: [],
    prerequisites: [], // already defined above
  },
  {
    concept: "data structures",
    subject: ["computer-science", "software-engineering"],
    prerequisites: [
      { concept: "Basic Programming", description: "Variables, loops, and functions" },
      { concept: "Memory Management", description: "Stack vs heap allocation" },
    ],
  },
  {
    concept: "operating systems",
    subject: ["computer-science", "software-engineering"],
    prerequisites: [
      { concept: "Computer Architecture", description: "CPU, memory, and I/O" },
      { concept: "Data Structures", description: "Queues, scheduling algorithms" },
      { concept: "C Programming", description: "Low-level systems programming" },
    ],
  },
  {
    concept: "compiler design",
    subject: ["computer-science", "software-engineering"],
    prerequisites: [
      { concept: "Formal Languages", description: "Regular expressions and grammars" },
      { concept: "Data Structures", description: "Trees, hash tables, graphs" },
      { concept: "Assembly", description: "Low-level code generation" },
    ],
  },
];

export class KnowledgeGapEngine {
  estimatePrerequisites(query: string, subject?: SubjectId): KnowledgeGap[] {
    const lower = query.toLowerCase();
    const matched: KnowledgeGap[] = [];

    for (const entry of PREREQUISITE_KNOWLEDGE) {
      const conceptRegex = new RegExp(
        entry.concept
          .split(/\s+/)
          .map((w) => w.replace(/[^a-z0-9]/g, ""))
          .filter(Boolean)
          .join("\\s*"),
        "i"
      );

      if (conceptRegex.test(lower)) {
        for (const prereq of entry.prerequisites) {
          const alreadyMentioned = PREREQUISITE_KNOWLEDGE.some((e) =>
            new RegExp(e.concept.replace(/[^a-z0-9]/g, "\\s*"), "i").test(lower) &&
            e.concept.toLowerCase() === prereq.concept.toLowerCase()
          );

          matched.push({
            concept: prereq.concept,
            description: prereq.description,
            isMissing: !alreadyMentioned,
          });
        }
      }
    }

    return matched;
  }

  buildPrerequisiteDirective(gaps: KnowledgeGap[]): string {
    const missing = gaps.filter((g) => g.isMissing);
    if (missing.length === 0) return "";

    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PREREQUISITE KNOWLEDGE DETECTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The student may be missing prerequisite knowledge for this topic.
Before teaching the main concept, briefly cover these foundations:

${missing.map((g, i) => `${i + 1}. ${g.concept} — ${g.description}`).join("\n")}

INSTRUCTION:
- Start with a BRIEF section titled "📋 Prerequisites" that introduces each prerequisite in 1-2 sentences
- Assume the student knows NOTHING about each prerequisite
- Use simple language for the prerequisite section
- After the prerequisite section, transition to the main topic
- Label the sections clearly so the student knows when prerequisites end and the main topic begins`;
  }
}

export const knowledgeGapEngine = new KnowledgeGapEngine();
