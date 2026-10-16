/**
 * The policy gateway.
 *
 * This is the only thing that decides whether a proposed tool call runs. It does
 * not import the registry (the caller passes the tool definition in), it does not
 * import a model adapter, and it holds no state: `evaluateToolCall` is a pure
 * function of the proposal, the grants the task holds, the budget, and the calls
 * already made.
 *
 * Order matters, and it is this order because it is the least privilege order:
 *
 *   1. the tool must exist;
 *   2. the arguments must match the schema exactly — unknown fields are refused,
 *      which is what stops `{"permissions": ["workspace:write"]}`-style
 *      escalation, because arguments can never become policy;
 *   3. anything high-impact or side-effecting needs an explicit approval;
 *   4. the task must hold the permission the tool requires;
 *   5. the budget must allow another call;
 *   6. the same (tool, arguments) pair may not be repeated without limit.
 *
 * Every refusal returns a code and a reason that is safe to show and to log.
 */

import { proposalDigest, validateArguments } from "./validation";
import type {
  Permission,
  PolicyOutcome,
  ToolBudgetState,
  ToolDefinition,
  ToolProposal,
} from "./types";

export interface PolicyRequest {
  proposal: ToolProposal;
  /** The tool the caller resolved from the registry, if the name is known. */
  tool: ToolDefinition | undefined;
  /** Grants this task holds. A proposal cannot widen them. */
  grants: readonly Permission[];
  budget: ToolBudgetState;
  /** Digests of the calls already made in this task. */
  history: readonly string[];
  /** An approval the operator already gave for this exact call. */
  approval?: { by: string; at: number };
  /** True when this attempt is a retry of a failed call. */
  isRetry?: boolean;
  /**
   * True while the global stop is engaged (Mission 14). The caller passes the
   * real switch's state in; this function stays pure, and the check comes first
   * because a stopped system refuses everything else outright.
   */
  stopped?: boolean;
}

export interface PolicyEvaluation {
  outcome: PolicyOutcome;
  /** Validated arguments; present only when the arguments matched the schema. */
  args?: Record<string, unknown>;
}

function deny(code: PolicyOutcome["code"], reason: string): PolicyEvaluation {
  return { outcome: { decision: "deny", code, reason } };
}

export function evaluateToolCall(request: PolicyRequest): PolicyEvaluation {
  const { proposal, tool, grants, budget, history } = request;

  if (request.stopped) {
    return deny("stopped", "the global stop is engaged; no tool call runs until an operator releases it.");
  }

  if (!tool) {
    return deny("unknown-tool", `"${proposal.tool}" is not a registered tool. Tools are defined in code and cannot be added by a proposal.`);
  }

  const validation = validateArguments(tool, proposal.arguments);
  if (!validation.ok) {
    return deny("invalid-arguments", `${tool.name}: ${validation.reason}.`);
  }

  // High-impact and side-effecting tools require an approval that only the
  // operator can give. There is no self-approval path: the proposal has no field
  // that can carry one.
  const needsApproval = tool.highImpact.length > 0 || tool.sideEffect !== "none";
  if (needsApproval && !request.approval) {
    return {
      outcome: {
        decision: "needs-approval",
        code: "high-impact-requires-approval",
        reason: `${tool.name} would perform ${tool.highImpact.join(", ") || tool.sideEffect}; it runs only with an explicit operator approval.`,
      },
    };
  }

  if (!grants.includes(tool.permission)) {
    return deny(
      "permission-not-granted",
      `${tool.name} requires "${tool.permission}", which this task does not hold. Arguments cannot grant a permission.`,
    );
  }

  if (budget.calls >= budget.maxCalls) {
    return deny("budget-exhausted", `the call budget is exhausted (${budget.calls}/${budget.maxCalls}).`);
  }
  if (budget.wallMs >= budget.maxWallMs) {
    return deny("budget-exhausted", `the time budget is exhausted (${Math.round(budget.wallMs)}/${budget.maxWallMs}ms).`);
  }
  if (budget.outputChars >= budget.maxOutputChars) {
    return deny("budget-exhausted", `the output budget is exhausted (${budget.outputChars}/${budget.maxOutputChars} characters).`);
  }
  if (request.isRetry && budget.retries >= budget.maxRetries) {
    return deny("budget-exhausted", `the retry budget is exhausted (${budget.retries}/${budget.maxRetries}).`);
  }

  const digest = proposalDigest(tool.name, validation.args);
  const repeats = history.filter((entry) => entry === digest).length;
  if (repeats >= budget.maxIdenticalCalls) {
    return deny(
      "repeated-call",
      `the same ${tool.name} call has already been made ${repeats} time(s); the limit is ${budget.maxIdenticalCalls}.`,
    );
  }

  return {
    outcome: {
      decision: "allow",
      code: "allowed",
      reason:
        tool.sideEffect === "none"
          ? `${tool.name} is read-only (${tool.permission}) and within budget.`
          : `${tool.name} was approved by ${request.approval?.by ?? "the operator"} and is within budget.`,
    },
    args: validation.args,
  };
}
