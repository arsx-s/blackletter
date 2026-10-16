/**
 * Tool schemas and the shapes that pass between the registry, the policy
 * gateway, the executor, and the audit trail.
 *
 * The rule the whole module is built around: **a prompt is not a security
 * boundary.** The model may *propose* a call; nothing in this directory treats a
 * proposal as permission. Every field a proposal carries is data, and the only
 * thing that decides whether a call runs is `src/tools/policy.ts`.
 */

/** What a tool is allowed to do to the world. Read-only tools are `none`. */
export type SideEffect = "none" | "local-write" | "external";

/** Grants a task holds. A tool names exactly one; arguments can never add any. */
export type Permission = "workspace:read" | "evidence:read" | "compute:local";

/** The actions the pack requires explicit approval for. None is implemented yet. */
export type HighImpactKind =
  | "file-write"
  | "package-install"
  | "network-access"
  | "message-send"
  | "publish"
  | "payment"
  | "permission-change"
  | "deployment";

export type ToolFieldType = "string" | "number" | "string[]" | "number[]";

export interface ToolFieldSpec {
  name: string;
  type: ToolFieldType;
  required: boolean;
  description: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  maxItems?: number;
}

export interface ToolSchemas {
  /** Field-by-field input contract. Unknown fields are rejected, not ignored. */
  input: ToolFieldSpec[];
  /** Human description of the output, shown in the panel. */
  outputDescription: string;
}

export interface ToolDefinition<A extends Record<string, unknown> = Record<string, unknown>> {
  name: string;
  description: string;
  sideEffect: SideEffect;
  permission: Permission;
  /**
   * High-impact actions this tool would perform. Empty for every tool in this
   * build; a non-empty list means the policy gateway requires an explicit
   * operator approval before any execution, and cannot be self-granted.
   */
  highImpact: HighImpactKind[];
  /** Hard per-call timeout. A call that exceeds it is reported as `timeout`. */
  timeoutMs: number;
  /** Hard output cap. Longer output is truncated and the truncation is reported. */
  maxOutputChars: number;
  schema: ToolSchemas;
  /**
   * Runs the validated call. `args` are the *typed* values that passed
   * validation, never the raw proposal. The context carries the approved
   * workspace and the linked abort signal, so a tool can stop cooperatively.
   */
  run(args: A, ctx: ToolRunContext): ToolRunOutput | Promise<ToolRunOutput>;
}

export interface ToolRunContext {
  workspaceId: string;
  /** Aborts when the task is cancelled or the call times out. */
  signal: AbortSignal;
  data: ToolData;
}

export interface ToolRunOutput {
  /** One line the UI can show; never contains a secret. */
  summary: string;
  /** Structured, untrusted result. Sanitised by the executor before display. */
  data: unknown;
  /** Optional untrusted text (documents, passages) for re-prompting. */
  text?: string;
  truncated?: boolean;
}

/*
 * Data the tools may read. Supplied by the caller (the workspace store, or a
 * fixture in tests) so tools never reach into application state themselves.
 */

export interface ToolDocument {
  id: string;
  workspaceId: string;
  name: string;
  content: string;
  status: "processing" | "ready" | "failed";
  addedAt: number;
}

export interface ToolNote {
  id: string;
  workspaceId: string;
  title: string;
  content: string;
  updatedAt: number;
}

export interface ToolKnowledgeNode {
  id: string;
  label: string;
  type: string;
  description: string;
}

/**
 * A memory record as a tool sees it: the content, the epistemic status the operator
 * can act on, and the provenance line that says where it came from.
 *
 * The revision history and the deletion audit are deliberately absent — a tool
 * reads what is currently believed, not how it got there, and it cannot write
 * either. `originNote` is included because a record without its reason would be
 * indistinguishable from a guess once it is out of the memory panel.
 */
export interface ToolMemoryRecord {
  id: string;
  category: string;
  content: string;
  status: string;
  origin: string;
  originNote: string;
  retention: string;
  tags: string[];
  updatedAt: number;
}

export interface ToolRunOutcome {
  runId: string;
  at: number;
  provider: string;
  local: boolean;
  errorCode?: string;
  confidence: number | null;
  faithfulness: number | null;
}

export interface ToolData {
  documents: ToolDocument[];
  notes: ToolNote[];
  knowledge: ToolKnowledgeNode[];
  memory: { total: number; byStatus: Record<string, number>; records: ToolMemoryRecord[] };
  tabCount: number;
  lastRun: ToolRunOutcome | null;
}

/** Where a proposal came from. Both are untrusted; both pass the same gate. */
export type ProposalOrigin = "model" | "operator";

export interface ToolProposal {
  tool: string;
  arguments: Record<string, unknown>;
  reason?: string;
  origin: ProposalOrigin;
}

export type PolicyDecision = "allow" | "deny" | "needs-approval";

export type PolicyCode =
  | "allowed"
  | "unknown-tool"
  | "invalid-arguments"
  | "permission-not-granted"
  | "high-impact-requires-approval"
  | "not-approved"
  | "budget-exhausted"
  | "repeated-call"
  | "cancelled"
  | "timeout"
  | "tool-error"
  | "internal-error"
  /** The global stop is engaged: a system condition, not a property of the call. */
  | "stopped";

export interface PolicyOutcome {
  decision: PolicyDecision;
  code: PolicyCode;
  /** Safe to show and to log: it never contains document or note content. */
  reason: string;
}

export type ToolResultStatus = "ok" | "error" | "timeout" | "cancelled" | "denied" | "needs-approval";

export interface ToolOutcome {
  status: ToolResultStatus;
  decision: PolicyDecision;
  code: PolicyCode;
  reason: string;
  tool: string;
  /** Present only when the tool actually ran and returned. */
  result?: ToolRunOutput;
  /** Sequence number of the audit entry that records this call. */
  auditSeq: number;
}

export interface ToolBudgetLimits {
  maxCalls: number;
  maxWallMs: number;
  maxOutputChars: number;
  maxRetries: number;
  /** Identical (tool, arguments) pairs allowed before the call is refused. */
  maxIdenticalCalls: number;
}

export interface ToolBudgetState extends ToolBudgetLimits {
  calls: number;
  wallMs: number;
  outputChars: number;
  retries: number;
}

/**
 * Defaults for a research task. Character counts stand in for tokens: no
 * tokenizer is available offline, and inventing a token count would be a
 * fabricated measurement.
 */
export const TOOL_BUDGET_LIMITS: ToolBudgetLimits = {
  maxCalls: 12,
  maxWallMs: 60_000,
  maxOutputChars: 200_000,
  maxRetries: 1,
  maxIdenticalCalls: 3,
};

export function freshBudget(limits: Partial<ToolBudgetLimits> = {}): ToolBudgetState {
  return {
    ...TOOL_BUDGET_LIMITS,
    ...limits,
    calls: 0,
    wallMs: 0,
    outputChars: 0,
    retries: 0,
  };
}
