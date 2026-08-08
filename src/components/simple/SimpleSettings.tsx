import { useState } from "react";
import { ChevronLeft, Sliders } from "lucide-react";
import { useWorkspaceStore, workspaceStore } from "../../stores/use-workspace";
import { Toggle } from "../ui/toggle";

export function SimpleSettings({ onClose }: { onClose: () => void }) {
  const state = useWorkspaceStore();
  const prefs = state.prefs;

  const [name, setName] = useState(() => {
    try { return localStorage.getItem("bl_username") || ""; } catch { return ""; }
  });

  const saveName = (value: string) => {
    setName(value);
    try { localStorage.setItem("bl_username", value.trim()); } catch { /* ignore */ }
  };

  const rowClass = "flex items-center justify-between gap-4 py-2.5";
  const labelClass = "font-sans text-sm text-bone/80";
  const descClass = "font-sans text-xs text-muted mt-0.5";

  return (
    <div className="h-full overflow-y-auto scrollbar-hide">
      <div className="max-w-xl mx-auto px-6 py-10">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 font-sans text-xs text-muted hover:text-bone transition-colors mb-8"
        >
          <ChevronLeft size={13} /> Back to chats
        </button>

        <h1 className="font-display text-3xl font-black tracking-tighter mb-1">Settings</h1>
        <p className="font-sans text-sm text-muted mb-8">Preferences for your BlackLetter experience.</p>

        <div className="space-y-4">
          <section className="bg-background border border-border/70 rounded-xl p-5">
            <div>
              <p className={labelClass}>Your name</p>
              <p className={descClass}>Used for your profile indicator and greetings.</p>
            </div>
            <input
              value={name}
              onChange={(e) => saveName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              placeholder="Your name"
              className="mt-3 w-full bg-bone/[0.03] border border-border px-3 py-2 font-sans text-sm outline-none focus:border-accent/50 transition-colors rounded-md placeholder:text-muted/40"
            />
          </section>

          <section className="bg-background border border-border/70 rounded-xl p-5">
            <div className={rowClass}>
              <div>
                <p className={labelClass}>Editor font size</p>
                <p className={descClass}>Controls text size in the editor, notes, and reports.</p>
              </div>
              <select
                value={prefs.fontSize}
                onChange={(e) => workspaceStore.setPrefs({ fontSize: e.target.value as "small" | "medium" | "large" })}
                className="bg-bone/[0.04] border border-border rounded px-2.5 py-1 font-sans text-xs outline-none focus:border-accent/50"
              >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
            <div className={rowClass}>
              <div>
                <p className={labelClass}>Spellcheck</p>
                <p className={descClass}>Enable spellcheck in the composer.</p>
              </div>
              <Toggle checked={prefs.spellcheck} onChange={(v) => workspaceStore.setPrefs({ spellcheck: v })} />
            </div>
            <div className={rowClass}>
              <div>
                <p className={labelClass}>Word wrap</p>
                <p className={descClass}>Wrap long lines in the editor.</p>
              </div>
              <Toggle checked={prefs.wordWrap} onChange={(v) => workspaceStore.setPrefs({ wordWrap: v })} />
            </div>
            <div className={rowClass}>
              <div>
                <p className={labelClass}>Auto-save</p>
                <p className={descClass}>Persist the workspace automatically as you work.</p>
              </div>
              <Toggle checked={prefs.autosave} onChange={(v) => workspaceStore.setPrefs({ autosave: v })} />
            </div>
          </section>

          <section className="bg-background border border-border/70 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <SlidersIcon />
              <div>
                <p className={labelClass}>Advanced controls</p>
                <p className={descClass}>
                  Model selection, knowledge graph, research canvas, and diagnostics live in Developer Mode.
                </p>
              </div>
            </div>
            <button
              onClick={() => workspaceStore.setPrefs({ developerMode: true })}
              className="mt-4 w-full px-4 py-2.5 rounded-md border border-border bg-bone/[0.03] font-sans text-xs font-medium text-bone/80 hover:border-accent/40 hover:text-bone transition-colors"
            >
              Open Developer Mode
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

function SlidersIcon() {
  return (
    <div className="w-8 h-8 rounded-md bg-bone/5 border border-border flex items-center justify-center shrink-0">
      <Sliders size={14} className="text-muted" />
    </div>
  );
}