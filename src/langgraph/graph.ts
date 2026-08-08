import type { GraphState, GraphDefinition, GraphRunResult, GraphNode } from "./types";
import type { TraceStageId } from "../pipeline/trace";
import { stageNameFor } from "../pipeline/trace";
import { reduceState } from "./state";
import { getReadableError } from "../lib/error-utils";
import { log, logError } from "./logger";
import { UserInputNode } from "./nodes/UserInputNode";
import { IntentNode } from "./nodes/IntentNode";
import { SubjectNode } from "./nodes/SubjectNode";
import { RouterNode, getNextAfterRouter } from "./nodes/RouterNode";
import { DocumentNode } from "./nodes/DocumentNode";
import { LearningProfileNode } from "./nodes/LearningProfileNode";
import { KnowledgeGapNode } from "./nodes/KnowledgeGapNode";
import { PromptBuilderNode } from "./nodes/PromptBuilderNode";
import { LLMNode } from "./nodes/LLMNode";
import { QualityNode } from "./nodes/QualityNode";
import { FormatterNode } from "./nodes/FormatterNode";
import { ReportNode } from "./nodes/ReportNode";
import { RetrievalNode } from "./nodes/RetrievalNode";
import { EvaluationNode } from "./nodes/EvaluationNode";

const blackLetterGraph: GraphDefinition = {
  nodes: {
    UserInputNode: UserInputNode as GraphNode,
    IntentNode: IntentNode as GraphNode,
    SubjectNode: SubjectNode as GraphNode,
    RouterNode: RouterNode as GraphNode,
    DocumentNode: DocumentNode as GraphNode,
    LearningProfileNode: LearningProfileNode as GraphNode,
    KnowledgeGapNode: KnowledgeGapNode as GraphNode,
    RetrievalNode: RetrievalNode as GraphNode,
    PromptBuilderNode: PromptBuilderNode as GraphNode,
    LLMNode: LLMNode as GraphNode,
    QualityNode: QualityNode as GraphNode,
    EvaluationNode: EvaluationNode as GraphNode,
    FormatterNode: FormatterNode as GraphNode,
    ReportNode: ReportNode as GraphNode,
  },
  edges: [
    { from: "UserInputNode", to: "IntentNode" },
    { from: "IntentNode", to: "SubjectNode" },
    { from: "SubjectNode", to: "RouterNode" },
    { from: "RouterNode", to: getNextAfterRouter },
    { from: "DocumentNode", to: "LearningProfileNode" },
    { from: "LearningProfileNode", to: "KnowledgeGapNode" },
    { from: "KnowledgeGapNode", to: "RetrievalNode" },
    { from: "RetrievalNode", to: "PromptBuilderNode" },
    { from: "PromptBuilderNode", to: "LLMNode" },
    { from: "LLMNode", to: "QualityNode" },
    { from: "QualityNode", to: "EvaluationNode" },
    { from: "EvaluationNode", to: "FormatterNode" },
    { from: "FormatterNode", to: "ReportNode" },
  ],
  start: "UserInputNode",
  end: ["ReportNode"],
};

export function createBlackLetterGraph() {
  return createStateMachine(blackLetterGraph);
}

const NODE_STAGE: Record<string, TraceStageId> = {
  IntentNode: "intent",
  SubjectNode: "subject",
  DocumentNode: "document",
  LearningProfileNode: "profile",
  KnowledgeGapNode: "gaps",
  PromptBuilderNode: "prompt",
  LLMNode: "openrouter",
  QualityNode: "quality",
  FormatterNode: "formatting",
  ReportNode: "report",
};

