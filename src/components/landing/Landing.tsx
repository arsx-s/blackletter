import { useEffect, useState, useCallback, type ReactNode } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { ArrowRight, Github, Send, ChevronDown, FileText, Brain, BookOpen, Network, Layers, Layout, Shield, Zap, Check, MessageSquare, Lightbulb, Sparkles, BarChart3, Code2, Beaker, Calculator, Scale, Building2, DollarSign, HeartPulse, FlaskConical } from "lucide-react";
import { AiEcosystem } from "./AiEcosystem";
import { Logo } from "../ui/logo";
import { KnowledgeField } from "./KnowledgeField";
import { WordReveal } from "./RevealText";
import { Magnetic } from "./Magnetic";
import { SpotlightCard } from "./SpotlightCard";
import { ParallaxLayer } from "./ParallaxLayer";
import { SpatialNav, type NavSection } from "./SpatialNav";
import { EASE_CINEMATIC, EASE_OUT } from "../../lib/motion";

/* ── Texture ── */
const NOISE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="160" height="160" filter="url(#n)" opacity="0.5"/></svg>',
  );

/* ── Landing-Specific Color Overrides ── */
const LANDING_STYLES = `
  .landing-root {
    --landing-bg: #FFFAF3;
    --landing-bg-alt: #FFF2DB;
    --landing-card: #EFE9E1;
    --landing-accent: #F62440;
    --landing-accent-hover: #D41E34;
    --landing-text: #322D29;
    --landing-text-secondary: #72383D;
    --landing-muted: #AC9C8D;
    --landing-border: #D1C7BD;
    --landing-surface: #FFE5BF;
  }
  .landing-root * { box-sizing: border-box; }
  .landing-root body { margin: 0; }

  /* Hairline grid used as an environmental layer behind the hero. */
  .bl-grid {
    background-image:
      linear-gradient(#D1C7BD 1px, transparent 1px),
      linear-gradient(90deg, #D1C7BD 1px, transparent 1px);
    background-size: 72px 72px;
    opacity: 0.24;
    -webkit-mask-image: radial-gradient(ellipse 82% 72% at 50% 42%, black 0%, transparent 78%);
    mask-image: radial-gradient(ellipse 82% 72% at 50% 42%, black 0%, transparent 78%);
  }

  .bl-noise {
    background-image: url("${NOISE}");
    background-size: 160px 160px;
    opacity: 0.04;
  }

  /* Surface that lifts on hover — used by capability cards. */
  .bl-card {
    background-color: #EFE9E1;
    border: 1px solid #D1C7BD;
    transition:
      background-color 320ms cubic-bezier(0.22, 1, 0.36, 1),
      border-color 320ms cubic-bezier(0.22, 1, 0.36, 1),
      box-shadow 320ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .bl-card:hover {
    background-color: #FFE5BF;
    border-color: #AC9C8D;
    box-shadow: 0 24px 50px -32px rgba(50, 45, 41, 0.5);
  }

  /* Underlined-on-hover link used in the footer. */
  .bl-link { position: relative; }
  .bl-link::after {
    content: "";
    position: absolute;
    left: 0; right: 0; bottom: -3px;
    height: 1px;
    background: currentColor;
    transform: scaleX(0);
    transform-origin: left;
    transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .bl-link:hover::after { transform: scaleX(1); }

  @media (prefers-reduced-motion: reduce) {
    .bl-card, .bl-link::after { transition: none; }
  }
`;

/* ── Loading Screen ── */
const LOADING_MESSAGES = [
  "Opening Workspace",
  "Restoring Research Sessions",
  "Mounting Knowledge Graph",
  "Loading Document Library",
  "Preparing Canvas",
  "Starting Local Storage",
  "Syncing Preferences",
];

function LoadingScreen({ onFinish }: { onFinish: () => void }) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [phase, setPhase] = useState<"entering" | "visible" | "exiting">("entering");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("visible"), 200);
    const msgInterval = setInterval(() => {
      setMessageIndex((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 900);
    const progressInterval = setInterval(() => {
      setProgress((p) => Math.min(1, p + 0.045));
    }, 130);
    const t2 = setTimeout(() => {
      setPhase("exiting");
      clearInterval(msgInterval);
      clearInterval(progressInterval);
      setTimeout(onFinish, 600);
    }, 3200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearInterval(msgInterval);
      clearInterval(progressInterval);
    };
  }, [onFinish]);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{ backgroundColor: "#322D29" }}
      initial={{ opacity: 1 }}
      animate={{ opacity: phase === "exiting" ? 0 : 1 }}
      transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute left-1/2 top-1/2 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          style={{ opacity: 0.16, background: "radial-gradient(circle, #F62440 0%, transparent 70%)" }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        animate={{ opacity: phase === "entering" ? 0 : 1, scale: phase === "entering" ? 0.9 : 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE_CINEMATIC }}
        className="relative flex w-64 flex-col items-center gap-6"
      >
        <div className="relative">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2" style={{ borderColor: "rgba(255,250,243,0.2)" }}>
            <Logo variant="white" size={30} />
          </div>
          <motion.div
            className="absolute -right-1 -top-1 h-4 w-4 rounded-full"
            style={{ backgroundColor: "#F62440" }}
            animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        <div className="flex w-full items-center gap-3">
          <div className="h-px flex-1 overflow-hidden" style={{ backgroundColor: "rgba(255,250,243,0.16)" }}>
            <motion.div
              className="h-full origin-left"
              style={{ backgroundColor: "#F62440" }}
              animate={{ scaleX: progress }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          </div>
          <span className="font-mono text-[10px] tabular-nums" style={{ color: "#AC9C8D" }}>
            {String(messageIndex + 1).padStart(2, "0")}/{String(LOADING_MESSAGES.length).padStart(2, "0")}
          </span>
        </div>

        <motion.p
          key={messageIndex}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3 }}
          className="text-sm font-medium tracking-wide"
          style={{ fontFamily: "'Inter', sans-serif", color: "rgba(255,250,243,0.6)" }}
        >
          {LOADING_MESSAGES[messageIndex]}
        </motion.p>
      </motion.div>
    </motion.div>
  );
}

