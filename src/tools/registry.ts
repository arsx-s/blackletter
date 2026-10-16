/**
 * The tool registry: a closed, read-only set.
 *
 * Every tool here is defined in code. There is no registration API, no plugin
 * directory and no way for a proposal — model-authored or not — to add, replace
 * or reconfigure a tool. A proposal can only *name* one of these.
 *
 * This build registers seven read-only tools. Nothing writes files, installs
 * packages, reaches the network, sends messages, publishes, pays, changes
 * permissions or deploys; `highImpact` is empty for all of them, and an
 * architecture guard fails the build if a tool is added that says otherwise
 * without the approval path being exercised.
 */

import { buildCorpusFrom } from "../pipeline/corpus";
import { formatLocator } from "../pipeline/grounding";
import { queryTerms, rerankChunks, scoreChunks } from "../pipeline/scoring";
import { evaluateExpression, summariseNumbers } from "./calculators";
import type { ToolDefinition, ToolDocument, ToolRunOutput } from "./types";

/** Characters of a document returned by `workspace.read` when no limit is given. */
export const READ_DEFAULT_CHARS = 4000;
/** Characters of one retrieved passage included in `evidence.retrieve`. */
export const PASSAGE_MAX_CHARS = 1200;

const EXCERPT_RADIUS = 120;

function excerptAround(text: string, needle: string, radius = EXCERPT_RADIUS): string | null {
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return null;
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + needle.length + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

function occurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const lower = haystack.toLowerCase();
  const target = needle.toLowerCase();
  let count = 0;
  let index = lower.indexOf(target);
  while (index >= 0) {
    count++;
    index = lower.indexOf(target, index + target.length);
  }
  return count;
}

/** Only documents that finished extracting can be read or retrieved. */
function readyDocuments(documents: ToolDocument[]): ToolDocument[] {
  return documents.filter((document) => document.status === "ready" && document.content.trim().length > 0);
}

const workspaceSearch: ToolDefinition<{ query: string; limit?: number }> = {
  name: "workspace.search",
  description:
    "Search this workspace's documents, notes and knowledge nodes for a term, and return matching items with the location of each match.",
  sideEffect: "none",
  permission: "workspace:read",
  highImpact: [],
  timeoutMs: 4000,
  maxOutputChars: 40_000,
  schema: {
    input: [
      { name: "query", type: "string", required: true, description: "The term or phrase to look for.", minLength: 1, maxLength: 200 },
      { name: "limit", type: "number", required: false, description: "Maximum hits (default 8).", min: 1, max: 20 },
    ],
    outputDescription: "Ranked hits: kind, id, title, the matching excerpt, and the number of occurrences.",
  },
  run({ query, limit }, ctx): ToolRunOutput {
    const max = limit ?? 8;
    const term = query.trim();
    const hits: Array<{ kind: string; id: string; title: string; excerpt: string; occurrences: number }> = [];

    for (const document of readyDocuments(ctx.data.documents)) {
      const mentions = occurrences(document.content, term) + occurrences(document.name, term);
      if (mentions === 0) continue;
      hits.push({
        kind: "document",
        id: document.id,
        title: document.name,
        excerpt: excerptAround(document.content, term) ?? `name matches "${term}"`,
        occurrences: mentions,
      });
    }

    for (const note of ctx.data.notes) {
      const mentions = occurrences(note.content, term) + occurrences(note.title, term);
      if (mentions === 0) continue;
      hits.push({
        kind: "note",
        id: note.id,
        title: note.title,
        excerpt: excerptAround(note.content, term) ?? `title matches "${term}"`,
        occurrences: mentions,
      });
    }

    for (const node of ctx.data.knowledge) {
      const mentions = occurrences(node.label, term) + occurrences(node.description, term);
      if (mentions === 0) continue;
      hits.push({ kind: "knowledge", id: node.id, title: node.label, excerpt: node.description, occurrences: mentions });
    }

    hits.sort((a, b) => b.occurrences - a.occurrences || a.title.localeCompare(b.title));
    const kept = hits.slice(0, max);

    return {
      summary: kept.length === 0 ? `No matches for "${term}" in this workspace.` : `${kept.length} match(es) for "${term}".`,
      data: { query: term, hits: kept, totalMatches: hits.length },
      text: kept.map((hit) => `[${hit.kind} ${hit.title}] ${hit.excerpt}`).join("\n"),
    };
  },
};

