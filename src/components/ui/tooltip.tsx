import { useId, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "../../lib/utils";

interface TooltipProps {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
}

/**
 * A lightweight visual tooltip for icon-only controls.
 *
 * Deliberately a *supplementary* affordance: accessible naming must still come
 * from the trigger's own `aria-label`, so the control remains usable if this
 * never appears. It opens on hover and on keyboard focus, closes on Escape, and
 * never opens for touch input — on touch there is no hover state to dismiss it,
 * and the icon's accessible name is already announced.
 */
export function Tooltip({ label, children, side = "top", className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span
      className={cn("relative inline-flex", className)}
      onPointerEnter={(e) => {
        if (e.pointerType !== "touch") setOpen(true);
      }}
      onPointerLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      {children}
      <AnimatePresence>
        {open && (
          <motion.span
            id={id}
            role="tooltip"
            initial={{ opacity: 0, y: side === "top" ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: side === "top" ? 4 : -4 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className={cn(
              "pointer-events-none absolute left-1/2 z-[60] -translate-x-1/2 whitespace-nowrap",
              "surface-popover rounded-sm px-2 py-1 font-sans text-2xs text-bone",
              side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
            )}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