/* ── Section Wrapper ── */
function Section({ id, children, className = "", style: extraStyle }: { id?: string; children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <section id={id} className={`relative px-6 lg:px-10 ${className}`} style={{ scrollMarginTop: "6rem", ...extraStyle }}>
      <div className="relative z-10 mx-auto max-w-7xl">
        {children}
      </div>
    </section>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em]" style={{ fontFamily: "'Inter', sans-serif", color: "#7D6A5B" }}>
      {children}
    </p>
  );
}

function SectionTitle({ children, lines, className = "" }: { children?: ReactNode; lines?: string[]; className?: string }) {
  return (
    <h2
      className={`text-4xl font-medium leading-[1.1] tracking-tight lg:text-5xl xl:text-6xl ${className}`}
      style={{ fontFamily: "'Instrument Serif', serif", color: "#322D29" }}
    >
      {lines
        ? lines.map((line, i) => (
            <span key={line} className="block">
              <WordReveal text={line} step={0.07} delay={i * 0.14} inView />
            </span>
          ))
        : children}
    </h2>
  );
}

function SectionSubtitle({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 max-w-2xl text-base leading-relaxed lg:text-lg" style={{ fontFamily: "'Inter', sans-serif", color: "#72383D" }}>
      {children}
    </p>
  );
}

/* ── Domains ── */
const DOMAINS = [
  { name: "Law", icon: Scale },
  { name: "Computer Science", icon: Code2 },
  { name: "Artificial Intelligence", icon: Brain },
  { name: "Business", icon: Building2 },
  { name: "Economics", icon: BarChart3 },
  { name: "Finance", icon: DollarSign },
  { name: "Engineering", icon: Beaker },
  { name: "Mathematics", icon: Calculator },
  { name: "Research", icon: FlaskConical },
  { name: "Medical Sciences", icon: HeartPulse },
  { name: "Biology", icon: BookOpen },
  { name: "Philosophy", icon: Lightbulb },
];

function DomainBadge({ name, icon: Icon, index }: { name: string; icon: typeof Scale; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, delay: index * 0.04 }}
      className="flex cursor-default items-center gap-2.5 rounded-sm px-4 py-2.5 transition-all duration-200"
      style={{
        backgroundColor: "#EFE9E1",
        border: "1px solid #D1C7BD",
        fontFamily: "'Inter', sans-serif",
      }}
      whileHover={{ y: -2, backgroundColor: "#FFE5BF", borderColor: "#AC9C8D", transition: { duration: 0.2 } }}
    >
      <Icon size={14} style={{ color: "#72383D" }} />
      <span className="whitespace-nowrap text-sm font-medium" style={{ color: "#322D29" }}>{name}</span>
    </motion.div>
  );
}

/* ── Capability Card ── */
function CapabilityCard({ icon: Icon, title, description, index }: { icon: typeof Brain; title: string; description: string; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: EASE_OUT, delay: index * 0.08 }}
      className="h-full"
    >
      <SpotlightCard className="bl-card h-full rounded-sm p-6 lg:p-8">
        <div className="relative z-10">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-sm" style={{ backgroundColor: "#322D29" }}>
            <Icon size={18} style={{ color: "#FFFAF3" }} />
          </div>
          <h3 className="mb-2 text-lg font-semibold" style={{ fontFamily: "'Instrument Serif', serif", color: "#322D29" }}>{title}</h3>
          <p className="text-sm leading-relaxed" style={{ fontFamily: "'Inter', sans-serif", color: "#72383D" }}>{description}</p>
        </div>
      </SpotlightCard>
    </motion.div>
  );
}

/* ── Pipeline Step ── */
const PIPELINE_STEPS = [
  { label: "Your Question", desc: "Ask naturally in any subject" },
  { label: "Intent Detection", desc: "We identify what you need" },
  { label: "Subject Analysis", desc: "Context-aware understanding" },
  { label: "Knowledge Mapping", desc: "Prerequisites identified" },
  { label: "Reasoning Engine", desc: "Structured explanation built" },
  { label: "Learning Report", desc: "Comprehensive output delivered" },
];

function PipelineStep({ step, index, isLast }: { step: typeof PIPELINE_STEPS[0]; index: number; isLast: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.4, delay: index * 0.15 }}
      className="group flex items-start gap-5"
    >
      <div className="flex flex-col items-center">
        <motion.div
          className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold"
          style={{ backgroundColor: "#322D29", color: "#FFFAF3", fontFamily: "'Inter', sans-serif" }}
          whileHover={{ scale: 1.1 }}
        >
          {index + 1}
        </motion.div>
        {!isLast && <div className="my-1 h-12 w-px lg:h-16" style={{ backgroundColor: "#D1C7BD" }} />}
      </div>
      <div className="pt-1.5">
        <h3 className="text-base font-semibold" style={{ fontFamily: "'Inter', sans-serif", color: "#322D29" }}>{step.label}</h3>
        <p className="mt-0.5 text-sm" style={{ fontFamily: "'Inter', sans-serif", color: "#7D6A5B" }}>{step.desc}</p>
      </div>
    </motion.div>
  );
}

/* ── Comparison Card ── */
function ComparisonCard({ title, items, accent }: { title: string; items: string[]; accent: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5 }}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
    >
      <SpotlightCard className="bl-card h-full rounded-sm p-6 lg:p-8" spotlight={`${accent}1f`}>
        <div className="relative z-10">
          <h3 className="mb-4 text-lg font-semibold" style={{ fontFamily: "'Instrument Serif', serif", color: "#322D29" }}>{title}</h3>
          <ul className="space-y-3">
            {items.map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-sm" style={{ fontFamily: "'Inter', sans-serif", color: "#72383D" }}>
                <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: accent }}>
                  <Check size={10} style={{ color: "#FFFAF3" }} />
                </div>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </SpotlightCard>
    </motion.div>
  );
}

/* ── Roadmap ── */
type RoadmapStatus = "completed" | "developing" | "upcoming";

interface RoadmapPhase {
  version: string;
  title: string;
  description: string;
  icon: typeof Brain;
  status: RoadmapStatus;
  features: string[];
}

