import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check } from "lucide-react";
import { cn } from "../../lib/utils";

interface AnimatedCopyButtonProps {
  text: string;
  className?: string;
}

export function AnimatedCopyButton({ text, className }: AnimatedCopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1800);
    } catch { setCopied(false); }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "relative flex items-center justify-center rounded-md border border-border bg-background text-bone transition-colors hover:bg-bone/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bone/20 focus-visible:ring-offset-2",
        className
      )}
      aria-label={copied ? "Copied" : "Copy to clipboard"}
    >
      <AnimatePresence mode="wait">
        {copied ? (
          <motion.span
            key="check"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            <Check size={14} className="text-emerald-500" />
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Copy size={14} />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
