import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Download, FileText, FileDown, Globe, X } from "lucide-react";
import { Button } from "../ui/button";
import { MODE_LABELS } from "../../lib/research";
import { renderMarkdown } from "./ResearchReport";
import type { TabIntelligence } from "../../types/workspace";
import type { DerivationProvenance } from "../../integrity/types";
import { confidenceLabelOrNull } from "../../pipeline/scoring";
import { EVIDENCE_WINDOW, formatLocator } from "../../pipeline/grounding";
import { CAVEAT, describeEvidenceCoverage } from "../../eval/calibration";

interface ReportExportProps {
  open: boolean;
  onClose: () => void;
  topic: string;
  mode: string;
  fullText: string;
  intelligence?: TabIntelligence | null;
  /** The derivation that produced this tab's records, when one was recorded. */
  derivation?: DerivationProvenance | null;
}

const FORMATS = [
  { id: "markdown", label: "Markdown", icon: FileText, ext: ".md" },
  { id: "html", label: "HTML", icon: Globe, ext: ".html" },
] as const;

/**
 * The appendix appended to an exported report.
 *
 * It reports only what the run established. A component that could not be
 * measured reads "not measured" — it is never given a number — and every
 * citation is listed with the evidence it resolved to, or with the fact that it
 * resolved to nothing. An export is the artefact most likely to be read away
 * from the app, so it is the last place a fabricated figure should appear.
 *
 * Since Mission 10 it also carries the confidence caveat verbatim, the evidence
 * coverage label, and — when the tab has one — the derivation's provenance: what
 * was derived, what support it could be checked against, and what issues the
 * boundary reported.
 */
function buildIntelligenceBlock(intelligence: TabIntelligence, derivation?: DerivationProvenance | null): string {
  const confidence = intelligence.confidence;
  const faithfulness = intelligence.faithfulness;
  const hallucination = intelligence.hallucination;
  const grounding = intelligence.groundingReport ?? null;
  const citations = grounding?.citations ?? null;
  const sources = intelligence.groundedSources ?? [];
  const chunks = intelligence.retrievedChunks ?? [];
  const unverifiable = new Set((grounding?.unverifiable ?? []).map((entry) => entry.chunkId));

  const lines: string[] = ["", "---", "", "## Intelligence Summary", ""];

  const label = confidenceLabelOrNull(confidence?.score);
  lines.push(
    `- **Confidence:** ${confidence?.score != null ? `${confidence.score}/100${label ? ` (${label})` : ""}` : "not measured"}`,
    `  - ${CAVEAT}`,
  );

  const coverage = describeEvidenceCoverage({
    retrievedChunkCount: chunks.length,
    topRetrievalScore: chunks.reduce<number | null>(
      (best, chunk) => (best === null || chunk.score > best ? chunk.score : best),
      null,
    ),
    faithfulnessScore: faithfulness?.score ?? null,
  });
  lines.push(`- **Evidence coverage:** ${coverage.level} — ${coverage.criteria}`);

  if (confidence) {
    for (const component of confidence.components) {
      lines.push(
        `  - ${component.name}: ${
          component.value !== null ? `${Math.round(component.value * 100)}%` : `not measured — ${component.reason ?? "no basis"}`
        } (${component.basis})`,
      );
    }
  }

  lines.push(
    `- **Faithfulness:** ${faithfulness?.score != null ? `${Math.round(faithfulness.score * 100)}%` : "not measured"}`,
    `- **Claims:** ${faithfulness?.supportedClaims.length ?? 0} supported, ${faithfulness?.unsupportedClaims.length ?? 0} unsupported, ${faithfulness?.unjudgedSentences?.length ?? 0} not judged`,
    `- **Hallucination:** ${hallucination?.present ? `flagged ${hallucination.flaggedClaims.length} unsupported claim(s)` : "none detected"}`,
  );

  if (citations) {
    lines.push(
      `- **Citations:** ${citations.resolved.length} of ${citations.markers.length} marker(s) resolved`,
      ...(citations.unresolved.length > 0
        ? [`  - unresolved: ${citations.unresolved.map((entry) => entry.marker).join(" ")}`]
        : []),
      ...(citations.weakCitations.length > 0
        ? [`  - below grounding threshold: ${citations.weakCitations.map((entry) => entry.marker).join(" ")}`]
        : []),
    );
  }

  lines.push(
    `- **Grounded sources:** ${sources.length > 0
      ? sources
          .map((source) => `${source.name}${source.pages && source.pages.length > 0 ? ` (pages ${source.pages.join(", ")})` : ""}`)
          .join(", ")
      : "none"}`,
    `- **Retrieved chunks:** ${chunks.length}${chunks.length > 0 ? `, ${chunks.filter((chunk) => chunk.location && !unverifiable.has(chunk.id)).length} verified against their source` : ""}`,
    `- **Latency:** ${intelligence.telemetry?.totalMs != null ? `${Math.round(intelligence.telemetry.totalMs)}ms` : "—"}`,
  );

  if (chunks.length > 0) {
    lines.push("", "### Evidence", "", "| Marker | Source | Chunk | Verified |", "| --- | --- | --- | --- |");
    chunks.slice(0, EVIDENCE_WINDOW).forEach((chunk, index) => {
      const verified = chunk.location && !unverifiable.has(chunk.id) ? "yes" : "no";
      lines.push(`| [${index + 1}] | ${formatLocator(chunk.location)} | \`${chunk.id}\` | ${verified} |`);
    });
  }

  if (derivation) {
    lines.push(
      "",
      "### Derived records",
      "",
      `- **Extracted from:** answer \`${derivation.answerDigest}\` (${derivation.answerChars.toLocaleString()} characters), schema v${derivation.version}`,
      `- **Run:** ${derivation.runId ?? "not recorded (the tab was written without a run id)"}`,
      `- **Kept:** ${derivation.counts.sections} sections, ${derivation.counts.entities} entities, ${derivation.counts.timeline} timeline entries, ${derivation.counts.notes} notes, ${derivation.counts.followUps} follow-ups`,
      `- **Support:** ${derivation.counts.supported} record(s) matched text in a retrieved chunk (supported), ${derivation.counts.unverified} matched none (unverified). "Supported" means a retrieved chunk contains the record's text; it is not a verification of the claim.`,
      `- **Boundary issues:** dropped ${derivation.counts.dropped}, merged ${derivation.counts.merged}`,
    );
    const issueCodes = Object.entries(derivation.issueTotals).filter(([, count]) => (count ?? 0) > 0);
    if (issueCodes.length > 0) {
      lines.push(`  - by code: ${issueCodes.map(([code, count]) => `${code} ×${count}`).join(", ")}`);
    }
    for (const issue of derivation.issues.slice(0, 10)) {
      lines.push(`  - [${issue.code}] ${issue.kind}: ${issue.detail}`);
    }
  }

  return lines.join("\n");
}

export function ReportExport({ open, onClose, topic, mode, fullText, intelligence, derivation }: ReportExportProps) {
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
      ? buildIntelligenceBlock(intelligence, derivation)
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