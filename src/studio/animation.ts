import type { AnimationPreset, AnimationToken } from "./types";

const DURATIONS = {
  instant: 50,
  fast: 100,
  normal: 200,
  slow: 300,
  deliberate: 400,
  narrative: 600,
} as const;

const EASING = {
  linear: "linear",
  default: "cubic-bezier(0.16, 1, 0.3, 1)",
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
  decelerate: "cubic-bezier(0, 0, 0.2, 1)",
  accelerate: "cubic-bezier(0.4, 0, 1, 1)",
  emphasize: "cubic-bezier(0.87, 0, 0.13, 1)",
} as const;

const PRESETS: Record<AnimationPreset, AnimationToken> = {
  "fade-in": { duration: DURATIONS.normal, easing: EASING.default, property: "opacity" },
  "fade-in-up": { duration: DURATIONS.normal, easing: EASING.decelerate, property: "transform, opacity" },
  "fade-in-down": { duration: DURATIONS.normal, easing: EASING.decelerate, property: "transform, opacity" },
  "slide-in-left": { duration: DURATIONS.slow, easing: EASING.smooth, property: "transform" },
  "slide-in-right": { duration: DURATIONS.slow, easing: EASING.smooth, property: "transform" },
  "scale-in": { duration: DURATIONS.normal, easing: EASING.spring, property: "transform, opacity" },
  expand: { duration: DURATIONS.slow, easing: EASING.decelerate, property: "height, opacity" },
  collapse: { duration: DURATIONS.slow, easing: EASING.accelerate, property: "height, opacity" },
  pulse: { duration: DURATIONS.narrative, easing: EASING.emphasize, property: "transform" },
  shimmer: { duration: DURATIONS.narrative, easing: EASING.linear, property: "background-position" },
};

export class AnimationSystem {
  private reducedMotion = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
  }

  getPreset(name: AnimationPreset): AnimationToken {
    const preset = PRESETS[name];
    if (this.reducedMotion) {
      return { ...preset, duration: 0 };
    }
    return preset;
  }

  getDuration(name: keyof typeof DURATIONS): number {
    return this.reducedMotion ? 0 : DURATIONS[name];
  }

  getEasing(name: keyof typeof EASING): string {
    return EASING[name];
  }

  css(name: AnimationPreset): string {
    const preset = this.getPreset(name);
    const duration = this.reducedMotion ? "0ms" : `${preset.duration}ms`;
    return `transition: ${preset.property} ${duration} ${preset.easing}`;
  }

  keyframes(name: AnimationPreset): string {
    switch (name) {
      case "fade-in":
        return "@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }";
      case "fade-in-up":
        return "@keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }";
      case "fade-in-down":
        return "@keyframes fadeInDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }";
      case "scale-in":
        return "@keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }";
      case "pulse":
        return "@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }";
      default:
        return "";
    }
  }

  stagger(index: number, baseDelay: number = 40): string {
    if (this.reducedMotion) return "0ms";
    return `${index * baseDelay}ms`;
  }

  isReducedMotion(): boolean {
    return this.reducedMotion;
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
  }
}

export const animation = new AnimationSystem();

