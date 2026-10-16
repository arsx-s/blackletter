import { useCallback, useEffect, useRef, useState } from "react";
import { workspaceStore } from "../../stores/use-workspace";
import { runPipeline } from "../../pipeline";
import { deriveTabRecords, recordDerivedChange } from "../../integrity";
import { getReadableError } from "../../lib/error-utils";
import { isCancelledError } from "../../lib/cancellation";
import { isStopEngaged, loadStop, registerInFlight } from "../../control";

function deriveTitle(topic: string): string {
  const clean = topic.trim().replace(/\s+/g, " ");
  if (!clean) return "Untitled Research";
  return clean.length > 48 ? clean.slice(0, 48).trim() + "…" : clean;
}

export interface ChatTurn {
  running: boolean;
  run: (tabId: string, prompt: string) => Promise<boolean>;
  /** Aborts the in-flight run, including the underlying network request. */
  cancel: () => void;
  /** The tab whose run is currently in flight, if any. */
  activeTabId: string | null;
  /** True when the in-flight run is for this tab. */
  isActive: (tabId: string) => boolean;
}

export function useChatTurn(): ChatTurn {
  const [running, setRunning] = useState(false);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const activeTabRef = useRef<string | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const unregisterStopRef = useRef<(() => void) | null>(null);
  /**
   * Monotonic run token. A run may only write to the store while it is still
   * the newest run, so a cancelled (or superseded) run can never overwrite a
   * newer answer with late data.
   */
  const tokenRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Leaving the workspace must not leave a request in flight.
      tokenRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
      unregisterStopRef.current?.();
      unregisterStopRef.current = null;
    };
  }, []);

  const cancel = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    const token = tokenRef.current;
    const tabId = activeTabRef.current;
    controller.abort();
    unregisterStopRef.current?.();
    unregisterStopRef.current = null;
    // Supersede immediately so nothing that is already resolving can write.
    if (tokenRef.current === token) tokenRef.current = token + 1;
    if (mountedRef.current) {
      if (tabId) {
        const fresh = workspaceStore.getState().tabs.find((t) => t.id === tabId);
        workspaceStore.updateTab(tabId, {
          phase: fresh?.fullText ? "complete" : "selecting-subject",
          streaming: false,
          pipelineStage: -1,
          error: null,
          messages: fresh
            ? [...fresh.messages, { role: "assistant", content: "Stopped before completion.", timestamp: Date.now() }]
            : undefined,
        });
        workspaceStore.pushTabEvent(tabId, "cancelled", "Stopped by the operator");
      }
      activeTabRef.current = null;
      setRunning(false);
      setActiveTabId(null);
    }
  }, []);

  const run = useCallback(async (tabId: string, prompt: string): Promise<boolean> => {
    await loadStop();
    if (isStopEngaged()) return false;
    const current = workspaceStore.getState().tabs.find((t) => t.id === tabId);
    if (!current || !prompt.trim()) return false;

    // Starting a run supersedes any run still in flight.
    controllerRef.current?.abort();
    unregisterStopRef.current?.();
    const controller = new AbortController();
    controllerRef.current = controller;
    const token = ++tokenRef.current;
    activeTabRef.current = tabId;
    const unregisterStop = registerInFlight({
      id: `chat:${tabId}:${token}`,
      label: "research run",
      abort: () => controller.abort(),
    });
    unregisterStopRef.current = unregisterStop;

    const isCurrent = () => tokenRef.current === token;

    setRunning(true);
    setActiveTabId(tabId);

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
        memoryContext: workspaceStore.memoryContextFor(workspaceId, resolution.prompt),
        canvasContext: workspaceStore.canvasContextFor(workspaceId),
        metadata: { researchMode: current.mode, followupKind: resolution.kind },
        signal: controller.signal,
      });

      const reportText = result.response;
      if (!reportText || !reportText.trim() || reportText.trim() === prompt.trim()) {
        throw new Error("AI returned an empty or echoed response. Please try again.");
      }
      if (!isCurrent()) return false;

      // One derivation path (Mission 10): the answer's records are validated,
      // deduplicated and given provenance before any of them reaches the store.
      const records = deriveTabRecords(reportText, {
        tabId,
        workspaceId,
        runId: result.telemetry?.runId ?? null,
        chunks: result.intelligence?.retrievedChunks ?? [],
      });

      const fresh = workspaceStore.getState().tabs.find((t) => t.id === tabId);
      workspaceStore.updateTab(tabId, {
        phase: "complete",
        streaming: false,
        pipelineStage: -1,
        sections: records.sections,
        fullText: reportText,
        entities: records.entities,
        timelineEvents: records.timelineEvents,
        notes: records.notes,
        followUps: records.followUps.map((followUp) => followUp.question),
        followUpsOrigin: records.followUps.some((followUp) => followUp.origin === "app") ? "app" : "answer",
        derivation: records.provenance,
        difficulty: result.difficulty || "intermediate",
        title: fresh && fresh.title && fresh.title !== "Untitled Research" ? fresh.title : deriveTitle(prompt),
        intelligence: result.intelligence
          ? {
              ...result.intelligence,
              // Chunks are stored whole. Truncating their text would break the
              // locators the grounding report carries: a chunk whose text has
              // been cut cannot be reproduced from its source, so it could no
              // longer be verified after a reload.
            }
          : undefined,
        messages: fresh
          ? [...fresh.messages, { role: "assistant", content: `Research complete — ${reportText.length.toLocaleString()} chars.`, timestamp: Date.now() }]
          : undefined,
      });

      // Record what this run changed outside the tab, so the operator can review
      // it. The memory outcome is the memory layer's own (created, duplicate,
      // conflict or rejected); nothing here calls it verified.
      const knowledge = workspaceStore.deriveGraphFromTab(tabId);
      const memory = workspaceStore.rememberExchange(workspaceId, prompt, reportText, tabId);
      recordDerivedChange({
        workspaceId,
        tabId,
        tabTitle: workspaceStore.getState().tabs.find((t) => t.id === tabId)?.title ?? prompt,
        provenance: records.provenance,
        effects: {
          knowledge,
          memory: memory ? { outcome: memory.outcome, recordId: memory.record?.id ?? null, detail: memory.detail } : null,
        },
      });
      workspaceStore.pushTabEvent(tabId, "completed", `Completed in ${Math.round(result.telemetry?.totalMs ?? 0)}ms`);
      return true;
    } catch (e) {
      if (isCancelledError(e)) {
        // A deliberate stop is a state change, not an error. Nothing derived
        // from the partial response is written.
        if (isCurrent()) {
          const fresh = workspaceStore.getState().tabs.find((t) => t.id === tabId);
          workspaceStore.updateTab(tabId, {
            phase: "complete",
            streaming: false,
            pipelineStage: -1,
            error: null,
            messages: fresh
              ? [...fresh.messages, { role: "assistant", content: "Stopped before completion.", timestamp: Date.now() }]
              : undefined,
          });
          workspaceStore.pushTabEvent(tabId, "cancelled", "Stopped by the operator");
        }
        return false;
      }

      if (!isCurrent()) return false;

      workspaceStore.updateTab(tabId, {
        phase: "complete",
        streaming: false,
        error: { code: (e as { code?: string })?.code || "SERVER", message: getReadableError(e) },
      });
      workspaceStore.pushTabEvent(tabId, "failed", `Failed: ${getReadableError(e)}`);
      return false;
    } finally {
      if (isCurrent()) {
        controllerRef.current = null;
        unregisterStop();
        if (unregisterStopRef.current === unregisterStop) unregisterStopRef.current = null;
        if (mountedRef.current) {
          activeTabRef.current = null;
          setRunning(false);
          setActiveTabId(null);
        }
      }
    }
  }, []);

  const isActive = useCallback((tabId: string) => activeTabId === tabId, [activeTabId]);

  return { running, run, cancel, activeTabId, isActive };
}
