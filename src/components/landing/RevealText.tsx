import type { CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { EASE_OUT } from "../../lib/motion";

interface WordRevealProps {
  /** The line of copy to reveal, word by word. */
  text: string;
  className?: string;
  style?: CSSProperties;
  /** Seconds before the first word starts. */
  delay?: number;
  /** Seconds between consecutive words. */
  step?: number;
  /** Reveal when scrolled into view rather than on mount. */
  inView?: boolean;
}

/**
 * WordReveal — the project's animated-typography primitive.
 *
 * Words lift and fade in sequence with a calm decelerating ease. Under
 * `prefers-reduced-motion` the final state is rendered immediately, so the copy
 * is never hidden behind an animation that will not run.
 */
export function WordReveal({
  text,
  className = "",
  style,
  delay = 0,
  step = 0.055,
  inView = false,
}: WordRevealProps) {
  const reduce = useReducedMotion();
  const words = text.split(" ");

  const trigger = reduce
    ? {}
    : inView
      ? { whileInView: { y: "0%", opacity: 1 }, viewport: { once: true, margin: "-80px" as const } }
      : { animate: { y: "0%", opacity: 1 } };

  return (
    <span className={className} style={style}>
      {words.map((word, i) => (
        <span key={`${word}-${i}`} className="inline-block">
          <motion.span
            className="inline-block will-change-transform"
            initial={reduce ? false : { y: "0.7em", opacity: 0 }}
            transition={{ duration: 0.8, ease: EASE_OUT, delay: delay + i * step }}
            {...trigger}
          >
            {word}
            {i < words.length - 1 ? "\u00A0" : ""}
          </motion.span>
        </span>
      ))}
    </span>
  );
}
