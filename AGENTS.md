# AGENTS.md — BlackLetter OS

## Project

Electron + Vite + React 19 desktop/OS-style application (`src/langgraph`,
  `src/providers`, `src/stores`, `src/components`, `src/knowledge`). Git repository.
  TypeScript strict. Tailwind CSS 3.

## Commands (Windows)

PowerShell blocks `.ps1` shims — always use the `.cmd` binaries or `cmd /c`.

- Dev (Vite :5173 + API relay :3000): `npm.cmd run dev`
- Build: `npm.cmd run build`
- Test: `npm.cmd run test` · Coverage: `npm.cmd run test:coverage`
- Lint: `npm.cmd run lint`
- shadcn component: `npx.cmd shadcn@latest add <name>`

## Design system — source of truth

Tokens live in **`src/styles.css`** (`:root` CSS variables, space-separated RGB)
and **`tailwind.config.js`**. Use them; never introduce raw hex or arbitrary px.

- **Color roles:** `--background` `--sidebar` `--surface` `--surface-elevated`
  `--text-primary/secondary/muted` `--accent` (rust `114 56 61`) `--accent-hover`
  `--accent-soft` `--border`. Tailwind: `bg-background`, `text-bone`,
  `border-border`, `bg-accent`, `text-muted`, etc.
- **Type:** `font-display` (Georgia serif), `font-sans` (Inter), `font-mono`
  (JetBrains Mono); custom `"Horizon"` face in `styles.css`.
- **Semantic type classes:** `.text-hero .text-display .text-h1…h6 .text-body
  .text-body-sm .text-caption .text-micro .text-label`.
- **Surfaces:** `.surface-default .surface-elevated .surface-glass
  .surface-glass-strong`. **Interaction:** `.interactive-surface .focus-ring`.
- **Spacing/radius/shadow/motion** scales are extended in `tailwind.config.js`
  (`4.5/18/22/30/…`, `rounded-xs…lg`, `shadow-premium*`, keyframes
  `fade-in* / scale-in / slide-* / float`).

## Component conventions

- Class helper: `cn()` from `@/lib/utils` (`@/*` → `./src/*`, aliased in both
  `tsconfig.json` and `vite.config.ts`).
- Primitives: Radix (`@radix-ui/*`), `class-variance-authority`, `cmdk`
  (command palette), `sonner` (toasts) are installed. Icons: `lucide-react`.
  Motion: `framer-motion` (v12). Complex timelines: `gsap`.
- shadcn is configured (`components.json`, new-york style, css `src/styles.css`).
  When generating components, review the output and map its classes onto the
  existing tokens/utilities above rather than importing a foreign theme.
- Avoid duplicating components; extend the existing set and keep variants small.

## UI workflow

Follow the global skills: `premium-web-design` → `design-system` →
`motion-design` → `visual-qa` → `accessibility-audit`. Before declaring UI
"done", render it in the built-in browser at **1440 / 834 / 390** px, read the
console and network, and run Lighthouse. Never claim a visual check that did
not happen.

## Security

- `OPENROUTER_API_KEY` is held by the server-side relays `api/chat.ts` and
  `scripts/dev-server.mjs`. Hosted use requires `BLACKLETTER_RELAY_TOKEN`; the
  local relay binds to loopback by default. Never print, log, or commit secrets;
  do not widen exposure. Only `.env.example` is committed.
