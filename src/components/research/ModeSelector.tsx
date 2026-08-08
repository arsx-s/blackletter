import { motion } from "framer-motion";
import { ArrowLeft, Search, Layers, BookText, BrainCircuit, Sparkles } from "lucide-react";
import { Button } from "../ui/button";

interface ModeSelectorProps {
  subject: string;
  topic: string;
  onSelect: (mode: string) => void;
  onBack: () => void;
  initial?: string;
}

const modes = [
  { id: "deep-research", label: "Deep Research", icon: Search, desc: "Comprehensive multi-source analysis with citations and structured sections" },
  { id: "literature-review", label: "Literature Review", icon: Layers, desc: "Survey of existing work, key findings, and research gaps" },
  { id: "quick-analysis", label: "Quick Analysis", icon: Sparkles, desc: "Fast overview with key insights and actionable takeaways" },
  { id: "conceptual", label: "Conceptual Framework", icon: BrainCircuit, desc: "Theoretical foundations, models, and conceptual relationships" },
];

export function ModeSelector({ subject, topic, onSelect, onBack, initial }: ModeSelectorProps) {
  return (
    <div className="w-full max-w-3xl mx-auto px-6 py-12">
      <button onClick={onBack} className="flex items-center gap-1.5 text-muted hover:text-bone/80 transition-colors mb-8 group">
        <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
        <span className="font-sans text-xs">Back to subjects</span>
      </button>

      <div className="text-center mb-10">
        <p className="font-mono text-2xs uppercase tracking-ultra text-muted mb-3">Step 2 of 2</p>
        <h2 className="font-display text-3xl font-black tracking-tighter mb-2">Choose your approach</h2>
        <p className="font-sans text-sm text-muted mb-2">Research mode for: <span className="font-medium text-bone/80">&ldquo;{topic}&rdquo;</span></p>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent/10 border border-accent/20 font-mono text-2xs text-accent capitalize">{subject}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {modes.map((mode, i) => {
          const Icon = mode.icon;
          const recommended = initial ? mode.id === initial : false;
          return (
            <motion.button
              key={mode.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.06 }}
              onClick={() => onSelect(mode.id)}
              className={`group flex items-start gap-4 p-5 rounded-xl border text-left transition-all duration-200 ${recommended ? "border-accent/50 bg-accent/[0.04] shadow-[0_4px_24px_-4px_rgba(114,56,61,0.18)]" : "border-border/70 bg-background hover:border-accent/40 hover:shadow-[0_4px_24px_-4px_rgba(114,56,61,0.12)]"}`}
            >
              <div className="w-10 h-10 rounded-xl bg-bone/[0.04] border border-border/60 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-accent/10 group-hover:border-accent/30 transition-colors">
                <Icon size={18} className="text-muted group-hover:text-accent transition-colors" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-sans text-sm font-medium text-bone/80">{mode.label}</p>
                  {recommended && (
                    <span className="px-1.5 py-0.5 rounded-full bg-accent/10 border border-accent/25 font-mono text-2xs text-accent">Recommended</span>
                  )}
                </div>
                <p className="font-sans text-2xs text-muted leading-relaxed">{mode.desc}</p>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
