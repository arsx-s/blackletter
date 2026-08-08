import { generateStream } from "../providers/provider";
import type {
  AgentId,
  AgentStatus,
  AgentContext,
  AgentResult,
  AgentActivity,
  AgentCapability,
  AgentDefinition,
} from "./types";

export abstract class BaseAgent {
  abstract readonly id: AgentId;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly capabilities: AgentCapability[];
  abstract readonly systemPrompt: string;

  protected status: AgentStatus = "idle";
  protected lastActivity: AgentActivity | null = null;

  protected async callAI(prompt: string, system?: string, fileContent?: string): Promise<string> {
    let result = "";
    try {
      for await (const chunk of generateStream({
        prompt,
        systemInstruction: system || this.systemPrompt,
        fileContent,
      })) {
        result += chunk;
      }
    } catch (e) {
      console.error(`[${this.id}] AI call failed:`, e);
      throw e;
    }
    return result;
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    this.status = "running";
    const startedAt = Date.now();

    const activity: AgentActivity = {
      agentId: this.id,
      agentName: this.name,
      status: "running",
      startedAt,
    };

    if (context.transparency) {
      context.activityLog.push(activity);
    }

    try {
      const contextUpdates = await this.process(context);
      this.status = "success";
      activity.status = "success";
      activity.completedAt = Date.now();
      activity.summary = this.getActivitySummary(contextUpdates);

      if (context.transparency) {
        const idx = context.activityLog.findIndex((a) => a.agentId === this.id && a.status === "running");
        if (idx >= 0) context.activityLog[idx] = activity;
      }

      this.lastActivity = activity;
      return { agentId: this.id, success: true, contextUpdates, activity };
    } catch (e) {
      this.status = "error";
      activity.status = "error";
      activity.completedAt = Date.now();
      activity.summary = `Error: ${e instanceof Error ? e.message : "Unknown error"}`;

      if (context.transparency) {
        const idx = context.activityLog.findIndex((a) => a.agentId === this.id && a.status === "running");
        if (idx >= 0) context.activityLog[idx] = activity;
      }

      this.lastActivity = activity;
      return {
        agentId: this.id,
        success: false,
        contextUpdates: {},
        activity,
        error: e instanceof Error ? e.message : "Unknown error",
      };
    }
  }

  protected abstract process(context: AgentContext): Promise<Partial<AgentContext>>;

  protected getActivitySummary(_updates: Partial<AgentContext>): string {
    return "Completed";
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  getLastActivity(): AgentActivity | null {
    return this.lastActivity;
  }

  getDefinition(): AgentDefinition {
    const def = this.getRequiredContext();
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      capabilities: this.capabilities,
      requiredContext: def.required,
      producedContext: def.produced,
    };
  }

  protected getRequiredContext(): { required?: (keyof AgentContext)[]; produced?: (keyof AgentContext)[] } {
    return {};
  }
}
