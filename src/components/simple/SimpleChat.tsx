import { useEffect, useRef, useState } from "react";
import { ArrowUp, FileText, Loader2, MessageSquare, Paperclip, Sparkles, X } from "lucide-react";
import { useWorkspaceStore, workspaceStore } from "../../stores/use-workspace";
import { useChatTurn } from "../canvas/use-chat-turn";
import { renderMarkdown } from "../research/ResearchReport";
import { AiErrorBanner } from "../ui/ai-error-banner";
import { AnimatedCopyButton } from "../ui/animated-copy-button";
import { extractForUpload, describeFailure } from "../../pipeline/documentEngine";

const ACCEPTED_EXTENSIONS = [".txt", ".md", ".pdf", ".docx"];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Human-readable form of the real upload constraints, so the UI and the
 *  validator can never drift apart. */
const ACCEPTED_LABEL = ACCEPTED_EXTENSIONS.map((e) => e.replace(".", "").toUpperCase()).join(" · ");
const MAX_FILE_LABEL = `${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB`;

interface SimpleChatProps {
  tabId: string;
  onOpenSettings: () => void;
}

export function SimpleChat({ tabId, onOpenSettings }: SimpleChatProps) {
  const state = useWorkspaceStore();
  const tab = state.tabs.find((t) => t.id === tabId) ?? null;
  const { run, cancel, isActive } = useChatTurn();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const docs = tab?.documentIds
    .map((id) => state.documents.find((d) => d.id === id))
    .filter((d) => d !== undefined) ?? [];

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [tab?.messages.length, tab?.streaming, tab?.phase]);

  if (!tab) return null;

  const empty = tab.messages.length === 0 && !tab.fullText;
  /** A run for *this* tab is live, so stopping it will actually abort a request. */
  const live = isActive(tabId);
  const streaming = tab.streaming === true || live;
  const busy = streaming;
  const canSend = input.trim().length > 0 && !busy;

  const submit = (text?: string) => {
    const prompt = (text ?? input).trim();
    if (!prompt || busy) return;
    setInput("");
    void run(tabId, prompt);
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        workspaceStore.setTabError(tabId, { code: "UNSUPPORTED_FILE_TYPE", message: `Unsupported file type: ${file.name}. Supported: ${ACCEPTED_EXTENSIONS.join(", ")}` });
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        workspaceStore.setTabError(tabId, { code: "DOCUMENT_TOO_LARGE", message: `${file.name} exceeds the 10 MB limit.` });
        continue;
      }
      try {
        const extracted = await extractForUpload(file);
        const docId = workspaceStore.addDocument({
          workspaceId: tab.workspaceId,
          folderId: null,
          name: file.name,
          extension: ext.replace(".", ""),
          size: file.size,
          pageCount: extracted.pageCount,
          content: extracted.text,
        });
        workspaceStore.attachDocumentToTab(tabId, docId);
        workspaceStore.deriveGraphFromDocument(docId);
      } catch (error) {
        const failure = describeFailure(error, file.name);
        workspaceStore.setTabError(tabId, failure);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        {/* min-h-full + flex column lets the empty state claim the full viewport
            height and centre itself, instead of hugging the top and leaving a
            dead band above the composer. */}
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 pt-6 pb-4 sm:px-6 lg:pt-10">
          {tab.error && (
            <AiErrorBanner
              error={tab.error}
              onRetry={() => { workspaceStore.setTabError(tabId, null); void run(tabId, tab.topic || tab.title); }}
              onDismiss={() => workspaceStore.setTabError(tabId, null)}
              onOpenSettings={onOpenSettings}
            />
          )}

          {empty && (
            <div className="flex flex-1 items-center justify-center py-8">
              <div className="w-full text-center">
                <div className="mb-6 flex justify-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-accent/20 bg-accent/10 shadow-button">
                    <Sparkles size={20} className="text-accent" />
                  </div>
                </div>
                <h1 className="font-display text-3xl font-black tracking-tighter lg:text-4xl">
                  What are you researching?
                </h1>
                <p className="mx-auto mt-2 max-w-md font-sans text-sm text-muted">
                  Ask a question, upload a document, or start a research session. Everything you gather stays in this workspace.
                </p>

                {/* Both actions are real: one moves focus to the composer, the
                    other opens the same file picker the paperclip uses. */}
                <div className="mx-auto mt-8 grid w-full max-w-md gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => inputRef.current?.focus()}
                    className="group flex items-center gap-3 rounded-md border border-border bg-bone/[0.02] px-3.5 py-3 text-left transition-colors hover:border-accent/40 hover:bg-bone/[0.04] focus-ring active:scale-[0.99]"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-border bg-background text-muted transition-colors group-hover:border-accent/30 group-hover:text-accent">
                      <MessageSquare size={14} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-sans text-xs font-medium text-bone">Ask a question</span>
                      <span className="block font-sans text-2xs text-faint">Type a topic or question to begin</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="group flex items-center gap-3 rounded-md border border-border bg-bone/[0.02] px-3.5 py-3 text-left transition-colors hover:border-accent/40 hover:bg-bone/[0.04] focus-ring active:scale-[0.99]"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-border bg-background text-muted transition-colors group-hover:border-accent/30 group-hover:text-accent">
                      <Paperclip size={14} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-sans text-xs font-medium text-bone">Upload a document</span>
                      <span className="block font-sans text-2xs text-faint">{ACCEPTED_LABEL} · up to {MAX_FILE_LABEL}</span>
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {!empty && (
            <div className="space-y-6">
              {tab.messages.map((m, i) => (
                <div key={i} className="flex" style={{ justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                  {m.role === "user" ? (
                    <div className="max-w-[85%] rounded-lg border border-accent/25 bg-accent px-4 py-2.5 font-sans text-sm text-surface shadow-button whitespace-pre-wrap break-words">
                      {m.content}
                    </div>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 font-mono text-2xs uppercase tracking-ultra text-faint">
                          <Sparkles size={10} aria-hidden="true" /> BlackLetter
                        </span>
                        {i === tab.messages.length - 1 && !streaming && tab.fullText && (
                          <AnimatedCopyButton text={tab.fullText} className="h-6 w-6 shrink-0" />
                        )}
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1 font-sans text-sm leading-relaxed text-bone/85 whitespace-pre-wrap break-words">
                          {m.content}
                        </div>
                      </div>
                      {i === tab.messages.length - 1 && !streaming && tab.phase === "complete" && tab.fullText && (
                        <div
                          className="bl-prose mt-3 [&_*]:text-bone/85 [&_p]:my-2 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(tab.fullText) }}
                        />
                      )}
                      {i === tab.messages.length - 1 && !streaming && tab.phase === "complete" && tab.followUps.length > 0 && (
                        <div className="mt-4">
                          {tab.followUpsOrigin !== "answer" && (
                            <p className="mb-1 font-sans text-micro text-faint">
                              {tab.followUpsOrigin === "app"
                                ? "Suggested by the application — not taken from this answer."
                                : "Origin unrecorded — not checked against this answer."}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {tab.followUps.slice(0, 3).map((q) => (
                              <button
                                key={q}
                                onClick={() => submit(q)}
                                className="rounded-full border border-border px-3 py-1.5 font-sans text-xs text-bone/70 transition-colors hover:border-accent/40 hover:bg-bone/[0.03] hover:text-bone focus-ring"
                              >
                                {q}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {streaming && (
                <div className="flex items-center gap-3" role="status" aria-live="polite">
                  <span className="relative flex h-1.5 w-1.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-accent/60 animate-ping" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                  </span>
                  <span className="font-sans text-xs text-muted">Research is in progress…</span>
                  <span className="h-px flex-1 overflow-hidden rounded-full bg-border" aria-hidden="true">
                    <span className="block h-full w-1/3 rounded-full bg-accent/40 animate-progress-sweep" />
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {docs.length > 0 && (
        <div className="mx-auto w-full max-w-3xl px-4 pb-2 sm:px-6">
          <p className="mb-1.5 font-mono text-2xs uppercase tracking-ultra text-faint">
            {docs.length === 1 ? "1 source attached" : `${docs.length} sources attached`}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {docs.map((doc) => (
              <span key={doc.id} className="flex items-center gap-1.5 rounded-md border border-border bg-bone/[0.05] px-2.5 py-1 font-sans text-2xs text-muted transition-colors hover:border-border-strong">
                <FileText size={10} className="shrink-0" aria-hidden="true" />
                <span className="max-w-40 truncate" title={doc.name}>{doc.name}</span>
                <button
                  onClick={() => workspaceStore.deleteDocument(doc.id)}
                  className="shrink-0 rounded-2xs p-0.5 transition-colors hover:bg-bone/[0.06] hover:text-bone focus-ring"
                  aria-label={`Remove ${doc.name}`}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-3xl px-4 pb-5 pt-1 sm:px-6">
        <div className="surface-panel flex items-end gap-2 rounded-lg px-3 py-2.5 transition-colors focus-within:border-accent/45">
          <button
            onClick={() => fileRef.current?.click()}
            className="shrink-0 rounded-sm p-1.5 text-muted transition-colors hover:bg-bone/[0.06] hover:text-bone focus-ring"
            title="Upload a document"
            aria-label={`Upload a document (${ACCEPTED_LABEL}, up to ${MAX_FILE_LABEL})`}
          >
            <Paperclip size={16} />
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && canSend) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Ask BlackLetter…"
            aria-label="Message BlackLetter"
            rows={1}
            spellCheck={state.prefs.spellcheck}
            className="max-h-40 min-w-0 flex-1 resize-none bg-transparent py-1 font-sans text-sm outline-none placeholder:text-faint"
          />
          {/* 36px hit area with a 40px wrapper on touch — comfortably tappable
              without making the composer taller on desktop. While a run for
              this tab is live the same slot becomes Stop, so the control never
              moves and never resizes. */}
          {live ? (
            <button
              onClick={cancel}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border-strong bg-bone/[0.06] text-bone transition-[background-color,transform] duration-150 hover:bg-bone/[0.1] active:scale-[0.96] focus-ring"
              title="Stop generating"
              aria-label="Stop generating"
            >
              <span className="h-3 w-3 rounded-2xs bg-current" aria-hidden="true" />
            </button>
          ) : (
            <button
              onClick={() => submit()}
              disabled={!canSend}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-accent/30 bg-accent text-surface transition-[background-color,transform,opacity] duration-150 hover:bg-accent-hover active:scale-[0.96] disabled:cursor-not-allowed disabled:border-border disabled:bg-bone/[0.06] disabled:text-faint focus-ring"
              title="Send"
              aria-label="Send message"
            >
              <ArrowUp size={16} />
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="font-mono text-2xs text-faint">
            <kbd className="font-mono">Enter</kbd> to send · <kbd className="font-mono">Shift</kbd>+<kbd className="font-mono">Enter</kbd> for a new line
          </p>
          {live && (
            <p className="flex shrink-0 items-center gap-1 font-mono text-2xs text-faint" aria-hidden="true">
              <Loader2 size={10} className="animate-spin" /> Stop to cancel
            </p>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(",")}
        multiple
        className="hidden"
        onChange={(e) => void handleUpload(e.target.files)}
      />
    </div>
  );
}
