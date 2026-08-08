import type { SubjectProfile } from "../types";

export const generalKnowledgeProfile: SubjectProfile = {
  id: "general-knowledge",
  name: "General Knowledge",
  description: "A broad understanding of diverse topics, concepts, and facts across multiple disciplines and domains.",
  keywords: [
    "general knowledge", "trivia", "overview", "introduction", "basics",
    "explain", "what is", "how does", "tell me about", "learn about",
    "understand", "meaning", "definition", "concept", "idea",
    "curiosity", "learning", "education", "knowledge",
  ],
  subdisciplines: [
    "general knowledge", "trivia", "popular science",
    "current events", "culture", "geography",
  ],
  teachingPhilosophy: {
    coreBelief: "General knowledge should be taught by connecting new information to what the learner already knows, building bridges between disciplines.",
    explanationOrder: [
      "Start with what the learner likely already knows",
      "Introduce the new topic by connecting it to familiar ideas",
      "Cover the essential facts and concepts",
      "Show why this topic matters or is interesting",
      "Connect to related topics across disciplines",
      "Give practical ways to learn more",
    ],
    preferredExamples: [
      "Everyday objects with surprising science behind them",
      "Historical events that shaped the modern world",
      "Natural phenomena visible in daily life",
      "Inventions and discoveries and their inventors",
      "Geographic and cultural facts that explain current events",
    ],
    preferredAnalogies: [
      "Knowledge as a web: new information connects to existing nodes",
      "Learning as building a puzzle: each piece makes the picture clearer",
      "Understanding as layers of an onion: deeper levels reveal more complexity",
      "General knowledge as a toolkit: different tools for different situations",
    ],
    difficultyProgression: [
      "What is the basic idea?",
      "Why is it interesting or important?",
      "How does it connect to other things you know?",
      "What are the key facts to remember?",
      "What deeper questions does it raise?",
    ],
    responseStructure: [
      "Big Picture: what this topic is and why it is worth knowing",
      "Intuition: the core idea in plain language",
      "Core Explanation: the essential facts and concepts",
      "Worked Example: how this manifests in the real world",
      "Visual Thinking: maps, diagrams, or tables",
      "Common Mistakes: things people often get wrong",
      "Memory Trick: a simple way to remember key facts",
      "Real World Applications: why this matters in daily life",
      "Challenge Question: a thought-provoking question",
      "Summary: five key facts or takeaways",
    ],
    importantTerminology: [
      "Included as needed based on the specific topic.",
    ],
    commonMisconceptions: [
      "Knowing facts without understanding connections is trivia, not knowledge",
      "Being wrong about a fact does not mean you are ignorant — it is an opportunity to learn",
      "No one knows everything — general knowledge is about breadth, not depth in all areas",
    ],
    visualStrategy: "Use maps for geographic connections, timelines for historical context, comparison tables for contrasting ideas, flowcharts for processes, and mind maps for showing how topics connect across disciplines.",
    practiceStrategy: "Read broadly across disciplines. Ask 'why' and 'how' questions about everyday phenomena. Relate new information to what you already know. Quiz yourself on connections between topics. Share what you learn with others.",
    revisionStrategy: "Review by making connections across topics. Create mental maps of how different fields relate. Stay curious and follow interesting questions. Read diverse sources on the same topic to understand different perspectives. Teach others what you have learned.",
  },
};
