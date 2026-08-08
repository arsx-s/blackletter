import { useEffect, useRef, useState } from "react";
import { ArrowUp, FileText, Loader2, Paperclip, Sparkles, X } from "lucide-react";
import { useWorkspaceStore, workspaceStore } from "../../stores/use-workspace";
import { useChatTurn } from "../canvas/use-chat-turn";
import { renderMarkdown } from "../research/ResearchReport";
import { AiErrorBanner } from "../ui/ai-error-banner";
import { extractTextFromFile } from "../../pipeline/documentEngine";
import type { WorkspaceDocument } from "../../types/workspace";

const ACCEPTED_EXTENSIONS = [".txt", ".md", ".pdf", ".docx"];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

interface SimpleChatProps {
  tabId: string;
  onOpenSettings: () => void;
}

export function SimpleChat({ tabId, onOpenSettings }: SimpleChatProps) {
  const state = useWorkspaceStore();
  const tab = state.tabs.find((t) => t.id === tabId) ?? null;
  const { running, run } = useChatTurn();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const docs = tab?.documentIds
    .map((id) => state.documents.find((d) => d.id === id))
    .filter((d) => d !== undefined) ?? [];

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [tab?.messages.length, tab?.streaming, tab?.phase]);

  if (!tab) return null;

  const empty = tab.messages.length === 0 && !tab.fullText;
  const streaming = tab.streaming === true || running;
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
        const content = await extractTextFromFile(file);
        const docId = workspaceStore.addDocument({
          workspaceId: tab.workspaceId,
          folderId: null,
          name: file.name,
          extension: ext.replace(".", ""),
          size: file.size,
          pageCount: null,
          content,
        });
        workspaceStore.attachDocumentToTab(tabId, docId);
        workspaceStore.deriveGraphFromDocument(docId);
      } catch {
        workspaceStore.setTabError(tabId, { code: "UNSUPPORTED_FILE", message: `Could not extract text from ${file.name}.` });
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 lg:pt-10 pb-4">
          {tab.error && (
            <AiErrorBanner
              error={tab.error}
              onRetry={() => { workspaceStore.setTabError(tabId, null); void run(tabId, tab.topic || tab.title); }}
              onDismiss={() => workspaceStore.setTabError(tabId, null)}
              onOpenSettings={onOpenSettings}
            />
          )}

          {empty && (
            <div className="text-center pt-10 lg:pt-20 pb-8">
              <div className="flex justify-center mb-6">
                <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                  <Sparkles size={20} className="text-accent" />
                </div>
              </div>
              <h1 className="font-display text-3xl lg:text-4xl font-black tracking-tighter mb-2">
                What are you researching?
              </h1>
              <p className="font-sans text-sm text-muted mb-10">
                Ask a question, upload a document, or start a research session.
              </p>
            </div>
          )}

          {!empty && (
            <div className="space-y-5">
              {tab.messages.map((m, i) => (
                <div key={i} className="flex" style={{ justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                  {m.role === "user" ? (
                    <div className="max-w-[85%] rounded-lg px-4 py-2.5 bg-accent text-surface font-sans text-sm whitespace-pre-wrap break-words">
                      {m.content}
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <div className="text-xs font-mono uppercase tracking-wider text-muted mb-1.5 flex items-center gap-1.5">
                        <Sparkles size={10} /> BlackLetter
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0 font-sans text-sm text-bone/80 leading-relaxed whitespace-pre-wrap break-words">
                          {m.content}
                        </div>
                      </div>
                      {i === tab.messages.length - 1 && !streaming && tab.phase === "complete" && tab.fullText && (
                        <div
                          className="mt-3 bl-prose [&_*]:text-bone/85 [&_p]:my-2 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(tab.fullText) }}
                        />
                      )}
                      {i === tab.messages.length - 1 && !streaming && tab.phase === "complete" && tab.followUps.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {tab.followUps.slice(0, 3).map((q) => (
                            <button
                              key={q}
                              onClick={() => submit(q)}
                              className="px-3 py-1.5 rounded-full border border-border text-xs font-sans text-bone/70 hover:border-accent/40 hover:text-bone transition-colors"
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {streaming && (
                <div className="flex items-center gap-2.5 px-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  <span className="font-sans text-xs text-muted">Research is in progress…</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {docs.length > 0 && (
        <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 pb-2 flex flex-wrap gap-1.5">
          {docs.map((doc) => (
            <span key={doc.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-bone/5 border border-border font-sans text-2xs text-muted">
              <FileText size={10} className="shrink-0" />
              <span className="max-w-40 truncate">{doc.name}</span>
              <button
                onClick={() => workspaceStore.deleteDocument(doc.id)}
                className="shrink-0 hover:text-bone"
                aria-label={`Remove ${doc.name}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 pb-5 pt-1">
        <div className="flex items-end gap-2 rounded-xl border border-border bg-bone/[0.03] px-3 py-2.5 focus-within:border-accent/40 transition-colors">
          <button
            onClick={() => fileRef.current?.click()}
            className="p-1.5 rounded-md text-muted hover:text-bone hover:bg-bone/5 transition-colors shrink-0"
            title="Upload a document"
            aria-label="Upload a document"
          >
            <Paperclip size={16} />
          </button>
          <textarea
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
            rows={1}
            spellCheck={state.prefs.spellcheck}
            className="flex-1 min-w-0 bg-transparent font-sans text-sm outline-none resize-none py-1 max-h-40 placeholder:text-muted/40"
          />
          <button
            onClick={() => submit()}
            disabled={!canSend}
            className="p-2 rounded-md bg-accent text-surface hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            title="Send"
            aria-label="Send"
          >
            <ArrowUp size={15} />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <p className="font-mono text-2xs text-muted/50">Answer · Upload · Research</p>
          {busy && (
            <p className="font-mono text-2xs text-muted/50 flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" /> Processing
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