export const microinteractions = {
  hover: {
    panel: "translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.08)",
    item: "background-color: rgba(59,130,246,0.04)",
    icon: "transform: scale(1.1)",
    button: "transform: translateY(-1px)",
  },
  click: {
    scale: "transform: scale(0.97)",
    feedback: "transition: transform 100ms cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
  focus: {
    ring: "box-shadow: 0 0 0 2px rgba(59,130,246,0.4)",
    transition: "box-shadow 200ms cubic-bezier(0.4, 0, 0.2, 1)",
  },
} as const;

export const loadingMessages = {
  research: [
    { id: "analyzing", label: "Analyzing query", description: "Understanding what you need", icon: "\uD83D\uDD0D" },
    { id: "researching", label: "Researching", description: "Gathering relevant information", icon: "\uD83D\uDCDA" },
    { id: "connecting", label: "Connecting concepts", description: "Finding relationships", icon: "\uD83D\uDD17" },
    { id: "verifying", label: "Verifying facts", description: "Checking accuracy", icon: "\u2705" },
    { id: "writing", label: "Writing response", description: "Crafting clear explanation", icon: "\u270D\uFE0F" },
    { id: "organizing", label: "Organizing knowledge", description: "Updating your knowledge base", icon: "\uD83D\uDCC2" },
  ],
  teaching: [
    { id: "understanding", label: "Understanding you", description: "Assessing your knowledge level", icon: "\uD83E\uDDD0" },
    { id: "preparing", label: "Preparing lesson", description: "Structuring the explanation", icon: "\uD83D\uDCDD" },
    { id: "finding", label: "Finding examples", description: "Selecting relevant examples", icon: "\uD83D\uDD0D" },
    { id: "creating", label: "Creating analogies", description: "Making it memorable", icon: "\uD83E\uDDE0" },
    { id: "pacing", label: "Setting pace", description: "Adapting to your level", icon: "\uD83D\uDFE0" },
  ],
  research_deep: [
    { id: "planning", label: "Planning research", description: "Creating investigation strategy", icon: "\uD83D\uDCCB" },
    { id: "gathering", label: "Gathering sources", description: "Collecting relevant materials", icon: "\uD83D\uDCC1" },
    { id: "analyzing", label: "Analyzing sources", description: "Evaluating quality and relevance", icon: "\uD83D\uDD0D" },
    { id: "synthesizing", label: "Synthesizing findings", description: "Combining insights", icon: "\uD83E\uDDE0" },
    { id: "checking", label: "Fact checking", description: "Verifying claims and evidence", icon: "\u2705" },
    { id: "citing", label: "Generating citations", description: "Formatting references", icon: "\uD83D\uDCD6" },
    { id: "writing", label: "Writing report", description: "Structuring final output", icon: "\u270D\uFE0F" },
  ],
} as const;

export const emptyStateTemplates = {
  research: {
    title: "Begin your research journey",
    description: "Ask a question about any topic. BlackLetter will gather information, analyze sources, and present clear findings.",
    action: "Start researching",
    icon: "\uD83D\uDD0D",
  },
  notes: {
    title: "Your notes will be smart",
    description: "Start taking notes. BlackLetter automatically links them to related concepts, sources, and knowledge objects.",
    action: "Write your first note",
    icon: "\uD83D\uDCDD",
  },
  knowledge: {
    title: "Build your knowledge base",
    description: "Every interaction adds to your knowledge graph. Ask questions, upload documents, or explore topics to get started.",
    action: "Explore a topic",
    icon: "\uD83E\uDDE0",
  },
  documents: {
    title: "Upload your first document",
    description: "Drop PDFs, notes, or research papers. BlackLetter will read, analyze, and connect them to your knowledge.",
    action: "Upload document",
    icon: "\uD83D\uDCC4",
  },
  mindmap: {
    title: "Map your thoughts",
    description: "Create a mind map to visualize connections between ideas. Start with a central concept and branch out.",
    action: "Create mind map",
    icon: "\uD83E\uDDE0",
  },
  whiteboard: {
    title: "Think on an infinite canvas",
    description: "Sketch ideas, connect concepts, add sticky notes. Your whiteboard grows with your thinking.",
    action: "Start drawing",
    icon: "\u270F\uFE0F",
  },
  timeline: {
    title: "Track your research progress",
    description: "As you research, key milestones and discoveries will appear here automatically.",
    action: "Start researching",
    icon: "\uD83D\uDCC5",
  },
  tasks: {
    title: "Stay organized",
    description: "Add tasks to track your research goals, reading list, and project milestones.",
    action: "Add your first task",
    icon: "\u2611",
  },
} as const;

export const errorTemplates = {
  api_key: {
    title: "API key needed",
    description: "BlackLetter needs an AI provider configured to power its intelligence systems.",
    recovery: "Add your API key in Settings to start learning and researching.",
    action: "Open Settings",
  },
  network: {
    title: "Connection interrupted",
    description: "BlackLetter couldn't reach its AI services.",
    recovery: "Check your internet connection and try again. Your local data is preserved.",
    action: "Retry",
  },
  rate_limit: {
    title: "Taking a short break",
    description: "You've reached the rate limit for API requests.",
    recovery: "Wait a moment and try again. Your workspace and notes are saved locally.",
    action: "Try again",
  },
  empty_response: {
    title: "No response generated",
    description: "The AI didn't produce a useful response for your query.",
    recovery: "Try rephrasing your question or adding more context.",
    action: "Ask again",
  },
  timeout: {
    title: "Taking longer than expected",
    description: "The research is taking more time than usual.",
    recovery: "Your query may be too broad. Try narrowing it down, or try again.",
    action: "Try again",
  },
  generic: {
    title: "Something unexpected happened",
    description: "BlackLetter encountered an unexpected situation.",
    recovery: "This is likely temporary. Please try again.",
    action: "Try again",
  },
} as const;
