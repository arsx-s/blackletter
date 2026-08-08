# BlackLetter

BlackLetter is a research workspace that brings AI-assisted research, document analysis, learning tools, visual exploration, and persistent research sessions together in one interface.

## Overview

BlackLetter is built around the idea that research should accumulate. A session starts with a question and becomes a structured report: sections, entities, timeline events, follow-up questions, and an intelligence summary with grounding and confidence signals. Sessions, documents, and notes live in workspaces and folders, are saved locally, and are always available to reopen.

Documents uploaded to a session are analyzed as part of the research, and every run feeds a knowledge graph that grows with your library. A research canvas lets you arrange reports, notes, and artifacts spatially, and a split view supports working on two sessions side by side.

## Features

- AI-assisted research sessions with structured, streamed reports
- Document analysis for `.txt`, `.md`, `.pdf`, and `.docx` files
- Persistent sessions, chat history, tabs, workspaces, and folders
- Knowledge graph that grows from research and documents
- Research canvas for arranging research material visually
- Split view for side-by-side sessions
- Notebook, document library, and full-text search (Ctrl+K)
- Model selection across multiple OpenRouter models
- Two interface modes: Intelligence and Developer
- Local-first storage — all state persists on your device
- Desktop app via Electron, web app deployed on Vercel

## Interface modes

### Intelligence Mode

Research, learning, document analysis, and general knowledge workflows. This is the default, product-focused surface.

### Developer Mode

Technical research, debugging, and code analysis workflows, with access to pipeline diagnostics and run telemetry.

## Models

BlackLetter uses OpenRouter as its model gateway, which lets the application work with a wide range of available models. Requests go through a small server-side relay (`api/chat.ts`); the API key is read only on the server and is never committed or sent from the browser.

## Built With

- React, TypeScript, Vite
- Electron (desktop)
- Node.js (local API relay)
- OpenRouter (model gateway)
- Vercel (deployment)

## Architecture

The app is a single-page application built around five integrated engines: the learning engine, the research workspace, the knowledge and intelligence engine, the research canvas, and offline intelligence. The UI reads and writes a single workspace store, persisted locally. Research requests flow through a pipeline (intent, subject, document context, prompt, generation, quality check, formatting) and stream responses back into the session. The browser never talks to a model provider directly — all AI traffic passes through the server-side relay.

## Getting started

Requirements: Node 20+ and an OpenRouter API key.

```bash
git clone https://github.com/arsx-s/blackletter.git
cd blackletter
npm install
```

Set the API key in your local shell only — it must never be committed:

```powershell
$env:OPENROUTER_API_KEY="your_key_here"
```

```bash
export OPENROUTER_API_KEY="your_key_here"
```

Then start the development environment:

```bash
npm run dev
```

This runs the Vite dev server on port 5173 and the local API relay on port 3000, with `/api` proxied between them.

## Build and test

```bash
npm run build     # type-check and build the production bundle
npm test          # run the test suite (vitest)
npm run lint      # run the linter (eslint)
```

## Deployment

BlackLetter is deployed on Vercel.

Production: https://blackletter-rfg8o82fv-atlas-labsx.vercel.app/

## Status

BlackLetter is an active personal software project, available as a deployed web application and as a Windows desktop build.

## Author

Ali Arsalan Aryan — https://github.com/arsx-s

## License

BlackLetter is released under the MIT License.
