/**
 * Integrity panel — what a run derived, and what it changed.
 *
 * Two things are shown here, and they answer two different questions:
 *
 *   1. **The derivation boundary.** For each completed run, how many records were
 *      derived from the answer, how many could be matched against retrieved
 *      evidence (`supported`), how many could not (`unverified`), and what issues
 *      the boundary reported — malformed records it refused, references the
 *      answer does not contain, duplicates it merged, lists it capped.
 *
 *   2. **The change set.** What the run added to the knowledge graph and which
 *      memory record it created. A memory record can be removed from here; the
 *      removal goes through the memory layer's audited deletion. Knowledge nodes
 *      can be seen, not deleted from here — a node is a text derivation shared by
 *      everything that mentions the term, and quietly deleting one would leave
 *      edges behind.
 *
 * It never shows a derived record as verified. Support means "a retrieved chunk
 * contains this text"; it is not a claim that the text is true.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, RefreshCw, Shield } from "lucide-react";
import { useWorkspaceStore } from "../../stores/use-workspace";
import { workspaceStore } from "../../stores/workspace-store";
import {
  acknowledgeDerivedChange,
  derivedChanges,
  derivedChangesDroppedCount,
  derivedChangesRejectedOnLoad,
  loadDerivedChanges,
  subscribeDerivedChanges,
  type DerivationIssueCode,
  type DerivedChangeRecord,
} from "../../integrity";
import { cn } from "../../lib/utils";

function timeOf(at: number): string {
  return new Date(at).toLocaleString();
}

const ISSUE_LABEL: Record<DerivationIssueCode, string> = {
  "malformed-record": "malformed",
  "fabricated-reference": "not in the answer",
  "app-supplied": "app label",
  "duplicate-merged": "duplicates merged",
  "type-conflict": "type conflict",
  "oversized-record": "oversized (kept whole)",
  "list-capped": "list capped",
  "id-collision": "id collision",
  "answer-too-large": "answer large",
};

export function IntegrityPanel() {
  const state = useWorkspaceStore();
  const workspaceId = state.activeWorkspaceId;
  const [changes, setChanges] = useState<readonly DerivedChangeRecord[]>(() => derivedChanges());
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void loadDerivedChanges().then(() => setChanges([...derivedChanges()]));
    return subscribeDerivedChanges(() => setChanges([...derivedChanges()]));
  }, []);

  const forWorkspace = useMemo(
    () => changes.filter((change) => change.workspaceId === workspaceId),
    [changes, workspaceId],
  );

  const removeMemory = useCallback((recordId: string) => {
    // Audited deletion: the memory layer records the digest of a "delete" entry
    // in its history, and the panel simply asks for it.
    const result = workspaceStore.deleteMemoryRecord(recordId, "Removed from a change set in the integrity panel by the operator.");
    setNote(result.ok ? "Memory record removed." : `Not removed: ${result.reason ?? "the record was not found"}`);
  }, []);

  // Read on every render, so a notify (acknowledgement, drop, reload) refreshes
  // these counters along with the list.
  const droppedCount = derivedChangesDroppedCount();
  const rejectedCount = derivedChangesRejectedOnLoad();

  return (
    <section className="surface-default rounded-md border border-border/60">
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Shield size={15} className="text-muted" />
          <h3 className="text-body-sm text-bone">Integrity</h3>
          <span className="text-micro text-muted">
            {forWorkspace.length} change set{forWorkspace.length === 1 ? "" : "s"} in this workspace · newest first
          </span>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-micro text-muted hover:text-bone"
          onClick={() => setChanges([...derivedChanges()])}
          title="Re-read the in-memory change log"
        >
          <RefreshCw size={10} /> refresh
        </button>
      </header>

      <div className="space-y-3 px-4 py-4">
        <p className="text-caption leading-relaxed text-muted">
          Every answer is read at one boundary before anything is stored: records are validated against a versioned schema,
          checked back against the answer they claim to come from, deduplicated, and given provenance.{" "}
          <span className="text-bone/80">Supported</span> means a retrieved chunk contains the record&apos;s text;{" "}
          <span className="text-bone/80">unverified</span> means nothing checked it. Neither is a claim that the text is
          true — that is what the grounding report and the task machine are for.
        </p>

        {note && <p className="text-caption text-bone/80">{note}</p>}

        {forWorkspace.length === 0 ? (
          <p className="text-caption text-muted/70">
            No completed run has recorded a change set in this workspace yet. A change set appears here when an answer is
            derived into records and folded into memory and the knowledge graph.
          </p>
        ) : (
          <ul className="divide-y divide-border/40 rounded-sm border border-border/50">
            {forWorkspace.map((change) => {
              const memoryRecord = change.effects.memory?.recordId
                ? workspaceStore.memoryRecordById(change.effects.memory.recordId)
                : null;
              const issueCodes = Object.entries(change.issueTotals).filter(([, count]) => (count ?? 0) > 0);
              return (
                <li key={change.id} className="space-y-1.5 px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] text-muted/60">{timeOf(change.at)}</span>
                    <span className="text-caption text-bone/80">{change.tabTitle || change.tabId || "untitled tab"}</span>
                    <span className="font-mono text-[9px] text-muted/60">run {change.runId ?? "unrecorded"}</span>
                    <span className="font-mono text-[9px] text-muted/50">
                      {change.answerDigest} · {change.answerChars.toLocaleString()} chars
                    </span>
                  </div>

                  <p className="text-micro text-muted">
                    derived: {change.counts.sections} sections · {change.counts.entities} entities · {change.counts.timeline} timeline ·{" "}
                    {change.counts.notes} notes · {change.counts.followUps} follow-ups — {change.counts.supported} supported,{" "}
                    {change.counts.unverified} unverified, {change.counts.dropped} refused, {change.counts.merged} merged
                  </p>

                  {issueCodes.length > 0 && (
                    <p className="flex flex-wrap items-center gap-1.5 text-micro text-amber-600">
                      <AlertCircle size={10} />
                      {issueCodes.map(([code, count]) => (
                        <span key={code} className="font-mono text-[9px]">
                          {ISSUE_LABEL[code as DerivationIssueCode] ?? code} ×{count}
                        </span>
                      ))}
                    </p>
                  )}
                  {change.issues.slice(0, 3).map((issue, index) => (
                    <p key={index} className="text-micro text-muted/70">
                      — [{issue.code}] {issue.kind}: {issue.detail}
                    </p>
                  ))}

                  <p className="text-micro text-muted">
                    knowledge: +{change.effects.knowledge.nodesAdded.length} node(s), +{change.effects.knowledge.edgesAdded.length} edge(s)
                    {change.effects.knowledge.nodesAdded.length > 0 && (
                      <span className="font-mono text-[9px] text-muted/60" title={change.effects.knowledge.nodesAdded.join(", ")}>
                        {" "}
                        · {change.effects.knowledge.nodesAdded.slice(0, 4).join(", ")}
                        {change.effects.knowledge.nodesAdded.length > 4 ? ` +${change.effects.knowledge.nodesAdded.length - 4} more` : ""}
                      </span>
                    )}
                  </p>

                  <div className="flex flex-wrap items-center gap-2">
                    {change.effects.memory ? (
                      <>
                        <span className="text-micro text-muted">
                          memory: {change.effects.memory.outcome}
                          {change.effects.memory.recordId ? ` · ${change.effects.memory.recordId}` : ""}
                          {change.effects.memory.detail ? ` — ${change.effects.memory.detail}` : ""}
                        </span>
                        {memoryRecord && (
                          <button
                            type="button"
                            onClick={() => removeMemory(memoryRecord.id)}
                            className="rounded-xs border border-border/60 px-2 py-0.5 text-micro text-muted transition-colors hover:border-accent/40 hover:text-bone"
                          >
                            Remove memory record
                          </button>
                        )}
                        {change.effects.memory.recordId && !memoryRecord && (
                          <span className="text-micro text-muted/60">(already removed or edited away)</span>
                        )}
                      </>
                    ) : (
                      <span className="text-micro text-muted/70">memory: nothing recorded for this run</span>
                    )}
                    <button
                      type="button"
                      onClick={() => acknowledgeDerivedChange(change.id, "Reviewed in the integrity panel.")}
                      className={cn(
                        "rounded-xs border px-2 py-0.5 text-micro transition-colors",
                        change.acknowledgements.length > 0
                          ? "border-accent/30 text-accent"
                          : "border-border/60 text-muted hover:border-accent/40 hover:text-bone",
                      )}
                    >
                      {change.acknowledgements.length > 0 ? "Acknowledged" : "Acknowledge"}
                    </button>
                  </div>
                  {change.acknowledgements.length > 0 && (
                    <p className="flex items-center gap-1 text-micro text-muted/70">
                      <CheckCircle2 size={10} className="text-accent" />
                      {change.acknowledgements[change.acknowledgements.length - 1].note} —{" "}
                      {timeOf(change.acknowledgements[change.acknowledgements.length - 1].at)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-micro text-muted/60">
          Log cap: the newest 60 change sets are kept{droppedCount > 0 ? `; ${droppedCount} older one(s) were dropped` : ""}.
          {rejectedCount > 0 && ` ${rejectedCount} stored entr${rejectedCount === 1 ? "y" : "ies"} could not be read and were refused.`}{" "}
          Acknowledging a change set records a note; it does not remove anything.
        </p>
      </div>
    </section>
  );
}