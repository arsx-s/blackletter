/**
 * The tool layer's public surface.
 *
 * `src/tools` owns: the registry of read-only tools, the policy gateway that
 * decides whether a call may run, the executor that runs it, the proposal parser,
 * and the audit trail. It deliberately does **not** import a model adapter, the
 * graph, or the UI, and an architecture guard keeps it that way — the provider
 * layer cannot call a tool, and a model's text cannot become a capability.
 */

export type {
  HighImpactKind,
  Permission,
  PolicyCode,
  PolicyDecision,
  PolicyOutcome,
  ProposalOrigin,
  SideEffect,
  ToolBudgetLimits,
  ToolBudgetState,
  ToolData,
  ToolDefinition,
  ToolFieldSpec,
  ToolOutcome,
  ToolProposal,
  ToolResultStatus,
  ToolRunContext,
  ToolRunOutput,
} from "./types";
export { TOOL_BUDGET_LIMITS, freshBudget } from "./types";

export { TOOL_REGISTRY, findTool, listTools, registeredPermissions } from "./registry";
export { evaluateToolCall, type PolicyEvaluation, type PolicyRequest } from "./policy";
export {
  createToolTask,
  emptyToolData,
  previewDecision,
  runProposal,
  type CreateTaskOptions,
  type RunProposalOptions,
  type ToolTask,
} from "./executor";
export {
  ACTION_BLOCK_CLOSE,
  ACTION_BLOCK_OPEN,
  MAX_PROPOSAL_BLOCK_CHARS,
  containsActionBlock,
  neutraliseActionBlocks,
  observeProposals,
  parseProposal,
  type ObservationContext,
  type ProposalParse,
} from "./proposals";
export {
  MAX_TOOL_AUDIT,
  appendToolAudit,
  clearToolAudit,
  loadToolAudit,
  subscribeToolAudit,
  toolAuditDroppedCount,
  toolAuditEntries,
  type ToolAuditEntry,
  type ToolAuditResult,
} from "./audit";
export { proposalDigest, summariseArguments, validateArguments } from "./validation";
export { MAX_EXPRESSION_CHARS, MAX_STAT_VALUES, evaluateExpression, summariseNumbers } from "./calculators";
