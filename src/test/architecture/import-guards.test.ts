import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Architecture guards.
 *
 * These are not unit tests of behaviour — they defend structural invariants
 * that previously drifted:
 *
 *   1. One live pipeline. `src/pipeline/pipeline.ts` contains a second,
 *      unreferenced `runPipeline`. It must stay unreferenced, or it becomes a
 *      second live execution path that nobody maintains.
 *   2. One model default. The literal default model used to be repeated in the
 *      client catalogue and in both relays.
 *   3. Credentials stay server-side. Only the relays may reach the provider
 *      host, and no relay may answer with a wildcard CORS header.
 *
 * Reading the source tree from a test is deliberate: an import-graph rule can
 * only be enforced by looking at the import graph.
 */

/**
 * Resolve the repository root by walking up from the working directory until a
 * `package.json` is found. `import.meta.url` is not usable here because the jsdom
 * test environment rewrites it to a non-file URL.
 */
function findRepoRoot(start: string): string {
  let dir = path.resolve(start);
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not locate the repository root from ${start}`);
}

const ROOT = findRepoRoot(process.cwd());
const SOURCE_ROOTS = ["src", "api", "scripts"];
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "release",
  "coverage",
  ".git",
  ".playwright-mcp",
  ".opencode",
]);
const EXTENSIONS = [".ts", ".tsx", ".mjs", ".js", ".cjs", ".mts"];

interface SourceFile {
  /** Repo-relative, forward slashes. */
  path: string;
  contents: string;
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (EXTENSIONS.some((ext) => entry.name.endsWith(ext))) out.push(full);
  }
  return out;
}

function readSources(): SourceFile[] {
  const files: SourceFile[] = [];
  for (const root of SOURCE_ROOTS) {
    const absolute = path.join(ROOT, root);
    if (!fs.existsSync(absolute)) continue;
    for (const file of walk(absolute)) {
      files.push({
        path: path.relative(ROOT, file).split(path.sep).join("/"),
        contents: fs.readFileSync(file, "utf-8"),
      });
    }
  }
  return files;
}

const SOURCES = readSources();
const isTestFile = (file: SourceFile) => file.path.startsWith("src/test/");

describe("architecture: one live pipeline", () => {
  it("finds the source tree", () => {
    expect(SOURCES.length).toBeGreaterThan(50);
  });

  it("keeps the duplicate pipeline orphaned", () => {
    const duplicating = SOURCES.filter((file) => file.path === "src/pipeline/pipeline.ts");
    expect(duplicating, "pipeline.ts should still exist — it must not be silently deleted").toHaveLength(1);

    const references = SOURCES.filter(
      (file) =>
        file.path !== "src/pipeline/pipeline.ts" &&
        /(?:from|import)\s*\(?\s*["'][^"']*pipeline\/pipeline["']/.test(file.contents),
    );
    expect(
      references.map((f) => f.path),
      "src/pipeline/pipeline.ts is a duplicate of the live graph and must not be imported",
    ).toEqual([]);
  });

  it("has exactly one live runPipeline definition reachable from the UI", () => {
    const declarers = SOURCES.filter((file) =>
      /export\s+async\s+function\s+runPipeline\s*\(/.test(file.contents),
    ).map((file) => file.path);

    expect(declarers.sort()).toEqual(["src/langgraph/index.ts", "src/pipeline/pipeline.ts"]);
    // Of those two, only the langgraph one is re-exported by the public barrel.
    const barrel = SOURCES.find((file) => file.path === "src/pipeline/index.ts");
    expect(barrel).toBeDefined();
    expect(barrel?.contents).toMatch(/export\s*\{\s*runPipeline[^}]*\}\s*from\s*["']\.\.\/langgraph["']/);
  });

  it("routes every UI call of runPipeline through the pipeline barrel", () => {
    const callers = SOURCES.filter(
      (file) =>
        !isTestFile(file) &&
        file.path !== "src/pipeline/pipeline.ts" &&
        file.path !== "src/langgraph/index.ts" &&
        /runPipeline\s*\(/.test(file.contents),
    );
    for (const caller of callers) {
      expect(
        /from\s+["'][^"']*\/pipeline["']/.test(caller.contents) ||
          /from\s+["']\.\.?\/[^"']*pipeline["']/.test(caller.contents),
        `${caller.path} should import runPipeline from the pipeline barrel, not from elsewhere`,
      ).toBe(true);
    }
  });
});

describe("architecture: one model default", () => {
  it("declares the default model in exactly one place", () => {
    const holders = SOURCES.filter(
      (file) => !isTestFile(file) && file.contents.includes("openai/gpt-4o-mini"),
    ).map((file) => file.path);

    expect(holders).toEqual(["src/config/model-defaults.mjs"]);
  });

  it("has the client catalogue consume that constant", () => {
    const models = SOURCES.find((file) => file.path === "src/config/models.ts");
    expect(models?.contents).toMatch(/from\s+["']\.\/model-defaults\.mjs["']/);
  });

  it("has both relays consume that constant", () => {
    const guard = SOURCES.find((file) => file.path === "src/server/relay-guard.mjs");
    expect(guard?.contents).toMatch(/from\s+["']\.\.\/config\/model-defaults\.mjs["']/);
  });

  it("no relay hard-codes a provider URL default", () => {
    for (const file of SOURCES.filter((f) => f.path === "api/chat.ts" || f.path === "scripts/dev-server.mjs")) {
      // Any model id literal in a relay means the policy has drifted.
      expect(file.contents).not.toMatch(/["'](?:openai|anthropic|google|deepseek)\/[a-z0-9.-]+["']/);
    }
  });
});

describe("architecture: one document parser", () => {
  it("defines the DEFLATE inflater exactly once", () => {
    const definers = SOURCES.filter((file) =>
      /function\s+inflateRaw\s*\(/.test(file.contents),
    ).map((file) => file.path);
    expect(definers).toEqual(["src/lib/extraction/inflate.ts"]);
  });

  it("defines the ZIP reader exactly once", () => {
    const definers = SOURCES.filter((file) =>
      /function\s+readZipEntries\s*\(/.test(file.contents),
    ).map((file) => file.path);
    expect(definers).toEqual(["src/lib/extraction/zip.ts"]);
  });

  it("keeps every PDF byte-parser inside the extraction module", () => {
    const definers = SOURCES.filter(
      (file) => !isTestFile(file) && /function\s+extractPDF\s*\(/.test(file.contents),
    ).map((file) => file.path);
    expect(
      definers,
      "the heuristic /Text(...) extractor must not come back in any form",
    ).toEqual([]);
  });

  it("does not revive the heuristic PDF text regex", () => {
    const offenders = SOURCES.filter(
      (file) => !isTestFile(file) && /\/Text\\\(/.test(file.contents),
    ).map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it("extracts text through a single entry point", () => {
    const definers = SOURCES.filter((file) =>
      /function\s+extractTextFromFile\s*\(/.test(file.contents),
    ).map((file) => file.path);
    expect(definers).toEqual(["src/pipeline/documentEngine.ts"]);

    const docxReaders = SOURCES.filter(
      (file) => !isTestFile(file) && /word\/document\.xml/.test(file.contents),
    ).map((file) => file.path);
    expect(docxReaders).toEqual(["src/lib/extraction/docx.ts"]);
  });

  it("never discards the reason a document failed to parse", () => {
    const offenders = SOURCES.filter(
      (file) => !isTestFile(file) && /Could not extract text from/.test(file.contents),
    ).map((file) => file.path);
    expect(
      offenders,
      "extraction failures must surface their real code and message, not a generic sentence",
    ).toEqual([]);
  });
});

describe("architecture: credentials stay server-side", () => {
  it("only allows the relays to reach the provider host", () => {
    const offenders = SOURCES.filter(
      (file) =>
        !isTestFile(file) &&
        file.path !== "api/chat.ts" &&
        file.path !== "scripts/dev-server.mjs" &&
        /openrouter\.ai\/api/.test(file.contents),
    ).map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it("never answers with a wildcard CORS origin", () => {
    const offenders = SOURCES.filter((file) =>
      /Access-Control-Allow-Origin["']\s*,\s*["']\*["']/.test(file.contents),
    ).map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it("keeps the provider credential out of the browser bundle sources", () => {
    // Only the two relays may *read* the credential. Mentions of the variable
    // name in explanatory copy are fine; a `process.env` read outside a relay
    // is not.
    const offenders = SOURCES.filter(
      (file) => !isTestFile(file) && /process\.env\.OPENROUTER_API_KEY/.test(file.contents),
    ).map((file) => file.path);

    expect(offenders.sort()).toEqual(["api/chat.ts", "scripts/dev-server.mjs"]);
  });

  it("binds the local relay to loopback by default", () => {
    const relay = SOURCES.find((file) => file.path === "scripts/dev-server.mjs");
    expect(relay).toBeDefined();
    expect(relay?.contents).toMatch(/BLACKLETTER_DEV_HOST\s*\|\|\s*["']127\.0\.0\.1["']/);
  });

  it("does not bind the Vite dev server to every interface", () => {
    const vite = fs.readFileSync(path.join(ROOT, "vite.config.ts"), "utf-8");
    expect(vite).not.toMatch(/host:\s*["']0\.0\.0\.0["']/);
  });
});

describe("architecture: one evidence layer", () => {
  it("chunks documents in exactly one place", () => {
    const chunkers = SOURCES.filter(
      (file) => !isTestFile(file) && /function\s+chunkDocumentPart\s*\(/.test(file.contents),
    ).map((file) => file.path);
    expect(chunkers).toEqual(["src/pipeline/grounding.ts"]);
  });

  it("cuts windows in exactly one place", () => {
    const windowers = SOURCES.filter(
      (file) => !isTestFile(file) && /function\s+windows\s*\(/.test(file.contents),
    ).map((file) => file.path);
    expect(windowers).toEqual(["src/pipeline/grounding.ts"]);
  });

  it("decides claim support in exactly one place", () => {
    const attributors = SOURCES.filter(
      (file) => !isTestFile(file) && /function\s+attributeClaims\s*\(/.test(file.contents),
    ).map((file) => file.path);
    expect(attributors).toEqual(["src/pipeline/grounding.ts"]);
  });

  it("verifies chunks in exactly one place", () => {
    const verifiers = SOURCES.filter(
      (file) => !isTestFile(file) && /function\s+verifyChunk\s*\(/.test(file.contents),
    ).map((file) => file.path);
    expect(verifiers).toEqual(["src/pipeline/grounding.ts"]);
  });

  it("takes document boundaries from the parts, not from the joined text", () => {
    // The boundary logic lives in the shared corpus builder; the node delegates
    // to it so the pipeline and the tool layer chunk identically.
    const node = SOURCES.find((file) => file.path === "src/langgraph/nodes/RetrievalNode.ts");
    expect(node).toBeDefined();
    expect(node?.contents).toMatch(/state\.documentParts/);
    expect(node?.contents).toMatch(/buildCorpusFrom\s*\(/);

    const corpus = SOURCES.find((file) => file.path === "src/pipeline/corpus.ts");
    expect(corpus).toBeDefined();
    expect(corpus?.contents).toMatch(/chunkDocumentPart/);
    // The joined text survives only as a fallback for sessions stored before
    // parts existed.
    expect(corpus?.contents).toMatch(/parts\.length\s*===\s*0/);
    // And it must never be split on the separator it was joined with.
    expect(corpus?.contents).not.toMatch(/split\(\s*\/[^/]*---/);
    expect(corpus?.contents).not.toMatch(/indexOf\(\s*["']--- /);
  });

  it("keeps the joined-text separator in one place", () => {
    const builders = SOURCES.filter(
      (file) => !isTestFile(file) && /---\s*\$\{[^}]*\}\s*---/.test(file.contents),
    ).map((file) => file.path);
    expect(builders).toEqual(["src/pipeline/documentEngine.ts"]);
  });

  it("keeps one stopword list", () => {
    const lists = SOURCES.filter(
      (file) => !isTestFile(file) && /export\s+const\s+STOP\s*=/.test(file.contents),
    ).map((file) => file.path);
    expect(lists).toEqual(["src/pipeline/grounding.ts"]);

    const scoring = SOURCES.find((file) => file.path === "src/pipeline/scoring.ts");
    expect(scoring?.contents).toMatch(/import\s*\{[^}]*\bSTOP\b[^}]*\}\s*from\s*["']\.\/grounding["']/s);
  });

  it("keeps one hash implementation", () => {
    const hashes = SOURCES.filter(
      (file) => !isTestFile(file) && /function\s+fnv1a32\s*\(/.test(file.contents),
    ).map((file) => file.path);
    expect(hashes).toEqual(["src/lib/hash.ts"]);
  });

  it("has one evidence window size, shared by the prompt and the resolver", () => {
    const definers = SOURCES.filter(
      (file) => !isTestFile(file) && /const\s+EVIDENCE_WINDOW\s*=/.test(file.contents),
    ).map((file) => file.path);
    expect(definers).toEqual(["src/pipeline/grounding.ts"]);

    for (const consumer of ["src/langgraph/nodes/PromptBuilderNode.ts", "src/langgraph/nodes/EvaluationNode.ts"]) {
      const file = SOURCES.find((source) => source.path === consumer);
      expect(file?.contents, `${consumer} must use the shared evidence window`).toMatch(/\bEVIDENCE_WINDOW\b/);
    }
  });

  it("keeps the extraction layer independent of the evidence layer", () => {
    // `src/lib/extraction` produces text and section boundaries; it must not
    // reach into grounding, or the dependency becomes a cycle.
    const offenders = SOURCES.filter(
      (file) => file.path.startsWith("src/lib/extraction/") && /from\s+["'][^"']*pipeline/.test(file.contents),
    ).map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it("derives faithfulness from the grounding report rather than judging twice", () => {
    const scoring = SOURCES.find((file) => file.path === "src/pipeline/scoring.ts");
    expect(scoring?.contents).toMatch(/function\s+faithfulnessFromReport\s*\(/);
    // The claim decision must be delegated, not reimplemented with a different
    // matching rule. Comments are stripped first so that prose describing the
    // old defect is not mistaken for the defect itself.
    const stripComments = (contents: string) =>
      contents.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    const offenders = SOURCES.filter(
      (file) =>
        !isTestFile(file) &&
        file.path !== "src/pipeline/grounding.ts" &&
        /\.includes\(token\)/.test(stripComments(file.contents)),
    ).map((file) => file.path);
    expect(offenders, "substring search must not stand in for word matching").toEqual([]);
  });

  it("does not substitute a constant when a measurement is missing", () => {
    // The old confidence function replaced unmeasurable components with fixed
    // numbers (`0.35`, `0.55`, `0.4`) and folded them into the score.
    const scoring = SOURCES.find((file) => file.path === "src/pipeline/scoring.ts");
    expect(scoring?.contents).toMatch(/measuredWeight/);
    expect(scoring?.contents).not.toMatch(/score\s*\?\?\s*0\.\d/);
    expect(scoring?.contents).not.toMatch(/\?\s*0\.55\s*:/);
    expect(scoring?.contents).not.toMatch(/\?\s*0\.35\s*:/);
  });
});

describe("architecture: one memory layer", () => {
  it("formats memory for a prompt in exactly one place", () => {
    const formatters = SOURCES.filter(
      (file) => !isTestFile(file) && /function\s+formatMemoryContext\s*\(/.test(file.contents),
    ).map((file) => file.path);
    expect(formatters).toEqual(["src/memory/retrieval.ts"]);
  });

  it("keeps memory behind one module boundary", () => {
    // Memory state, records and retrieval live in `src/memory`; other layers
    // import the barrel rather than reaching into the files.
    const deepImporters = SOURCES.filter(
      (file) =>
        !isTestFile(file) &&
        !file.path.startsWith("src/memory/") &&
        /from\s+["'][^"']*\/memory\/(types|state|retrieval)["']/.test(file.contents) &&
        !/from\s+["'][^"']*\/memory\/types["']/.test(file.contents),
    ).map((file) => file.path);
    expect(deepImporters).toEqual([]);
  });

  it("keeps memory independent of the model and the graph", () => {
    const offenders = SOURCES.filter(
      (file) => file.path.startsWith("src/memory/") && /from\s+["'][^"']*(providers|langgraph|pipeline\/(?!grounding))/.test(file.contents),
    ).map((file) => file.path);
    expect(offenders, "memory is stored state, not a model or a graph dependency").toEqual([]);
  });

  it("never calls a model or a training path from the memory layer", () => {
    const banned = /(fetch\s*\(|XMLHttpRequest|streamOpenRouter|runPipeline|fine[-_]?tune|trainModel|WebSocket)/;
    const offenders = SOURCES.filter(
      (file) => file.path.startsWith("src/memory/") && banned.test(file.contents),
    ).map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it("records an origin on every record it creates", () => {
    const state = SOURCES.find((file) => file.path === "src/memory/state.ts");
    // Both record-creating paths go through the two factories, and neither may
    // invent an origin: they are always passed one.
    expect(state?.contents).toMatch(/statusForOrigin\s*\(/);
    expect(state?.contents).toMatch(/origin:\s*"legacy-import"/);
    expect(state?.contents).not.toMatch(/origin:\s*["']user["']\s*,\s*\n\s*status/);
  });

  it("keeps deletion and retrieval on the same state", () => {
    const retrieval = SOURCES.find((file) => file.path === "src/memory/retrieval.ts");
    // Retrieval must read the record list itself; a second index could go stale
    // after a deletion.
    expect(retrieval?.contents).toMatch(/state\.records/);
    expect(retrieval?.contents).not.toMatch(/Index|cache|Map<string,\s*MemoryRecord>/);
  });

  it("has one hard-coded auto-record cap for the panel and the store", () => {
    const caps = SOURCES.filter(
      (file) => !isTestFile(file) && /const\s+MEMORY_MAX_AUTO_PER_WORKSPACE\s*=/.test(file.contents),
    ).map((file) => file.path);
    expect(caps).toEqual(["src/memory/state.ts"]);

    const panel = SOURCES.find((file) => file.path === "src/components/memory/MemoryPanel.tsx");
    expect(panel?.contents).toMatch(/MEMORY_MAX_AUTO_PER_WORKSPACE/);
  });
});

/* ------------------------------------------------- platform guards (Mission 6) */

/** Comments describe rules; only code can break them. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("architecture: one provider layer", () => {
  it("decides provider selection in exactly one module", () => {
    const owners = SOURCES.filter(
      (file) => !isTestFile(file) && /export\s+(function|const)\s+(setProviderSelection|DEFAULT_SELECTION)\b/.test(file.contents),
    ).map((file) => file.path);
    expect(owners).toEqual(["src/providers/selection.ts"]);
  });

  it("keeps the loopback default in the shared defaults module", () => {
    const defaults = SOURCES.filter(
      (file) => /export\s+const\s+OLLAMA_BASE_URL\s*=/.test(file.contents),
    ).map((file) => file.path);
    expect(defaults).toEqual(["src/config/model-defaults.mjs"]);

    const module = SOURCES.find((file) => file.path === "src/config/model-defaults.mjs");
    expect(module?.contents).toMatch(/OLLAMA_BASE_URL\s*=\s*"http:\/\/127\.0\.0\.1:11434"/);
  });

  it("never assumes a local model id", () => {
    const module = SOURCES.find((file) => file.path === "src/config/model-defaults.mjs");
    // "Ornith 9B" is not a documented Ollama identifier; guessing a default
    // would either fail confusingly or pull something else.
    expect(module?.contents).toMatch(/export\s+const\s+OLLAMA_DEFAULT_MODEL\s*=\s*""/);
  });

  it("never pulls, downloads or starts a local model", () => {
    // The adapter may *tell the operator* to run `ollama pull` themselves; what
    // it must never do is call the pull endpoint or spawn a process.
    const offenders = SOURCES.filter(
      (file) => !isTestFile(file) && /\/api\/pull|child_process|spawn\s*\(|execa/.test(stripComments(file.contents)),
    ).map((file) => file.path);
    expect(offenders, "the app points at a runtime; it never installs one").toEqual([]);

    const adapter = SOURCES.find((file) => file.path === "src/providers/ollama.ts");
    expect(adapter?.contents).toMatch(/Nothing was downloaded automatically/);
  });

  it("routes every generation through the provider dispatcher", () => {
    const dispatchers = SOURCES.filter(
      (file) => !isTestFile(file) && /\bstreamOllama\s*\(/.test(file.contents),
    ).map((file) => file.path);
    expect(dispatchers).toEqual(["src/providers/ollama.ts", "src/providers/provider.ts"]);

    const remoteCallers = SOURCES.filter(
      (file) => !isTestFile(file) && /\bstreamOpenRouter\s*\(/.test(file.contents) && file.path !== "src/providers/openrouter.ts",
    ).map((file) => file.path);
    expect(remoteCallers).toEqual(["src/providers/provider.ts"]);
  });

  it("only falls back to the remote provider when the operator allowed it", () => {
    const dispatcher = SOURCES.find((file) => file.path === "src/providers/provider.ts");
    const contents = dispatcher?.contents ?? "";
    expect(contents).toMatch(/remoteFallback\s*!==\s*"allow"/);
    // The fallback never fires for a missing model or an oversized prompt.
    expect(contents).toMatch(/isTransientLocalError\s*\(/);
  });

  it("records the provider that actually ran on the run and its telemetry", () => {
    const state = SOURCES.find((file) => file.path === "src/langgraph/state.ts");
    expect(state?.contents).toMatch(/resolveProvider\s*\(/);
    expect(state?.contents).toMatch(/providerFallback/);

    const node = SOURCES.find((file) => file.path === "src/langgraph/nodes/LLMNode.ts");
    // The node records what the provider layer reported, not what was requested.
    expect(node?.contents).toMatch(/onProvider/);
    expect(node?.contents).toMatch(/providerLocal/);

    const telemetry = SOURCES.find((file) => file.path === "src/pipeline/trace.ts");
    expect(telemetry?.contents).toMatch(/interface\s+PipelineTelemetry[\s\S]*?provider:\s*string/);

    const entry = SOURCES.find((file) => file.path === "src/observability/metrics.ts");
    expect(entry?.contents).toMatch(/interface\s+RunRecord[\s\S]*?provider\?:/);
  });

  it("does not name a provider after the stage that runs it", () => {
    const trace = SOURCES.find((file) => file.path === "src/pipeline/trace.ts");
    // The generation stage is named for what it does; the provider identity
    // lives on the telemetry, so a local run cannot be shown as an OpenRouter one.
    expect(trace?.contents).toMatch(/openrouter:\s*"Generation"/);
  });
});

describe("architecture: one tool layer", () => {
  it("keeps the tool layer free of models, the graph, and the host", () => {
    const tools = SOURCES.filter((file) => file.path.startsWith("src/tools/"));
    expect(tools.length).toBeGreaterThan(5);

    const offenders = tools
      .filter((file) =>
        /from\s+["'][^"']*(providers|langgraph)\//.test(file.contents) ||
        /from\s+["']node:/.test(file.contents) ||
        /require\s*\(|child_process|electron|XMLHttpRequest|WebSocket/.test(file.contents),
      )
      .map((file) => file.path);
    expect(offenders, "tools read data, they never reach the host or a model").toEqual([]);
  });

  it("never evaluates code inside the tool layer", () => {
    const offenders = SOURCES.filter(
      (file) => file.path.startsWith("src/tools/") && /\beval\s*\(|new\s+Function\s*\(/.test(file.contents),
    ).map((file) => file.path);
    expect(offenders).toEqual([]);

    // The calculator is the tool most likely to grow an escape hatch. Outside its
    // own documentation it may not reference a global object at all.
    const calculator = SOURCES.find((file) => file.path === "src/tools/calculators.ts");
    expect(stripComments(calculator?.contents ?? "")).not.toMatch(/\b(globalThis|window|process)\b/);
  });

  it("keeps the policy gateway independent of the registry and of the model", () => {
    const policy = SOURCES.find((file) => file.path === "src/tools/policy.ts");
    const contents = policy?.contents ?? "";
    expect(contents).not.toMatch(/from\s+["']\.\/registry["']/);
    expect(contents).not.toMatch(/from\s+["'][^"']*providers\//);
    // The gateway is a pure decision, so it holds no state of its own.
    expect(contents).not.toMatch(/\blet\s+/);
  });

  it("declares every tool in exactly one place", () => {
    const definers = SOURCES.filter(
      (file) => !isTestFile(file) && /const\s+TOOL_REGISTRY\s*:\s*ReadonlyMap/.test(file.contents),
    ).map((file) => file.path);
    expect(definers).toEqual(["src/tools/registry.ts"]);

    for (const name of ["workspace.search", "workspace.read", "workspace.status", "evidence.retrieve", "memory.search"]) {
      const owners = SOURCES.filter((file) => !isTestFile(file) && file.contents.includes(`name: "${name}"`)).map(
        (file) => file.path,
      );
      expect(owners, name).toEqual(["src/tools/registry.ts"]);
    }
  });

  it("cannot be extended at runtime outside a test build", () => {
    const registry = SOURCES.find((file) => file.path === "src/tools/registry.ts");
    expect(registry?.contents).toMatch(/function\s+registerToolForTests/);
    expect(registry?.contents).toMatch(/MODE === "test"/);
    expect(registry?.contents).toMatch(/throw new Error\("tools can only be registered in a test build"\)/);
  });

  it("gives the model no way to approve its own call", () => {
    const registry = SOURCES.find((file) => file.path === "src/tools/registry.ts");
    // Nothing in the seven read-only tools is high-impact or side-effecting.
    expect(registry?.contents).not.toMatch(/highImpact:\s*\[\s*"/);
    expect(registry?.contents).toMatch(/highImpact:\s*\[\]/);

    const policy = SOURCES.find((file) => file.path === "src/tools/policy.ts");
    // Approval can only arrive as an argument to the evaluator, never be read
    // out of the proposal.
    expect(policy?.contents).toMatch(/if \(needsApproval && !request\.approval\)/);
    expect(policy?.contents).not.toMatch(/proposal\.approval/);
  });

  it("neutralises tool output in exactly one implementation", () => {
    const neutralisers = SOURCES.filter(
      (file) => !isTestFile(file) && /function\s+neutraliseActionBlocks\s*\(/.test(file.contents),
    ).map((file) => file.path);
    expect(neutralisers).toEqual(["src/tools/proposals.ts"]);

    // The executor is what applies it to tool output, so a tool cannot skip it.
    const executor = SOURCES.find((file) => file.path === "src/tools/executor.ts");
    expect(executor?.contents).toMatch(/neutraliseActionBlocks\s*\(/);
  });

  it("observes proposals only in the model's own response", () => {
    const observers = SOURCES.filter(
      (file) => !isTestFile(file) && /\bobserveProposals\s*\(/.test(file.contents),
    ).map((file) => file.path);
    expect(observers).toEqual(["src/langgraph/index.ts", "src/tools/proposals.ts"]);
  });

  it("keeps the provider adapter unable to run a tool", () => {
    const offenders = SOURCES.filter(
      (file) => file.path.startsWith("src/providers/") && /from\s+["'][^"']*tools/.test(file.contents),
    ).map((file) => file.path);
    expect(offenders, "a provider streams text; the gateway decides what may run").toEqual([]);
  });

  it("offers no API that edits the audit trail", () => {
    const audit = SOURCES.find((file) => file.path === "src/tools/audit.ts");
    const exported = [...(audit?.contents ?? "").matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1]);
    expect(exported).toContain("appendToolAudit");
    expect(exported.filter((name) => /^(update|edit|remove|delete)ToolAudit/i.test(name))).toEqual([]);
  });

  it("defines the task budget once and shows it where the budget is spent", () => {
    const owners = SOURCES.filter(
      (file) => !isTestFile(file) && /const\s+TOOL_BUDGET_LIMITS\s*:/.test(file.contents),
    ).map((file) => file.path);
    expect(owners).toEqual(["src/tools/types.ts"]);

    const panel = SOURCES.find((file) => file.path === "src/components/observability/ToolsPanel.tsx");
    expect(panel?.contents).toMatch(/TOOL_BUDGET_LIMITS/);
    expect(panel?.contents).toMatch(/CONSOLE_GRANTS/);
  });
});

/* ------------------------------------------------ retrieval guards (Mission 8) */

describe("architecture: one retrieval path", () => {
  it("opens network connections only at the documented boundaries", () => {
    const callers = SOURCES.filter((file) => {
      if (isTestFile(file)) return false;
      const code = stripComments(file.contents);
      // A platform call (`await fetch(`) or a fallback reference (`?? fetch`) —
      // neither pattern can match prose, so a panel label cannot fool it.
      return /(await\s+|\?\?\s*)fetch\b/.test(code);
    }).map((file) => file.path);

    expect(callers.sort()).toEqual([
      "api/chat.ts",
      "scripts/dev-server.mjs",
      "src/providers/ollama.ts",
      "src/providers/openrouter.ts",
      "src/research/web/fetch.ts",
      "src/research/web/run.ts",
    ]);
  });

  it("never follows a redirect", () => {
    for (const file of SOURCES.filter((entry) => !isTestFile(entry))) {
      expect(stripComments(file.contents), file.path).not.toMatch(/redirect\s*:\s*"follow"/);
    }
    const fetcher = SOURCES.find((file) => file.path === "src/research/web/fetch.ts");
    expect(fetcher?.contents).toMatch(/redirect:\s*"manual"/);
    expect(fetcher?.contents).toMatch(/REDIRECTS_FOLLOWED/);
  });

  it("decides whether a destination may be contacted in exactly one function", () => {
    const definers = SOURCES.filter(
      (file) => !isTestFile(file) && /export\s+function\s+checkResearchUrl\s*\(/.test(file.contents),
    ).map((file) => file.path);
    expect(definers).toEqual(["src/research/web/fetch.ts"]);

    const privateChecks = SOURCES.filter(
      (file) =>
        !isTestFile(file) &&
        /export\s+function\s+isPrivate(Ipv4|Ipv6|Host)\s*\(/.test(file.contents),
    ).map((file) => file.path);
    expect(privateChecks).toEqual(["src/research/web/fetch.ts"]);

    // Both the transfer layer and the evidence layer consult it, so a stored
    // citation is judged by the same rule that allowed the fetch.
    const users = SOURCES.filter(
      (file) => !isTestFile(file) && /checkResearchUrl\s*\(/.test(file.contents),
    ).map((file) => file.path);
    expect(users).toContain("src/research/web/analysis.ts");
  });

  it("keeps retrieval free of the model layers and vice versa", () => {
    const retrieval = SOURCES.filter((file) => file.path.startsWith("src/research/web/"));
    expect(retrieval.length).toBeGreaterThan(4);

    for (const file of retrieval) {
      const code = stripComments(file.contents);
      expect(code, file.path).not.toMatch(/from\s+["'][^"']*(langgraph|providers)\//);
      expect(code, file.path).not.toMatch(/process\.env|import\.meta\.env/);
      expect(code, file.path).not.toMatch(/\beval\s*\(|new\s+Function\s*\(/);
      expect(code, file.path).not.toMatch(/API_KEY|apiKey|client_secret/i);
    }

    const modelLayers = SOURCES.filter(
      (file) => !isTestFile(file) && /^src\/(providers|langgraph)\//.test(file.path),
    );
    for (const file of modelLayers) {
      expect(stripComments(file.contents), file.path).not.toMatch(/research\/web/);
    }
  });

  it("reaches the retrieval layer only through its entry point", () => {
    const deep = SOURCES.filter(
      (file) =>
        !isTestFile(file) &&
        file.path !== "src/research/web/index.ts" &&
        /from\s+["'][^"']*research\/web\/[a-z]/.test(file.contents),
    ).map((file) => file.path);
    expect(deep).toEqual([]);
  });

  it("extracts page text without ever inserting it into a document", () => {
    const extractors = SOURCES.filter(
      (file) => !isTestFile(file) && /export\s+function\s+extractPage\s*\(/.test(file.contents),
    ).map((file) => file.path);
    expect(extractors).toEqual(["src/research/web/extract.ts"]);

    for (const file of SOURCES.filter((entry) => entry.path.startsWith("src/research/web/") || entry.path === "src/components/research/WebResearchPanel.tsx")) {
      const code = stripComments(file.contents);
      expect(code, file.path).not.toMatch(/dangerouslySetInnerHTML|innerHTML\s*=|document\.write|createContextualFragment/);
    }

    // The extractor parses into an inert tree and neutralises action blocks.
    const extractor = SOURCES.find((file) => file.path === "src/research/web/extract.ts");
    expect(extractor?.contents).toMatch(/new DOMParser\(\)/);
    expect(extractor?.contents).toMatch(/neutraliseActionBlocks\s*\(/);
  });

  it("makes no claim about a source without a stored record behind it", () => {
    // Citation identity is content-addressed on the canonical URL, so a citation
    // cannot be written by hand into a run.
    const analysis = SOURCES.find((file) => file.path === "src/research/web/analysis.ts");
    expect(analysis?.contents).toMatch(/id:\s*`src-\$\{digestValue/);

    // Claim support is decided by the grounding module, not re-implemented here.
    expect(analysis?.contents).toMatch(/attributeClaims\s*\(/);
    const definers = SOURCES.filter(
      (file) => !isTestFile(file) && /export\s+function\s+attributeClaims\s*\(/.test(file.contents),
    ).map((file) => file.path);
    expect(definers).toEqual(["src/pipeline/grounding.ts"]);
  });

  it("adds a retrieval layer without replacing the existing research module", () => {
    const types = SOURCES.find((file) => file.path === "src/research/types.ts");
    expect(types?.contents).toMatch(/export type SourceType/);

    const barrel = SOURCES.find((file) => file.path === "src/research/index.ts");
    expect(barrel?.contents).toMatch(/ResearchEngine/);
  });

  it("shows retrieval in developer mode only", () => {
    const users = SOURCES.filter(
      (file) => !isTestFile(file) && file.path !== "src/components/research/WebResearchPanel.tsx" && /WebResearchPanel/.test(file.contents),
    ).map((file) => file.path);
    expect(users).toEqual(["src/components/observability/DeveloperMode.tsx"]);
  });
});

