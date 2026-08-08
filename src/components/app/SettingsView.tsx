import {
  Activity, Archive, Brain, Copy, History, Layers, Plus, RotateCw, Settings, Globe, BookOpen, Sliders, Trash2, Key, ExternalLink,
} from "lucide-react";
import { Toggle } from "../ui/toggle";
import { workspaceStore } from "../../stores/workspace-store";
import { useWorkspaceStore } from "../../stores/use-workspace";
import { MODEL_CATEGORIES, modelForCategory, categoryForModel, type ModelCategory } from "../../config/models";
import { openExternalUrl } from "../../lib/electron";

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

export function SettingsView() {
  const state = useWorkspaceStore();
  const prefs = state.prefs;
  const workspaceId = state.activeWorkspaceId;
  const activeTab = state.tabs.find((t) => t.id === state.activeTabId) ?? null;
  const memory = workspaceStore.getMemory(workspaceId);
  const snapshots = workspaceStore.snapshotsForWorkspace(workspaceId, "snapshot");
  const templates = workspaceStore.snapshotsForWorkspace(workspaceId, "template");
  const history = activeTab?.history ?? [];

  const sectionClass = "bg-background border border-border/70 rounded-xl p-5";
  const labelClass = "font-sans text-sm font-medium text-bone/80";
  const descClass = "font-sans text-xs text-muted mt-0.5";
  const rowClass = "flex items-center justify-between gap-4 py-2";

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8 max-w-2xl">
      <div className="flex items-center gap-4 mb-8">
        <Settings size={28} className="text-muted" />
        <h1 className="font-display text-4xl font-black tracking-tighter">Workshop</h1>
      </div>

      <div className="space-y-6 pb-12">
        <div className={sectionClass}>
          <div className="flex items-center gap-3 mb-4">
            <Sliders size={16} className="text-muted" />
            <p className={labelClass}>General</p>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-sans text-sm">Editor font size</p>
                <p className={descClass}>Controls text size in the editor, notes, and reports</p>
              </div>
              <select value={prefs.fontSize} onChange={(e) => workspaceStore.setPrefs({ fontSize: e.target.value as "small" | "medium" | "large" })}
                className="bg-bone/[0.04] border border-border rounded px-2.5 py-1 font-sans text-xs outline-none focus:border-bone/30">
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-sans text-sm">Spellcheck</p>
                <p className={descClass}>Enable spellcheck in the editor</p>
              </div>
              <Toggle checked={prefs.spellcheck} onChange={(v) => workspaceStore.setPrefs({ spellcheck: v })} />
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-sans text-sm">Word wrap</p>
                <p className={descClass}>Wrap long lines in the editor</p>
              </div>
              <Toggle checked={prefs.wordWrap} onChange={(v) => workspaceStore.setPrefs({ wordWrap: v })} />
            </div>
          </div>
        </div>

        <div className={sectionClass}>
          <div className="flex items-center gap-3 mb-4">
            <Globe size={16} className="text-muted" />
            <p className={labelClass}>Research</p>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-sans text-sm">Default research mode</p>
                <p className={descClass}>Preselected mode when starting research</p>
              </div>
              <select value={prefs.defaultMode} onChange={(e) => workspaceStore.setPrefs({ defaultMode: e.target.value })}
                className="bg-bone/[0.04] border border-border rounded px-2.5 py-1 font-sans text-xs outline-none focus:border-bone/30">
                <option value="deep-research">Deep Research</option>
                <option value="quick-analysis">Quick Analysis</option>
                <option value="literature-review">Literature Review</option>
                <option value="conceptual">Conceptual Framework</option>
              </select>
            </div>
          </div>
        </div>

        <div className={sectionClass}>
          <div className="flex items-center gap-3 mb-4">
            <Key size={16} className="text-muted" />
            <p className={labelClass}>AI & Models</p>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-sans text-sm">Default model</p>
                <p className={descClass}>Used for new sessions unless a model is chosen explicitly</p>
              </div>
              <select
                value={categoryForModel(prefs.defaultModel)}
                onChange={(e) => workspaceStore.setPrefs({ defaultModel: modelForCategory(e.target.value as ModelCategory) })}
                className="bg-bone/[0.04] border border-border rounded px-2.5 py-1 font-sans text-xs outline-none focus:border-bone/30"
              >
                {MODEL_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label} — {c.model}</option>
                ))}
              </select>
            </div>
            <div className="border-t border-border/60 pt-3">
              <p className="font-sans text-sm">API key</p>
              <p className={descClass + " mt-1 leading-relaxed"}>
                BlackLetter calls OpenRouter with the key in your <span className="font-mono text-2xs">OPENROUTER_API_KEY</span> environment variable.
                If the key is missing or invalid, you'll see a "No API Key" notice here in Workshop.
              </p>
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => openExternalUrl("https://openrouter.ai/keys")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-border hover:border-accent/40 font-sans text-xs text-bone/80 transition-colors"
                >
                  Get an API key <ExternalLink size={11} />
                </button>
                <button
                  onClick={() => openExternalUrl("https://openrouter.ai/docs/quickstart")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-border hover:border-accent/40 font-sans text-xs text-bone/80 transition-colors"
                >
                  OpenRouter docs <ExternalLink size={11} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={sectionClass}>
          <div className="flex items-center gap-3 mb-4">
            <BookOpen size={16} className="text-muted" />
            <p className={labelClass}>Editor</p>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-sans text-sm">Autosave notebooks</p>
                <p className={descClass}>Automatically persist changes to this device. Turn off to save manually (Ctrl+S or on exit)</p>
              </div>
              <Toggle checked={prefs.autosave} onChange={(v) => workspaceStore.setPrefs({ autosave: v })} />
            </div>
            <div className="flex items-center gap-3 py-2">
              <div className="flex-1">
                <p className="font-sans text-sm">Temperature</p>
                <p className={descClass}>AI response creativity ({prefs.temperature})</p>
              </div>
              <input type="range" min={0} max={1} step={0.1} value={prefs.temperature}
                onChange={(e) => workspaceStore.setPrefs({ temperature: parseFloat(e.target.value) })}
                className="w-24 accent-accent" />
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-sans text-sm">Max tokens</p>
                <p className={descClass}>Maximum response length</p>
              </div>
              <select value={prefs.maxTokens} onChange={(e) => workspaceStore.setPrefs({ maxTokens: parseInt(e.target.value, 10) })}
                className="bg-bone/[0.04] border border-border rounded px-2.5 py-1 font-sans text-xs outline-none focus:border-bone/30">
                <option value={2048}>2,048</option>
                <option value={4096}>4,096</option>
                <option value={8192}>8,192</option>
              </select>
            </div>
          </div>
        </div>

        <div className={sectionClass}>
          <div className="flex items-center gap-3 mb-4">
            <Brain size={16} className="text-muted" />
            <p className={labelClass}>Research memory</p>
          </div>
          <p className={descClass + " mb-3"}>
            BlackLetter remembers past research in this workspace — goals, concepts, gaps, and follow-ups — and uses it to continue topics across sessions.
          </p>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-sans text-sm">Stored knowledge</p>
              <p className={descClass}>{memory.entries.length} exchanges · {memory.concepts.length} concepts · {memory.gaps.length} gaps · {memory.goals.length} goals</p>
            </div>
            <button
              onClick={() => { if (confirm("Clear this workspace's research memory? This cannot be undone.")) workspaceStore.clearMemory(workspaceId); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-border font-sans text-xs text-bone/70 hover:bg-bone/5 transition-colors"
            >
              <Trash2 size={12} /> Clear memory
            </button>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-sans text-sm">Developer Mode</p>
              <p className={descClass}>Show the live pipeline in System Status — stages, events, and prompt inspection</p>
            </div>
            <Toggle checked={prefs.developerMode} onChange={(v) => workspaceStore.setPrefs({ developerMode: v })} />
          </div>
        </div>

        <div className={sectionClass}>
          <div className="flex items-center gap-3 mb-4">
            <History size={16} className="text-muted" />
            <p className={labelClass}>Session timeline</p>
          </div>
          {history.length === 0 ? (
            <p className={descClass}>No activity in this session yet.</p>
          ) : (
            <ol className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {[...history].reverse().map((e) => (
                <li key={e.id} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent/70 mt-1.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted/70">{e.kind} · {fmtTime(e.at)}</p>
                    {e.detail && <p className="font-sans text-xs text-bone/70">{e.detail}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className={sectionClass}>
          <div className="flex items-center gap-3 mb-4">
            <Layers size={16} className="text-muted" />
            <p className={labelClass}>Workspace snapshots & templates</p>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-sans text-sm">Snapshots</p>
                <p className={descClass}>Capture sessions, documents, notes, and canvas — restore anytime</p>
              </div>
              <button
                onClick={() => workspaceStore.addWorkspaceSnapshot(workspaceId)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-accent text-surface font-sans text-xs font-medium"
              >
                <Plus size={12} /> Capture snapshot
              </button>
            </div>
            {snapshots.length > 0 && (
              <ul className="space-y-1.5">
                {snapshots.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 border border-border/50 rounded-sm px-3 py-2 bg-bone/[0.02]">
                    <Archive size={12} className="text-muted shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-sans text-xs text-bone/80 truncate">{s.label}</p>
                      <p className="font-mono text-[9px] text-muted/60">{fmtTime(s.at)} · {s.tabs.length} tabs · {s.documents.length} docs</p>
                    </div>
                    <button
                      onClick={() => { if (confirm("Restore this snapshot? Current workspace content for sessions, documents, notes, and canvas will be replaced.")) workspaceStore.restoreWorkspaceSnapshot(workspaceId, s.id); }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-sm border border-border font-sans text-[10px] text-bone/70 hover:bg-bone/5"
                    >
                      <RotateCw size={10} /> Restore
                    </button>
                    <button
                      onClick={() => workspaceStore.deleteWorkspaceSnapshot(workspaceId, s.id)}
                      className="p-1 rounded-sm text-muted hover:text-accent"
                    >
                      <Trash2 size={11} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center justify-between py-2 border-t border-border/50">
              <div>
                <p className="font-sans text-sm">Templates</p>
                <p className={descClass}>Save structure (folders, notes, canvas) to scaffold new workspaces</p>
              </div>
              <button
                onClick={() => workspaceStore.addTemplate(workspaceId)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-accent text-surface font-sans text-xs font-medium"
              >
                <Copy size={12} /> Save as template
              </button>
            </div>
            {templates.length > 0 && (
              <ul className="space-y-1.5">
                {templates.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 border border-border/50 rounded-sm px-3 py-2 bg-bone/[0.02]">
                    <Copy size={12} className="text-muted shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-sans text-xs text-bone/80 truncate">{t.label}</p>
                      <p className="font-mono text-[9px] text-muted/60">{fmtTime(t.at)}</p>
                    </div>
                    <button
                      onClick={() => {
                        const name = prompt("Name the new workspace", `${t.label.replace(/^Template /, "")}`);
                        if (name === null) return;
                        workspaceStore.createWorkspaceFromTemplate(t.id, name);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-sm border border-border font-sans text-[10px] text-bone/70 hover:bg-bone/5"
                    >
                      <Plus size={10} /> Use
                    </button>
                    <button onClick={() => workspaceStore.deleteTemplate(t.id)} className="p-1 rounded-sm text-muted hover:text-accent">
                      <Trash2 size={11} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className={sectionClass}>
          <div className="flex items-center gap-3 mb-4">
            <Activity size={16} className="text-muted" />
            <p className={labelClass}>System</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-1.5">
              <span className="font-sans text-xs text-muted">Version</span>
              <span className="font-sans text-xs text-bone/70">3.2.0</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="font-sans text-xs text-muted">Build</span>
              <span className="font-sans text-xs text-bone/70">BlackLetter-OS</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="font-sans text-xs text-muted">Session</span>
              <span className="font-mono text-2xs text-bone/70">LOCAL — saved on this device</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}