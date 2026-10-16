/**
 * Structured action proposals.
 *
 * Neither provider's tool-calling support is verified, so the app does not
 * pretend to speak a native tool protocol. Instead a model may emit one explicit
 * block:
 *
 * ```text
 * <blackletter-action>
 * {"tool": "workspace.search", "arguments": {"query": "reactor"}, "reason": "check the log"}
 * </blackletter-action>
 * ```
 *
 * Three rules make that safe to parse:
 *
 *   1. **Only an explicit block is a proposal.** Arbitrary prose is never read as
 *      an instruction, so "you should now delete everything" is just text.
 *   2. **Parsing is not permission.** A parsed proposal is still untrusted data;
 *      it goes through the same policy gateway as an operator-authored one.
 *   3. **Tool output is neutralised.** Text that came *from a tool* (a document, a
 *      passage) is passed through `neutraliseActionBlocks` before it can be seen
 *      by a model again, so a document containing a fake action block cannot
 *      smuggle a proposal back in through retrieval.
 */

import { digestValue } from "../lib/hash";
import { appendToolAudit, type ToolAuditEntry } from "./audit";
import type { ProposalOrigin, ToolProposal } from "./types";

export const ACTION_BLOCK_OPEN = "<blackletter-action>";
export const ACTION_BLOCK_CLOSE = "</blackletter-action>";
/** A proposal larger than this is refused without being parsed. */
export const MAX_PROPOSAL_BLOCK_CHARS = 4000;

const ALLOWED_KEYS = new Set(["tool", "arguments", "reason"]);

export interface ProposalParse {
  /** True when a block was present at all, even if it could not be read. */
  present: boolean;
  proposal: ToolProposal | null;
  /** Safe, specific reason a present block was not usable. */
  problem?: string;
}

export function containsActionBlock(text: string): boolean {
  return typeof text === "string" && text.includes(ACTION_BLOCK_OPEN);
}

/**
 * Parse the first action block in `text`. `text` must be the model's own
 * response — never tool output, which is neutralised before it is re-shown.
 */
export function parseProposal(text: string, origin: ProposalOrigin = "model"): ProposalParse {
  if (typeof text !== "string" || !containsActionBlock(text)) {
    return { present: false, proposal: null };
  }

  const start = text.indexOf(ACTION_BLOCK_OPEN);
  const end = text.indexOf(ACTION_BLOCK_CLOSE, start + ACTION_BLOCK_OPEN.length);
  if (end < 0) {
    return { present: true, proposal: null, problem: "the action block was never closed" };
  }

  const body = text.slice(start + ACTION_BLOCK_OPEN.length, end).trim();
  if (body.length === 0) return { present: true, proposal: null, problem: "the action block was empty" };
  if (body.length > MAX_PROPOSAL_BLOCK_CHARS) {
    return { present: true, proposal: null, problem: `the action block is larger than ${MAX_PROPOSAL_BLOCK_CHARS} characters` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { present: true, proposal: null, problem: "the action block is not valid JSON" };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { present: true, proposal: null, problem: "the action block must contain a JSON object" };
  }

  const record = parsed as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_KEYS.has(key)) {
      return { present: true, proposal: null, problem: `the action block contains an unknown field "${key}"` };
    }
  }

  if (typeof record.tool !== "string" || record.tool.trim().length === 0) {
    return { present: true, proposal: null, problem: 'the action block needs a non-empty "tool" name' };
  }
  if (record.tool.length > 80) {
    return { present: true, proposal: null, problem: 'the "tool" name is longer than 80 characters' };
  }

  if (record.arguments !== undefined && (typeof record.arguments !== "object" || record.arguments === null || Array.isArray(record.arguments))) {
    return { present: true, proposal: null, problem: '"arguments" must be a JSON object' };
  }

  if (record.reason !== undefined && (typeof record.reason !== "string" || record.reason.length > 300)) {
    return { present: true, proposal: null, problem: '"reason" must be a string of at most 300 characters' };
  }

  return {
    present: true,
    proposal: {
      tool: record.tool.trim(),
      arguments: (record.arguments as Record<string, unknown> | undefined) ?? {},
      reason: record.reason as string | undefined,
      origin,
    },
  };
}

/**
 * Make tool output safe to show or to re-prompt: a marker inside it is rewritten
 * so it can never be parsed as a proposal. The text is otherwise unchanged, so a
 * document that *discusses* the marker is not silently censored — it just stops
 * being executable.
 */
export function neutraliseActionBlocks(text: string): string {
  if (typeof text !== "string") return "";
  return text.split(ACTION_BLOCK_OPEN).join("[blackletter-action]").split(ACTION_BLOCK_CLOSE).join("[/blackletter-action]");
}

export interface ObservationContext {
  workspaceId: string;
  tabId: string;
  runId: string;
}

/**
 * Record a proposal seen in a model response. Nothing is executed: execution is
 * a separate, deliberate step (`runProposal`, driven by the operator or by a
 * task loop that holds a budget). The audit entry says exactly that.
 */
export function observeProposals(text: string, ctx: ObservationContext): ToolAuditEntry[] {
  const parsed = parseProposal(text);
  if (!parsed.present) return [];

  const base = {
    at: Date.now(),
    taskId: `run:${ctx.runId}`,
    workspaceId: ctx.workspaceId,
    by: "model" as const,
    decision: "observed" as const,
    code: "observed-not-executed" as const,
  };

  if (!parsed.proposal) {
    return [
      appendToolAudit({
        ...base,
        tool: "(unreadable)",
        argsDigest: digestValue({ problem: parsed.problem ?? "unknown" }),
        argSummary: "",
        reason: `a proposal was present but not executed: ${parsed.problem ?? "unknown problem"}`,
      }),
    ];
  }

  return [
    appendToolAudit({
      ...base,
      tool: parsed.proposal.tool,
      argsDigest: digestValue(parsed.proposal.arguments),
      argSummary: "",
      reason: "recorded from the model's response; not executed. A proposal is a request, not a permission.",
    }),
  ];
}
