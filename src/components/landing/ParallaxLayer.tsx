import type { CSSProperties, ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { useRef } from "react";

interface ParallaxLayerProps {
  children: ReactNode;
  className?: string;
  /** Total pixels travelled across a full viewport pass (~2x is the amplitude). */
  distance?: number;
  style?: CSSProperties;
}

/**
 * ParallaxLayer — scroll-driven depth.
 *
 * The layer drifts against the scroll direction as it passes through the
 * viewport, which is how the landing builds layered environments instead of a
 * flat stack of sections. The spring keeps the motion tied to the scroll (it
 * settles rather than snapping), and the whole effect is skipped under
 * `prefers-reduced-motion`.
 */
export function ParallaxLayer({
  children,
  className = "",
  distance = 48,
  style,
}: ParallaxLayerProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const raw = useTransform(scrollYProgress, [0, 1], [distance, -distance]);
  const y = useSpring(raw, { stiffness: 120, damping: 26, mass: 0.5 });

  return (
    <motion.div ref={ref} className={className} style={{ ...style, y: reduce ? 0 : y }}>
      {children}
    </motion.div>
  );
}
