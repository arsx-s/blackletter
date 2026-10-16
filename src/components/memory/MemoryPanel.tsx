import { useMemo, useState } from "react";
import { AlertCircle, Brain, Check, ChevronDown, History, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { workspaceStore, useWorkspaceStore } from "../../stores/use-workspace";
import {
  EPISTEMIC_STATUS_LABELS,
  EPISTEMIC_STATUS_MEANINGS,
  MEMORY_MAX_AUTO_PER_WORKSPACE,
  MEMORY_CATEGORIES,
  MEMORY_CATEGORY_LABELS,
  MEMORY_CATEGORY_MEANINGS,
  MEMORY_ORIGIN_LABELS,
  OPERATOR_SETTABLE_STATUSES,
  memoryView,
  type EpistemicStatus,
  type MemoryCategory,
  type MemoryRecord,
  type RetentionMode,
} from "../../memory";

/**
 * The memory panel.
 *
 * Mission 4's requirement is that memory be *inspectable and controllable*, so
 * this panel is deliberately plain: every stored record is listed with where it
 * came from and how far it is trusted, every action asks for a reason, and
 * nothing is presented as a fact unless a code path actually checked it. The
 * panel never writes memory on the operator's behalf except through the
 * "Remember this" form, which is an explicit action.
 */

const fieldClass =
  "bg-bone/5 border border-border rounded px-2.5 py-1.5 font-sans text-xs text-bone/90 outline-none focus:border-bone/30 focus-ring";
const actionClass =
  "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border border-border font-sans text-xs text-bone/70 hover:bg-bone/5 hover:border-bone/25 transition-colors focus-ring";
const dangerClass =
  "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border border-border font-sans text-xs text-bone/70 hover:bg-accent/15 hover:border-accent/50 transition-colors focus-ring";

function fmtWhen(ts: number): string {
  if (!ts) return "unknown";
  return new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function statusTone(status: EpistemicStatus): string {
  if (status === "verified" || status === "supported") return "text-emerald-300/80 border-emerald-400/25";
  if (status === "disputed") return "text-accent border-accent/40";
  if (status === "inferred") return "text-bone/60 border-border";
  return "text-muted border-border";
}

function provenanceLine(record: MemoryRecord): string {
  const source = record.provenance.source;
  const parts: string[] = [];
  if (source.name) parts.push(source.name);
  if (source.locator) parts.push(source.locator);
  if (source.id && !source.name) parts.push(source.id);
  if (source.retrievedAt) parts.push(`read ${new Date(source.retrievedAt).toLocaleDateString()}`);
  return parts.length > 0 ? `Source: ${parts.join(" · ")}` : "Source: not recorded";
}

function retentionSummary(record: MemoryRecord): string {
  if (record.retention.mode === "keep") return "Retention: keep until deleted";
  if (record.retention.mode === "review") return "Retention: review when old";
  return `Retention: delete after ${record.retention.expiresAt ? new Date(record.retention.expiresAt).toLocaleDateString() : "an unset date"}`;
}

/** One record: content, labels, why it exists, and the actions on it. */
function RecordRow({
  record,
  onChanged,
}: {
  record: MemoryRecord;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<"idle" | "edit" | "delete" | "retention" | "history">("idle");
  const [draft, setDraft] = useState(record.content);
  const [note, setNote] = useState("");
  const [retentionMode, setRetentionMode] = useState<RetentionMode>(record.retention.mode);
  const [expiresAt, setExpiresAt] = useState(
    record.retention.expiresAt ? new Date(record.retention.expiresAt).toISOString().slice(0, 10) : "",
  );
  const [status, setStatus] = useState<EpistemicStatus>(
    OPERATOR_SETTABLE_STATUSES.includes(record.status) ? record.status : "unverified",
  );
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setMode("idle");
    setNote("");
    setError(null);
  };

  const submitEdit = () => {
    const result = workspaceStore.editMemoryRecord(record.id, { content: draft, status, note });
    if (!result.ok) {
      setError(result.reason ?? "the change was not saved");
      return;
    }
    window.dispatchEvent(
      new CustomEvent("blackletter:memory-changed", { detail: { recordId: record.id, action: "edited" } }),
    );
    reset();
    onChanged();
  };

  const submitDelete = () => {
    const result = workspaceStore.deleteMemoryRecord(record.id, note);
    if (!result.ok) {
      setError(result.reason ?? "the record was not deleted");
      return;
    }
    reset();
    onChanged();
  };

  const submitRetention = () => {
    const policy =
      retentionMode === "expire"
        ? { mode: "expire" as const, expiresAt: expiresAt ? new Date(`${expiresAt}T00:00:00`).getTime() : NaN }
        : { mode: retentionMode };
    if (retentionMode === "expire" && !Number.isFinite(policy.expiresAt)) {
      setError("an expiry date is required when the policy is expire");
      return;
    }
    const result = workspaceStore.setMemoryRetention(record.id, policy, note);
    if (!result.ok) {
      setError(result.reason ?? "the retention change was not saved");
      return;
    }
    reset();
    onChanged();
  };

  return (
    <li className="border border-border/70 rounded-lg p-3 bg-bone/5">
      <p className="font-sans text-xs text-bone/85 whitespace-pre-wrap break-words">{record.content}</p>

      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <span className="px-1.5 py-0.5 rounded-xs border border-border font-mono text-2xs uppercase tracking-wider text-muted">
          {MEMORY_CATEGORY_LABELS[record.category]}
        </span>
        <span className={cn("px-1.5 py-0.5 rounded-xs border font-mono text-2xs uppercase tracking-wider", statusTone(record.status))}>
          {EPISTEMIC_STATUS_LABELS[record.status]}
        </span>
        <span className="px-1.5 py-0.5 rounded-xs border border-border font-mono text-2xs uppercase tracking-wider text-muted">
          {MEMORY_ORIGIN_LABELS[record.provenance.origin]}
        </span>
        {record.scope.workspaceId === null && (
          <span className="px-1.5 py-0.5 rounded-xs border border-border font-mono text-2xs uppercase tracking-wider text-muted">
            every workspace
          </span>
        )}
        {record.auto && (
          <span className="px-1.5 py-0.5 rounded-xs border border-border font-mono text-2xs uppercase tracking-wider text-muted">
            auto-recorded
          </span>
        )}
      </div>

      <p className="font-sans text-2xs text-muted mt-2 leading-relaxed">
        {provenanceLine(record)} · added {fmtWhen(record.createdAt)}
        {record.updatedAt !== record.createdAt ? ` · last changed ${fmtWhen(record.updatedAt)}` : ""}
        {record.lastRetrievedAt ? ` · last used in a prompt ${fmtWhen(record.lastRetrievedAt)}` : " · never used in a prompt"}
      </p>
      <p className="font-sans text-2xs text-muted/80 mt-1">{retentionSummary(record)}</p>
      <p className="font-sans text-2xs text-muted/80 mt-1">
        Why it exists: {record.revisions[0]?.note ?? record.provenance.note}
      </p>

      <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
        <button className={actionClass} onClick={() => (mode === "edit" ? reset() : setMode("edit"))} aria-expanded={mode === "edit"}>
          Edit
        </button>
        <button className={actionClass} onClick={() => (mode === "retention" ? reset() : setMode("retention"))} aria-expanded={mode === "retention"}>
          Retention
        </button>
        <button className={actionClass} onClick={() => (mode === "history" ? reset() : setMode("history"))} aria-expanded={mode === "history"}>
          <History size={11} /> History ({record.revisions.length})
        </button>
        <button className={dangerClass} onClick={() => (mode === "delete" ? reset() : setMode("delete"))} aria-expanded={mode === "delete"}>
          <Trash2 size={11} /> Delete
        </button>
      </div>

      {mode === "edit" && (
        <div className="mt-3 border-t border-border/60 pt-3 space-y-2">
          <label className="block font-sans text-2xs text-muted" htmlFor={`memory-edit-${record.id}`}>
            Corrected text
          </label>
          <textarea
            id={`memory-edit-${record.id}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            className={cn(fieldClass, "w-full resize-y leading-relaxed")}
          />
          <div className="flex items-center gap-2">
            <label className="font-sans text-2xs text-muted" htmlFor={`memory-status-${record.id}`}>
              Trust
            </label>
            <select
              id={`memory-status-${record.id}`}
              value={status}
              onChange={(event) => setStatus(event.target.value as EpistemicStatus)}
              className={fieldClass}
            >
              {OPERATOR_SETTABLE_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {EPISTEMIC_STATUS_LABELS[option]} — {EPISTEMIC_STATUS_MEANINGS[option]}
                </option>
              ))}
            </select>
          </div>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Why this correction (required)"
            aria-label="Reason for the correction"
            className={cn(fieldClass, "w-full")}
          />
          <div className="flex items-center gap-2">
            <button className={actionClass} onClick={submitEdit}>
              <Check size={11} /> Save correction
            </button>
            <button className={actionClass} onClick={reset}>
              <X size={11} /> Cancel
            </button>
          </div>
          <p className="font-sans text-2xs text-muted/70">
            Correcting an inference does not relabel it as user-provided; the origin stays what it was.
          </p>
        </div>
      )}

      {mode === "retention" && (
        <div className="mt-3 border-t border-border/60 pt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="font-sans text-2xs text-muted" htmlFor={`memory-retention-${record.id}`}>
              Policy
            </label>
            <select
              id={`memory-retention-${record.id}`}
              value={retentionMode}
              onChange={(event) => setRetentionMode(event.target.value as RetentionMode)}
              className={fieldClass}
            >
              <option value="keep">keep until deleted</option>
              <option value="review">review when old</option>
              <option value="expire">delete after a date</option>
            </select>
            {retentionMode === "expire" && (
              <input
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                aria-label="Delete this record after"
                className={fieldClass}
              />
            )}
          </div>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Why this retention change (required)"
            aria-label="Reason for the retention change"
            className={cn(fieldClass, "w-full")}
          />
          <div className="flex items-center gap-2">
            <button className={actionClass} onClick={submitRetention}>
              <Check size={11} /> Apply retention
            </button>
            <button className={actionClass} onClick={reset}>
              <X size={11} /> Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "history" && (
        <ol className="mt-3 border-t border-border/60 pt-3 space-y-1.5">
          {[...record.revisions].reverse().map((revision, index) => (
            <li key={`${revision.at}-${index}`} className="font-sans text-2xs text-muted">
              <span className="font-mono uppercase tracking-wider text-muted/70">
                {revision.action} · {fmtWhen(revision.at)}
              </span>
              <br />
              {revision.note}
              {revision.previousContent && (
                <span className="block mt-0.5 text-muted/70">was: {revision.previousContent}</span>
              )}
            </li>
          ))}
        </ol>
      )}

      {mode === "delete" && (
        <div className="mt-3 border-t border-border/60 pt-3 space-y-2">
          <p className="font-sans text-2xs text-bone/80">
            Deleting removes the record from memory and from every future prompt. The audit keeps a digest, not the text.
          </p>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Why this should be forgotten (required)"
            aria-label="Reason for the deletion"
            className={cn(fieldClass, "w-full")}
          />
          <div className="flex items-center gap-2">
            <button className={dangerClass} onClick={submitDelete}>
              <Trash2 size={11} /> Delete this record
            </button>
            <button className={actionClass} onClick={reset}>
              <X size={11} /> Keep it
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="font-sans text-2xs text-accent mt-2">
          {error}
        </p>
      )}
    </li>
  );
}

export function MemoryPanel({ workspaceId, workspaceName }: { workspaceId: string; workspaceName: string }) {
  const state = useWorkspaceStore();
  // `state.memoryState` is replaced on every memory mutation, so it is the
  // dependency that makes this recompute exactly when memory changes.
  const view = useMemo(() => memoryView(state.memoryState, workspaceId), [state.memoryState, workspaceId]);

  const [category, setCategory] = useState<MemoryCategory | "all">("all");
  const [status, setStatus] = useState<EpistemicStatus | "all">("all");
  const [term, setTerm] = useState("");

  const [adding, setAdding] = useState(false);
  const [newCategory, setNewCategory] = useState<MemoryCategory>("semantic");
  const [newContent, setNewContent] = useState("");
  const [newNote, setNewNote] = useState("");
  const [clearConfirm, setClearConfirm] = useState("");
  const [clearNote, setClearNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");

  const records = view.records.filter((record) => {
    if (category !== "all" && record.category !== category) return false;
    if (status !== "all" && record.status !== status) return false;
    if (term.trim() && !record.content.toLowerCase().includes(term.trim().toLowerCase())) return false;
    return true;
  });

  const submitNew = () => {
    const result = workspaceStore.addMemoryRecord({
      category: newCategory,
      content: newContent,
      provenance: { origin: "user", source: { type: "none" }, note: newNote.trim() || "Added by hand in the memory panel." },
      scope: { workspaceId },
    });
    if (result.outcome === "rejected") {
      setMessage(result.detail ?? "the record was not stored");
      return;
    }
    setMessage(
      result.outcome === "duplicate"
        ? "An identical record already existed, so nothing was stored twice."
        : result.outcome === "conflict"
          ? `Stored, and both sides are now marked disputed: ${result.detail ?? ""}`
          : null,
    );
    setNewContent("");
    setNewNote("");
    setAdding(false);
  };

  const applySweep = () => {
    const sweep = workspaceStore.sweepMemoryRetention();
    setMessage(
      sweep.expired > 0 || sweep.reviewDue > 0
        ? `${sweep.expired} record(s) removed by their own retention policy; ${sweep.reviewDue} due for review.`
        : "Nothing was due under the current retention policies.",
    );
  };

  const clearWorkspace = () => {
    const result = workspaceStore.clearMemoryScope(workspaceId, clearConfirm, clearNote);
    setMessage(
      result.ok
        ? `Cleared ${result.removed} record(s) from this workspace. The old conversation summary was cleared as well.`
        : (result.reason ?? "nothing was cleared"),
    );
    if (result.ok) {
      setClearConfirm("");
      setClearNote("");
      workspaceStore.clearMemory(workspaceId);
    }
  };

  const resolve = (winnerId: string, loserId: string) => {
    const result = workspaceStore.resolveMemoryDispute(winnerId, loserId, resolutionNote);
    setMessage(result.ok ? "Dispute resolved; the losing record is kept and marked unverified." : (result.reason ?? null));
    if (result.ok) setResolutionNote("");
  };

  const stats = view.stats;

  return (
    <div className="space-y-4">
      <p className="font-sans text-xs text-muted leading-relaxed">
        BlackLetter remembers things as records, not as a conversation log. Each record says where it came from and how far it is
        trusted, and this panel is the only place they change. Memory here is stored state; nothing on this screen retrains a model.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(
          [
            ["Records here", String(view.records.length)],
            ["Disputes", String(view.disputes.length)],
            ["Due for review", String(view.reviewDue.length + view.expired.length)],
            ["Auto-recorded", String(records.filter((record) => record.auto).length)],
          ] as Array<[string, string]>
        ).map(([label, value]) => (
          <div key={label} className="border border-border/70 rounded-lg px-3 py-2">
            <p className="font-display text-xl leading-none">{value}</p>
            <p className="font-mono text-2xs uppercase tracking-wider text-muted mt-1">{label}</p>
          </div>
        ))}
      </div>

      <p className="font-sans text-2xs text-muted/80 leading-relaxed">
        Across every workspace: {stats.total} record(s) — {stats.byOrigin.user} user-provided, {stats.byOrigin["model-inference"]}{" "}
        model-inferred, {stats.byOrigin["external-source"]} from sources, {stats.byOrigin["legacy-import"]} legacy imports with unknown
        origin. Auto-recorded memory is capped at {MEMORY_MAX_AUTO_PER_WORKSPACE} records per workspace; the oldest is retired with an audit entry when the
        cap is reached. Nothing here is sent anywhere except the prompt for this workspace.
      </p>

      {view.disputes.length > 0 && (
        <div className="border border-accent/40 rounded-lg p-3 bg-accent/5">
          <div className="flex items-center gap-2">
            <AlertCircle size={13} className="text-accent" />
            <p className="font-sans text-xs text-bone/90">
              {view.disputes.length} pair(s) of records disagree. Both sides are kept until you decide.
            </p>
          </div>
          <ul aria-label="Conflicting records" className="mt-3 space-y-3">
            {view.disputes.map((pair) => (
              <li key={`${pair.a.id}-${pair.b.id}`} className="space-y-2">
                <p className="font-sans text-2xs text-muted">{pair.reason}</p>
                {[pair.a, pair.b].map((record, index) => (
                  <div key={record.id} className="border border-border/60 rounded-md p-2 bg-background">
                    <p className="font-sans text-xs text-bone/85 whitespace-pre-wrap break-words">{record.content}</p>
                    <p className="font-sans text-2xs text-muted mt-1">
                      {EPISTEMIC_STATUS_LABELS[record.status]} · {MEMORY_ORIGIN_LABELS[record.provenance.origin]} · added{" "}
                      {fmtWhen(record.createdAt)}
                    </p>
                    <button
                      className={cn(actionClass, "mt-2")}
                      onClick={() => resolve(record.id, index === 0 ? pair.b.id : pair.a.id)}
                    >
                      <ShieldCheck size={11} /> Rely on this one
                    </button>
                  </div>
                ))}
              </li>
            ))}
          </ul>
          <input
            value={resolutionNote}
            onChange={(event) => setResolutionNote(event.target.value)}
            placeholder="Why you decided this (required)"
            aria-label="Reason for resolving the dispute"
            className={cn(fieldClass, "w-full mt-2")}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select value={category} onChange={(event) => setCategory(event.target.value as MemoryCategory | "all")} className={fieldClass} aria-label="Filter by category">
          <option value="all">All categories</option>
          {MEMORY_CATEGORIES.map((option) => (
            <option key={option} value={option}>
              {MEMORY_CATEGORY_LABELS[option]}
            </option>
          ))}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value as EpistemicStatus | "all")} className={fieldClass} aria-label="Filter by trust">
          <option value="all">All trust levels</option>
          {Object.entries(EPISTEMIC_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search remembered text"
          aria-label="Search memory records"
          className={cn(fieldClass, "flex-1 basis-40")}
        />
        <button className={actionClass} onClick={() => setAdding((value) => !value)} aria-expanded={adding}>
          <Plus size={11} /> Remember something
        </button>
        <button className={actionClass} onClick={applySweep}>
          Apply retention now
        </button>
      </div>

      {adding && (
        <div className="border border-border/70 rounded-lg p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="font-sans text-2xs text-muted" htmlFor="memory-new-category">
              Kind
            </label>
            <select
              id="memory-new-category"
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value as MemoryCategory)}
              className={fieldClass}
            >
              {MEMORY_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {MEMORY_CATEGORY_LABELS[option]} — {MEMORY_CATEGORY_MEANINGS[option]}
                </option>
              ))}
            </select>
          </div>
          <textarea
            value={newContent}
            onChange={(event) => setNewContent(event.target.value)}
            rows={3}
            placeholder="What should be remembered"
            aria-label="What should be remembered"
            className={cn(fieldClass, "w-full resize-y leading-relaxed")}
          />
          <input
            value={newNote}
            onChange={(event) => setNewNote(event.target.value)}
            placeholder="Why this matters (stored as the record's origin note)"
            aria-label="Why this should be remembered"
            className={cn(fieldClass, "w-full")}
          />
          <div className="flex items-center gap-2">
            <button className={actionClass} onClick={submitNew} disabled={!newContent.trim()}>
              <Check size={11} /> Remember it
            </button>
            <button className={actionClass} onClick={() => setAdding(false)}>
              <X size={11} /> Cancel
            </button>
          </div>
          <p className="font-sans text-2xs text-muted/70">
            Added as user-provided and marked assumed: the system takes your word for it without pretending to have verified it.
          </p>
        </div>
      )}

      {message && (
        <p role="status" className="font-sans text-2xs text-bone/80">
          {message}
        </p>
      )}

      {records.length === 0 ? (
        <p className="font-sans text-xs text-muted">
          Nothing matches. {view.records.length === 0 ? "This workspace has no memory records yet." : "Try a wider filter."}
        </p>
      ) : (
        <ul aria-label="Memory records" className="space-y-2">
          {records.map((record) => (
            <RecordRow key={record.id} record={record} onChanged={() => setMessage(null)} />
          ))}
        </ul>
      )}

      <details className="border border-border/70 rounded-lg p-3">
        <summary className="flex items-center gap-2 cursor-pointer font-sans text-xs text-bone/80">
          <ChevronDown size={12} /> Audit history ({view.audit.length})
        </summary>
        <p className="font-sans text-2xs text-muted mt-2 leading-relaxed">
          Deletions, clears and automatic retirements are recorded here by content digest only — never the text that was removed.
        </p>
        {view.audit.length === 0 ? (
          <p className="font-sans text-2xs text-muted mt-2">Nothing has been deleted or retired yet.</p>
        ) : (
          <ol className="mt-2 space-y-1.5">
            {view.audit.map((entry) => (
              <li key={`${entry.at}-${entry.recordId}`} className="font-sans text-2xs text-muted">
                <span className="font-mono uppercase tracking-wider text-muted/70">
                  {entry.action} · {fmtWhen(entry.at)}
                </span>{" "}
                {MEMORY_CATEGORY_LABELS[entry.category]} · digest {entry.contentHash} · {entry.note}
              </li>
            ))}
          </ol>
        )}
      </details>

      <div className="border border-border/70 rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Brain size={13} className="text-muted" />
          <p className="font-sans text-xs text-bone/85">Clear memory</p>
        </div>
        <p className="font-sans text-2xs text-muted leading-relaxed">
          Clearing removes every record scoped to this workspace. Records scoped to every workspace are left alone, and the audit keeps a
          digest of what was removed.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={clearConfirm}
            onChange={(event) => setClearConfirm(event.target.value)}
            placeholder={`Type ${workspaceId} to confirm`}
            aria-label="Type the workspace id to confirm clearing this workspace's memory"
            className={cn(fieldClass, "flex-1 basis-48 font-mono")}
          />
          <input
            value={clearNote}
            onChange={(event) => setClearNote(event.target.value)}
            placeholder="Why you are clearing it (required)"
            aria-label="Reason for clearing this workspace's memory"
            className={cn(fieldClass, "flex-1 basis-48")}
          />
          <button className={dangerClass} onClick={clearWorkspace} disabled={clearConfirm !== workspaceId || clearNote.trim().length < 3}>
            <Trash2 size={11} /> Clear {workspaceName}
          </button>
        </div>
      </div>
    </div>
  );
}
