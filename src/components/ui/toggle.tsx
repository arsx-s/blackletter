import { useId } from "react";
import { cn } from "../../lib/utils";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, disabled }: ToggleProps) {
  const uid = useId();
  const inputId = `tog-${uid}`;

  return (
    <label htmlFor={inputId} className="relative inline-block select-none" style={{ width: 44, height: 24 }}>
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="sr-only"
      />
      <div
        className={cn(
          "w-full h-full rounded-full relative transition-colors duration-300",
          checked ? "bg-emerald-500" : "bg-black/15",
        )}
        style={{
          boxShadow: checked
            ? "inset 0 1px 3px rgba(0,0,0,0.2)"
            : "inset 0 1px 3px rgba(0,0,0,0.12)",
        }}
      >
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 rounded-full bg-white transition-all duration-300 z-10",
          )}
          style={{
            width: 20,
            height: 20,
            left: checked ? "calc(100% + 2px - 22px)" : "2px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2), 0 1px 1px rgba(0,0,0,0.06)",
          }}
        />
      </div>
    </label>
  );
}