/* --------------------------------------------------- task guards (Mission 9) */

describe("architecture: one task execution path", () => {
  it("declares the status table in exactly one place", () => {
    const definers = SOURCES.filter(
      (file) => !isTestFile(file) && /const\s+ALLOWED_TRANSITIONS\s*:/.test(file.contents),
    ).map((file) => file.path);
    expect(definers).toEqual(["src/tasks/machine.ts"]);

    const machine = SOURCES.find((file) => file.path === "src/tasks/machine.ts");
    expect(machine?.contents).toMatch(/COMPLETED:\s*\[\]/);
    expect(machine?.contents).toMatch(/FAILED:\s*\[\]/);
    expect(machine?.contents).toMatch(/CANCELLED:\s*\[\]/);
  });

  it("cannot reach COMPLETED from anywhere but the verifier", () => {
    const setters = SOURCES.filter((file) => !isTestFile(file) && /to:\s*"COMPLETED"/.test(file.contents)).map(
      (file) => file.path,
    );
    expect(setters).toEqual(["src/tasks/runner.ts"]);

    const runner = SOURCES.find((file) => file.path === "src/tasks/runner.ts")?.contents ?? "";
    const verifierAt = runner.indexOf("export function verifyTask");
    const stepper = runner.slice(runner.indexOf("export async function stepTask"), verifierAt);
    const verifier = runner.slice(verifierAt);
    expect(stepper, "the step runner must not declare success").not.toMatch(/to:\s*"COMPLETED"/);
    expect(verifier).toMatch(/to:\s*"COMPLETED"/);
  });

  it("runs every step through the tool policy gateway and nowhere else", () => {
    const tasks = SOURCES.filter((file) => file.path.startsWith("src/tasks/"));
    expect(tasks.length).toBeGreaterThan(4);

    for (const file of tasks) {
      const code = stripComments(file.contents);
      expect(code, file.path).not.toMatch(/(await\s+|\?\?\s*)fetch\b/);
      expect(code, file.path).not.toMatch(/from\s+["'][^"']*(langgraph|providers|research\/web|stores|components)\//);
      expect(code, file.path).not.toMatch(/\beval\s*\(|new\s+Function\s*\(|node:/);
      // A tool is never invoked directly: the registry is looked up for its
      // declaration, and the call itself goes through the executor.
      expect(code, file.path).not.toMatch(/\b(?:tool|definition)\s*\.\s*run\s*\(/);
    }

    const runner = SOURCES.find((file) => file.path === "src/tasks/runner.ts")?.contents ?? "";
    expect(runner).toMatch(/runProposal\s*\(/);
    expect(runner).toMatch(/findTool\s*\(/);
  });

  it("keeps the planner deterministic and free of the clock", () => {
    const planner = stripComments(SOURCES.find((file) => file.path === "src/tasks/planner.ts")?.contents ?? "");
    expect(planner).not.toMatch(/Date\.now|Math\.random|performance\.now/);
    // The planner proposes steps; it does not run them.
    expect(planner).not.toMatch(/runProposal|createToolTask/);
  });

  it("never lets a task grant itself a permission", () => {
    const runner = stripComments(SOURCES.find((file) => file.path === "src/tasks/runner.ts")?.contents ?? "");
    expect(runner).not.toMatch(/grants\s*\.\s*push|grants\s*=|grants:\s*\[\s*\.\.\.task\.grants\s*\]\s*\./);
    // The grants handed to a tool call are a copy of the task's own grants.
    expect(runner).toMatch(/grants:\s*\[\.\.\.task\.grants\]/);
    // And a resolution source can never be a permission.
    expect(runner).not.toMatch(/case\s+"permission"|case\s+"grant/);
  });

  it("lets a plan grow, never shrink, and only on the operator's word", () => {
    const runner = SOURCES.find((file) => file.path === "src/tasks/runner.ts")?.contents ?? "";
    const start = runner.indexOf("export function reviseStep");
    const end = runner.indexOf("/* ------------------------------------------------------------ verification */");
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);

    const revise = stripComments(runner.slice(start, end));
    expect(revise).toMatch(/revisions: \[\.\.\.task\.revisions/);
    expect(revise).toMatch(/steps: \[\.\.\.task\.steps, step\]/);
    // Removing a step that already ran would erase its result, so a revision may
    // only ever append.
    expect(revise).not.toMatch(/\.splice\(|\.filter\(|\.slice\(|\.pop\(/);
    // And it is not something a task does to itself.
    expect(revise).toMatch(/task\.status !== "RUNNING" && task\.status !== "PAUSED"/);
  });

  it("persists through the key-value layer and recovers what a restart interrupted", () => {    const store = stripComments(SOURCES.find((file) => file.path === "src/tasks/store.ts")?.contents ?? "");
    expect(store).toMatch(/from\s+["']\.\.\/lib\/db["']/);
    expect(store).not.toMatch(/localStorage|indexedDB|window\./);

    const runner = SOURCES.find((file) => file.path === "src/tasks/runner.ts")?.contents ?? "";
    expect(runner).toMatch(/export function recoverInterruptedTask/);
    const recovery = runner.slice(runner.indexOf("export function recoverInterruptedTask"));
    expect(recovery).toMatch(/to:\s*"PAUSED"/);
  });

  it("makes the unmeasured budgets visible rather than showing them as spent", () => {
    const types = SOURCES.find((file) => file.path === "src/tasks/types.ts")?.contents ?? "";
    expect(types).toMatch(/unmeasured:\s*\["tokens",\s*"currency"\]/);

    const panel = SOURCES.find((file) => file.path === "src/components/observability/TasksPanel.tsx")?.contents ?? "";
    expect(panel).toMatch(/TASK_BUDGET_LIMITS\.unmeasured/);
    expect(panel).toMatch(/Not enforced:/);
    // The panel must not offer level 3 as if it existed.
    expect(panel).toMatch(/Level \{MAX_AUTONOMY_LEVEL \+ 1\} is not/);
  });

  it("shows tasks in developer mode only", () => {
    const users = SOURCES.filter(
      (file) => !isTestFile(file) && file.path !== "src/components/observability/TasksPanel.tsx" && /TasksPanel/.test(file.contents),
    ).map((file) => file.path);
    expect(users).toEqual(["src/components/observability/DeveloperMode.tsx"]);
  });
});

/* ------------------------------------------------------- epistemic guards (Mission 10) */

describe("architecture: one derivation boundary", () => {
  /**
   * Names imported from `lib/research`. Matching only import statements matters
   * here: `extractEntities` also exists in `src/knowledge/extractor.ts` and as a
   * method on the document intelligence class, and neither has anything to do
   * with the report extractors.
   */
  function importedFromResearch(contents: string): string[] {
    const names: string[] = [];
    const pattern = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["'][^"']*lib\/research["']/g;
    const stripped = stripComments(contents);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(stripped)) !== null) {
      for (const name of (match[1] ?? "").split(",")) {
        names.push(name.replace(/\btype\b/, "").trim());
      }
    }
    return names;
  }

  const EXTRACTORS = [
    "parseReportSections",
    "extractEntities",
    "extractTimeline",
    "extractNotes",
    "extractFollowUpQuestions",
  ];

  it("reads the raw report extractors in exactly one place", () => {
    const callers = SOURCES.filter(
      (file) => !isTestFile(file) && importedFromResearch(file.contents).some((name) => EXTRACTORS.includes(name)),
    ).map((file) => file.path);
    expect(callers).toEqual(["src/integrity/derive.ts"]);
  });

  it("routes both live run call sites through the boundary", () => {
    for (const file of ["src/components/canvas/use-chat-turn.ts", "src/components/research/ResearchWorkspace.tsx"]) {
      const contents = stripComments(SOURCES.find((source) => source.path === file)?.contents ?? "");
      expect(contents, file).toMatch(/deriveTabRecords\(/);
      expect(contents, file).toMatch(/recordDerivedChange\(/);
      // The tab's records come from the derivation's return value. Labels and
      // stage lists may still be imported from `lib/research` — the raw
      // extractors may not be.
      for (const extractor of EXTRACTORS) {
        expect(contents, file).not.toMatch(new RegExp(`${extractor}\\s*\\(`));
      }
    }
  });

  it("keeps the extractor seam closed outside a test build", () => {
    const derive = SOURCES.find((file) => file.path === "src/integrity/derive.ts")?.contents ?? "";
    expect(derive).toMatch(/extractors && isTestBuild\(\)/);
    expect(derive).toMatch(/env\?\.MODE === "test"/);
  });

  it("gives every derived record an optional provenance field and no verified claim", () => {
    const research = SOURCES.find((file) => file.path === "src/lib/research.ts")?.contents ?? "";
    const provenanceFields = research.match(/provenance\?:\s*DerivedRecordProvenance/g) ?? [];
    // ReportSection, Entity, TimelineEvent, ResearchNote — one each.
    expect(provenanceFields).toHaveLength(4);

    const types = stripComments(SOURCES.find((file) => file.path === "src/integrity/types.ts")?.contents ?? "");
    expect(types).toMatch(/"supported"\s*\|\s*"unverified"/);

    const derive = stripComments(
      SOURCES.find((file) => file.path === "src/integrity/derive.ts")?.contents ?? "",
    );
    // The boundary never writes the word `verified`, in any casing, as data.
    expect(derive).not.toMatch(/["']verified["']/i);
  });

  it("labels an application-suggested follow-up instead of passing it off as the answer's", () => {
    const followUps = SOURCES.find((file) => file.path === "src/components/research/FollowUpQuestions.tsx")?.contents ?? "";
    expect(followUps).toMatch(/origin\?: "answer" \| "app"/);
    expect(followUps).toMatch(/origin === "app"/);
    expect(followUps).toMatch(/Suggested by the application/);

    const simple = SOURCES.find((file) => file.path === "src/components/simple/SimpleChat.tsx")?.contents ?? "";
    expect(simple).toMatch(/followUpsOrigin/);
    expect(simple).toMatch(/Suggested by the application/);

    const research = SOURCES.find((file) => file.path === "src/lib/research.ts")?.contents ?? "";
    // The fallback the extractor used to invent is gone for good.
    const followUpExtractor = research.slice(research.indexOf("export function extractFollowUpQuestions"));
    expect(followUpExtractor.slice(0, 900)).not.toMatch(/Could you elaborate on the mechanisms/);
  });

  it("puts the confidence caveat and the coverage label next to the number", () => {
    for (const file of ["src/components/research/IntelligenceStrip.tsx", "src/components/research/ReportExport.tsx"]) {
      const contents = SOURCES.find((source) => source.path === file)?.contents ?? "";
      expect(contents, file).toMatch(/CAVEAT/);
      expect(contents, file).toMatch(/describeEvidenceCoverage\(/);
    }
  });

  it("keeps the change log versioned, validated on read, and non-destructive to newer changes", () => {
    const changes = stripComments(SOURCES.find((file) => file.path === "src/integrity/changes.ts")?.contents ?? "");
    expect(changes).toMatch(/stored\.version !== INTEGRITY_SCHEMA_VERSION/);
    expect(changes).toMatch(/readStoredChange/);
    // Merging, not replacing, so a change recorded while the read was in flight
    // is never hidden.
    expect(changes).toMatch(/\[\.\.\.read, \.\.\.changes\]/);
  });

  it("shows the integrity panel in developer mode only", () => {
    const users = SOURCES.filter(
      (file) => !isTestFile(file) && file.path !== "src/components/observability/IntegrityPanel.tsx" && /IntegrityPanel/.test(file.contents),
    ).map((file) => file.path);
    expect(users).toEqual(["src/components/observability/DeveloperMode.tsx"]);
  });

  it("keeps the tool layer from claiming verification and from storing chain-of-thought", () => {
    const toolFiles = SOURCES.filter((file) => file.path.startsWith("src/tools/"));
    expect(toolFiles.length).toBeGreaterThan(0);
    const claiming = toolFiles.filter((file) => /verif/i.test(stripComments(file.contents))).map((file) => file.path);
    expect(claiming).toEqual([]);

    const audit = SOURCES.find((file) => file.path === "src/tools/audit.ts")?.contents ?? "";
    expect(audit).toMatch(/startedAt\?: number/);
    expect(audit).toMatch(/finishedAt\?: number/);

    const cot = SOURCES.filter(
      (file) => !isTestFile(file) && /chain[-_ ]?of[-_ ]?thought|reasoning_content/i.test(file.contents),
    ).map((file) => file.path);
    expect(cot).toEqual([]);
  });
});

/* -------------------------------------------------------- project guards (Mission 11) */

describe("architecture: projects stay inert and bounded", () => {
  const projectFiles = (): Array<{ path: string; contents: string }> => SOURCES.filter((file) => file.path.startsWith("src/projects/"));

  it("contains no timer, no worker, and no network call", () => {
    const offenders = projectFiles()
      .filter((file) =>
        /setInterval|setTimeout|requestAnimationFrame|new Worker|fetch\s*\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon/.test(
          stripComments(file.contents),
        ),
      )
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it("ships scheduling off, and enabling it needs an explicit acknowledgement", () => {
    const actions = stripComments(SOURCES.find((file) => file.path === "src/projects/actions.ts")?.contents ?? "");
    expect(actions).toMatch(/enabled: false/);
    expect(actions).toMatch(/schedule-needs-acknowledgement/);
    expect(actions).toMatch(/input\.enabled && input\.acknowledged !== true/);
    // Enabling is recorded as an intent, in as many words.
    expect(actions).toMatch(/Nothing starts by itself/);
  });

  it("reaches the task machine from exactly one file, and passes a task no more authority than the project holds", () => {
    const importers = projectFiles()
      .filter((file) => /import\s+(?!type\b)[\s\S]{0,400}?from\s+["'][^"']*\.\.\/tasks/.test(stripComments(file.contents)))
      .map((file) => file.path);
    expect(importers).toEqual(["src/projects/actions.ts"]);

    const actions = stripComments(SOURCES.find((file) => file.path === "src/projects/actions.ts")?.contents ?? "");
    expect(actions).toMatch(/grants: next\.grants\.map\(\(entry\) => entry\.permission\)/);
    expect(actions).toMatch(/isApplied\(/);
    expect(actions).toMatch(/consume\(/);
  });

  it("never calls a tool itself", () => {
    const offenders = projectFiles()
      .filter((file) => /tools\/(executor|registry)|runTool\s*\(/.test(stripComments(file.contents)))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it("reads no environment and names no credential", () => {
    for (const file of projectFiles()) {
      const code = stripComments(file.contents);
      expect(code, file.path).not.toMatch(/import\.meta\.env|process\.env/);
      expect(code, file.path).not.toMatch(/OPENROUTER_API_KEY|OPENROUTER_[A-Z_]+|OLLAMA_[A-Z_]+/);
    }
  });

  it("derives the five dashboard words instead of storing them", () => {
    const derive = stripComments(SOURCES.find((file) => file.path === "src/projects/derive.ts")?.contents ?? "");
    for (const state of ['"completed"', '"pending"', '"blocked"', '"failed"', '"approval-needed"']) {
      expect(derive, state).toContain(state);
    }
    // A milestone stores no state field at all: the state is a conclusion.
    const types = stripComments(SOURCES.find((file) => file.path === "src/projects/types.ts")?.contents ?? "");
    const milestoneInterface = types.slice(types.indexOf("export interface ProjectMilestone"), types.indexOf("export interface ProjectBudget"));
    expect(milestoneInterface).not.toMatch(/^\s*state\s*:/m);
  });

  it("states the no-timers rule and the acknowledgement in the panel itself", () => {
    const panel = stripComments(SOURCES.find((file) => file.path === "src/components/observability/ProjectsPanel.tsx")?.contents ?? "");
    expect(panel).toMatch(/no timers, no background jobs/);
    expect(panel).toMatch(/nothing runs on its own/);
    expect(panel).toMatch(/approval expires in 24 hours/);
  });

  it("shows the projects panel in developer mode only", () => {
    const users = SOURCES.filter(
      (file) => !isTestFile(file) && file.path !== "src/components/observability/ProjectsPanel.tsx" && /ProjectsPanel/.test(file.contents),
    ).map((file) => file.path);
    expect(users).toEqual(["src/components/observability/DeveloperMode.tsx"]);
  });
});

/* -------------------------------------------------- control-plane guards (Mission 14) */

describe("architecture: the control plane answers to the operator, not the model", () => {
  const controlFiles = (): SourceFile[] => SOURCES.filter((file) => file.path.startsWith("src/control/"));

  it("cannot be imported by the model, the providers, the graph, or the pipeline", () => {
    const modelSide = SOURCES.filter(
      (file) =>
        !isTestFile(file) &&
        /^src\/(langgraph|providers|intelligence|pipeline)\//.test(file.path) &&
        /from\s+["'][^"']*\bcontrol(?:\/[a-z]+)?["']/.test(stripComments(file.contents)),
    ).map((file) => file.path);
    expect(modelSide, "a model that can reach the stop can also release it").toEqual([]);
  });

  it("lets the tool layer and the task runner see the switch, and nothing else", () => {
    const switchUsers = SOURCES.filter(
      (file) =>
        !isTestFile(file) &&
        !file.path.startsWith("src/control/") &&
        /from\s+["'][^"']*\bcontrol\/stop["']/.test(stripComments(file.contents)),
    ).map((file) => file.path);
    expect(switchUsers.sort()).toEqual(["src/tasks/runner.ts", "src/tools/executor.ts"]);
  });

  it("keeps the operator's action out of every non-UI module", () => {
    const operatorUsers = SOURCES.filter(
      (file) =>
        !isTestFile(file) &&
        !file.path.startsWith("src/control/") &&
        /from\s+["'][^"']*\bcontrol(?:\/index)?["']/.test(stripComments(file.contents)),
    ).map((file) => file.path);
    expect(operatorUsers.sort()).toEqual([
      "src/components/app/StopControl.tsx",
      "src/components/canvas/use-chat-turn.ts",
      "src/components/observability/ControlPanel.tsx",
      "src/components/research/ResearchWorkspace.tsx",
    ]);
  });

  it("registers both live research entry points with the global stop", () => {
    for (const filePath of [
      "src/components/canvas/use-chat-turn.ts",
      "src/components/research/ResearchWorkspace.tsx",
    ]) {
      const source = stripComments(SOURCES.find((file) => file.path === filePath)?.contents ?? "");
      expect(source, filePath).toMatch(/registerInFlight\s*\(/);
      expect(source, filePath).toMatch(/await loadStop\(\)/);
      expect(source, filePath).toMatch(/isStopEngaged\(\)/);
    }
  });

  it("engages the stop only from inside the control plane", () => {
    const engagers = SOURCES.filter(
      (file) => !isTestFile(file) && /\bengageStop\s*\(/.test(stripComments(file.contents)),
    ).map((file) => file.path);
    expect(engagers.sort()).toEqual(["src/control/engage.ts", "src/control/stop.ts"]);

    const outside = engagers.filter((file) => !file.startsWith("src/control/"));
    expect(outside, "nothing outside the control plane may engage the stop").toEqual([]);

    const stop = stripComments(SOURCES.find((file) => file.path === "src/control/stop.ts")?.contents ?? "");
    // Release is called by the operator's surfaces; nothing inside the switch does.
    const callsInStop = (stop.match(/releaseStop\s*\(/g) ?? []).length;
    expect(callsInStop, "the only `releaseStop(` in stop.ts is its own definition").toBe(1);
  });

  it("keeps the switch module free of tools, tasks and the host", () => {
    const stop = stripComments(SOURCES.find((file) => file.path === "src/control/stop.ts")?.contents ?? "");
    expect(stop).not.toMatch(/from\s+["'][^"']*(tools|tasks|providers|langgraph)/);
    expect(stop).not.toMatch(/require\s*\(|electron|child_process/);
  });

  it("contains no timer, no worker, and no network call", () => {
    const offenders = controlFiles()
      .filter((file) =>
        /setInterval|setTimeout|requestAnimationFrame|new Worker|fetch\s*\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon/.test(
          stripComments(file.contents),
        ),
      )
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it("reads no environment and names no credential", () => {
    for (const file of controlFiles()) {
      const code = stripComments(file.contents);
      expect(code, file.path).not.toMatch(/import\.meta\.env|process\.env/);
      expect(code, file.path).not.toMatch(/OPENROUTER_API_KEY|OPENROUTER_[A-Z_]+|OLLAMA_[A-Z_]+/);
    }
  });

  it("checks the stop before anything else, at all three gates", () => {
    const policy = stripComments(SOURCES.find((file) => file.path === "src/tools/policy.ts")?.contents ?? "");
    const stoppedCheck = policy.indexOf("request.stopped");
    const unknownTool = policy.indexOf("if (!tool)");
    expect(stoppedCheck).toBeGreaterThan(0);
    expect(stoppedCheck, "the stop is checked before the tool is even looked up").toBeLessThan(unknownTool);

    const executor = stripComments(SOURCES.find((file) => file.path === "src/tools/executor.ts")?.contents ?? "");
    expect(executor).toMatch(/if \(isStopEngaged\(\)\) \{/);
    expect(executor).toMatch(/mergeAborts\(task\.signal, stopSignal\(\)\)/);

    const runner = stripComments(SOURCES.find((file) => file.path === "src/tasks/runner.ts")?.contents ?? "");
    const step = runner.slice(runner.indexOf("export async function stepTask"));
    const stopCheck = step.indexOf("isStopEngaged()");
    expect(stopCheck).toBeGreaterThan(0);
    expect(stopCheck).toBeLessThan(step.indexOf('task.status !== "RUNNING"'));
  });

  it("puts the stop in the status bar, where no navigation is needed to reach it", () => {
    const users = SOURCES.filter(
      (file) => !isTestFile(file) && file.path !== "src/components/app/StopControl.tsx" && /StopControl/.test(file.contents),
    ).map((file) => file.path);
    expect(users).toEqual(["src/components/app/StatusBar.tsx"]);

    const panelUsers = SOURCES.filter(
      (file) => !isTestFile(file) && file.path !== "src/components/observability/ControlPanel.tsx" && /ControlPanel/.test(file.contents),
    ).map((file) => file.path);
    expect(panelUsers).toEqual(["src/components/observability/DeveloperMode.tsx"]);
  });

  it("allows only the app's own keys through backup and restore, in both directions", () => {
    const backup = stripComments(SOURCES.find((file) => file.path === "src/control/backup.ts")?.contents ?? "");
    expect(backup).toMatch(/BACKUP_KEYS\.includes\(key\)/);
    expect(backup).toMatch(/payload\.version !== CONTROL_VERSION/);
    // Nothing is written until the whole payload validates.
    const validate = backup.indexOf("const refused = Object.keys(payloadEntries)");
    const firstWrite = backup.indexOf("await kvPutMany(payloadEntries)");
    expect(validate).toBeGreaterThan(0);
    expect(validate).toBeLessThan(firstWrite);
  });

  it("states what the stop cannot do, in the code and in the panel", () => {
    const stop = SOURCES.find((file) => file.path === "src/control/stop.ts")?.contents ?? "";
    expect(stop).toMatch(/cannot interrupt a synchronous/);

    const panel = SOURCES.find((file) => file.path === "src/components/observability/ControlPanel.tsx")?.contents ?? "";
    expect(panel).toMatch(/cannot interrupt a synchronous tool body/);
    expect(panel).toMatch(/Releasing it resumes nothing/);
  });
});
