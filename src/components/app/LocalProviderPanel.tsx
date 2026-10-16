/**
 * Local model provider settings — Workshop → AI & Models.
 *
 * Everything this panel does is operator-triggered: nothing here polls, pulls,
 * starts, or downloads. "Check connection" asks the runtime for its version,
 * "List installed models" asks what is already on disk, and "Inspect" copies the
 * runtime's own capability report for one model. Until a model is inspected its
 * capabilities are shown as *unknown* rather than guessed from its name or size.
 */

import { useCallback, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Cpu, RefreshCw } from "lucide-react";
import { workspaceStore } from "../../stores/workspace-store";
import { useWorkspaceStore } from "../../stores/use-workspace";
import {
  activeProvider,
} from "../../providers/provider";
import {
  capabilitiesWithEvidence,
  describeCapability,
  ollamaCapabilities,
  openRouterCapabilities,
  type ModelEvidence,
} from "../../providers/capabilities";
import {
  checkOllamaHealth,
  inspectOllamaModel,
  listOllamaModels,
  type OllamaModelSummary,
} from "../../providers/ollama";
import { validateOllamaBaseUrl } from "../../providers/selection";
import { Toggle } from "../ui/toggle";

type Probe =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <span className="font-sans text-xs text-muted shrink-0">{label}</span>
      <span className="font-mono text-2xs text-bone/70 text-right break-words min-w-0">{value}</span>
    </div>
  );
}

function fmtBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return "size unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function LocalProviderPanel() {
  const state = useWorkspaceStore();
  const prefs = state.prefs;
  const [probe, setProbe] = useState<Probe>({ kind: "idle" });
  const [models, setModels] = useState<OllamaModelSummary[] | null>(null);
  const [evidence, setEvidence] = useState<ModelEvidence | null>(null);
  const [busy, setBusy] = useState<"health" | "list" | "inspect" | null>(null);

  const urlCheck = useMemo(
    () => validateOllamaBaseUrl(prefs.ollamaBaseUrl, { allowNonLoopback: prefs.allowNonLoopbackLocalProvider }),
    [prefs.ollamaBaseUrl, prefs.allowNonLoopbackLocalProvider],
  );

  const nextRun = activeProvider();
  const isLocal = prefs.provider === "ollama";

  const capabilities = useMemo(() => {
    if (!isLocal) return openRouterCapabilities();
    return capabilitiesWithEvidence(ollamaCapabilities(), evidence);
  }, [isLocal, evidence]);

  const checkConnection = useCallback(async () => {
    setBusy("health");
    setProbe({ kind: "busy" });
    try {
      const health = await checkOllamaHealth();
      setProbe(
        health.ok
          ? { kind: "ok", message: `Answered${health.version ? ` — version ${health.version}` : ""}.` }
          : { kind: "error", message: health.message ?? "The local runtime did not answer." },
      );
    } finally {
      setBusy(null);
    }
  }, []);

  const listModels = useCallback(async () => {
    setBusy("list");
    setProbe({ kind: "busy" });
    try {
      const result = await listOllamaModels();
      if (result.ok) {
        setModels(result.models);
        setProbe({
          kind: "ok",
          message:
            result.models.length === 0
              ? "The runtime is running but has no models installed."
              : `${result.models.length} model${result.models.length === 1 ? "" : "s"} already installed.`,
        });
      } else {
        setModels(null);
        setProbe({ kind: "error", message: result.message ?? "Could not list models." });
      }
    } finally {
      setBusy(null);
    }
  }, []);

  const inspect = useCallback(async (model: string) => {
    setBusy("inspect");
    setProbe({ kind: "busy" });
    try {
      const result = await inspectOllamaModel(model);
      if (result.ok && result.evidence) {
        setEvidence(result.evidence);
        setProbe({ kind: "ok", message: `Read the runtime's report for "${model}". Nothing was downloaded.` });
      } else {
        setProbe({ kind: "error", message: result.message ?? "Could not inspect that model." });
      }
    } finally {
      setBusy(null);
    }
  }, []);

  const inputClass =
    "min-w-0 w-full bg-bone/[0.04] border border-border rounded px-2.5 py-1.5 font-mono text-xs outline-none focus:border-accent/40 placeholder:text-faint";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between py-2">
        <div className="min-w-0 pr-4">
          <p className="font-sans text-sm">Run inference</p>
          <p className="font-sans text-xs text-muted mt-0.5">
            Where a request is answered. Recorded per run, so a session always shows which provider produced it.
          </p>
        </div>
        <select
          value={prefs.provider}
          onChange={(e) => workspaceStore.setPrefs({ provider: e.target.value as "openrouter" | "ollama" })}
          aria-label="Model provider"
          className="shrink-0 bg-bone/[0.04] border border-border rounded px-2.5 py-1 font-sans text-xs outline-none focus:border-bone/30"
        >
          <option value="openrouter">Remote (OpenRouter)</option>
          <option value="ollama">Local (Ollama)</option>
        </select>
      </div>

      <div className="border-t border-border/60 pt-3 space-y-1">
        <Line label="Next run" value={`${nextRun.label} — ${nextRun.model || "no model chosen"}`} />
        <Line label="Transport" value={nextRun.provider === "ollama" ? "tokens stay on this machine" : "sent to the relay"} />
        {nextRun.problem && (
          <p className="flex items-start gap-1.5 font-sans text-xs text-accent pt-1">
            <AlertCircle size={12} className="mt-0.5 shrink-0" />
            {`Local inference is selected but not usable: ${nextRun.problem}. Runs will refuse rather than silently fall back.`}
          </p>
        )}
      </div>

      {isLocal && (
        <div className="border-t border-border/60 pt-3 space-y-4">
          <div>
            <p className="font-sans text-sm">Runtime address</p>
            <p className="font-sans text-xs text-muted mt-0.5">
              Loopback only by default. A non-loopback address is refused until the opt-in below is on.
            </p>
            <input
              type="text"
              value={prefs.ollamaBaseUrl}
              onChange={(e) => workspaceStore.setPrefs({ ollamaBaseUrl: e.target.value })}
              aria-label="Local runtime base URL"
              spellCheck={false}
              className={inputClass + " mt-2"}
            />
            {!urlCheck.ok && prefs.ollamaBaseUrl.trim() !== "" && (
              <p className="font-sans text-xs text-accent mt-1">{urlCheck.reason}</p>
            )}
            {urlCheck.nonLoopback && (
              <div className="flex items-center justify-between py-2">
                <div className="min-w-0 pr-4">
                  <p className="font-sans text-xs">Allow a non-loopback runtime address</p>
                  <p className="font-sans text-2xs text-muted mt-0.5">
                    Only with a hardened runtime. Anything on the network can then reach it.
                  </p>
                </div>
                <Toggle
                  checked={prefs.allowNonLoopbackLocalProvider}
                  onChange={(v) => workspaceStore.setPrefs({ allowNonLoopbackLocalProvider: v })}
                />
              </div>
            )}
          </div>

          <div>
            <p className="font-sans text-sm">Local model</p>
            <p className="font-sans text-xs text-muted mt-0.5">
              No model is assumed. Type the exact id, or list what the runtime already has and pick one.
            </p>
            <input
              type="text"
              value={prefs.ollamaModel}
              onChange={(e) => workspaceStore.setPrefs({ ollamaModel: e.target.value })}
              placeholder="e.g. the model id exactly as `ollama list` prints it"
              aria-label="Local model id"
              spellCheck={false}
              className={inputClass + " mt-2"}
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void checkConnection()}
              disabled={busy !== null || !urlCheck.ok}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-border hover:border-accent/40 disabled:opacity-40 font-sans text-xs text-bone/80 transition-colors"
            >
              <RefreshCw size={11} className={busy === "health" ? "animate-spin" : ""} /> Check connection
            </button>
            <button
              onClick={() => void listModels()}
              disabled={busy !== null || !urlCheck.ok}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-border hover:border-accent/40 disabled:opacity-40 font-sans text-xs text-bone/80 transition-colors"
            >
              <Cpu size={11} /> List installed models
            </button>
          </div>

          {probe.kind !== "idle" && (
            <p
              className={
                "flex items-start gap-1.5 font-sans text-xs " +
                (probe.kind === "error" ? "text-accent" : probe.kind === "ok" ? "text-bone/70" : "text-muted")
              }
              role="status"
            >
              {probe.kind === "ok" && <CheckCircle2 size={12} className="mt-0.5 shrink-0" />}
              {probe.kind === "error" && <AlertCircle size={12} className="mt-0.5 shrink-0" />}
              <span>
                {probe.kind === "busy"
                  ? "Asking the local runtime…"
                  : probe.kind === "ok" || probe.kind === "error"
                    ? probe.message
                    : ""}
              </span>
            </p>
          )}

          {models && models.length > 0 && (
            <ul className="space-y-1.5">
              {models.map((m) => (
                <li key={m.name} className="flex items-center gap-2 border border-border/50 rounded-sm px-3 py-2 bg-bone/[0.02]">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-bone/80 truncate">{m.name}</p>
                    <p className="font-mono text-[9px] text-muted/60">
                      {[m.parameterSize, m.quantization, fmtBytes(m.sizeBytes)].filter(Boolean).join(" · ")}
                      {m.modifiedAt ? ` · ${m.modifiedAt}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => workspaceStore.setPrefs({ ollamaModel: m.name })}
                    className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-sm border border-border font-sans text-[10px] text-bone/70 hover:bg-bone/5"
                  >
                    Use
                  </button>
                  <button
                    onClick={() => void inspect(m.name)}
                    disabled={busy !== null}
                    className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-sm border border-border font-sans text-[10px] text-bone/70 hover:bg-bone/5 disabled:opacity-40"
                  >
                    Inspect
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-border/60 pt-3">
            <p className="font-sans text-xs text-muted">
              If local inference fails, the request fails — nothing is resent to a hosted model unless you allow it here.
            </p>
            <div className="flex items-center justify-between py-2">
              <div className="min-w-0 pr-4">
                <p className="font-sans text-xs">Allow remote fallback</p>
                <p className="font-sans text-2xs text-muted mt-0.5">
                  When on, a local outage retries on OpenRouter and the run is labelled as a fallback.
                </p>
              </div>
              <Toggle
                checked={prefs.remoteFallback === "allow"}
                onChange={(v) => workspaceStore.setPrefs({ remoteFallback: v ? "allow" : "never" })}
              />
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-border/60 pt-3 space-y-1">
        <p className="font-sans text-xs text-muted">
          {nextRun.provider === "ollama" ? "Local model capabilities" : "Provider capabilities"}
        </p>
        <Line label="Streaming" value={describeCapability(capabilities.streaming)} />
        <Line label="Structured output" value={describeCapability(capabilities.structuredOutput)} />
        <Line label="Tool calls" value={describeCapability(capabilities.toolCalls)} />
        <Line label="Image input" value={describeCapability(capabilities.vision)} />
        <Line
          label="Context window"
          value={capabilities.contextWindow !== null ? `${capabilities.contextWindow.toLocaleString()} tokens` : "unknown"}
        />
        <ul className="pt-1 space-y-0.5">
          {capabilities.basis.map((b) => (
            <li key={b} className="font-sans text-2xs text-muted/70 leading-relaxed">· {b}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
