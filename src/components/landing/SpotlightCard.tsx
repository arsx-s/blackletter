import type { CSSProperties, PointerEvent, ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "../../lib/utils";

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Colour of the pointer-tracked highlight. */
  spotlight?: string;
  /** Subtle 3D tilt toward the pointer. Ignored under reduced motion. */
  tilt?: boolean;
}

/**
 * SpotlightCard — a surface that tracks the pointer.
 *
 * A radial highlight follows the cursor and the card leans a couple of degrees
 * toward it, giving flat panels a sense of depth. The card is a plain element
 * rather than a motion component so callers can animate it with framer-motion
 * without fighting over `transform`; all pointer state is written to CSS custom
 * properties, so moving the mouse causes zero React renders.
 */
export function SpotlightCard({
  children,
  className,
  style,
  spotlight = "rgba(246,36,64,0.12)",
  tilt = true,
}: SpotlightCardProps) {
  const reduce = useReducedMotion();

  const handleMove = (event: PointerEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    const px = (event.clientX - rect.left) / Math.max(1, rect.width);
    const py = (event.clientY - rect.top) / Math.max(1, rect.height);

    el.style.setProperty("--spot-x", `${(px * 100).toFixed(2)}%`);
    el.style.setProperty("--spot-y", `${(py * 100).toFixed(2)}%`);

    if (tilt && !reduce) {
      el.style.setProperty("--tilt-x", `${((0.5 - py) * 4).toFixed(2)}deg`);
      el.style.setProperty("--tilt-y", `${((px - 0.5) * 6).toFixed(2)}deg`);
    }
  };

  const handleLeave = (event: PointerEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    el.style.setProperty("--tilt-x", "0deg");
    el.style.setProperty("--tilt-y", "0deg");
  };

  return (
    <div
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      className={cn("group/spot relative overflow-hidden", className)}
      style={{
        ...style,
        transform: "perspective(1000px) rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg))",
        transformStyle: "preserve-3d",
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
        style={{
          background: `radial-gradient(320px circle at var(--spot-x, 50%) var(--spot-y, 50%), ${spotlight}, transparent 72%)`,
        }}
      />
      {children}
    </div>
  );
}
