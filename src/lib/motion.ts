import type { Transition, Variants } from "framer-motion";

/**
 * Shared motion language for BlackLetter surfaces.
 *
 * The intent is a single, restrained vocabulary — cinematic entrances, calm
 * easing, no gratuitous springiness. Everything here is safe under
 * `prefers-reduced-motion` because callers gate on framer's `useReducedMotion`
 * or the `reduceMotion()` helper below.
 */

/** Decelerating ease used for entrances and reveals. */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
/** Symmetric ease for cross-fades. */
export const EASE_IN_OUT: [number, number, number, number] = [0.65, 0, 0.35, 1];
/** Long, slow settle — used sparingly for full-screen choreography. */
export const EASE_CINEMATIC: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const DUR = {
  instant: 0.12,
  fast: 0.2,
  base: 0.45,
  slow: 0.8,
  cinematic: 1.15,
} as const;

export const SPRING_SOFT: Transition = { type: "spring", stiffness: 210, damping: 26, mass: 0.7 };
export const SPRING_SNAPPY: Transition = { type: "spring", stiffness: 380, damping: 32, mass: 0.6 };

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DUR.base, ease: EASE_OUT } },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE_OUT } },
};

export const fadeDown: Variants = {
  hidden: { opacity: 0, y: -16 },
  show: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE_OUT } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.965 },
  show: { opacity: 1, scale: 1, transition: { duration: DUR.base, ease: EASE_OUT } },
};

/** Parent variant that staggers its children. Pair with `fadeUp`/`fadeIn`. */
export function staggerParent(stagger = 0.06, delayChildren = 0): Variants {
  return { hidden: {}, show: { transition: { staggerChildren: stagger, delayChildren } } };
}

/** Standard viewport config for scroll-triggered reveals. */
export const VIEWPORT_ONCE = { once: true, margin: "-80px" } as const;

/** Whether the user asked the OS to reduce motion. Safe in non-DOM contexts. */
export function reduceMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