const workspaceRead: ToolDefinition<{ id: string; maxChars?: number }> = {
  name: "workspace.read",
  description:
    "Read one document, note or knowledge item from this workspace by its id. The item must belong to the approved workspace.",
  sideEffect: "none",
  permission: "workspace:read",
  highImpact: [],
  timeoutMs: 2000,
  maxOutputChars: 20_000,
  schema: {
    input: [
      { name: "id", type: "string", required: true, description: "Item id as reported by workspace.search.", minLength: 1, maxLength: 120 },
      { name: "maxChars", type: "number", required: false, description: `Characters to return (default ${READ_DEFAULT_CHARS}, max 8000).`, min: 200, max: 8000 },
    ],
    outputDescription: "The item's title, kind, a locator, and its text (bounded, possibly truncated).",
  },
  run({ id, maxChars }, ctx): ToolRunOutput {
    const limit = maxChars ?? READ_DEFAULT_CHARS;

    const document = ctx.data.documents.find((entry) => entry.id === id);
    if (document) {
      if (document.status !== "ready") {
        return {
          summary: `Document "${document.name}" is ${document.status}; there is no readable text yet.`,
          data: { found: true, kind: "document", id, status: document.status, text: "" },
        };
      }
      const text = document.content.slice(0, limit);
      return {
        summary: `Read ${text.length} of ${document.content.length} characters of document "${document.name}".`,
        data: {
          found: true,
          kind: "document",
          id,
          title: document.name,
          locator: `document:${document.id}`,
          chars: text.length,
          totalChars: document.content.length,
        },
        text,
        truncated: text.length < document.content.length,
      };
    }

    const note = ctx.data.notes.find((entry) => entry.id === id);
    if (note) {
      const text = note.content.slice(0, limit);
      return {
        summary: `Read ${text.length} of ${note.content.length} characters of note "${note.title}".`,
        data: { found: true, kind: "note", id, title: note.title, locator: `note:${note.id}`, chars: text.length, totalChars: note.content.length },
        text,
        truncated: text.length < note.content.length,
      };
    }

    const node = ctx.data.knowledge.find((entry) => entry.id === id);
    if (node) {
      return {
        summary: `Read knowledge node "${node.label}".`,
        data: { found: true, kind: "knowledge", id, title: node.label, type: node.type, locator: `knowledge:${node.id}` },
        text: node.description,
      };
    }

    // An id that matches nothing in the approved workspace is reported as
    // not-found. It is never interpreted as a path, and it never widens the
    // search to anything outside this workspace.
    return { summary: `No item with id "${id}" exists in this workspace.`, data: { found: false, id } };
  },
};

const workspaceStatus: ToolDefinition<Record<string, never>> = {
  name: "workspace.status",
  description:
    "Report the state of this workspace: how many documents are ready, failed or processing, notes, knowledge nodes, stored memory records, open sessions, and the evaluation outcome of the most recent run.",
  sideEffect: "none",
  permission: "workspace:read",
  highImpact: [],
  timeoutMs: 1000,
  maxOutputChars: 4000,
  schema: {
    input: [],
    outputDescription: "Counts by kind, plus the last run's provider, error code, confidence and faithfulness.",
  },
  run(_args, ctx): ToolRunOutput {
    const documents = ctx.data.documents;
    const byStatus = {
      ready: documents.filter((d) => d.status === "ready").length,
      processing: documents.filter((d) => d.status === "processing").length,
      failed: documents.filter((d) => d.status === "failed").length,
    };

    const data = {
      documents: { total: documents.length, ...byStatus },
      notes: ctx.data.notes.length,
      knowledgeNodes: ctx.data.knowledge.length,
      memory: ctx.data.memory,
      sessions: ctx.data.tabCount,
      lastRun: ctx.data.lastRun,
    };

    return {
      summary: ctx.data.lastRun
        ? `Workspace: ${documents.length} document(s), ${ctx.data.notes.length} note(s), ${ctx.data.knowledge.length} knowledge node(s). Last run: ${ctx.data.lastRun.provider}${ctx.data.lastRun.errorCode ? ` failed with ${ctx.data.lastRun.errorCode}` : " completed"}.`
        : `Workspace: ${documents.length} document(s), ${ctx.data.notes.length} note(s), ${ctx.data.knowledge.length} knowledge node(s). No run recorded yet.`,
      data,
    };
  },
};