const ROADMAP_META: Record<RoadmapStatus, { label: string; color: string }> = {
  completed: { label: "Completed", color: "#3B6E4F" },
  developing: { label: "In Development", color: "#72383D" },
  upcoming: { label: "Upcoming", color: "#7D6A5B" },
};

const ROADMAP_DATA: RoadmapPhase[] = [
  {
    version: "v1.0",
    title: "Learning Engine",
    description: "A tutoring layer that tracks what you already know, finds what you are missing, and paces explanations against both.",
    icon: Brain,
    status: "completed",
    features: [
      "Adaptive explanations",
      "Knowledge-gap detection",
      "Prerequisite tutoring",
      "Learning preferences",
      "Document understanding",
      "Structured reports",
    ],
  },
  {
    version: "v2.0",
    title: "Research Workspace",
    description: "A workspace for real research — tabs, folders, documents, and history that carry over between visits.",
    icon: Layers,
    status: "completed",
    features: [
      "Multiple research tabs",
      "Workspaces",
      "Folders",
      "Session history",
      "Saved research",
      "Auto-save",
      "Document manager",
      "Global search",
      "Workspace organization",
    ],
  },
  {
    version: "v3.0",
    title: "Knowledge & Intelligence Engine",
    description: "Every session builds a knowledge graph, and every answer is checked against it — grounded, scored, and explained.",
    icon: Network,
    status: "completed",
    features: [
      "Automatic knowledge graphs",
      "Concept extraction",
      "Learning paths",
      "Graph search",
      "Graph memory",
      "Retrieval & grounding",
      "Answer confidence scoring",
      "Context-aware prompts",
    ],
  },
  {
    version: "v4.0",
    title: "Research Canvas",
    description: "An infinite canvas where sessions, documents, graphs, notes, and answers are placed side by side and linked.",
    icon: Layout,
    status: "completed",
    features: [
      "Infinite canvas",
      "Drag-and-drop layout",
      "Sticky notes",
      "Diagrams & mind maps",
      "AI session blocks",
      "Report blocks",
      "Document blocks",
      "Knowledge graph blocks",
      "Linked blocks & edges",
    ],
  },
  {
    version: "v5.0",
    title: "Offline Intelligence",
    description: "Continue research with a locally configured model and keep workspace data on your device.",
    icon: Shield,
    status: "upcoming",
    features: [
      "Local model selection through Ollama",
      "Local workspace storage",
      "Explicit provider selection",
    ],
  },
];

