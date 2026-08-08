# BlackLetter Vercel Deployment Audit — Python Build Detection

**Date:** 7 August 2026
**Verdict:**

Vercel builds Python because the repository root contains `requirements.txt` **and** the `api/` folder contains three Python serverless files (`api/main.py`, `api/metrics.py`, `api/models.py`). Vercel treats any `*.py` inside `api/` as a Python serverless function and sees root `requirements.txt` as a Python project, so it runs `pip install -r requirements.txt` and builds a Python runtime — while this project is a plain Vite + Node + TypeScript + Node-serverless frontend.

Everything below is the audit. **No files were changed during the audit.**

## 1. Every Python file found (tracked in git)

| File | Kind |
|---|---|
| `api/main.py` | FastAPI app (the RAG API) |
| `api/metrics.py` | metrics/log endpoints |
| `api/models.py` | API models |
| `dashboard/app.py` | Streamlit observability dashboard |
| `eval/faithfulness.py` | off-line faithfulness evaluator |
| `eval/run_eval.py` | off-line eval harness |
| `generation/generator.py` | answer generation |
| `generation/prompts.py` | prompt templates |
| `ingestion/chunker.py` | document chunking |
| `ingestion/embed.py` | embeddings + Chroma store |
| `ingestion/loaders.py` | file loaders |
| `retrieval/logger.py` | run logging |
| `retrieval/retriever.py` | vector retrieval |
| `retrieval/scorer.py` | re-ranking / scoring / judging |
| `tests/test_faithfulness.py` | pytest |
| `tests/test_metrics.py` | pytest |
| `tests/test_retriever.py` | pytest |
| `tests/test_scorer.py` | pytest |

Untracked-but-local Python data (gitignored, not deployed by Vercel): `.venv/`, `chroma_db/chroma.sqlite3`, `.pytest_cache/`, `api/__pycache__/`.

## 2. Every Python dependency / config file

- `requirements.txt` (repo root) — fastapi, uvicorn, python-dotenv, langchain-core, langchain-text-splitters, langchain-chroma, langchain-openai, langchain-anthropic, pypdf, pytest, streamlit
- `pytest.ini` — pytest pythonpath config
- `dashboard/.streamlit/config.toml` — Streamlit config
- `deployment/render.yaml` — **Render** service config (`runtime: python`, `startCommand: uvicorn api.main:app`)
- `docs/architecture.md`, `docs/decisions.md`, `blog/faithfulness-design.md` — RAG-project docs
- No `pyproject.toml`, `Pipfile`, `Pipfile.lock`, `poetry.lock`, `.python-version`, `runtime.txt` exist.

## 3. Why Vercel detects Python

1. **Root `requirements.txt`** → Vercel's framework detection flags a Python project and tries `pip install -r requirements.txt` in the build.
2. **`api/*.py` files** → Vercel natively compiles every `.py` in `api/` as a Python serverless function, which also triggers the Python build/runtime and the `pip install`.
3. No `build`/`installCommand`/`framework` was pinned in `vercel.json` to override the auto-detection, so the platform falls back to what the repo "looks like".

The current `vercel.json` contains **no Python runtime config** (only `functions.api/chat.ts` maxDuration/memory) — the Python settings to remove are the files listed in items 1–2, not a `vercel.json` runtime entry.

## 4. Are these files used by BlackLetter?

**No.** The BlackLetter app is 100% TypeScript/React/Vite (Node serverless `api/chat.ts` → OpenRouter). Evidence:

- `package.json` dev/build scripts reference only Node (`vite`, `tsc`, `scripts/dev-server.mjs`, `electron`). No Python invocation.
- The live AI path is `src/providers/` → `provider.ts` → `streamOpenRouter` → `api/chat.ts`. Zero `.py` imports reachable from `src/`.
- All "retrieval / evaluation / scoring / generation" logic that BlackLetter actually uses is native TypeScript (`src/pipeline/`, `src/langgraph/nodes/`, `src/providers/`). The Python suite is a **parallel** implementation that nothing references.
- GitHub Actions CI (`main.yml/main`) runs Node only — no `pytest` step.
- `python -m pytest` was run only by prior QA passes on the old README instructions (now dead).

## 5. Do they belong to the accidental project?

Yes. The merged-in code is a separate "BlackLetter RAG service" (FastAPI + LangChain + Chroma + Streamlit) whose own README even states: *"`api/` also holds `chat.ts`, the frontend's Vercel model relay. It is unrelated to the React app."* The RAG service has its own Render deployment config (`deployment/render.yaml`), its own docs (`docs/architecture.md`, `docs/decisions.md`, `blog/faithfulness-design.md`), its own eval/tests, and its own dependency file. It is a second project vendored into this repo.

## 6. Files that can safely be removed

| Path | Reason |
|---|---|
| `requirements.txt` | Python marker at repo root — this is what breaks the build |
| `pytest.ini` | Python marker |
| `api/main.py`, `api/metrics.py`, `api/models.py` | Python serverless functions in `api/` |
| `dashboard/` (`app.py`, `.streamlit/config.toml`) | Streamlit, unused |
| `deployment/` (`render.yaml`) | Render python service config, unused by Vercel |
| `eval/` (3 py + eval_set.json) | off-line eval harness |
| `generation/`, `ingestion/`, `retrieval/` (9 py) | RAG pipeline, duplicated in TS |
| `tests/` (4 py) | Python test suite |
| `blog/faithfulness-design.md` | RAG design doc |
| `docs/architecture.md`, `docs/decisions.md` | RAG docs (product docs are separate) |
| `assets/architecture.svg`, `assets/demo.gif` | referenced only by RAG docs/README |
| (untracked, dir delete on disk) `.venv/ chroma_db/ .pytest_cache/ api/__pycache__` | local Python artifacts, gitignored |

## 7. Files that must remain

- `src/` (React/TS app), `electron/`, `public/`, `index.html`
- `scripts/dev-server.mjs` + `generate-icon.cjs` (Node dev/electron tooling)
- `api/chat.ts` (**the only file that should remain in `api/`**)
- `vercel.json` (unchanged — pins the Node serverless function)
- Node config: `package.json`, `package-lock.json`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`, postcss/tailwind/eslint/prettier configs
- `docs/product-architecture.md`, `docs/Design-System.md`, `docs/Roadmap.md` (frontend product docs)
- `.github/`, `CHANGELOG.md`, `CONRITING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `LICENSE`, `QA-AUDIT*.md`, `AUTH-AUDIT.md`, `USER-ACCEPTANCE-REPORT.md`

## Expected effect of cleanup

- `git ls-files '*.py'` → 0 results
- `npm install` unaffected; `npm run build` still produces `dist/`
- Vercel auto-detection: no Python signals remain → Node/Vite build only
- `vercel.json` unchanged (`api/chat.ts` stays as the sole serverless function)

---

Cleanup starts now per the task instructions.