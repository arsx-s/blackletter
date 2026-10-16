import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
  /**
   * Busy state. Renders a spinner over the label (the label stays in the layout
   * so the button does not resize mid-action), blocks interaction, and exposes
   * `aria-busy` so assistive tech announces the wait.
   */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", disabled, loading = false, children, ...props }, ref) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={cn(
          "relative inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap",
          "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out",
          "disabled:pointer-events-none disabled:opacity-50",
          "select-none focus-ring",
          variant === "primary" &&
            "bg-accent text-background border border-accent/30 shadow-button hover:bg-accent-hover hover:shadow-premium active:scale-[0.97]",
          variant === "secondary" &&
            "bg-sidebar text-bone border border-border hover:bg-border/50 hover:border-border-strong active:scale-[0.97]",
          variant === "ghost" &&
            "bg-transparent text-muted border border-transparent hover:bg-bone/[0.06] hover:text-bone active:scale-[0.97]",
          variant === "outline" &&
            "bg-transparent text-bone border border-border hover:bg-bone/[0.04] hover:border-border-strong active:scale-[0.97]",
          variant === "danger" &&
            "bg-accent-hover/10 text-accent-hover border border-accent-hover/20 hover:bg-accent-hover/20 active:scale-[0.97]",
          size === "sm" && "h-8 px-3 text-xs rounded-xs",
          size === "md" && "h-10 px-4 text-sm rounded-sm",
          size === "lg" && "h-12 px-6 text-base rounded-sm",
          size === "icon" && "h-9 w-9 rounded-xs",
          className,
        )}
        {...props}
      >
        <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>{children}</span>
        {loading && <Loader2 className="absolute h-4 w-4 animate-spin" aria-hidden="true" />}
      </button>
    );
  },
);
Button.displayName = "Button";
