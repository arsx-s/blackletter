---
name: BlackLetter Design System
description: Project-specific design system for BlackLetter OS — the concrete tokens, semantic classes, fonts, and component conventions to use when building or restyling UI in this repository. Use together with the global premium-web-design and design-system skills.
---

# BlackLetter Design System (project)

This repository already has a mature token system. **Extend it — do not replace
it.** Pair this skill with `premium-web-design` (art direction) and
`design-system` (architecture); this file defines what already exists here.

## Token sources

- `src/styles.css` → `:root` CSS variables (RGB triplets, used as
  `rgb(var(--x) / <alpha-value>)`).
- `tailwind.config.js` → maps those variables into Tailwind color/type/spacing/
  radius/shadow/animation scales.

Never hardcode hex or arbitrary pixel values in components.

## Colour roles

| Role | Variable | Tailwind |
| ---- | -------- | -------- |
| Page background | `--background: 239 233 225` | `bg-background` |
| Rail / sidebar | `--sidebar: 217 217 217` | `bg-sidebar` / `bg-graphite` |
| Surface | `--surface` | `bg-surface` / `bg-carbon` |
| Elevated surface | `--surface-elevated` | `bg-surface-elevated` |
| Primary text | `--text-primary: 50 45 41` | `text-bone` |
| Secondary text | `--text-secondary` | `text-paper` |
| Muted text | `--text-muted` | `text-muted` |
| Accent (rust) | `--accent: 114 56 61` | `bg-accent` / `text-accent` |
| Accent hover | `--accent-hover: 90 44 48` | `bg-accent-hover` |
| Soft accent | `--accent-soft` | `bg-accent-soft` |
| Border | `--border: 172 156 141` | `border-border` |

The palette is a warm "paper + ink + rust" system. Keep it monochromatic and
restrained; the rust accent is the single colour that carries emphasis.

## Typography

- `font-display` = Georgia/Times (serif) — headings and editorial voice.
- `font-sans` = Inter — UI and body.
- `font-mono` = JetBrains Mono — code, micro-labels.
- Custom face `"Horizon"` (see `@font-face` in `styles.css`) for display moments.
- Use the semantic classes rather than rebuilding them:
  `.text-hero`, `.text-display`, `.text-h1`…`.text-h6`, `.text-body`,
  `.text-body-sm`, `.text-caption`, `.text-micro`, `.text-label`.
- Runtime font scaling is driven by `data-fontsize` on the root
  (`--bl-font`, `--bl-lh`); respect `.bl-prose` / `.bl-code` for user-scaled text.

## Surfaces & interaction

- `.surface-default`, `.surface-elevated`, `.surface-glass`,
  `.surface-glass-strong` — use these instead of ad-hoc border+blur combos.
- `.interactive-surface` for hover/active feedback; `.focus-ring` for focus.
- Motion: reuse the keyframes/utilities in `tailwind.config.js`
  (`fade-in*`, `scale-in`, `slide-*`, `float`, `spin-slow`, `pulse-soft`).
  `prefers-reduced-motion` is already globally disabled in `styles.css`.

## Components

- Use `cn()` from `@/lib/utils`.
- `@radix-ui/*`, `class-variance-authority`, `cmdk`, `sonner`, `lucide-react`,
  `framer-motion`, and `gsap` are available.
- When adding a shadcn component, generate it, then restyle to these tokens
  (the generated component must use `--background/--foreground`-style classes
  only if you first map them; prefer the project's `bg-background`, `text-bone`,
  `border-border`).

## Rules

1. One accent colour; neutrals do the work.
2. One `h1` per view; establish hierarchy with size + weight + colour.
3. Space using the Tailwind scale (no magic numbers).
4. Every interactive element gets hover, focus-visible, active, and disabled.
5. Verify in a real browser at 1440 / 834 / 390 before declaring done.
