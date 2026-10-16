import { cn } from "./utils";

/**
 * One field treatment for the whole app.
 *
 * The inline class strings this replaces were duplicated across the shell, the
 * settings panes and the profile popover, and had drifted apart — some used
 * `text-muted/40` placeholders, which composite to roughly 2.8:1 on the page
 * background and fail WCAG AA. Fields now share a single recessed surface, one
 * focus treatment, and the contrast-safe `--text-faint` for placeholder text.
 *
 * Sizing is deliberately *not* part of the appearance, so callers can pick a
 * density without fighting utility cascade order (`px-3` beats `px-2.5` purely
 * by position in the generated stylesheet, regardless of class-attribute order).
 *
 * Lives in `lib` rather than beside the components so the component modules only
 * export components — a mixed module breaks React Fast Refresh.
 */
export const fieldAppearance = cn(
  "w-full bg-bone/[0.03] border border-border rounded-sm",
  "font-sans text-bone",
  "placeholder:text-faint",
  "transition-[border-color,background-color,box-shadow] duration-150 ease-out",
  "outline-none focus:border-accent/60 focus:bg-bone/[0.05]",
  "disabled:opacity-50 disabled:cursor-not-allowed",
);

/** Default density: the standard form field. */
export const fieldClass = cn(fieldAppearance, "px-3 py-2 text-sm");
