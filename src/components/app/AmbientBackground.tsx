/**
 * AmbientBackground — the depth layer behind the workspace shell.
 *
 * A restrained composition built only from the project's existing tokens:
 * two soft accent/muted glows that give the flat `--background` some
 * atmospheric falloff, a hairline grid that fades out toward the top, and a
 * very low-opacity grain so large empty panels read as paper rather than as
 * dead space.
 *
 * Everything is static — no animation, no pointer tracking — so it costs
 * nothing per frame and needs no reduced-motion branch.
 */

const GRAIN =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="140" height="140" filter="url(#n)" opacity="0.5"/></svg>',
  );

export function AmbientBackground({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div
        className="absolute -left-40 -top-48 h-[34rem] w-[34rem] rounded-full blur-3xl"
        style={{
          opacity: 0.1,
          background: "radial-gradient(circle, rgb(var(--accent)) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute -bottom-56 -right-40 h-[38rem] w-[38rem] rounded-full blur-3xl"
        style={{
          opacity: 0.07,
          background: "radial-gradient(circle, rgb(var(--text-primary)) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          opacity: 0.05,
          backgroundImage:
            "linear-gradient(rgb(var(--text-primary)) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--text-primary)) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse 90% 60% at 50% 0%, black 0%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 60% at 50% 0%, black 0%, transparent 78%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{ opacity: 0.03, backgroundImage: `url("${GRAIN}")`, backgroundSize: "140px 140px" }}
      />
    </div>
  );
}
