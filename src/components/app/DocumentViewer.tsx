import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Upload, Search, X, BookMarked, Download, ChevronLeft, ChevronRight, Loader2,
} from "lucide-react";
import { Button } from "../ui/button";
import { toast } from "../ui/toast";
import { cn } from "../../lib/utils";
import { useWorkspaceStore, workspaceStore } from "../../stores/use-workspace";
import { extractTextFromFile } from "../../pipeline/documentEngine";

const PAGE_SIZE = 40;

function splitPages(text: string): string[] {
  const lines = text.split("\n");
  const pages: string[] = [];
  for (let i = 0; i < lines.length; i += PAGE_SIZE) pages.push(lines.slice(i, i + PAGE_SIZE).join("\n"));
  return pages.length > 0 ? pages : [""];
}

export function DocumentViewer() {
  const state = useWorkspaceStore();
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [uploading, setUploading] = useState(false);

  const documents = useMemo(
    () => state.documents.filter((d) => d.workspaceId === state.activeWorkspaceId),
    [state.documents, state.activeWorkspaceId],
  );

  useEffect(() => {
    const focusId = state.prefs.focusDocumentId;
    if (focusId && documents.some((d) => d.id === focusId)) {
      setActiveDocId(focusId);
      setCurrentPage(0);
      workspaceStore.setPrefs({ focusDocumentId: null });
    }
  }, [state.prefs.focusDocumentId, documents]);

  const activeDoc = documents.find((d) => d.id === activeDocId) ?? null;
  const activePages = useMemo(() => (activeDoc ? splitPages(activeDoc.content) : []), [activeDoc]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const text = await extractTextFromFile(file);
      const id = workspaceStore.addDocument({
        workspaceId: state.activeWorkspaceId,
        folderId: null,
        name: file.name,
        extension: file.name.substring(file.name.lastIndexOf(".") + 1).toLowerCase(),
        size: file.size,
        pageCount: null,
        content: text,
      });
      setActiveDocId(id);
      setCurrentPage(0);
      toast("Document uploaded.", "success");
    } catch {
      toast("Failed to read file. Supported: .txt, .md, .pdf, .docx", "error");
    } finally {
      setUploading(false);
    }
  };

  const downloadActive = () => {
    if (!activeDoc) return;
    const blob = new Blob([activeDoc.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = activeDoc.name.replace(/\.[^.]+$/, "") + ".txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast("Document downloaded.", "success");
  };

  const pageMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !activeDoc) return new Set<number>();
    const hits = new Set<number>();
    activeDoc.content.toLowerCase().split("\n").forEach((line, i) => {
      if (line.includes(q)) hits.add(Math.floor(i / PAGE_SIZE));
    });
    return hits;
  }, [searchQuery, activeDoc]);

  const visiblePages = useMemo(() => {
    if (!activeDoc) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activePages.map((_, i) => i);
    return activePages.map((_, i) => i).filter((i) => pageMatches.has(i));
  }, [activeDoc, activePages, searchQuery, pageMatches]);

  useEffect(() => {
    if (showSearch && visiblePages.length > 0 && !visiblePages.includes(currentPage)) {
      setCurrentPage(visiblePages[0]);
    }
  }, [visiblePages, showSearch, currentPage]);

  if (documents.length === 0) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 rounded-xl border border-black/10 bg-black/[0.03] flex items-center justify-center mx-auto mb-5">
            <FileText size={24} className="text-black/30" />
          </div>
          <p className="font-display text-xl font-medium text-black/80 mb-2">No documents yet</p>
          <p className="font-sans text-sm text-black/40 mb-6 max-w-xs mx-auto leading-relaxed">Upload your first document to view, annotate, and search within it.</p>
          <input type="file" accept=".txt,.md,.pdf,.docx" onChange={(e) => void handleUpload(e)} className="hidden" id="doc-upload-empty" />
          <label htmlFor="doc-upload-empty" className={cn(
            "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-sm bg-bone text-ink border border-bone cursor-pointer hover:bg-paper active:scale-[0.97] transition-all duration-150 ease-out select-none",
            uploading && "opacity-50 pointer-events-none cursor-wait",
          )}>
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? "Extracting…" : "Upload document"}
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="w-56 border-r border-black/10 flex flex-col shrink-0">
        <div className="flex items-center justify-between p-3 border-b border-black/10">
          <span className="font-sans text-xs text-black/50">{documents.length} file{documents.length !== 1 ? "s" : ""}</span>
          <input type="file" accept=".txt,.md,.pdf,.docx" onChange={(e) => void handleUpload(e)} className="hidden" id="doc-upload-sidebar" />
          <label htmlFor="doc-upload-sidebar" className={cn("p-1.5 rounded-xs hover:bg-black/10 cursor-pointer transition-colors", uploading && "opacity-50 pointer-events-none cursor-wait")}>
            {uploading ? <Loader2 size={13} className="animate-spin text-black/40" /> : <Upload size={13} className="text-black/40" />}
          </label>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {documents.map((d) => (
            <button key={d.id} onClick={() => { setActiveDocId(d.id); setCurrentPage(0); }}
              className={cn("w-full text-left p-3 border-b border-black/5 hover:bg-black/[0.03] transition-colors",
                activeDocId === d.id && "bg-black/10 border-l-2 border-l-white/50"
              )}>
              <p className="font-sans text-xs font-medium text-black/70 truncate">{d.name}</p>
              <p className="font-sans text-2xs text-black/30 mt-1">{splitPages(d.content).length} pages · {Math.max(1, Math.round(d.content.length / 1500)).toLocaleString()} words</p>
            </button>
          ))}
        </div>
      </div>

      {activeDoc ? (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-black/10">
            <div className="flex items-center gap-2 min-w-0">
              <FileText size={14} className="text-black/40 shrink-0" />
              <p className="font-sans text-sm font-medium truncate">{activeDoc.name}</p>
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => setShowSearch((v) => !v)} title="Search document"><Search size={13} /></Button>
              <Button size="sm" variant="ghost" onClick={() => toast("Annotations are coming soon.", "info")} title="Annotate"><BookMarked size={13} /></Button>
              <Button size="sm" variant="ghost" onClick={downloadActive} title="Download"><Download size={13} /></Button>
            </div>
          </div>

          <AnimatePresence>
            {showSearch && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-black/10 bg-black/[0.02]">
                  <Search size={12} className="text-black/30" />
                  <input autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={`Search ${activeDoc.name}…`}
                    className="flex-1 bg-transparent font-sans text-xs outline-none placeholder:text-black/20"
                  />
                  {searchQuery && (
                    <span className="font-mono text-2xs text-black/40 shrink-0">{pageMatches.size} page{pageMatches.size !== 1 ? "s" : ""}</span>
                  )}
                  <button onClick={() => { setShowSearch(false); setSearchQuery(""); }} className="p-0.5 hover:bg-black/10 rounded-xs"><X size={12} className="text-black/30" /></button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center justify-between px-4 py-1.5 border-b border-black/5 bg-black/[0.01]">
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" disabled={currentPage === 0} onClick={() => setCurrentPage((p) => p - 1)}><ChevronLeft size={13} /></Button>
              <span className="font-sans text-xs text-black/50 font-mono">p. {currentPage + 1} / {activePages.length}</span>
              <Button size="sm" variant="ghost" disabled={currentPage >= activePages.length - 1} onClick={() => setCurrentPage((p) => p + 1)}><ChevronRight size={13} /></Button>
            </div>
            <div className="flex gap-1">
              {activePages.map((_, i) => (
                <button key={i} onClick={() => setCurrentPage(i)}
                  className={cn("w-6 h-1.5 rounded-full transition-all duration-200", i === currentPage ? "bg-black/50" : "bg-black/15 hover:bg-black/30")}
                />
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-hide">
            <div className="max-w-2xl mx-auto py-8 px-8">
              <div className="p-4 rounded-lg border border-black/10 bg-black/[0.03]">
                <p className="font-sans text-xs text-black/30 font-mono mb-3">p. {currentPage + 1}</p>
                <p className="font-sans text-sm leading-7 text-black/70 whitespace-pre-wrap">{activePages[currentPage]}</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="font-sans text-sm text-black/30">Select a document to view</p>
        </div>
      )}
    </div>
  );
}