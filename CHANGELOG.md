# BlackLetter Changelog

All notable changes to BlackLetter are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned

- Research Canvas (v4.0)
- Offline Intelligence (v5.0)

## [3.1.0] — 2026-08-07

### Added

- Packaged Electron AI support: the release build now starts the OpenRouter API proxy (`scripts/dev-server.mjs`) inside the app and routes renderer requests through it, so AI/research/chat work without the dev toolchain
- CORS + OPTIONS preflight on the API proxy for cross-origin calls from the packaged renderer

### Changed

- Version reference and CTA on the landing page now launch the app instead of a stale hosted link
- Archival workspace rename restores the working rename/commit/cancel flow
- `build.files` ships `scripts/**/*.mjs` so the packaged API server is included

### Fixed

- Prompt size guarded (document 40k, knowledge 8k, memory 4k, evidence 15 chunks, history 6×600 chars) instead of injecting unbounded source text
- Client no longer sends a dead `fileContent` field to `/api/chat` (server never read it; the document already flows inside the prompt)
- Node-thrown error codes (`UNSUPPORTED_FILE_TYPE`, `EXTRACTION_FAILED`, `NO_KEY`, etc.) are preserved end-to-end through the graph runner instead of being collapsed to generic messages
- Removed dead code: `src/lib/ai.ts` (also stopped logging 500 chars of each uploaded document), 9 unused UI components, stray corrupt root file
- Duplicate `Scale` declaration removed from the lucide shim; non-interactive timeline card no longer shows a pointer cursor

## [3.0.0] — 2026-08-04

### Added

- **Knowledge Engine**: a knowledge graph that grows as you research; documents feed it, concepts are linked, and relationships are surfaced across the whole library
- **Context search**: search across your library connects back to everything related to a finding
- **Graph search**: query the knowledge graph to pull out linked concepts, sources, and relationships
- Model categories and a refined model picker (fast / balanced / reasoning / creative / coding / research)
- New-session creation flows with workspace and folder assignment

### Changed

- Knowledge graph and context features are wired into research sessions as first-class surfaces
- Preview persistence now captures the full session state, including the graph and search context

### Fixed

- Chat persistence across reload: sessions, scroll position, and pipeline state are restored from local storage

## [2.0.0] — 2026-05-12

### Added

- **Research Workspace**: research sessions become living documents with captured sources
- Structured research reports (Docket) generated from pipeline output
- Persisted context from the first prompt through to the final report
- Preference controls (font size, spellcheck, word wrap, autosave, temperature, max tokens)
- Desktop distribution with Electron

### Changed

- Workspace layout restructured so notes, dashboards, and tools live side by side
- Report rendering moved to a dedicated markdown surface with pipeline metadata

## [1.0.0] — 2026-02-20

### Added

- **Learning Engine**: adaptive study modes with structured document output
- Core pipeline: intent detection, subject detection, evidence review, execution, and quality checking
- Report-style learning documents with key takeaways, principles, pitfalls, mnemonics, drills, and references
- Local persistence foundation via IndexedDB with localStorage fallback
- Model routing through OpenRouter with configurable temperature and limits

[Unreleased]: https://github.com/arsx-s/BlackLetter/compare/v3.0.0...HEAD
[3.0.0]: https://github.com/arsx-s/BlackLetter/releases/tag/v3.0.0
[2.0.0]: https://github.com/arsx-s/BlackLetter/releases/tag/v2.0.0
[1.0.0]: https://github.com/arsx-s/BlackLetter/releases/tag/v1.0.0