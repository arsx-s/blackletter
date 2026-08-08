import { useEffect, useState, useRef, useCallback, type ReactNode } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { ArrowRight, Github, Send, Menu, X, ChevronDown, FileText, Brain, BookOpen, Network, Layers, Layout, Shield, Zap, Check, MessageSquare, Lightbulb, Sparkles, BarChart3, Code2, Beaker, Calculator, Scale, Building2, DollarSign, HeartPulse, FlaskConical } from "lucide-react";
import { AiEcosystem } from "./AiEcosystem";
import { Logo } from "../ui/logo";

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

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("visible"), 200);
    const msgInterval = setInterval(() => {
      setMessageIndex((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 900);
    const t2 = setTimeout(() => {
      setPhase("exiting");
      clearInterval(msgInterval);
      setTimeout(onFinish, 600);
    }, 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearInterval(msgInterval); };
  }, [onFinish]);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{ backgroundColor: "#322D29" }}
      initial={{ opacity: 1 }}
      animate={{ opacity: phase === "exiting" ? 0 : 1 }}
      transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        animate={{ opacity: phase === "entering" ? 0 : 1, scale: phase === "entering" ? 0.9 : 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
        className="flex flex-col items-center gap-6"
      >
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-2 flex items-center justify-center" style={{ borderColor: "rgba(255,250,243,0.2)" }}>
            <Logo variant="white" size={30} />
          </div>
          <motion.div
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full"
            style={{ backgroundColor: "#F62440" }}
            animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
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

/* ── Floating Knowledge Particles (Hero Background) ── */
function KnowledgeParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const particlesRef = useRef<Array<{ x: number; y: number; vx: number; vy: number; size: number; phase: number; alpha: number }>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame: number;
    let w = 0, h = 0;

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = w;
      canvas!.height = h;
    }

    function initParticles() {
      const count = Math.min(Math.floor((w * h) / 15000), 60);
      particlesRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 2 + 1,
        phase: Math.random() * Math.PI * 2,
        alpha: Math.random() * 0.4 + 0.1,
      }));
    }

    function draw() {
      ctx!.clearRect(0, 0, w, h);
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      for (const p of particlesRef.current) {
        p.x += p.vx + (mx - 0.5) * 0.15;
        p.y += p.vy + (my - 0.5) * 0.15;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(50,45,41,${p.alpha})`;
        ctx!.fill();

        for (const q of particlesRef.current) {
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx!.beginPath();
            ctx!.moveTo(p.x, p.y);
            ctx!.lineTo(q.x, q.y);
            ctx!.strokeStyle = `rgba(172,156,141,${0.08 * (1 - dist / 120)})`;
            ctx!.lineWidth = 0.5;
            ctx!.stroke();
          }
        }
      }
      frame = requestAnimationFrame(draw);
    }

    resize();
    initParticles();
    draw();

    const handleMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX / w, y: e.clientY / h };
    };
    window.addEventListener("mousemove", handleMouse);
    window.addEventListener("resize", () => { resize(); initParticles(); });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("mousemove", handleMouse);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ opacity: 0.6 }} />;
}

/* ── Header ── */
function Header({ onLaunch }: { onLaunch: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { label: "Capabilities", href: "#capabilities" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Roadmap", href: "#roadmap" },
    { label: "Feedback", href: "#feedback" },
  ];

  return (
    <motion.header
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        backgroundColor: scrolled ? "#FFFAF3" : "transparent",
        borderBottom: scrolled ? "1px solid #D1C7BD" : "1px solid transparent",
      }}
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.1 }}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="flex items-center justify-between h-16 lg:h-20">
          <a href="#top" className="flex items-center gap-3 select-none">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "#322D29" }}>
              <Logo variant="white" size={16} />
            </div>
            <span className="text-sm font-semibold tracking-tight" style={{ fontFamily: "'Inter', sans-serif", color: "#322D29" }}>BlackLetter</span>
          </a>

          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm font-medium transition-colors duration-200"
                style={{ fontFamily: "'Inter', sans-serif", color: "#AC9C8D" }}
                onMouseEnter={(e) => e.currentTarget.style.color = "#322D29"}
                onMouseLeave={(e) => e.currentTarget.style.color = "#AC9C8D"}
              >
                {link.label}
              </a>
            ))}
            <button
              onClick={onLaunch}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-sm transition-all duration-200 active:scale-[0.97]"
              style={{ backgroundColor: "#F62440", color: "#FFFAF3", fontFamily: "'Inter', sans-serif" }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#D41E34"}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#F62440"}
            >
              Launch <ArrowRight size={14} />
            </button>
          </nav>

          <button
            className="md:hidden p-2 rounded-sm transition-colors"
            style={{ color: "#322D29" }}
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden overflow-hidden"
            style={{ backgroundColor: "#FFFAF3", borderTop: "1px solid #D1C7BD" }}
          >
            <div className="px-6 py-4 flex flex-col gap-4">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-sm font-medium py-1"
                  style={{ fontFamily: "'Inter', sans-serif", color: "#AC9C8D" }}
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </a>
              ))}
              <button
                onClick={() => { setMobileOpen(false); onLaunch(); }}
                className="flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold rounded-sm transition-all"
                style={{ backgroundColor: "#F62440", color: "#FFFAF3", fontFamily: "'Inter', sans-serif" }}
              >
                Launch <ArrowRight size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}

/* ── Section Wrapper ── */
function Section({ id, children, className = "", style: extraStyle }: { id?: string; children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <section id={id} className={`relative px-6 lg:px-10 ${className}`} style={extraStyle}>
      <div className="max-w-7xl mx-auto">
        {children}
      </div>
    </section>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-xs font-semibold tracking-[0.2em] uppercase mb-4" style={{ fontFamily: "'Inter', sans-serif", color: "#AC9C8D" }}>
      {children}
    </p>
  );
}

function SectionTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={`text-4xl lg:text-5xl xl:text-6xl font-medium leading-[1.1] tracking-tight ${className}`}
      style={{ fontFamily: "'Instrument Serif', serif", color: "#322D29" }}
    >
      {children}
    </h2>
  );
}

function SectionSubtitle({ children }: { children: ReactNode }) {
  return (
    <p className="text-base lg:text-lg max-w-2xl mt-4 leading-relaxed" style={{ fontFamily: "'Inter', sans-serif", color: "#72383D" }}>
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
  { name: "Humanities", icon: BookOpen },
  { name: "Philosophy", icon: Lightbulb },
];

function DomainBadge({ name, icon: Icon, index }: { name: string; icon: typeof Scale; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, delay: index * 0.04 }}
      className="flex items-center gap-2.5 px-4 py-2.5 rounded-sm transition-all duration-200 cursor-default"
      style={{
        backgroundColor: "#EFE9E1",
        border: "1px solid #D1C7BD",
        fontFamily: "'Inter', sans-serif",
      }}
      whileHover={{ y: -2, backgroundColor: "#FFE5BF", borderColor: "#AC9C8D", transition: { duration: 0.2 } }}
    >
      <Icon size={14} style={{ color: "#72383D" }} />
      <span className="text-sm font-medium whitespace-nowrap" style={{ color: "#322D29" }}>{name}</span>
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
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="group relative p-6 lg:p-8 rounded-sm transition-all duration-300 cursor-default"
      style={{
        backgroundColor: "#EFE9E1",
        border: "1px solid #D1C7BD",
      }}
      whileHover={{ y: -4, backgroundColor: "#FFE5BF", borderColor: "#AC9C8D", transition: { duration: 0.2 } }}
    >
      <div className="w-10 h-10 rounded-sm flex items-center justify-center mb-4 transition-colors duration-200" style={{ backgroundColor: "#322D29" }}>
        <Icon size={18} style={{ color: "#FFFAF3" }} />
      </div>
      <h3 className="text-lg font-semibold mb-2" style={{ fontFamily: "'Instrument Serif', serif", color: "#322D29" }}>{title}</h3>
      <p className="text-sm leading-relaxed" style={{ fontFamily: "'Inter', sans-serif", color: "#72383D" }}>{description}</p>
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
      className="flex items-start gap-5 group"
    >
      <div className="flex flex-col items-center">
        <motion.div
          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold"
          style={{ backgroundColor: "#322D29", color: "#FFFAF3", fontFamily: "'Inter', sans-serif" }}
          whileHover={{ scale: 1.1 }}
        >
          {index + 1}
        </motion.div>
        {!isLast && <div className="w-px h-12 lg:h-16 my-1" style={{ backgroundColor: "#D1C7BD" }} />}
      </div>
      <div className="pt-1.5">
        <h4 className="text-base font-semibold" style={{ fontFamily: "'Inter', sans-serif", color: "#322D29" }}>{step.label}</h4>
        <p className="text-sm mt-0.5" style={{ fontFamily: "'Inter', sans-serif", color: "#AC9C8D" }}>{step.desc}</p>
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
      className="p-6 lg:p-8 rounded-sm"
      style={{
        backgroundColor: "#EFE9E1",
        border: "1px solid #D1C7BD",
      }}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
    >
      <h3 className="text-lg font-semibold mb-4" style={{ fontFamily: "'Instrument Serif', serif", color: "#322D29" }}>{title}</h3>
      <ul className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-3 text-sm" style={{ fontFamily: "'Inter', sans-serif", color: "#72383D" }}>
            <div className="w-4 h-4 rounded-full flex items-center justify-center mt-0.5 shrink-0" style={{ backgroundColor: accent }}>
              <Check size={10} style={{ color: "#FFFAF3" }} />
            </div>
            {item}
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

/* ── Stat Counter ── */
function StatCounter({ value, label, suffix = "" }: { value: number; label: string; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          const duration = 1500;
          const steps = 30;
          const increment = value / steps;
          let current = 0;
          const timer = setInterval(() => {
            current += increment;
            if (current >= value) {
              setDisplay(value);
              clearInterval(timer);
            } else {
              setDisplay(Math.floor(current));
            }
          }, duration / steps);
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div ref={ref} className="text-center">
      <div className="text-4xl lg:text-5xl font-semibold" style={{ fontFamily: "'Instrument Serif', serif", color: "#322D29" }}>
        {display}{suffix}
      </div>
      <p className="text-sm mt-2 font-medium" style={{ fontFamily: "'Inter', sans-serif", color: "#AC9C8D" }}>{label}</p>
    </div>
  );
}

/* ── Roadmap ── */
type RoadmapStatus = "completed" | "developing" | "planned";

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
  planned: { label: "Planned", color: "#AC9C8D" },
};

const ROADMAP_DATA: RoadmapPhase[] = [
  {
    version: "v1.0",
    title: "Learning Engine",
    description: "The intelligence layer that shapes every explanation around what you already know and what you are missing.",
    icon: Brain,
    status: "completed",
    features: [
      "Adaptive explanations",
      "Document understanding",
      "Knowledge-gap detection",
      "Personalized learning",
      "AI tutoring",
      "Structured reports",
    ],
  },
  {
    version: "v2.0",
    title: "Research Workspace",
    description: "A workspace built for real research — tabs, folders, documents, and history that survive between sessions.",
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
    title: "Knowledge Engine",
    description: "Concept maps recorded while each report is written — what relates to what, and why.",
    icon: Network,
    status: "completed",
    features: [
      "Automatic knowledge graphs",
      "Concept relationships",
      "Entity extraction",
      "Learning paths",
      "Graph memory",
      "Knowledge exploration",
      "Graph search",
      "Context awareness",
    ],
  },
  {
    version: "v4.0",
    title: "Research Canvas",
    description: "An infinite canvas where research — documents, graphs, notes, and answers — is laid out, linked, and freely arranged.",
    icon: Layout,
    status: "developing",
    features: [
      "Infinite workspace",
      "Drag-and-drop research",
      "Notes",
      "Diagrams",
      "Mind maps",
      "AI blocks",
      "Documents",
      "Knowledge graph",
      "Everything connected",
    ],
  },
  {
    version: "v5.0",
    title: "Offline Intelligence",
    description: "The full system with no network — local models, local embeddings, encrypted storage, and sync on your terms.",
    icon: Shield,
    status: "planned",
    features: [
      "Local AI",
      "Offline research",
      "Encrypted storage",
      "Private knowledge",
      "Hybrid AI",
      "Offline embeddings",
      "Local vector database",
      "Automatic cloud synchronization",
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
        onClick={() => setExpanded((v) => !v)}
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
            className="w-11 h-11 rounded-sm flex items-center justify-center shrink-0"
            style={{ backgroundColor: phase.status === "completed" ? "#F62440" : "#322D29" }}
          >
            <Icon size={18} style={{ color: "#FFFAF3" }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-xs font-bold tracking-widest" style={{ color: meta.color }}>{phase.version}</span>
              <span className="text-2xs px-2 py-0.5 rounded-sm font-semibold uppercase tracking-wider" style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}>{meta.label}</span>
            </div>
            <h3 className="text-lg lg:text-xl font-semibold mt-1" style={{ fontFamily: "'Instrument Serif', serif", color: "#322D29" }}>{phase.title}</h3>
            <p className="text-sm mt-1 leading-relaxed max-w-xl" style={{ fontFamily: "'Inter', sans-serif", color: phase.status === "planned" ? "rgba(114,56,61,0.45)" : "#72383D" }}>{phase.description}</p>
            {phase.status === "developing" && (
              <div className="mt-3 h-1.5 w-44 rounded-full overflow-hidden" style={{ backgroundColor: "#72383D22" }}>
                <div className="h-full rounded-full roadmap-progress" style={{ backgroundColor: "#72383D" }} />
              </div>
            )}
            {phase.status === "planned" && (
              <span className="mt-1 inline-block font-mono text-[10px] uppercase tracking-widest opacity-50" style={{ color: "#AC9C8D" }}>Locked — ships in a future release</span>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "#AC9C8D" }}>{phase.features.length} features</span>
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
              <div className="mx-5 pb-5 border-t" style={{ borderColor: "#D1C7BD" }}>
                <ul className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-2">
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
    <div className="rounded-sm overflow-hidden border" style={{ backgroundColor: "#FFFAF3", borderColor: "#D1C7BD" }}>
      <div className="px-5 py-3 border-b flex items-center gap-2" style={{ backgroundColor: "#EFE9E1", borderColor: "#D1C7BD" }}>
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#F62440" }} />
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#AC9C8D" }} />
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#AC9C8D" }} />
        <span className="text-xs font-medium ml-2" style={{ fontFamily: "'Inter', sans-serif", color: "#AC9C8D" }}>BlackLetter — Research Session</span>
      </div>

      <div className="p-5 lg:p-8">
        {!started ? (
          <div className="flex gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              placeholder="Ask anything... e.g. Explain Linear Algebra"
              className="flex-1 px-4 py-3 text-sm outline-none rounded-sm border transition-colors"
              style={{ fontFamily: "'Inter', sans-serif", backgroundColor: "#FFF2DB", borderColor: "#D1C7BD", color: "#322D29" }}
            />
            <button
              onClick={handleSubmit}
              className="px-5 py-3 text-sm font-semibold rounded-sm transition-all active:scale-[0.97]"
              style={{ backgroundColor: "#F62440", color: "#FFFAF3", fontFamily: "'Inter', sans-serif" }}
            >
              <Send size={16} />
            </button>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="flex items-center gap-3 pb-4 border-b" style={{ borderColor: "#D1C7BD" }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "#322D29" }}>
                <Logo variant="white" size={16} />
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: "#322D29" }}>{query}</p>
                <p className="text-xs" style={{ color: "#AC9C8D" }}>Research Report</p>
              </div>
              {phase === "processing" && (
                <motion.div
                  className="ml-auto flex items-center gap-2 text-xs font-medium"
                  style={{ color: "#72383D" }}
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <Zap size={12} /> Building understanding...
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
                  <div className="flex items-start gap-3 p-3 rounded-sm" style={{ backgroundColor: "#FFF2DB" }}>
                    <span className="text-base mt-0.5">{sectionIcons[s]}</span>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#72383D" }}>{s}</p>
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
                <div className="flex items-center gap-2 text-xs font-medium" style={{ color: "#F62440" }}>
                  <Check size={14} /> Report complete — ready for review
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
    </div>
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
            <Header onLaunch={onEnter} />

            {/* ── HERO ── */}
            <motion.section
              className="relative min-h-screen flex items-center overflow-hidden px-6 lg:px-10"
              style={{ backgroundColor: "#FFFAF3", opacity: heroOpacity, scale: heroScale }}
            >
              <KnowledgeParticles />

              <div className="max-w-7xl mx-auto w-full relative z-10 pt-24 lg:pt-28">
                <div className="max-w-4xl">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                  >
                    <div className="flex items-center gap-3 mb-6">
                      <p className="text-xs font-semibold tracking-[0.25em] uppercase" style={{ fontFamily: "'Inter', sans-serif", color: "#F62440" }}>
                        AI Research Operating System
                      </p>
                      <span
                        className="font-mono text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-sm"
                        style={{ color: "#F62440", border: "1px solid #F62440" }}
                      >
                        v3.0 Live
                      </span>
                    </div>
                  </motion.div>

                  <motion.h1
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: 0.35 }}
                    className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl xl:text-[8.5rem] font-medium leading-[0.92] tracking-tighter"
                    style={{ fontFamily: "'Instrument Serif', serif", color: "#322D29" }}
                  >
                    Research. Learn.
                    <br />
                    <span style={{ color: "#72383D" }}>Build knowledge.</span>
                  </motion.h1>

                  <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.55 }}
                    className="text-base lg:text-lg max-w-xl mt-6 lg:mt-8 leading-relaxed"
                    style={{ fontFamily: "'Inter', sans-serif", color: "#72383D" }}
                  >
                    BlackLetter is an AI research operating system. Sessions, documents, knowledge graph, and canvas live in one workspace — so the work you do today becomes the system you use tomorrow.
                  </motion.p>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.7 }}
                    className="flex flex-wrap gap-4 mt-8 lg:mt-10"
                  >
                    <button
                      onClick={onEnter}
                      className="flex items-center gap-2 px-7 py-3.5 text-sm font-semibold rounded-sm transition-all duration-200 active:scale-[0.97]"
                      style={{ backgroundColor: "#F62440", color: "#FFFAF3", fontFamily: "'Inter', sans-serif" }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#D41E34"}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#F62440"}
                    >
                      Launch BlackLetter <ArrowRight size={15} />
                    </button>
                    <a
                      href="#how-it-works"
                      className="flex items-center gap-2 px-7 py-3.5 text-sm font-semibold rounded-sm transition-all duration-200"
                      style={{ backgroundColor: "#EFE9E1", color: "#322D29", fontFamily: "'Inter', sans-serif", border: "1px solid #D1C7BD" }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#FFE5BF"; e.currentTarget.style.borderColor = "#AC9C8D"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#EFE9E1"; e.currentTarget.style.borderColor = "#D1C7BD"; }}
                    >
                      See How It Works <ChevronDown size={14} />
                    </a>
                  </motion.div>
                </div>

                {/* Scroll indicator */}
                <motion.div
                  className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.2, duration: 0.6 }}
                >
                  <motion.div
                    className="w-px h-8"
                    style={{ backgroundColor: "#D1C7BD" }}
                    animate={{ height: [8, 24, 8] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  <span className="text-2xs font-medium uppercase tracking-widest" style={{ color: "#AC9C8D" }}>Scroll</span>
                </motion.div>
              </div>
            </motion.section>

            {/* ── DOMAINS ── */}
            <Section className="py-20 lg:py-28" style={{ backgroundColor: "#FFF2DB" }}>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <SectionLabel>Supported Domains</SectionLabel>
                <SectionTitle>Learn anything.<br />Teach everything.</SectionTitle>
                <SectionSubtitle>Twelve disciplines, one reasoning core — each with subject-aware rules for how it explains.</SectionSubtitle>
              </motion.div>
              <div className="flex flex-wrap gap-3 mt-10">
                {DOMAINS.map((d, i) => (
                  <DomainBadge key={d.name} name={d.name} icon={d.icon} index={i} />
                ))}
              </div>
            </Section>

            {/* ── CAPABILITIES ── */}
            <Section id="capabilities" className="py-20 lg:py-28">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <SectionLabel>Capabilities</SectionLabel>
                <SectionTitle>Six engines.<br />One workspace.</SectionTitle>
                <SectionSubtitle>A research session is the entry point; a knowledge graph is what accumulates. Everything else sits between the two.</SectionSubtitle>
              </motion.div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5 mt-10 lg:mt-12">
                <CapabilityCard icon={Brain} title="Adaptive Learning" description="Explanations adjust to what you already know and how you learn best." index={0} />
                <CapabilityCard icon={FileText} title="Document Intelligence" description="PDFs, papers, and briefs become structured, searchable research material." index={1} />
                <CapabilityCard icon={Layers} title="Research Workspace" description="Multiple sessions, folders, documents, and history — saved automatically, searchable globally." index={2} />
                <CapabilityCard icon={Network} title="Knowledge Graph" description="Concepts are extracted and connected as you research. The map grows with your work." index={3} />
                <CapabilityCard icon={BookOpen} title="Subject Intelligence" description="A legal explanation reads differently from a physics one. BlackLetter knows the difference." index={4} />
                <CapabilityCard icon={Zap} title="Learning Memory" description="Progress, weak areas, and preferred depth are remembered across sessions — no configuration required." index={5} />
              </div>
            </Section>

            {/* ── HOW IT WORKS ── */}
            <Section id="how-it-works" className="py-20 lg:py-28" style={{ backgroundColor: "#FFF2DB" }}>
              <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5 }}
                >
                  <SectionLabel>The Pipeline</SectionLabel>
                  <SectionTitle>From question<br />to understanding.</SectionTitle>
                  <SectionSubtitle>Every query runs through BlackLetter's pipeline — intent, subject, knowledge gap, prompt assembly, execution, quality check, formatting — in that order, every time.</SectionSubtitle>
                </motion.div>

                <div className="space-y-1 lg:pl-8">
                  {PIPELINE_STEPS.map((step, i) => (
                    <PipelineStep key={step.label} step={step} index={i} isLast={i === PIPELINE_STEPS.length - 1} />
                  ))}
                </div>
              </div>
            </Section>

            {/* ── WHY BLACKLETTER ── */}
            <Section className="py-20 lg:py-28">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="text-center mb-12 lg:mb-16"
              >
                <SectionLabel>Why BlackLetter</SectionLabel>
                <SectionTitle>Chatbots answer.<br />BlackLetter works.</SectionTitle>
              </motion.div>

              <div className="grid md:grid-cols-3 gap-4 lg:gap-6">
                <ComparisonCard
                  title="A Chatbot"
                  items={["Answers in isolation, forgets immediately", "One-size-fits-all explanations", "Nothing accumulates between sessions"]}
                  accent="#AC9C8D"
                />
                <ComparisonCard
                  title="BlackLetter"
                  items={["Every session builds on the last", "Subject-aware explanations that adapt", "Reports, graphs, and notes accumulate"]}
                  accent="#F62440"
                />
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.5 }}
                  whileHover={{ y: -3, transition: { duration: 0.2 } }}
                  className="p-6 lg:p-8 rounded-sm flex flex-col items-center justify-center text-center"
                  style={{
                    backgroundColor: "#F62440",
                    border: "1px solid #F62440",
                  }}
                >
                  <Sparkles size={24} style={{ color: "#FFFAF3" }} />
                  <p className="text-base font-semibold mt-3" style={{ fontFamily: "'Instrument Serif', serif", color: "#FFFAF3" }}>
                    The difference is the difference between searching and working.
                  </p>
                </motion.div>
              </div>
            </Section>

            {/* ── INTERACTIVE DEMO ── */}
            <Section className="py-20 lg:py-28" style={{ backgroundColor: "#FFF2DB" }}>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <SectionLabel>Try It</SectionLabel>
                <SectionTitle>See what BlackLetter<br />actually does.</SectionTitle>
                <SectionSubtitle>Type a topic below and watch how BlackLetter structures the response — no API key required.</SectionSubtitle>
              </motion.div>
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

            {/* ── STATISTICS ── */}
            <Section className="py-20 lg:py-28">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="text-center mb-12 lg:mb-16"
              >
                <SectionLabel>By The Numbers</SectionLabel>
                <SectionTitle className="text-center">Built for depth,<br />not breadth.</SectionTitle>
              </motion.div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 lg:gap-6">
                <StatCounter value={24} label="Subjects Supported" />
                <StatCounter value={15} label="Learning Modes" />
                <StatCounter value={12} label="Research Templates" />
                <StatCounter value={50} label="Knowledge Pipelines" />
                <StatCounter value={4} label="Document Types" suffix="+" />
                <StatCounter value={9} label="Report Sections" />
              </div>
            </Section>

            {/* ── AI ECOSYSTEM ── */}
            <AiEcosystem />

            {/* ── ROADMAP ── */}
            <Section id="roadmap" className="py-20 lg:py-28" style={{ backgroundColor: "#FFF2DB" }}>
              <div className="max-w-3xl">
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5 }}
                >
                  <SectionLabel>Roadmap</SectionLabel>
                  <SectionTitle>One system.<br />Five releases.</SectionTitle>
                  <SectionSubtitle>BlackLetter ships in numbered releases. Everything below is real — no vaporware, no estimated dates, just the sequence we are building in.</SectionSubtitle>
                </motion.div>

                <div className="relative mt-10 lg:mt-12 space-y-4 lg:space-y-5 pl-1">
                  <div className="absolute left-[5px] top-3 bottom-3 w-px" style={{ backgroundColor: "#D1C7BD" }} />
                  {ROADMAP_DATA.map((phase, i) => (
                    <div key={phase.version} className="relative">
                      <div
                        className="absolute left-0 top-7 w-[11px] h-[11px] rounded-full border-2 -translate-x-[5px]"
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
            <Section className="py-20 lg:py-28">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="text-center max-w-3xl mx-auto"
              >
                <SectionLabel>Get Started</SectionLabel>
                <SectionTitle className="text-center">Research. Learn.<br />Build knowledge.</SectionTitle>
                <p className="text-base lg:text-lg mt-4 leading-relaxed" style={{ fontFamily: "'Inter', sans-serif", color: "#72383D" }}>
                  BlackLetter v3.0 is live. Run it in your browser today, read the code, or follow the development on GitHub.
                </p>

                <motion.div
                  className="flex flex-wrap justify-center gap-4 mt-10"
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                >
                  <button
                    onClick={onEnter}
                    className="flex items-center gap-2 px-8 py-3.5 text-sm font-semibold rounded-sm transition-all duration-200 active:scale-[0.97] cursor-pointer"
                    style={{ backgroundColor: "#F62440", color: "#FFFAF3", fontFamily: "'Inter', sans-serif" }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#D41E34"}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#F62440"}
                  >
                    Launch BlackLetter <ArrowRight size={15} />
                  </button>
                  <a
                    href="https://github.com/arsx-s/blackletter"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-8 py-3.5 text-sm font-semibold rounded-sm transition-all duration-200 active:scale-[0.97]"
                    style={{ backgroundColor: "#322D29", color: "#FFFAF3", fontFamily: "'Inter', sans-serif" }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#72383D"}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#322D29"}
                  >
                    <Github size={16} /> GitHub Repository
                  </a>
                  <a
                    href="https://github.com/arsx-s/blackletter#readme"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-8 py-3.5 text-sm font-semibold rounded-sm transition-all duration-200 active:scale-[0.97]"
                    style={{ backgroundColor: "#EFE9E1", color: "#322D29", fontFamily: "'Inter', sans-serif", border: "1px solid #D1C7BD" }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#FFE5BF"; e.currentTarget.style.borderColor = "#AC9C8D"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#EFE9E1"; e.currentTarget.style.borderColor = "#D1C7BD"; }}
                  >
                    <BookOpen size={16} /> Documentation
                  </a>
                </motion.div>
              </motion.div>
            </Section>

            {/* ── FEEDBACK ── */}
            <Section id="feedback" className="py-20 lg:py-28">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="text-center max-w-2xl mx-auto"
              >
                <SectionLabel>Shape The Future</SectionLabel>
                <SectionTitle className="text-center">Help us build<br />something meaningful.</SectionTitle>
                <p className="text-base lg:text-lg mt-4 leading-relaxed" style={{ fontFamily: "'Inter', sans-serif", color: "#72383D" }}>
                  BlackLetter is built in the open. Bugs, feature requests, and design opinions all land in the issue tracker — and the roadmap changes with them.
                </p>

                <motion.div
                  className="flex flex-wrap justify-center gap-4 mt-8"
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                >
                  <a
                    href="https://github.com/arsx-s/blackletter"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-7 py-3.5 text-sm font-semibold rounded-sm transition-all duration-200 active:scale-[0.97]"
                    style={{ backgroundColor: "#322D29", color: "#FFFAF3", fontFamily: "'Inter', sans-serif" }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#72383D"}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#322D29"}
                  >
                    <Github size={16} /> GitHub
                  </a>
                  <a
                    href="mailto:feedback@blackletter.dev"
                    className="flex items-center gap-2 px-7 py-3.5 text-sm font-semibold rounded-sm transition-all duration-200 active:scale-[0.97]"
                    style={{ backgroundColor: "#EFE9E1", color: "#322D29", fontFamily: "'Inter', sans-serif", border: "1px solid #D1C7BD" }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#FFE5BF"; e.currentTarget.style.borderColor = "#AC9C8D"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#EFE9E1"; e.currentTarget.style.borderColor = "#D1C7BD"; }}
                  >
                    <MessageSquare size={16} /> Give Feedback
                  </a>
                </motion.div>
              </motion.div>
            </Section>

            {/* ── FOOTER ── */}
            <footer style={{ backgroundColor: "#322D29" }}>
              <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16 lg:py-20">
                <div className="grid lg:grid-cols-4 gap-12">
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-sm flex items-center justify-center" style={{ backgroundColor: "#322D29", border: "1px solid rgba(255,250,243,0.2)" }}>
                        <Logo variant="white" size={18} />
                      </div>
                      <div>
                        <p className="text-lg font-semibold leading-tight" style={{ fontFamily: "'Inter', sans-serif", color: "#FFFAF3" }}>BlackLetter</p>
                        <p className="text-xs mt-0.5" style={{ fontFamily: "'Inter', sans-serif", color: "#AC9C8D" }}>AI Research Operating System</p>
                      </div>
                    </div>
                    <p className="text-sm mt-6 max-w-xs leading-relaxed" style={{ fontFamily: "'Inter', sans-serif", color: "#AC9C8D" }}>
                      A local-first research operating system for people who work in depth. Research sessions, documents, a knowledge graph, and a canvas — in one place.
                    </p>
                  </div>

                  <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-3 gap-10">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "#AC9C8D" }}>Product</p>
                      <nav className="flex flex-col gap-2.5">
                        <a href="https://github.com/arsx-s/blackletter" target="_blank" rel="noopener noreferrer" className="text-sm transition-colors duration-200" style={{ fontFamily: "'Inter', sans-serif", color: "#FFFAF3" }} onMouseEnter={(e) => e.currentTarget.style.color = "#F62440"} onMouseLeave={(e) => e.currentTarget.style.color = "#FFFAF3"}>Documentation</a>
                        <a href="#roadmap" className="text-sm transition-colors duration-200" style={{ fontFamily: "'Inter', sans-serif", color: "#FFFAF3" }} onMouseEnter={(e) => e.currentTarget.style.color = "#F62440"} onMouseLeave={(e) => e.currentTarget.style.color = "#FFFAF3"}>Roadmap</a>
                        <a href="mailto:feedback@blackletter.dev" className="text-sm transition-colors duration-200" style={{ fontFamily: "'Inter', sans-serif", color: "#FFFAF3" }} onMouseEnter={(e) => e.currentTarget.style.color = "#F62440"} onMouseLeave={(e) => e.currentTarget.style.color = "#FFFAF3"}>Feedback</a>
                        <a href="https://github.com/arsx-s/blackletter" target="_blank" rel="noopener noreferrer" className="text-sm transition-colors duration-200" style={{ fontFamily: "'Inter', sans-serif", color: "#FFFAF3" }} onMouseEnter={(e) => e.currentTarget.style.color = "#F62440"} onMouseLeave={(e) => e.currentTarget.style.color = "#FFFAF3"}>Privacy</a>
                      </nav>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "#AC9C8D" }}>Community</p>
                      <nav className="flex flex-col gap-2.5">
                        <a href="https://github.com/arsx-s/blackletter" target="_blank" rel="noopener noreferrer" className="text-sm transition-colors duration-200" style={{ fontFamily: "'Inter', sans-serif", color: "#FFFAF3" }} onMouseEnter={(e) => e.currentTarget.style.color = "#F62440"} onMouseLeave={(e) => e.currentTarget.style.color = "#FFFAF3"}>GitHub</a>
                        <a href="https://github.com/arsx-s/blackletter" target="_blank" rel="noopener noreferrer" className="text-sm transition-colors duration-200" style={{ fontFamily: "'Inter', sans-serif", color: "#FFFAF3" }} onMouseEnter={(e) => e.currentTarget.style.color = "#F62440"} onMouseLeave={(e) => e.currentTarget.style.color = "#FFFAF3"}>Star Project</a>
                        <a href="https://github.com/arsx-s/blackletter/issues" target="_blank" rel="noopener noreferrer" className="text-sm transition-colors duration-200" style={{ fontFamily: "'Inter', sans-serif", color: "#FFFAF3" }} onMouseEnter={(e) => e.currentTarget.style.color = "#F62440"} onMouseLeave={(e) => e.currentTarget.style.color = "#FFFAF3"}>Issues</a>
                        <a href="https://github.com/arsx-s/blackletter/releases" target="_blank" rel="noopener noreferrer" className="text-sm transition-colors duration-200" style={{ fontFamily: "'Inter', sans-serif", color: "#FFFAF3" }} onMouseEnter={(e) => e.currentTarget.style.color = "#F62440"} onMouseLeave={(e) => e.currentTarget.style.color = "#FFFAF3"}>Releases</a>
                      </nav>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "#AC9C8D" }}>Version</p>
                      <p className="text-sm" style={{ fontFamily: "'Inter', sans-serif", color: "#FFFAF3" }}>v3.0</p>
                      <p className="text-xs mt-1" style={{ color: "#AC9C8D" }}>MIT License</p>
                    </div>
                  </div>
                </div>

                <div className="mt-12 pt-8 border-t flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4" style={{ borderColor: "rgba(255,250,243,0.1)" }}>
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
