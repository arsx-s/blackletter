import type { PipelineContext } from "./types";

export interface DecisionResult {
  runDocumentEngine: boolean;
}

export async function executeDecision(ctx: PipelineContext): Promise<DecisionResult> {
  const hasFiles = ctx.input.files && ctx.input.files.length > 0;
  return { runDocumentEngine: !!hasFiles };
}
