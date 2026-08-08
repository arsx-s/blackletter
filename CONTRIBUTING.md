# Contributing to BlackLetter

Thanks for your interest in contributing to BlackLetter — the AI Research Operating System.

This project is about thoughtful, durable research tooling. Contributions that improve the product experience, the design system, or the intelligence behind it are always welcome. Before you start, please read the design language in `docs/Design-System.md` — the tone, naming, and motion rules apply to everything we ship.

## Ways to contribute

- **Report issues** — bugs, regressions, and unclear behavior are always useful. Use the issue templates so every report includes what is needed to reproduce it.
- **Improve documentation** — product copy, guides, and comments that earn their place.
- **Submit code** — through a pull request following the workflow below.
- **Give feedback** — product feedback goes to feedback@blackletter.dev.

## Reporting a bug

Use the bug report template. A good report includes:

- the behavior that broke and what was expected instead
- the steps to reproduce it, ideally the smallest set of steps
- the environment (browser/device, and whether the issue appears on web or desktop)
- a screenshot or minimal reproduction when the bug is visual

## Development workflow

For a local development environment:

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the development environment with `npm run dev`. This runs the frontend and the local relay together.

3. Write or adjust code with the design system in mind. Keep the change small, focused, and descriptive.

4. Run the test suite to confirm nothing regresses:

   ```bash
   npm test
   ```

5. Type-check and build the production bundle:

   ```bash
   npm run build
   ```

6. Run the linter:

   ```bash
   npm run lint
   ```

### Environment variable

The app requires an `OPENROUTER_API_KEY` to load the model. Set it in your local shell before starting the development environment. Everything else works without a key; only model-backed features depend on it.

### Style and conventions

- Follow the existing repository structure: components, stores, providers, and the pipeline live in their folders under `src/`.
- Keep TypeScript strict and add types at boundaries.
- Follow the design system in `docs/Design-System.md` — tone, spacing, and transitions.
- Do not reformat code that is unrelated to your change.

## Pull requests

- One PR per change; keep the diff small and reviewable.
- Use the pull request template — summary, what changed, and how it was tested.
- Update `CHANGELOG.md` under Unreleased when you add, change, or fix user-facing behavior.

## Commit messages

Write commit messages that explain the "why" along with the change. Prefer imperative, concise subjects (for example, "Fix session persistence on reload").

## Code ownership

Final approval of code and releases rests with the maintainer (Ali Arsalan Aryan). Long-running experiments belong on a branch; stable behavior belongs on `main`.