const evidenceRetrieve: ToolDefinition<{ query: string; limit?: number }> = {
  name: "evidence.retrieve",
  description:
    "Retrieve the passages of this workspace's documents that best match a query, using the same chunking and scoring the pipeline uses. Returns locators so a claim can be traced back to its source.",
  sideEffect: "none",
  permission: "evidence:read",
  highImpact: [],
  timeoutMs: 6000,
  maxOutputChars: 60_000,
  schema: {
    input: [
      { name: "query", type: "string", required: true, description: "What to find evidence for.", minLength: 1, maxLength: 300 },
      { name: "limit", type: "number", required: false, description: "Maximum passages (default 6, max 8).", min: 1, max: 8 },
    ],
    outputDescription: "Ranked passages with score, source name and locator; passages are untrusted text.",
  },
  run({ query, limit }, ctx): ToolRunOutput {
    const documents = readyDocuments(ctx.data.documents);
    if (documents.length === 0) {
      return {
        summary: "No ready documents in this workspace, so there is no evidence to retrieve.",
        data: { query, passages: [], note: "No ready documents." },
      };
    }

    const { corpus } = buildCorpusFrom({
      documentParts: documents.map((document) => ({ documentId: document.id, name: document.name, text: document.content })),
    });
    const scored = scoreChunks(query, corpus);
    const top = rerankChunks(scored, limit ?? 6);

    const passages = top.map((chunk) => ({
      chunkId: chunk.id,
      score: Number(chunk.score.toFixed(4)),
      source: chunk.source,
      locator: chunk.location ? formatLocator(chunk.location) : chunk.source,
      text: chunk.text.slice(0, PASSAGE_MAX_CHARS),
      truncated: chunk.text.length > PASSAGE_MAX_CHARS,
    }));

    return {
      summary:
        passages.length === 0
          ? "No passage in this workspace's documents matched the query."
          : `${passages.length} passage(s) retrieved from ${documents.length} document(s).`,
      data: { query, passages, candidates: corpus.length },
      text: passages.map((passage) => `[${passage.locator}] ${passage.text}`).join("\n\n"),
      truncated: passages.some((passage) => passage.truncated),
    };
  },
};

const calculate: ToolDefinition<{ expression: string }> = {
  name: "calculate",
  description:
    "Evaluate a constrained arithmetic expression (numbers, + - * / % ^, parentheses). No variables, no functions, no host access.",
  sideEffect: "none",
  permission: "compute:local",
  highImpact: [],
  timeoutMs: 1000,
  maxOutputChars: 2000,
  schema: {
    input: [
      { name: "expression", type: "string", required: true, description: "Arithmetic only, e.g. (1200*3)/7.", minLength: 1, maxLength: 200 },
    ],
    outputDescription: "The numeric result of the expression.",
  },
  run({ expression }): ToolRunOutput {
    const result = evaluateExpression(expression);
    if (!result.ok) throw new Error(result.error);
    return {
      summary: `${expression.trim()} = ${result.value}`,
      data: { expression: expression.trim(), value: result.value },
    };
  },
};

const numbersStats: ToolDefinition<{ values: number[]; precision?: number }> = {
  name: "numbers.stats",
  description: "Summarise a list of numbers: count, sum, minimum, maximum, mean and median.",
  sideEffect: "none",
  permission: "compute:local",
  highImpact: [],
  timeoutMs: 1000,
  maxOutputChars: 2000,
  schema: {
    input: [
      { name: "values", type: "number[]", required: true, description: "The numbers to summarise.", maxItems: 500 },
      { name: "precision", type: "number", required: false, description: "Decimals in the result (default 6).", min: 0, max: 6 },
    ],
    outputDescription: "Summary statistics for the list.",
  },
  run({ values, precision }): ToolRunOutput {
    const result = summariseNumbers(values, precision ?? 6);
    if (!result.ok) throw new Error(result.error);
    const s = result.summary;
    return {
      summary: `n=${s.count} sum=${s.sum} min=${s.min} max=${s.max} mean=${s.mean} median=${s.median}`,
      data: s,
    };
  },
};

/**
 * Search this workspace's memory records.
 *
 * Memory is where the operator's own statements, established facts and model
 * inferences live, and each record carries the epistemic status and the origin note
 * that say how much it is worth. A task that cannot read them would have to
 * re-derive what the workspace already knows.
 *
 * The tool is read-only even though memory is writable: it reports records and
 * never touches them. In particular it does not update `lastRetrievedAt`, because
 * a tool that wrote while it read would stop being a read-only tool.
 */
