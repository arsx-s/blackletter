import { motion } from "framer-motion";
import { Atom, FlaskConical, BookOpen, BrainCircuit, Globe, BarChart3, Code, Library } from "lucide-react";

const subjects = [
  { id: "academic", label: "Academic", desc: "Scholarly papers, citations, theoretical frameworks", icon: Library },
  { id: "scientific", label: "Scientific", desc: "Research methods, experiments, empirical data", icon: Atom },
  { id: "historical", label: "Historical", desc: "Chronological events, primary sources, context", icon: BookOpen },
  { id: "technical", label: "Technical", desc: "Engineering, architecture, specifications, implementation", icon: Code },
  { id: "philosophical", label: "Philosophical", desc: "Concepts, arguments, schools of thought, ethics", icon: BrainCircuit },
  { id: "political", label: "Political", desc: "Policy analysis, governance, international relations", icon: Globe },
  { id: "economic", label: "Economic", desc: "Market analysis, economic theories, data modeling", icon: BarChart3 },
  { id: "medical", label: "Medical", desc: "Clinical studies, treatments, biological mechanisms", icon: FlaskConical },
];

interface SubjectSelectorProps {
  onSelect: (subject: string) => void;
}

export function SubjectSelector({ onSelect }: SubjectSelectorProps) {
  return (
    <div className="w-full max-w-3xl mx-auto px-6 py-12">
      <div className="text-center mb-10">
        <p className="font-mono text-2xs uppercase tracking-ultra text-muted mb-3">Step 1 of 2</p>
        <h2 className="font-display text-3xl font-black tracking-tighter mb-2">Choose your subject</h2>
        <p className="font-sans text-sm text-muted">Select the academic domain closest to your research topic</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {subjects.map((subject, i) => {
          const Icon = subject.icon;
          return (
            <motion.button
              key={subject.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.04 }}
              onClick={() => onSelect(subject.id)}
              className="group flex flex-col items-center text-center p-5 rounded-xl border border-border/70 bg-background hover:border-accent/40 hover:shadow-[0_4px_24px_-4px_rgba(114,56,61,0.12)] transition-all duration-200"
            >
              <div className="w-10 h-10 rounded-xl bg-bone/[0.04] border border-border/60 flex items-center justify-center mb-3 group-hover:bg-accent/10 group-hover:border-accent/30 transition-colors">
                <Icon size={18} className="text-muted group-hover:text-accent transition-colors" />
              </div>
              <p className="font-sans text-sm font-medium text-bone/80 mb-1">{subject.label}</p>
              <p className="font-sans text-2xs text-muted leading-relaxed">{subject.desc}</p>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
