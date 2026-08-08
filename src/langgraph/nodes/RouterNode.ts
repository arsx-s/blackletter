import type { GraphState } from "../types";
import { log } from "../logger";

export async function RouterNode(state: GraphState): Promise<Partial<GraphState>> {
  const hasDocuments = state.uploadedDocuments.length > 0;
  log("ROUTER", `RouterNode evaluated: ${hasDocuments ? "documents present" : "no documents"}`);
  return {};
}

export function getNextAfterRouter(state: GraphState): string {
  const hasDocuments = state.uploadedDocuments.length > 0;
  log("ROUTER", `RouterNode → ${hasDocuments ? "DocumentNode" : "LearningProfileNode"}`);
  return hasDocuments ? "DocumentNode" : "LearningProfileNode";
}
