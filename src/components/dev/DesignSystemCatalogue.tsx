import { useMemo, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import {
  DUR,
  EASE_CINEMATIC,
  EASE_IN_OUT,
  EASE_OUT,
  SPRING_SOFT,
  SPRING_SNAPPY,
  fadeDown,
  fadeUp,
  scaleIn,
  staggerParent,
} from "../../lib/motion";

/**
 * DesignSystemCatalogue — a live render of every token and primitive in
 * `src/styles.css`. Reachable at `#design-system`.
 *
 * This exists as a visual-regression target: it reads the same CSS variables the
 * product does, so a token change shows up here before it shows up in a screenshot
 * diff. It renders nothing but existing utilities — no new colours, spacings or
 * radii are introduced here.
 */

const COLOR_ROLES: Array<{ token: string; role: string }> = [
  { token: "--background", role: "Page canvas" },
  { token: "--sidebar", role: "Chrome, rails, docks" },
  { token: "--surface", role: "Panels, cards" },
  { token: "--surface-elevated", role: "Raised panels" },
  { token: "--text-primary", role: "Primary text — bone" },
  { token: "--text-secondary", role: "Secondary text — paper" },
  { token: "--text-muted", role: "Captions, muted labels" },
  { token: "--accent", role: "Accent — rust" },
  { token: "--accent-hover", role: "Accent — hover / press" },
  { token: "--accent-soft", role: "Accent — soft tint" },
  { token: "--border", role: "Hairlines, dividers" },
  { token: "--shadow-color", role: "Elevation shadow ink" },
];

const TYPE_SCALE: Array<{ cls: string; sample: string }> = [
  { cls: "text-hero", sample: "Research" },
  { cls: "text-display", sample: "Build knowledge" },
  { cls: "text-h1", sample: "Heading one" },
  { cls: "text-h2", sample: "Heading two" },
  { cls: "text-h3", sample: "Heading three" },
  { cls: "text-h4", sample: "Heading four" },
  { cls: "text-h5", sample: "Heading five" },
  { cls: "text-h6", sample: "Heading six" },
  { cls: "text-body", sample: "Body — the default reading size for any prose surface." },
  { cls: "text-body-sm", sample: "Body small — dense panels and sidebars." },
  { cls: "text-caption", sample: "Caption — supporting detail under a value." },
  { cls: "text-label", sample: "Label — form and control labels" },
  { cls: "text-micro", sample: "Section marker" },
];

const SURFACES: Array<{ cls: string; note: string }> = [
  { cls: "surface-default", note: "Flat panel on the page canvas" },
  { cls: "surface-elevated", note: "Raised — adds the premium shadow" },
  { cls: "surface-glass", note: "Translucent, 20px blur" },
  { cls: "surface-glass-strong", note: "Translucent, 40px blur" },
];

const RADII = ["rounded-2xs", "rounded-xs", "rounded-sm", "rounded", "rounded-md", "rounded-lg"];
const SHADOWS = ["shadow-button", "shadow-glow-sm", "shadow-glow", "shadow-premium", "shadow-premium-lg", "shadow-dock"];
const SPACING: Array<{ key: string; value: string }> = [
  { key: "4.5", value: "1.125rem" },
  { key: "18", value: "4.5rem" },
  { key: "22", value: "5.5rem" },
  { key: "30", value: "7.5rem" },
  { key: "34", value: "8.5rem" },
  { key: "88", value: "22rem" },
  { key: "100", value: "25rem" },
  { key: "120", value: "30rem" },
];
const ANIMATIONS = [
  "animate-fade-in",
  "animate-fade-in-up",
  "animate-fade-in-down",
  "animate-fade-in-left",
  "animate-fade-in-right",
  "animate-scale-in",
  "animate-spin-slow",
  "animate-pulse-soft",
  "animate-float",
];

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border pt-10 first:border-t-0 first:pt-0">
      <h2 className="text-h4">{title}</h2>
      <p className="text-body-sm mt-2 max-w-2xl text-muted">{description}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function DesignSystemCatalogue() {
  const reduced = useReducedMotion();
  const [replay, setReplay] = useState(0);
  const [replayKey, setReplayKey] = useState(0);

  const roles = useMemo(() => COLOR_ROLES, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="page-container flex flex-wrap items-center gap-4 py-4">
          <div className="min-w-0">
            <p className="text-micro">BlackLetter OS</p>
            <h1 className="text-h5">Design System</h1>
          </div>
          <p className="text-caption hidden max-w-sm md:block">
            Every token and primitive in <code className="font-mono text-2xs">src/styles.css</code> rendered live.
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setReplayKey((k) => k + 1)}
              title="Replay the entrance animation"
            >
              Replay motion
            </Button>
            <Button variant="outline" size="sm" onClick={() => { window.location.hash = ""; }}>
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to app
            </Button>
          </div>
        </div>
      </header>

      <motion.div
        key={replayKey}
        initial={reduced ? false : "hidden"}
        animate="show"
        variants={staggerParent(0.05)}
        className="page-container space-y-10 py-10"
      >
        <motion.div variants={fadeUp}>
          <Section
            id="color"
            title="Colour roles"
            description="Roles, not colours. Components reference the role so a theme change repaints everything at once."
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {roles.map((role) => (
                <div key={role.token} className="surface-default overflow-hidden rounded-md">
                  <div
                    className="h-16 w-full border-b border-border"
                    style={{ backgroundColor: `rgb(var(${role.token}))` }}
                  />
                  <div className="p-3">
                    <p className="font-mono text-2xs text-bone">{role.token}</p>
                    <p className="text-caption mt-1 leading-snug">{role.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </motion.div>

        <motion.div variants={fadeUp}>
          <Section
            id="type"
            title="Type scale"
            description="Semantic classes rather than raw sizes. Georgia for display, Inter for reading, JetBrains Mono for data."
          >
            <div className="space-y-5">
              {TYPE_SCALE.map((row) => (
                <div key={row.cls} className="border-b border-border/60 pb-4 last:border-b-0 last:pb-0">
                  <p className="font-mono text-2xs text-muted">.{row.cls}</p>
                  <p className={cn(row.cls, "mt-1 truncate")}>{row.sample}</p>
                </div>
              ))}
            </div>
          </Section>
        </motion.div>

        <motion.div variants={fadeUp}>
          <Section
            id="surfaces"
            title="Surfaces"
            description="Four depths. Glass is used only over content that should stay legible through the blur."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {SURFACES.map((surface) => (
                <div
                  key={surface.cls}
                  className="relative overflow-hidden rounded-lg border border-border"
                  style={{
                    backgroundImage:
                      "linear-gradient(rgb(var(--text-primary) / 0.06) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--text-primary) / 0.06) 1px, transparent 1px)",
                    backgroundSize: "16px 16px",
                  }}
                >
                  <div className={cn(surface.cls, "m-4 rounded-md p-5")}>
                    <p className="font-mono text-2xs text-bone">.{surface.cls}</p>
                    <p className="text-caption mt-1">{surface.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </motion.div>

        <motion.div variants={fadeUp}>
          <Section
            id="controls"
            title="Buttons & interaction"
            description="Five variants, four sizes. Every control carries the shared focus ring and a 0.97 press scale."
          >
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                {(["primary", "secondary", "ghost", "outline", "danger"] as const).map((variant) => (
                  <Button key={variant} variant={variant}>
                    {variant}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                {(["sm", "md", "lg"] as const).map((size) => (
                  <Button key={size} size={size}>
                    size {size}
                  </Button>
                ))}
                <Button size="icon" aria-label="Icon button">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button disabled>disabled</Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <button className="interactive-surface focus-ring surface-default rounded-md p-4 text-left">
                  <p className="text-label">.interactive-surface</p>
                  <p className="text-caption mt-1">Hover tint, press scale</p>
                </button>
                <button className="card-hover focus-ring surface-elevated rounded-md p-4 text-left">
                  <p className="text-label">.card-hover</p>
                  <p className="text-caption mt-1">Lifts 2px, deepens shadow</p>
                </button>
                <button className="focus-ring surface-default rounded-md p-4 text-left">
                  <p className="text-label">.focus-ring</p>
                  <p className="text-caption mt-1">Tab to see the ring</p>
                </button>
              </div>
            </div>
          </Section>
        </motion.div>

        <motion.div variants={fadeUp}>
          <Section
            id="shape"
            title="Radius, elevation & spacing"
            description="Radius and shadow scales are deliberately short — six radii, six elevations, no one-off values."
          >
            <div className="grid gap-8 lg:grid-cols-3">
              <div>
                <p className="text-micro">Radius</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {RADII.map((radius) => (
                    <div key={radius} className="text-center">
                      <div className={cn("h-14 w-14 border border-border bg-surface", radius)} />
                      <p className="font-mono text-2xs mt-2 text-muted">{radius.replace("rounded-", "")}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-micro">Elevation</p>
                <div className="mt-3 space-y-3">
                  {SHADOWS.map((shadow) => (
                    <div key={shadow} className={cn("surface-elevated rounded-sm px-3 py-2", shadow)}>
                      <p className="font-mono text-2xs text-muted">{shadow}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-micro">Spacing</p>
                <div className="mt-3 space-y-2">
                  {SPACING.map((space) => (
                    <div key={space.key} className="flex items-center gap-3">
                      <span className="font-mono text-2xs w-8 shrink-0 text-muted">{space.key}</span>
                      <span className="h-2 rounded-2xs bg-accent/70" style={{ width: space.value }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Section>
        </motion.div>

        <motion.div variants={fadeUp}>
          <Section
            id="motion"
            title="Motion"
            description="One shared vocabulary in src/lib/motion.ts. Transform and opacity only, and every consumer gates on prefers-reduced-motion."
          >
            <div className="grid gap-8 lg:grid-cols-2">
              <div>
                <p className="text-micro">Durations (seconds)</p>
                <div className="mt-3 space-y-2">
                  {Object.entries(DUR).map(([name, value]) => (
                    <div key={name} className="flex items-center gap-3">
                      <span className="font-mono text-2xs w-20 shrink-0 text-muted">{name}</span>
                      <span className="h-2 rounded-2xs bg-bone/40" style={{ width: `${value * 160}px` }} />
                      <span className="font-mono text-2xs text-muted">{value}s</span>
                    </div>
                  ))}
                </div>
                <p className="text-micro mt-6">Easing curves</p>
                <div className="mt-3 space-y-1">
                  {[
                    { name: "EASE_OUT", value: EASE_OUT },
                    { name: "EASE_IN_OUT", value: EASE_IN_OUT },
                    { name: "EASE_CINEMATIC", value: EASE_CINEMATIC },
                  ].map((ease) => (
                    <p key={ease.name} className="font-mono text-2xs text-muted">
                      {ease.name} · cubic-bezier({ease.value.join(", ")})
                    </p>
                  ))}
                </div>
                <p className="text-micro mt-6">Springs</p>
                <div className="mt-3 space-y-1">
                  <p className="font-mono text-2xs text-muted">
                    SPRING_SOFT · stiffness {String(SPRING_SOFT.stiffness)} · damping {String(SPRING_SOFT.damping)}
                  </p>
                  <p className="font-mono text-2xs text-muted">
                    SPRING_SNAPPY · stiffness {String(SPRING_SNAPPY.stiffness)} · damping {String(SPRING_SNAPPY.damping)}
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-3">
                  <p className="text-micro">Named animations</p>
                  <Button variant="ghost" size="sm" onClick={() => setReplay((r) => r + 1)}>
                    Replay
                  </Button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {ANIMATIONS.map((animation) => (
                    <div key={animation} className="surface-default rounded-sm p-3 text-center">
                      <div key={`${animation}-${replay}`} className={cn("mx-auto h-6 w-6 rounded-xs bg-accent/70", animation)} />
                      <p className="font-mono text-2xs mt-2 break-all text-muted">{animation}</p>
                    </div>
                  ))}
                </div>

                <p className="text-micro mt-6">Variants</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {[
                    { name: "fadeUp", variants: fadeUp },
                    { name: "fadeDown", variants: fadeDown },
                    { name: "scaleIn", variants: scaleIn },
                  ].map((variant) => (
                    <motion.div
                      key={`${variant.name}-${replay}`}
                      initial={reduced ? false : "hidden"}
                      animate="show"
                      variants={variant.variants}
                      className="surface-default rounded-sm px-3 py-2"
                    >
                      <p className="font-mono text-2xs text-muted">{variant.name}</p>
                    </motion.div>
                  ))}
                </div>
                <p className="text-caption mt-4">
                  {reduced
                    ? "prefers-reduced-motion is ON — entrances render their final state immediately."
                    : "prefers-reduced-motion is off — entrances animate."}
                </p>
              </div>
            </div>
          </Section>
        </motion.div>
      </motion.div>
    </div>
  );
}