export function createStateMachine(def: GraphDefinition) {
  const { nodes, edges, start, end } = def;

  async function execute(
    initialState: GraphState,
  ): Promise<GraphRunResult> {
    let state = { ...initialState };
    const visitedNodes: string[] = [];
    const executionTimes: Record<string, number> = {};
    let currentNode = start;
    const maxIterations = 100;
    let iteration = 0;

    log("GRAPH", `Starting execution at node "${start}"`);
    log("GRAPH", `Input prompt: "${state.userPrompt.slice(0, 80)}..."`);

    while (iteration < maxIterations) {
      iteration++;
      const nodeName = currentNode;
      const nodeFn = nodes[nodeName];

      if (!nodeFn) {
        const err = `Node "${nodeName}" not found in graph definition`;
        logError("GRAPH", err);
        state.errors.push(err);
        return { state, visitedNodes, executionTimes, finalNode: nodeName, success: false, error: err };
      }

      visitedNodes.push(nodeName);
      state.visitedNodes = [...visitedNodes];

      const startTime = performance.now();
      log("NODE", `>>> ENTER "${nodeName}"`);

      const stageId = NODE_STAGE[nodeName];
      const isSelfTraced = nodeName === "RetrievalNode" || nodeName === "EvaluationNode";
      if (stageId) {
        state.trace.start(stageId, stageNameFor(stageId));
      }

      try {
        const result = await nodeFn(state);
        const elapsed = Math.round(performance.now() - startTime);
        executionTimes[nodeName] = elapsed;

        log("NODE", `<<< LEAVE "${nodeName}" — ${elapsed}ms`);
        if (elapsed > 1000) {
          log("NODE", `    ⚠ ${nodeName} took ${(elapsed / 1000).toFixed(1)}s`);
        }

        if ("error" in result && typeof result.error === "string") {
          logError("NODE", `"${nodeName}" returned error: ${result.error}`);
          state.errors.push(result.error);
          if (stageId) state.trace.fail(stageId, result.error);
          const errorCode = (result as { errorCode?: string }).errorCode;
          return { state, visitedNodes, executionTimes, finalNode: nodeName, success: false, error: result.error, errorCode };
        }

        state = reduceState(state, result as Partial<GraphState>);

        if (end.includes(nodeName)) {
          log("GRAPH", `Reached end node "${nodeName}" — execution complete`);
          if (!isSelfTraced && stageId) state.trace.end(stageId, { durationMs: elapsed });
          state.trace.start("response", "Response");
          state.trace.end("response", { totalMs: state.trace.totalMs() });
          return { state, visitedNodes, executionTimes, finalNode: nodeName, success: true };
        }

        if (stageId && !isSelfTraced) {
          state.trace.end(stageId, { durationMs: elapsed });
        }

        const edge = edges.find((e) => e.from === nodeName);
        if (!edge) {
          if (end.includes(nodeName)) {
            return { state, visitedNodes, executionTimes, finalNode: nodeName, success: true };
          }
          const err = `No edge defined from node "${nodeName}"`;
          logError("GRAPH", err);
          state.errors.push(err);
          return { state, visitedNodes, executionTimes, finalNode: nodeName, success: false, error: err };
        }

        if (typeof edge.to === "function") {
          currentNode = edge.to(state);
          log("ROUTER", `"${nodeName}" → "${currentNode}"`);
        } else {
          currentNode = edge.to;
          log("EDGE", `"${nodeName}" → "${currentNode}"`);
        }
      } catch (e) {
        const elapsed = Math.round(performance.now() - startTime);
        executionTimes[nodeName] = elapsed;
        const msg = getReadableError(e);
        const thrownCode = (e as { code?: string })?.code ?? (e as { errorCode?: string })?.errorCode;
        logError("NODE", `"${nodeName}" threw: ${msg}`, e);
        state.errors.push(msg);
        if (stageId) state.trace.fail(stageId, msg);
        return { state, visitedNodes, executionTimes, finalNode: nodeName, success: false, error: msg, errorCode: thrownCode ?? "SERVER" };
      }
    }

    const err = `Max iterations (${maxIterations}) exceeded — possible infinite loop`;
    logError("GRAPH", err);
    state.errors.push(err);
    return { state, visitedNodes, executionTimes, finalNode: currentNode, success: false, error: err };
  }

  return { execute, definition: def };
}
