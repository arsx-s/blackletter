interface LogoProps {
  size?: number;
  variant?: "default" | "white";
  className?: string;
  onClick?: () => void;
}

export function Logo({ size = 32, variant = "default", className, onClick }: LogoProps) {
  return (
    <img
      src={variant === "white" ? "/icon-BL-white.svg" : "/icon-BL.svg"}
      alt="BlackLetter"
      className={className}
      style={{ width: size, height: size, display: "block" }}
      onClick={onClick}
      draggable={false}
    />
  );
}
