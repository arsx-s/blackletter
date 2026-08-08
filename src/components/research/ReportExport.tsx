import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Download, FileText, FileDown, Globe, X } from "lucide-react";
import { Button } from "../ui/button";
import { MODE_LABELS } from "../../lib/research";
import { renderMarkdown } from "./ResearchReport";
import type { TabIntelligence } from "../../types/workspace";
import { confidenceLabel } from "../../pipeline/scoring";

interface ReportExportProps {
  open: boolean;
  onClose: () => void;
  topic: string;
  mode: string;
  fullText: string;
  intelligence?: TabIntelligence | null;
}

const FORMATS = [
  { id: "markdown", label: "Markdown", icon: FileText, ext: ".md" },
  { id: "html", label: "HTML", icon: Globe, ext: ".html" },
] as const;

export function ReportExport({ open, onClose, topic, mode, fullText, intelligence }: ReportExportProps) {
  const [format, setFormat] = useState<string>("markdown");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleExport = () => {
    const modeLabel = (MODE_LABELS as Record<string, string>)[mode] || mode;
    const intelBlock = intelligence
      ? [
          "",
          "---",
          "",
          "## Intelligence Summary",
          "",
          `- **Confidence:** ${intelligence.confidence?.score != null ? `${intelligence.confidence.score}/100` : "—"} (${intelligence.confidence ? confidenceLabel(intelligence.confidence.score) : "n/a"})`,
          `- **Faithfulness:** ${intelligence.faithfulness?.score != null ? `${Math.round(intelligence.faithfulness.score * 100)}%` : "—"}`,
          `- **Hallucination:** ${intelligence.hallucination?.present ? `flagged ${intelligence.hallucination.flaggedClaims.length} unsupported claim(s)` : "none detected"}`,
          `- **Grounded sources:** ${intelligence.groundedSources?.length ? intelligence.groundedSources.map((s) => s.name).join(", ") : "none"}`,
          `- **Retrieved chunks:** ${intelligence.retrievedChunks?.length ?? 0}`,
          `- **Latency:** ${intelligence.telemetry?.totalMs != null ? `${Math.round(intelligence.telemetry.totalMs)}ms` : "—"}`,
        ].join("\n")
      : "";
    const header = `# ${topic}\n\n**Research Mode:** ${modeLabel}\n\n---\n\n`;
    const content = header + fullText + intelBlock;
    const ext = format === "markdown" ? ".md" : ".html";
    const mime = format === "markdown" ? "text/markdown" : "text/html";
    const formatted = format === "html"
      ? `<!DOCTYPE html><html><head><meta charset="utf-8"><title></title><style>body{max-width:800px;margin:40px auto;font-family:-apple-system,BlinkMacSystemFont,sans-serif;line-height:1.75;color:#5A514B;padding:0 20px;background:#EFE9E1}h1{font-size:1.75em;color:#322D29;border-bottom:1px solid #AC9C8D;padding-bottom:8px}h2{font-size:1.35em;color:#322D29;margin-top:28px}h3{font-size:1.1em;color:#322D29;margin-top:20px}blockquote{border-left:3px solid #72383D;margin-left:0;padding-left:15px;color:#7B7068;font-style:italic}code{background:#D9D9D9;padding:2px 6px;border-radius:4px;font-size:.85em;color:#322D29;border:1px solid #AC9C8D}pre{background:#D9D9D9;border:1px solid #AC9C8D;border-radius:6px;padding:15px;overflow-x:auto}pre code{background:transparent;border:none;padding:0}table{border-collapse:collapse;width:100%;font-size:.85em}th{text-align:left;color:#322D29;font-weight:600;padding:8px 12px;border-bottom:1px solid #AC9C8D}td{padding:8px 12px;color:#5A514B;border-bottom:1px solid #D9D9D9}strong{color:#322D29}</style></head><body>${renderMarkdown(content)}</body></html>`
      : content;

    const blob = new Blob([formatted], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${topic.toLowerCase().replace(/\s+/g, "-").slice(0, 50)}${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-bone/60 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-ink border border-black/10 rounded-2xl shadow-2xl w-full max-w-md mx-4"
      >
        <div className="flex items-center justify-between p-5 border-b border-black/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-bone/10 flex items-center justify-center">
              <Download size={14} className="text-bone" />
            </div>
            <p className="font-sans text-sm font-medium text-bone">Export Report</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-black/10 rounded-xs"><X size={14} className="text-black/40" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <p className="font-sans text-xs text-black/50 mb-1">Topic</p>
            <p className="font-sans text-sm text-bone">{topic}</p>
          </div>

          <div>
            <p className="font-sans text-xs text-black/50 mb-2">Format</p>
            <div className="grid grid-cols-2 gap-2">
              {FORMATS.map((f) => {
                const Icon = f.icon;
                const isSelected = format === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setFormat(f.id)}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all ${
                      isSelected
                        ? "border-bone/30 bg-bone/8"
                        : "border-black/10 bg-black/[0.02] hover:bg-black/[0.04]"
                    }`}
                  >
                    <Icon size={14} className={isSelected ? "text-bone" : "text-black/40"} />
                    <div>
                      <p className={`font-sans text-xs font-medium ${isSelected ? "text-bone" : "text-black/60"}`}>{f.label}</p>
                      <p className="font-mono text-2xs text-black/35">{f.ext}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg bg-black/[0.03] border border-black/10 p-3">
            <p className="font-sans text-2xs text-black/40 leading-relaxed">
              Export includes the full research report with all sections, analysis, and markdown formatting.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-black/10">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleExport}>
            <FileDown size={14} />
            Export
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}