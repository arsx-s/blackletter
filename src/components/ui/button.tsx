import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap",
        "transition-all duration-150 ease-out",
        "disabled:pointer-events-none disabled:opacity-40",
        "select-none focus-ring",
        variant === "primary" && "bg-accent text-background border border-accent/30 hover:bg-accent-hover active:scale-[0.97]",
        variant === "secondary" && "bg-sidebar text-bone border border-border hover:bg-border/50 active:scale-[0.97]",
        variant === "ghost" && "bg-transparent text-muted border border-transparent hover:bg-bone/[0.06] active:scale-[0.97]",
        variant === "outline" && "bg-transparent text-bone border border-border hover:bg-sidebar active:scale-[0.97]",
        variant === "danger" && "bg-accent-hover/10 text-accent-hover border border-accent-hover/20 hover:bg-accent-hover/20 active:scale-[0.97]",
        size === "sm" && "h-8 px-3 text-xs rounded-xs",
        size === "md" && "h-10 px-4 text-sm rounded-sm",
        size === "lg" && "h-12 px-6 text-base rounded-sm",
        size === "icon" && "h-9 w-9 rounded-xs",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
);
Button.displayName = "Button";