function RoadmapItem({ phase, index }: { phase: RoadmapPhase; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const meta = ROADMAP_META[phase.status];
  const Icon = phase.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay: index * 0.08 }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        className="cursor-pointer rounded-sm border transition-all duration-300"
        style={{
          backgroundColor: "#EFE9E1",
          borderColor: phase.status === "completed" ? "#F62440" : "#D1C7BD",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = meta.color;
          e.currentTarget.style.boxShadow = "0 8px 28px rgba(50,45,41,0.08)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = phase.status === "completed" ? "#F62440" : "#D1C7BD";
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        <div className="flex items-center gap-4 p-4 lg:p-5">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm"
            style={{ backgroundColor: phase.status === "completed" ? "#F62440" : "#322D29" }}
          >
            <Icon size={18} style={{ color: "#FFFAF3" }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-xs font-bold tracking-widest" style={{ color: meta.color }}>{phase.version}</span>
              <span className="text-2xs rounded-sm px-2 py-0.5 font-semibold uppercase tracking-wider" style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}>{meta.label}</span>
            </div>
            <h3 className="mt-1 text-lg font-semibold lg:text-xl" style={{ fontFamily: "'Instrument Serif', serif", color: "#322D29" }}>{phase.title}</h3>
            <p className="mt-1 max-w-xl text-sm leading-relaxed" style={{ fontFamily: "'Inter', sans-serif", color: phase.status === "upcoming" ? "#7D6A5B" : "#72383D" }}>{phase.description}</p>
            {phase.status === "developing" && (
              <div className="mt-3 h-1.5 w-44 overflow-hidden rounded-full" style={{ backgroundColor: "#72383D22" }}>
                <div className="roadmap-progress h-full rounded-full" style={{ backgroundColor: "#72383D" }} />
              </div>
            )}
            {phase.status === "upcoming" && (
              <span className="mt-1 inline-block font-mono text-[10px] uppercase tracking-widest" style={{ color: "#7D6A5B" }}>Ships in a future release</span>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "#7D6A5B" }}>{phase.features.length} features</span>
            <ChevronDown
              size={14}
              style={{ color: "#AC9C8D", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
            />
          </div>
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="mx-5 border-t pb-5" style={{ borderColor: "#D1C7BD" }}>
                <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {phase.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm" style={{ fontFamily: "'Inter', sans-serif" }}>
                      <Check size={13} className="mt-0.5 shrink-0" style={{ color: meta.color }} />
                      <span style={{ color: "#322D29" }}>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/* ── Interactive Demo Preview ── */
function InteractiveDemo() {
  const [query, setQuery] = useState("");
  const [started, setStarted] = useState(false);
  const [phase, setPhase] = useState<"input" | "processing" | "done">("input");
  const [visibleSections, setVisibleSections] = useState<string[]>([]);

  const handleSubmit = useCallback(() => {
    if (!query.trim()) return;
    setStarted(true);
    setPhase("processing");
    const sections = ["Goal", "Foundation", "Concepts", "Examples", "Summary"];

    sections.forEach((s, i) => {
      setTimeout(() => {
        setVisibleSections((prev) => [...prev, s]);
        if (i === sections.length - 1) setPhase("done");
      }, 600 + i * 500);
    });
  }, [query]);

  const sectionIcons: Record<string, string> = { Goal: "🎯", Foundation: "📐", Concepts: "🧠", Examples: "💡", Summary: "✅" };

  return (
    <div className="overflow-hidden rounded-sm border" style={{ backgroundColor: "#FFFAF3", borderColor: "#D1C7BD" }}>
      <div className="flex items-center gap-2 border-b px-5 py-3" style={{ backgroundColor: "#EFE9E1", borderColor: "#D1C7BD" }}>
        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#F62440" }} />
        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#AC9C8D" }} />
        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#AC9C8D" }} />
        <span className="ml-2 text-xs font-medium" style={{ fontFamily: "'Inter', sans-serif", color: "#AC9C8D" }}>BlackLetter — Research Session</span>
      </div>

      <div className="p-5 lg:p-8">
        <p className="mb-4 rounded-sm border px-3 py-2 text-xs leading-relaxed" style={{ color: "#72383D", backgroundColor: "#FFF2DB", borderColor: "#D1C7BD" }}>
          Illustrative sample only. This preview is not connected to an AI service and does not generate a live answer.
        </p>
        {!started ? (
          <div className="flex gap-3">
            <input
              aria-label="Enter a topic for the illustrative preview"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              placeholder="Ask anything... e.g. Explain Linear Algebra"
              className="flex-1 rounded-sm border px-4 py-3 text-sm outline-none transition-colors"
              style={{ fontFamily: "'Inter', sans-serif", backgroundColor: "#FFF2DB", borderColor: "#D1C7BD", color: "#322D29" }}
            />
            <button
              onClick={handleSubmit}
              aria-label="Show illustrative sample"
              className="rounded-sm px-5 py-3 text-sm font-semibold transition-all active:scale-[0.97]"
              style={{ backgroundColor: "#D41E34", color: "#FFFAF3", fontFamily: "'Inter', sans-serif" }}
            >
              <Send size={16} />
            </button>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="flex items-center gap-3 border-b pb-4" style={{ borderColor: "#D1C7BD" }}>
              <div className="flex h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: "#322D29" }}>
                <Logo variant="white" size={16} />
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: "#322D29" }}>{query}</p>
                <p className="text-xs" style={{ color: "#7D6A5B" }}>Illustrative report preview</p>
              </div>
              {phase === "processing" && (
                <motion.div
                  className="ml-auto flex items-center gap-2 text-xs font-medium"
                  style={{ color: "#72383D" }}
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <Zap size={12} /> Previewing sample structure...
                </motion.div>
              )}
            </div>

            <div className="space-y-3">
              {["Goal", "Foundation", "Concepts", "Examples", "Summary"].map((s) => (
                <motion.div
                  key={s}
                  initial={{ opacity: 0, height: 0 }}
                  animate={visibleSections.includes(s) ? { opacity: 1, height: "auto" } : { opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-start gap-3 rounded-sm p-3" style={{ backgroundColor: "#FFF2DB" }}>
                    <span className="mt-0.5 text-base">{sectionIcons[s]}</span>
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: "#72383D" }}>{s}</p>
                      <p className="text-sm leading-relaxed" style={{ fontFamily: "'Inter', sans-serif", color: "#322D29" }}>
                        {s === "Goal" && "Understand the fundamental concepts of linear algebra and their applications."}
                        {s === "Foundation" && "Basic algebra, coordinate systems, and mathematical reasoning."}
                        {s === "Concepts" && "Vectors, matrices, linear transformations, eigenvalues, and vector spaces."}
                        {s === "Examples" && "Work through Gaussian elimination, matrix multiplication, and orthogonal projections with step-by-step guidance."}
                        {s === "Summary" && "Linear algebra provides the mathematical language for describing multidimensional systems."}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {phase === "done" && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="pt-2">
                <div className="flex items-center gap-2 text-xs font-medium" style={{ color: "#D41E34" }}>
                  <Check size={14} /> Sample preview complete
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}

/* ── Navigation model ── */
const NAV_SECTIONS: NavSection[] = [
  { id: "top", label: "Overview" },
  { id: "product", label: "Workspace" },
  { id: "domains", label: "Domains" },
  { id: "capabilities", label: "Capabilities" },
  { id: "how-it-works", label: "Pipeline" },
  { id: "try-it", label: "Try It" },
  { id: "roadmap", label: "Roadmap" },
  { id: "launch", label: "Get Started" },
  { id: "feedback", label: "Feedback" },
];

/** Replays the shared section-intro animation for a block of copy. */
function Intro({ children, className = "", center = false }: { children: ReactNode; className?: string; center?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: EASE_OUT }}
      className={`${center ? "text-center" : ""} ${className}`}
    >
      {children}
    </motion.div>
  );
}

/* ── Main Landing Component ── */
export function Landing({ onEnter }: { onEnter: () => void }) {
  const [showLoading, setShowLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.15], [1, 0.95]);

  const handleLoadingFinish = useCallback(() => {
    setShowLoading(false);
    setTimeout(() => setShowContent(true), 100);
  }, []);

  return (
    <>
      <style>{LANDING_STYLES}</style>
      {showLoading && <LoadingScreen onFinish={handleLoadingFinish} />}

      <AnimatePresence>
        {showContent && (
          <motion.div
            className="landing-root"
            id="top"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            style={{ backgroundColor: "#FFFAF3", minHeight: "100vh", color: "#322D29", fontFamily: "'Inter', sans-serif" }}
          >
            <SpatialNav onLaunch={onEnter} sections={NAV_SECTIONS} />

            {/* ── HERO ── */}
            <motion.section
              className="relative flex min-h-screen items-center overflow-hidden px-6 lg:px-10"
              style={{ backgroundColor: "#FFFAF3", opacity: heroOpacity, scale: heroScale }}
            >
              {/* Environmental depth: parallax light, hairline grid, knowledge field */}
              <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
                <ParallaxLayer distance={78} className="absolute inset-0">
                  <div
                    className="absolute -left-40 top-[-12%] h-[46rem] w-[46rem] rounded-full blur-3xl"
                    style={{ opacity: 0.1, background: "radial-gradient(circle, #F62440 0%, transparent 70%)" }}
                  />
                </ParallaxLayer>
                <ParallaxLayer distance={-46} className="absolute inset-0">
                  <div
                    className="absolute right-[-16rem] top-[6%] h-[42rem] w-[42rem] rounded-full blur-3xl"
                    style={{ opacity: 0.09, background: "radial-gradient(circle, #72383D 0%, transparent 70%)" }}
                  />
                </ParallaxLayer>
                <div className="bl-grid absolute inset-0" />
                <KnowledgeField className="absolute inset-0" />
                {/* Legibility veil. The field is a backdrop for the type, not a
                    competitor for it — nodes were landing on top of the
                    headline and body copy. A directional scrim clears the column
                    the type occupies while the visualisation keeps full presence
                    to the right. Stacks vertically on narrow screens, where the
                    copy spans the full width. */}
                <div
                  className="absolute inset-0 hidden lg:block"
                  style={{
                    background:
                      "linear-gradient(90deg, #FFFAF3 0%, rgba(255,250,243,0.95) 28%, rgba(255,250,243,0.62) 50%, rgba(255,250,243,0) 76%)",
                  }}
                />
                <div
                  className="absolute inset-0 lg:hidden"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(255,250,243,0.24) 0%, rgba(255,250,243,0.93) 40%, rgba(255,250,243,0.93) 64%, rgba(255,250,243,0.24) 100%)",
                  }}
                />
                <div className="bl-noise absolute inset-0" />
                <div
                  className="absolute inset-x-0 bottom-0 h-40"
                  style={{ background: "linear-gradient(180deg, transparent, #FFFAF3)" }}
                />
              </div>

              <div className="relative z-10 mx-auto w-full max-w-7xl pt-24 lg:pt-28">
                <div className="max-w-4xl">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.2 }}
                  >
                    <div className="mb-6 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ fontFamily: "'Inter', sans-serif", color: "#D41E34" }}>
                        AI Research Operating System
                      </p>
                      <span
                        className="font-mono text-[10px] font-bold uppercase tracking-widest rounded-sm px-2 py-0.5"
                        style={{ color: "#D41E34", border: "1px solid #D41E34" }}
                      >
                        Research workspace
                      </span>
                    </div>
                  </motion.div>

                  <h1
                    className="text-6xl font-medium leading-[0.92] tracking-tighter sm:text-7xl md:text-8xl lg:text-9xl xl:text-[8.5rem]"
                    style={{ fontFamily: "'Instrument Serif', serif", color: "#322D29" }}
                  >
                    <span className="block">
                      <WordReveal text="Research. Learn." delay={0.35} step={0.09} />
                    </span>
                    <span className="block" style={{ color: "#72383D" }}>
                      <WordReveal text="Build knowledge." delay={0.5} step={0.09} />
                    </span>
                  </h1>

                  <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.55 }}
                    className="mt-6 max-w-xl text-base leading-relaxed lg:mt-8 lg:text-lg"
                    style={{ fontFamily: "'Inter', sans-serif", color: "#72383D" }}
                  >
                    BlackLetter is an AI research operating system. Sessions, documents, knowledge graph, and canvas live in one workspace — so the work you do today becomes the system you use tomorrow.
                  </motion.p>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.7 }}
                    className="mt-8 flex flex-wrap gap-4 lg:mt-10"
                  >
                    <Magnetic>
                      <button
                        onClick={onEnter}
                        className="flex items-center gap-2 rounded-sm px-7 py-3.5 text-sm font-semibold transition-all duration-200 active:scale-[0.97]"
                        style={{ backgroundColor: "#D41E34", color: "#FFFAF3", fontFamily: "'Inter', sans-serif" }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#B0172B")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#D41E34")}
                      >
                        Launch BlackLetter <ArrowRight size={15} />
                      </button>
                    </Magnetic>
                    <Magnetic strength={0.16}>
                      <a
                        href="#how-it-works"
                        className="flex items-center gap-2 rounded-sm px-7 py-3.5 text-sm font-semibold transition-all duration-200"
                        style={{ backgroundColor: "#EFE9E1", color: "#322D29", fontFamily: "'Inter', sans-serif", border: "1px solid #D1C7BD" }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#FFE5BF"; e.currentTarget.style.borderColor = "#AC9C8D"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#EFE9E1"; e.currentTarget.style.borderColor = "#D1C7BD"; }}
                      >
                        See How It Works <ChevronDown size={14} />
                      </a>
                    </Magnetic>
                  </motion.div>
                </div>
              </div>

              {/* Scroll indicator — anchored to the section so it sits at the fold */}
              <motion.div
                className="absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2, duration: 0.6 }}
              >
                <motion.div
                  className="w-px"
                  style={{ backgroundColor: "#D1C7BD" }}
                  animate={{ height: [8, 24, 8] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <span className="text-2xs font-medium uppercase tracking-widest" style={{ color: "#7D6A5B" }}>Scroll</span>
              </motion.div>
            </motion.section>

            {/* ── PRODUCT PREVIEW ── */}
            <Section id="product" className="py-16 lg:py-24">
              <Intro center className="mx-auto max-w-3xl">
                <SectionLabel>Inside BlackLetter</SectionLabel>
                <SectionTitle lines={["One workspace.", "A deeper understanding."]} className="text-center" />
                <SectionSubtitle>Research sessions, structured reports, saved notes, and connected concepts share the same workspace.</SectionSubtitle>
              </Intro>
              <div className="mt-10 overflow-hidden rounded-md border shadow-premium" style={{ backgroundColor: "#211F1D", borderColor: "#D1C7BD" }}>
                <div className="flex items-center justify-between border-b px-4 py-3 sm:px-6" style={{ borderColor: "rgba(255,250,243,0.12)", color: "#FFFAF3" }}>
                  <div className="flex items-center gap-3"><Logo variant="white" size={18} /><span className="text-sm font-medium">Research workspace</span></div>
                  <span className="font-mono text-xs" style={{ color: "#C2B5A8" }}>SAMPLE VIEW</span>
                </div>
                <div className="grid gap-px md:grid-cols-[0.8fr_1.5fr_0.8fr]" style={{ backgroundColor: "rgba(255,250,243,0.12)" }}>
                  <div className="p-5 sm:p-6" style={{ backgroundColor: "#282522", color: "#FFFAF3" }}>
                    <p className="mb-4 text-xs uppercase tracking-widest" style={{ color: "#C2B5A8" }}>Research sessions</p>
                    <p className="rounded-sm px-3 py-2 text-sm" style={{ backgroundColor: "rgba(255,250,243,0.08)" }}>Linear algebra foundations</p>
                    <p className="mt-2 px-3 py-2 text-sm" style={{ color: "#C2B5A8" }}>Matrix transformations</p>
                    <p className="mt-2 px-3 py-2 text-sm" style={{ color: "#C2B5A8" }}>Eigenvectors and meaning</p>
                  </div>
                  <div className="p-5 sm:p-7" style={{ backgroundColor: "#FFFAF3", color: "#322D29" }}>
                    <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#72383D" }}>Structured report · Mathematics</p>
                    <h3 className="mt-3 font-display text-2xl sm:text-3xl">What does a matrix transformation do?</h3>
                    <p className="mt-3 text-sm leading-6" style={{ color: "#675B53" }}>A matrix transformation maps vectors from one space to another. Each column describes where a basis direction moves, making rotation, scaling, and projection easier to reason about.</p>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-sm border p-3" style={{ borderColor: "#D1C7BD", backgroundColor: "#FFF2DB" }}><p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#72383D" }}>Key idea</p><p className="mt-1 text-sm">Columns encode the transformed basis.</p></div>
                      <div className="rounded-sm border p-3" style={{ borderColor: "#D1C7BD", backgroundColor: "#FFF2DB" }}><p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#72383D" }}>Saved note</p><p className="mt-1 text-sm">Connect the map to its geometric effect.</p></div>
                    </div>
                  </div>
                  <div className="p-5 sm:p-6" style={{ backgroundColor: "#282522", color: "#FFFAF3" }}>
                    <p className="mb-4 text-xs uppercase tracking-widest" style={{ color: "#C2B5A8" }}>Related concepts</p>
                    <div className="space-y-3 text-sm">
                      <div className="rounded-sm border px-3 py-2" style={{ borderColor: "rgba(255,250,243,0.18)" }}>Vector space</div>
                      <div className="ml-5 h-4 border-l" style={{ borderColor: "#F62440" }} />
                      <div className="rounded-sm border px-3 py-2" style={{ borderColor: "rgba(255,250,243,0.18)" }}>Linear map</div>
                      <div className="ml-5 h-4 border-l" style={{ borderColor: "#F62440" }} />
                      <div className="rounded-sm border px-3 py-2" style={{ borderColor: "rgba(255,250,243,0.18)" }}>Matrix</div>
                    </div>
                  </div>
                </div>
              </div>
            </Section>

            {/* ── DOMAINS ── */}
            <Section id="domains" className="py-20 lg:py-28" style={{ backgroundColor: "#FFF2DB" }}>
              <Intro>
                <SectionLabel>Supported Domains</SectionLabel>
                <SectionTitle lines={["Learn anything.", "Teach everything."]} />
                <SectionSubtitle>BlackLetter detects subject context from your question and its documents to shape the research workflow.</SectionSubtitle>
              </Intro>
              <div className="mt-10 flex flex-wrap gap-3">
                {DOMAINS.map((d, i) => (
                  <DomainBadge key={d.name} name={d.name} icon={d.icon} index={i} />
                ))}
              </div>
            </Section>

            {/* ── CAPABILITIES ── */}
            <Section id="capabilities" className="py-20 lg:py-28">
              <Intro>
                <SectionLabel>Capabilities</SectionLabel>
                <SectionTitle lines={["Six engines.", "One workspace."]} />
                <SectionSubtitle>A research session is the entry point; a knowledge graph is what accumulates. Everything else sits between the two.</SectionSubtitle>
              </Intro>

              <div className="mt-10 grid gap-4 md:grid-cols-2 lg:mt-12 lg:grid-cols-3 lg:gap-5">
                <CapabilityCard icon={Brain} title="Adaptive Learning" description="Choose focused learning and explanation modes for the question you are working through." index={0} />
                <CapabilityCard icon={FileText} title="Document Intelligence" description="Work with supported PDF, DOCX, Markdown, and text documents alongside your research." index={1} />
                <CapabilityCard icon={Layers} title="Research Workspace" description="Multiple sessions, folders, documents, and history — saved automatically, searchable globally." index={2} />
                <CapabilityCard icon={Network} title="Knowledge Graph" description="Concepts are extracted and connected as you research. The map grows with your work." index={3} />
                <CapabilityCard icon={BookOpen} title="Subject Intelligence" description="Question and document terms help identify subject context for a more relevant response." index={4} />
                <CapabilityCard icon={Zap} title="Learning Memory" description="Saved sessions, notes, and workspace knowledge remain available as your research continues." index={5} />
              </div>
            </Section>

            {/* ── HOW IT WORKS ── */}
            <Section id="how-it-works" className="py-20 lg:py-28" style={{ backgroundColor: "#FFF2DB" }}>
              <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
                <Intro>
                  <SectionLabel>The Pipeline</SectionLabel>
                  <SectionTitle lines={["From question", "to understanding."]} />
                  <SectionSubtitle>BlackLetter organizes a question through intent, subject context, relevant knowledge, reasoning, and a structured result.</SectionSubtitle>
                </Intro>

                <div className="space-y-1 lg:pl-8">
                  {PIPELINE_STEPS.map((step, i) => (
                    <PipelineStep key={step.label} step={step} index={i} isLast={i === PIPELINE_STEPS.length - 1} />
                  ))}
                </div>
              </div>
            </Section>

            {/* ── WHY BLACKLETTER ── */}
            <Section id="why" className="py-20 lg:py-28">
              <Intro center className="mb-12 lg:mb-16">
                <SectionLabel>Why BlackLetter</SectionLabel>
                <SectionTitle lines={["Chatbots answer.", "BlackLetter helps work build."]} className="text-center" />
              </Intro>

              <div className="grid gap-4 md:grid-cols-3 lg:gap-6">
                <ComparisonCard
                  title="A one-off chat"
                  items={["May be separate from previous work", "Usually focused on the current prompt", "Notes and outcomes need organizing elsewhere"]}
                  accent="#AC9C8D"
                />
                <ComparisonCard
                  title="BlackLetter"
                  items={["Saved sessions and workspace context stay together", "Subject context informs the workflow", "Reports, graph knowledge, and notes can accumulate"]}
                  accent="#F62440"
                />
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.5 }}
                  whileHover={{ y: -3, transition: { duration: 0.2 } }}
                  className="flex flex-col items-center justify-center rounded-sm p-6 text-center lg:p-8"
                  style={{
                    backgroundColor: "#D41E34",
                    border: "1px solid #D41E34",
                  }}
                >
                  <Sparkles size={24} style={{ color: "#FFFAF3" }} />
                  <p className="mt-3 text-base font-semibold" style={{ fontFamily: "'Instrument Serif', serif", color: "#FFFAF3" }}>
                    A workspace designed for research that continues.
                  </p>
                </motion.div>
              </div>
            </Section>

            {/* ── INTERACTIVE DEMO ── */}
            <Section id="try-it" className="py-20 lg:py-28" style={{ backgroundColor: "#FFF2DB" }}>
              <Intro>
                <SectionLabel>Illustrative Preview</SectionLabel>
                <SectionTitle lines={["See how a question becomes", "structured understanding."]} />
                <SectionSubtitle>Enter a topic to explore the sample interaction. The sample report stays about linear algebra regardless of the text entered, and does not call the live research service.</SectionSubtitle>
              </Intro>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: 0.15 }}
                className="mt-10"
              >
                <InteractiveDemo />
              </motion.div>
            </Section>

            {/* ── AI ECOSYSTEM ── */}
            <AiEcosystem />

            {/* ── ROADMAP ── */}
            <Section id="roadmap" className="py-20 lg:py-28" style={{ backgroundColor: "#FFF2DB" }}>
              <div className="max-w-3xl">
                <Intro>
                  <SectionLabel>Roadmap</SectionLabel>
                  <SectionTitle lines={["One system.", "Five releases."]} />
                  <SectionSubtitle>BlackLetter ships in numbered releases. Everything below is real — no vaporware, no estimated dates, just the sequence we are building in.</SectionSubtitle>
                </Intro>

                <div className="relative mt-10 space-y-4 pl-1 lg:mt-12 lg:space-y-5">
                  <div className="absolute bottom-3 left-[5px] top-3 w-px" style={{ backgroundColor: "#D1C7BD" }} />
                  {ROADMAP_DATA.map((phase, i) => (
                    <div key={phase.version} className="relative">
                      <div
                        className="absolute left-0 top-7 h-[11px] w-[11px] -translate-x-[5px] rounded-full border-2"
                        style={{ backgroundColor: "#FFF2DB", borderColor: ROADMAP_META[phase.status].color }}
                      />
                      <div className="pl-7">
                        <RoadmapItem phase={phase} index={i} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Section>

            {/* ── LAUNCH ── */}
            <Section id="launch" className="py-20 lg:py-28">
              <div
                className="relative overflow-hidden rounded-md px-6 py-16 lg:px-14 lg:py-20"
                style={{ backgroundColor: "#EFE9E1", border: "1px solid #D1C7BD" }}
              >
                <ParallaxLayer distance={54} className="pointer-events-none absolute inset-0">
                  <div
                    className="absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
                    style={{ opacity: 0.1, background: "radial-gradient(circle, #F62440 0%, transparent 70%)" }}
                  />
                </ParallaxLayer>
                <div className="bl-noise pointer-events-none absolute inset-0" />

                <Intro center className="relative mx-auto max-w-3xl">
                  <SectionLabel>Get Started</SectionLabel>
                  <SectionTitle lines={["Research. Learn.", "Build knowledge."]} className="text-center" />
                  <p className="mt-4 text-base leading-relaxed lg:text-lg" style={{ fontFamily: "'Inter', sans-serif", color: "#72383D" }}>
                    Research sessions, documents, notes, and connected knowledge come together in one workspace. Explore the app, read the code, or follow development on GitHub.
                  </p>

                  <motion.div
                    className="mt-10 flex flex-wrap justify-center gap-4"
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                  >
                    <Magnetic>
                      <button
                        onClick={onEnter}
                        className="flex cursor-pointer items-center gap-2 rounded-sm px-8 py-3.5 text-sm font-semibold transition-all duration-200 active:scale-[0.97]"
                        style={{ backgroundColor: "#D41E34", color: "#FFFAF3", fontFamily: "'Inter', sans-serif" }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#B0172B")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#D41E34")}
                      >
                        Launch BlackLetter <ArrowRight size={15} />
                      </button>
                    </Magnetic>
                    <a
                      href="https://github.com/arsx-s/blackletter"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-sm px-8 py-3.5 text-sm font-semibold transition-all duration-200 active:scale-[0.97]"
                      style={{ backgroundColor: "#322D29", color: "#FFFAF3", fontFamily: "'Inter', sans-serif" }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#72383D")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#322D29")}
                    >
                      <Github size={16} /> GitHub Repository
                    </a>
                    <a
                      href="https://github.com/arsx-s/blackletter#readme"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-sm px-8 py-3.5 text-sm font-semibold transition-all duration-200 active:scale-[0.97]"
                      style={{ backgroundColor: "#FFFAF3", color: "#322D29", fontFamily: "'Inter', sans-serif", border: "1px solid #D1C7BD" }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#FFE5BF"; e.currentTarget.style.borderColor = "#AC9C8D"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#FFFAF3"; e.currentTarget.style.borderColor = "#D1C7BD"; }}
                    >
                      <BookOpen size={16} /> Documentation
                    </a>
                  </motion.div>
                </Intro>
              </div>
            </Section>

            {/* ── FEEDBACK ── */}
            <Section id="feedback" className="py-20 lg:py-28">
              <Intro center className="mx-auto max-w-2xl">
                <SectionLabel>Feedback</SectionLabel>
                <SectionTitle lines={["Built in the open.", "Tell us what breaks."]} className="text-center" />
                <p className="mt-4 text-base leading-relaxed" style={{ fontFamily: "'Inter', sans-serif", color: "#72383D" }}>
                  BlackLetter is a portfolio project in active development. Bug reports, design critique, and feature ideas are all welcome.
                </p>

                <motion.div
                  className="mt-10 flex flex-wrap justify-center gap-4"
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.15 }}
                >
                  <a
                    href="https://github.com/arsx-s/blackletter"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-sm px-7 py-3.5 text-sm font-semibold transition-all duration-200 active:scale-[0.97]"
                    style={{ backgroundColor: "#322D29", color: "#FFFAF3", fontFamily: "'Inter', sans-serif" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#72383D")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#322D29")}
                  >
                    <Github size={16} /> GitHub
                  </a>
                  <a
                    href="https://github.com/arsx-s/blackletter/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-sm px-7 py-3.5 text-sm font-semibold transition-all duration-200 active:scale-[0.97]"
                    style={{ backgroundColor: "#EFE9E1", color: "#322D29", fontFamily: "'Inter', sans-serif", border: "1px solid #D1C7BD" }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#FFE5BF"; e.currentTarget.style.borderColor = "#AC9C8D"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#EFE9E1"; e.currentTarget.style.borderColor = "#D1C7BD"; }}
                  >
                    <MessageSquare size={16} /> Give Feedback
                  </a>
                </motion.div>
              </Intro>
            </Section>

            {/* ── FOOTER ── */}
            <footer style={{ backgroundColor: "#322D29" }}>
              <div className="mx-auto max-w-7xl px-6 py-16 lg:px-10 lg:py-20">
                <div className="grid gap-12 lg:grid-cols-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-sm" style={{ backgroundColor: "#322D29", border: "1px solid rgba(255,250,243,0.2)" }}>
                        <Logo variant="white" size={18} />
                      </div>
                      <div>
                        <p className="text-lg font-semibold leading-tight" style={{ fontFamily: "'Inter', sans-serif", color: "#FFFAF3" }}>BlackLetter</p>
                        <p className="mt-0.5 text-xs" style={{ fontFamily: "'Inter', sans-serif", color: "#AC9C8D" }}>AI Research Operating System</p>
                      </div>
                    </div>
                    <p className="mt-6 max-w-xs text-sm leading-relaxed" style={{ fontFamily: "'Inter', sans-serif", color: "#AC9C8D" }}>
                      A local-first research operating system for people who work in depth. Research sessions, documents, a knowledge graph, and a canvas — in one place.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:col-span-3">
                    <div>
                      <p className="mb-4 text-xs font-semibold uppercase tracking-widest" style={{ color: "#AC9C8D" }}>Product</p>
                      <nav className="flex flex-col gap-2.5">
                        <a href="https://github.com/arsx-s/blackletter" target="_blank" rel="noopener noreferrer" className="bl-link text-sm transition-colors duration-200" style={{ fontFamily: "'Inter', sans-serif", color: "#FFFAF3" }} onMouseEnter={(e) => (e.currentTarget.style.color = "#F62440")} onMouseLeave={(e) => (e.currentTarget.style.color = "#FFFAF3")}>Documentation</a>
                        <a href="#roadmap" className="bl-link text-sm transition-colors duration-200" style={{ fontFamily: "'Inter', sans-serif", color: "#FFFAF3" }} onMouseEnter={(e) => (e.currentTarget.style.color = "#F62440")} onMouseLeave={(e) => (e.currentTarget.style.color = "#FFFAF3")}>Roadmap</a>
                        <a href="https://github.com/arsx-s/blackletter/issues" target="_blank" rel="noopener noreferrer" className="bl-link text-sm transition-colors duration-200" style={{ fontFamily: "'Inter', sans-serif", color: "#FFFAF3" }} onMouseEnter={(e) => (e.currentTarget.style.color = "#F62440")} onMouseLeave={(e) => (e.currentTarget.style.color = "#FFFAF3")}>Feedback</a>
                      </nav>
                    </div>
                    <div>
                      <p className="mb-4 text-xs font-semibold uppercase tracking-widest" style={{ color: "#AC9C8D" }}>Community</p>
                      <nav className="flex flex-col gap-2.5">
                        <a href="https://github.com/arsx-s/blackletter" target="_blank" rel="noopener noreferrer" className="bl-link text-sm transition-colors duration-200" style={{ fontFamily: "'Inter', sans-serif", color: "#FFFAF3" }} onMouseEnter={(e) => (e.currentTarget.style.color = "#F62440")} onMouseLeave={(e) => (e.currentTarget.style.color = "#FFFAF3")}>GitHub</a>
                        <a href="https://github.com/arsx-s/blackletter" target="_blank" rel="noopener noreferrer" className="bl-link text-sm transition-colors duration-200" style={{ fontFamily: "'Inter', sans-serif", color: "#FFFAF3" }} onMouseEnter={(e) => (e.currentTarget.style.color = "#F62440")} onMouseLeave={(e) => (e.currentTarget.style.color = "#FFFAF3")}>Star Project</a>
                        <a href="https://github.com/arsx-s/blackletter/issues" target="_blank" rel="noopener noreferrer" className="bl-link text-sm transition-colors duration-200" style={{ fontFamily: "'Inter', sans-serif", color: "#FFFAF3" }} onMouseEnter={(e) => (e.currentTarget.style.color = "#F62440")} onMouseLeave={(e) => (e.currentTarget.style.color = "#FFFAF3")}>Issues</a>
                        <a href="https://github.com/arsx-s/blackletter/releases" target="_blank" rel="noopener noreferrer" className="bl-link text-sm transition-colors duration-200" style={{ fontFamily: "'Inter', sans-serif", color: "#FFFAF3" }} onMouseEnter={(e) => (e.currentTarget.style.color = "#F62440")} onMouseLeave={(e) => (e.currentTarget.style.color = "#FFFAF3")}>Releases</a>
                      </nav>
                    </div>
                    <div>
                      <p className="mb-4 text-xs font-semibold uppercase tracking-widest" style={{ color: "#AC9C8D" }}>Version</p>
                      <p className="text-sm" style={{ fontFamily: "'Inter', sans-serif", color: "#FFFAF3" }}>v3.2.0</p>
                      <p className="mt-1 text-xs" style={{ color: "#AC9C8D" }}>MIT License</p>
                    </div>
                  </div>
                </div>

                <div className="mt-12 flex flex-col justify-between gap-4 border-t pt-8 sm:flex-row sm:items-center" style={{ borderColor: "rgba(255,250,243,0.1)" }}>
                  <p className="text-xs" style={{ fontFamily: "'Inter', sans-serif", color: "#AC9C8D" }}>
                    &copy; {new Date().getFullYear()} BlackLetter. Built by Ali Arsalan Aryan.
                  </p>
                  <p className="font-mono text-xs" style={{ color: "#AC9C8D" }}>Portfolio Project · 2026</p>
                </div>
              </div>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
