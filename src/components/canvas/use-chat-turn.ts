import { useCallback, useState } from "react";
import { workspaceStore } from "../../stores/use-workspace";
import { runPipeline } from "../../pipeline";
import {
  parseReportSections,
  extractEntities,
  extractTimeline,
  extractNotes,
  extractFollowUpQuestions,
} from "../../lib/research";
import { getReadableError } from "../../lib/error-utils";

function deriveTitle(topic: string): string {
  const clean = topic.trim().replace(/\s+/g, " ");
  if (!clean) return "Untitled Research";
  return clean.length > 48 ? clean.slice(0, 48).trim() + "…" : clean;
}

export function useChatTurn(): { running: boolean; run: (tabId: string, prompt: string) => Promise<boolean> } {
  const [running, setRunning] = useState(false);

  const run = useCallback(async (tabId: string, prompt: string): Promise<boolean> => {
    const current = workspaceStore.getState().tabs.find((t) => t.id === tabId);
    if (!current || !prompt.trim()) return false;
    setRunning(true);

    workspaceStore.updateTab(tabId, {
      phase: "researching",
      streaming: true,
      pipelineStage: 0,
      topic: prompt,
      error: null,
      messages: [...current.messages, { role: "user", content: prompt, timestamp: Date.now() }],
    });
    workspaceStore.pushTabEvent(tabId, "started", `Started research on "${prompt.slice(0, 60)}"`);

    const workspaceId = current.workspaceId;
    const files = current.documentIds
      .map((id) => workspaceStore.getState().documents.find((d) => d.id === id))
      .filter((d): d is NonNullable<typeof d> => d !== undefined && d.content !== "")
      .map((doc) => new File([doc.content], `${doc.name}.txt`, { type: "text/plain" }));

    const history = current.messages.map((m) => ({ role: m.role, content: m.content }));
    const resolution = workspaceStore.resolveFollowupQuery(workspaceId, prompt);

    try {
      const result = await runPipeline({
        prompt: resolution.prompt,
        files,
        history,
        subject: resolution.isFollowup && resolution.subjectHint ? resolution.subjectHint : current.subject,
        mode: current.mode,
        model: current.model,
        knowledgeContext: workspaceStore.graphContextFor(prompt),
        temperature: workspaceStore.getState().prefs.temperature,
        maxTokens: workspaceStore.getState().prefs.maxTokens,
        workspaceId,
        tabId,
        memoryContext: workspaceStore.memoryContextFor(workspaceId),
        canvasContext: workspaceStore.canvasContextFor(workspaceId),
        metadata: { researchMode: current.mode, followupKind: resolution.kind },
      });

      const reportText = result.response;
      if (!reportText || !reportText.trim() || reportText.trim() === prompt.trim()) {
        throw new Error("AI returned an empty or echoed response. Please try again.");
      }
      const fresh = workspaceStore.getState().tabs.find((t) => t.id === tabId);
      workspaceStore.updateTab(tabId, {
        phase: "complete",
        streaming: false,
        pipelineStage: -1,
        sections: parseReportSections(reportText),
        fullText: reportText,
        entities: extractEntities(reportText),
        timelineEvents: extractTimeline(reportText),
        notes: extractNotes(reportText),
        followUps: extractFollowUpQuestions(reportText),
        difficulty: result.difficulty || "intermediate",
        title: fresh && fresh.title && fresh.title !== "Untitled Research" ? fresh.title : deriveTitle(prompt),
        intelligence: result.intelligence
          ? {
              ...result.intelligence,
              retrievedChunks: (result.intelligence.retrievedChunks ?? []).slice(0, 4).map((c) => ({ ...c, text: c.text.slice(0, 400) })),
            }
          : undefined,
        messages: fresh
          ? [...fresh.messages, { role: "assistant", content: `Research complete — ${reportText.length.toLocaleString()} chars.`, timestamp: Date.now() }]
          : undefined,
      });
      workspaceStore.deriveGraphFromTab(tabId);
      workspaceStore.rememberExchange(workspaceId, prompt, reportText);
      workspaceStore.pushTabEvent(tabId, "completed", `Completed in ${Math.round(result.telemetry?.totalMs ?? 0)}ms`);
      return true;
    } catch (e) {
      workspaceStore.updateTab(tabId, {
        phase: "complete",
        streaming: false,
        error: { code: (e as { code?: string })?.code || "SERVER", message: getReadableError(e) },
      });
      workspaceStore.pushTabEvent(tabId, "failed", `Failed: ${getReadableError(e)}`);
      return false;
    } finally {
      setRunning(false);
    }
  }, []);

  return { running, run };
}
