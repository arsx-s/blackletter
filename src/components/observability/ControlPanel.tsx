/**
 * Control plane panel — the stop's detail view, and backup/restore.
 *
 * The status bar has the one-press stop. This panel is where the operator reads
 * what a stop *did* (which tasks were paused, whose grants were cleared, what was
 * aborted), revokes one task's access without stopping everything, and takes a
 * backup of the application's own stores.
 *
 * The panel states what the stop cannot do, because the alternative is a
 * comfortable lie: a synchronous tool body is not interrupted mid-function
 * (JavaScript cannot do that), and releasing the stop does not resume anything.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AlertCircle, CheckCircle2, OctagonX, Shield } from "lucide-react";
import {
  emergencyStop,
  exportControlState,
  inFlightEntries,
  lastStopReport,
  loadStop,
  parseBackup,
  releaseEmergencyStop,
  restoreControlState,
  revokeTaskAccess,
  stopState,
  subscribeStop,
  summariseBackup,
  type RestoreReport,
  type StopReport,
} from "../../control";
import { loadTasks, subscribeTasks, tasksFor, type TaskRecord } from "../../tasks";
import { isTerminal } from "../../tasks/machine";
import { cn } from "../../lib/utils";

export function ControlPanel() {
  const stop = useSyncExternalStore(subscribeStop, stopState, stopState);
  const [, setRevision] = useState(0);
  const [report, setReport] = useState<StopReport | null>(() => lastStopReport());
  const [reason, setReason] = useState("");
  const [taskId, setTaskId] = useState("");
  const [backupText, setBackupText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [restored, setRestored] = useState<RestoreReport | null>(null);

  useEffect(() => {
    void loadStop();
    void loadTasks();
    const unsubscribe = subscribeTasks(() => setRevision((value) => value + 1));
    return unsubscribe;
  }, []);

  const live = tasksFor().filter((task) => !isTerminal(task.status));
  const inFlight = inFlightEntries();

  const onStop = useCallback(() => {
    const result = emergencyStop({ reason: reason.trim() || "the operator stopped all work from the control panel" });
    setReport(result);
    setProblem(null);
    setNotice(
      `Stopped. Paused ${result.pausedTaskIds.length} task(s), cleared the grants of ${result.revokedTaskIds.length}, aborted ${result.abortedInFlight} in-flight operation(s).`,
    );
  }, [reason]);

  const onExport = useCallback(async () => {
    const payload = await exportControlState();
    const text = JSON.stringify(payload, null, 2);
    setBackupText(text);
    const summary = summariseBackup(payload);
    setProblem(null);
    setNotice(`Exported ${summary.keys.length} key(s), ${summary.bytes} characters. Keep it wherever you keep your data.`);
    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      // The textarea is the copy path when the clipboard is unavailable.
    }
  }, []);

  const onRestore = useCallback(async () => {
    const parsed = parseBackup(backupText);
    if (!parsed.ok) {
      setProblem(`Refused: ${parsed.reason}.`);
      setNotice(null);
      return;
    }
    const result = await restoreControlState(parsed.payload);
    setRestored(result);
    if (result.refused.length > 0) {
      setProblem(`Refused the whole payload: it names key(s) this build does not restore (${result.refused.join(", ")}).`);
      return;
    }
    setProblem(null);
    setNotice(`Restored ${result.restored.length} key(s). Reload the window (Ctrl+R) for the running stores to read them.`);
  }, [backupText]);

  return (
    <section className="surface-default rounded-md border border-border/60">
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Shield size={15} className="text-muted" />
          <h3 className="text-body-sm text-bone">Control plane</h3>
          <span className="text-micro text-muted">enforced outside the model, checked by tests</span>
        </div>
        <span className={cn("rounded-xs border px-1.5 py-0.5 text-micro", stop.engaged ? "border-accent/40 text-accent" : "border-border/60 text-muted")}>
          {stop.engaged ? "stopped" : "running"}
        </span>
      </header>

      <div className="space-y-4 px-4 py-4">
        <div className="rounded-xs border border-border/60 px-3 py-2">
          <p className="text-caption text-muted">
            The stop refuses every tool call and every task step, aborts what is running, pauses live tasks and clears their grants. It is
            persisted: a window closed while stopped reopens stopped. Releasing it resumes nothing — that is a separate decision.
          </p>
          <p className="mt-1 text-micro text-muted">
            It cannot interrupt a synchronous tool body mid-function (JavaScript cannot), and it does not cancel a document extraction that
            has not called a tool yet.
          </p>
          {stop.engaged && (
            <p className="mt-2 text-micro text-accent" title={stop.reason}>
              Stopped since {stop.at ? new Date(stop.at).toLocaleString() : "an unknown time"} · {stop.reason}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              aria-label="Reason for stopping"
              placeholder="Why (recorded with the stop)"
              className="w-64 rounded-xs border border-border/60 bg-background px-2 py-1 text-caption text-bone"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xs border border-accent/40 bg-accent/[0.08] px-3 py-1.5 text-caption text-accent disabled:opacity-50"
              onClick={onStop}
              disabled={stop.engaged}
            >
              <OctagonX size={13} /> {stop.engaged ? "Already stopped" : "Stop all work"}
            </button>
            <button
              type="button"
              className="rounded-xs border border-border/60 px-3 py-1.5 text-caption text-muted hover:text-bone disabled:opacity-50"
              onClick={() => {
                releaseEmergencyStop();
                setNotice("Stop released. Tasks stay paused and grants stay revoked until you resume or re-grant them.");
              }}
              disabled={!stop.engaged}
            >
              Release
            </button>
            <span className="text-micro text-muted">
              {inFlight.length} in-flight operation(s) registered for abort
            </span>
          </div>
          {report && (
            <ul className="mt-2 space-y-0.5 text-micro text-muted">
              <li>
                Paused: {report.pausedTaskIds.length === 0 ? "none" : report.pausedTaskIds.join(", ")}
                {report.refused.length > 0 ? ` · could not pause: ${report.refused.map((entry) => `${entry.taskId} (${entry.reason})`).join("; ")}` : ""}
              </li>
              <li>
                Grants cleared: {report.revokedTaskIds.length === 0 ? "none had any" : report.revokedTaskIds.join(", ")} · aborted in flight:{" "}
                {report.abortedInFlight}
              </li>
            </ul>
          )}
        </div>

        <div>
          <h4 className="text-micro text-muted">Live tasks ({live.length}) — revoke one task's access without stopping the rest</h4>
          {live.length === 0 ? (
            <p className="mt-1 text-caption text-muted">No live task. Nothing holds a grant right now.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {live.map((task) => (
                <li key={task.id} className="flex flex-wrap items-center gap-2 rounded-xs border border-border/60 px-3 py-1.5">
                  <span className="font-mono text-micro text-bone">{task.id}</span>
                  <span className="text-micro text-muted">
                    {task.status} · grants: {task.grants.length === 0 ? "none" : task.grants.join(", ")}
                  </span>
                  <button
                    type="button"
                    className="ml-auto rounded-xs border border-border/60 px-2 py-0.5 text-micro text-muted hover:text-bone disabled:opacity-50"
                    disabled={task.grants.length === 0}
                    onClick={() => {
                      const changed = revokeTaskAccess(task.id);
                      setRevision((value) => value + 1);
                      if (changed) {
                        setProblem(null);
                        setNotice(`Revoked the grants of ${task.id}; it keeps its status and its history.`);
                      }
                    }}
                  >
                    Revoke grants
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xs border border-border/60 px-3 py-2">
          <h4 className="text-micro text-muted">Backup and restore</h4>
          <p className="mt-1 text-micro text-muted">
            Exports this application's own stores (workspace state, tasks, projects, the audit trail, the integrity change log, the web
            research log, the metrics caches, and the stop). It restores only those keys, checks the version first, and refuses the whole
            payload if it names anything else. The host-level procedure — copying the user-data directory — is the one that also covers the
            Electron shell; see <span className="font-mono">docs/control-plane.md</span>.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-xs border border-border/60 px-3 py-1.5 text-caption text-muted hover:text-bone"
              onClick={() => void onExport()}
            >
              Export to the box below
            </button>
            <button
              type="button"
              className="rounded-xs border border-border/60 px-3 py-1.5 text-caption text-muted hover:text-bone disabled:opacity-50"
              onClick={() => void onRestore()}
              disabled={backupText.trim().length === 0}
            >
              Restore from the box
            </button>
          </div>
          <textarea
            aria-label="Backup payload"
            rows={4}
            spellCheck={false}
            className="mt-2 w-full rounded-xs border border-border/60 bg-background px-2 py-1.5 font-mono text-micro text-bone"
            placeholder="{ } — paste a backup here to restore it"
            value={backupText}
            onChange={(event) => setBackupText(event.target.value)}
          />
          {restored && (
            <p className="mt-1 text-micro text-muted">
              Last restore: {restored.restored.length} key(s) written{restored.missing.length > 0 ? `, ${restored.missing.length} absent and left alone` : ""}.
            </p>
          )}
        </div>

        {notice && (
          <p className="flex items-start gap-2 text-caption text-accent">
            <CheckCircle2 size={14} className="mt-0.5" /> {notice}
          </p>
        )}
        {problem && (
          <p className="flex items-start gap-2 rounded-xs border border-amber-500/40 px-3 py-2 text-caption text-amber-600">
            <AlertCircle size={14} className="mt-0.5" /> {problem}
          </p>
        )}
      </div>
    </section>
  );
}