const memorySearch: ToolDefinition<{ query: string; limit?: number }> = {
  name: "memory.search",
  description:
    "Search this workspace's memory records by term, and return each match with its category, epistemic status and origin note.",
  sideEffect: "none",
  permission: "workspace:read",
  highImpact: [],
  timeoutMs: 3000,
  maxOutputChars: 30_000,
  schema: {
    input: [
      { name: "query", type: "string", required: true, description: "The term or phrase to look for.", minLength: 1, maxLength: 200 },
      { name: "limit", type: "number", required: false, description: "Maximum records (default 8).", min: 1, max: 20 },
    ],
    outputDescription: "Ranked memory records: id, category, status, origin note, retention and the matching excerpt.",
  },
  run({ query, limit }, ctx): ToolRunOutput {
    const records = ctx.data.memory.records;
    if (records.length === 0) {
      return {
        summary: "No memory records are available for this workspace.",
        data: { query, hits: [], totalMatches: 0, note: "No memory records." },
      };
    }

    const terms = queryTerms(query);
    if (terms.length === 0) {
      return {
        summary: `"${query.trim()}" contains no searchable term.`,
        data: { query, hits: [], totalMatches: 0 },
      };
    }

    const scored = records
      .map((record) => {
        const haystack = `${record.content} ${record.tags.join(" ")}`;
        const distinct = terms.filter((term) => haystack.toLowerCase().includes(term)).length;
        const mentions = terms.reduce((total, term) => total + occurrences(haystack, term), 0);
        // Distinct terms first: a record that covers more of the question is a
        // better answer than one that repeats a single word.
        return { record, score: distinct * 2 + mentions, distinct };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || b.record.updatedAt - a.record.updatedAt || a.record.id.localeCompare(b.record.id));

    const kept = scored.slice(0, limit ?? 8);
    const hits = kept.map(({ record, score, distinct }) => ({
      kind: "memory",
      id: record.id,
      title: `${record.category} · ${record.status} · ${record.origin}`,
      excerpt: excerptAround(record.content, terms[0]) ?? record.content.slice(0, EXCERPT_RADIUS * 2),
      occurrences: score,
      score: Number(score.toFixed(4)),
      status: record.status,
      origin: record.origin,
      originNote: record.originNote,
      retention: record.retention,
      matchedTerms: distinct,
      updatedAt: record.updatedAt,
    }));

    return {
      summary:
        hits.length === 0
          ? `No memory record matched "${query.trim()}".`
          : `${hits.length} memory record(s) matched "${query.trim()}" (of ${records.length} record(s) in this workspace).`,
      // Records are untrusted text: the panel and the task store treat this as data.
      data: { query: query.trim(), hits, totalMatches: scored.length, searched: records.length },
      text: hits
        .map(
          (hit) =>
            `[memory ${hit.id} · ${hit.status} · ${hit.origin}] ${hit.excerpt}${hit.originNote ? ` (origin: ${hit.originNote})` : ""}`,
        )
        .join("\n"),
    };
  },
};

/**
 * The registry. Frozen in the sense that matters: the exported view is read-only,
 * the map is built once at module load, and the only mutation path is the
 * test-gated seam below. A proposal can only look a tool up.
 */
const registry = new Map<string, ToolDefinition>(
  [workspaceSearch, workspaceRead, workspaceStatus, evidenceRetrieve, memorySearch, calculate, numbersStats].map((tool) => [
    tool.name,
    tool,
  ]),
);

export const TOOL_REGISTRY: ReadonlyMap<string, ToolDefinition> = registry;

export function findTool(name: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.get(name);
}

export function listTools(): ToolDefinition[] {
  return [...TOOL_REGISTRY.values()];
}

/** Every permission any registered tool requires. Arguments cannot extend this. */
export function registeredPermissions(): string[] {
  return [...new Set(listTools().map((tool) => tool.permission))].sort();
}

/**
 * Test seam. A tool may only be added to the registry when the build is a test
 * build — the production bundle cannot register anything at runtime, so neither a
 * model nor a stray import can extend the registry. An architecture guard checks
 * that this gate is present, and the registry is otherwise closed.
 */
export function registerToolForTests(tool: ToolDefinition): void {
  if (!isTestBuild()) throw new Error("tools can only be registered in a test build");
  registry.set(tool.name, tool);
}

export function unregisterToolForTests(name: string): void {
  if (!isTestBuild()) throw new Error("tools can only be removed in a test build");
  registry.delete(name);
}

function isTestBuild(): boolean {
  const env = (import.meta as { env?: { MODE?: string } }).env;
  return env?.MODE === "test";
}
