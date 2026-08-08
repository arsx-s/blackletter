import { motion } from "framer-motion";
import { ArrowRight, Lightbulb } from "lucide-react";

interface FollowUpQuestionsProps {
  questions: string[];
  onSelect: (question: string) => void;
}

export function FollowUpQuestions({ questions, onSelect }: FollowUpQuestionsProps) {
  if (questions.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.4 }}
      className="mt-8 pt-6 border-t border-border"
    >
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb size={14} className="text-bone/50" />
        <p className="font-sans text-xs font-medium text-bone/70">Continue exploring</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {questions.map((q, i) => (
          <motion.button
            key={i}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6 + i * 0.1, duration: 0.3 }}
            onClick={() => onSelect(q)}
            className="group flex items-center gap-2 px-3.5 py-2 rounded-lg bg-bone/[0.03] border border-border hover:bg-bone/[0.06] hover:border-border transition-all text-left"
          >
            <span className="font-sans text-xs text-bone/60 group-hover:text-bone/80 transition-colors leading-relaxed">
              {q}
            </span>
            <ArrowRight size={12} className="text-muted/50 group-hover:text-bone/50 transition-colors shrink-0" />
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
