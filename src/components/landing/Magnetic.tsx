import type { PointerEvent, ReactNode } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { cn } from "../../lib/utils";
import { SPRING_SOFT } from "../../lib/motion";

interface MagneticProps {
  children: ReactNode;
  className?: string;
  /** How far the child leans toward the pointer, as a fraction of the offset. */
  strength?: number;
}

/**
 * Magnetic — a pointer-responsive wrapper for primary actions.
 *
 * The child drifts a few pixels toward the cursor and springs back on leave,
 * which makes a CTA feel physical without changing its hit area or behaviour.
 * Motion values are used directly so pointer movement never triggers a React
 * render. Disabled under `prefers-reduced-motion`.
 */
export function Magnetic({ children, className, strength = 0.28 }: MagneticProps) {
  const reduce = useReducedMotion();
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, SPRING_SOFT);
  const y = useSpring(rawY, SPRING_SOFT);

  const handleMove = (event: PointerEvent<HTMLSpanElement>) => {
    if (reduce) return;
    const rect = event.currentTarget.getBoundingClientRect();
    rawX.set((event.clientX - (rect.left + rect.width / 2)) * strength);
    rawY.set((event.clientY - (rect.top + rect.height / 2)) * strength);
  };

  const reset = () => {
    rawX.set(0);
    rawY.set(0);
  };

  return (
    <motion.span
      onPointerMove={handleMove}
      onPointerLeave={reset}
      onBlur={reset}
      style={{ x, y }}
      className={cn("inline-block", className)}
    >
      {children}
    </motion.span>
  );
}
