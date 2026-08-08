import { motion } from "framer-motion";
import type { ReportSection } from "../../lib/research";
import { AnimatedCopyButton } from "../ui/animated-copy-button";

const S = {
  p: 'font-family:sans-serif;font-size:var(--bl-font,0.875rem);color:#5A514B;line-height:var(--bl-lh,1.6);margin-bottom:0.75rem',
  h3: 'font-family:Georgia,"Times New Roman",serif;font-size:calc(var(--bl-font,0.875rem) * 1.14);font-weight:600;color:#322D29;margin-top:1.25rem;margin-bottom:0.5rem',
  strong: 'color:#322D29;font-weight:600',
  code: 'font-family:"JetBrains Mono",monospace;font-size:var(--bl-code,0.75rem);background:#D9D9D9;color:#322D29;padding:1px 6px;border-radius:4px;border:1px solid #AC9C8D',
  bq: 'border-left:3px solid #72383D;padding-left:1rem;color:#7B7068;font-style:italic;margin:0.75rem 0;font-size:calc(var(--bl-font,0.875rem) * 0.94)',
  li: 'color:#5A514B;font-size:var(--bl-font,0.875rem);margin-left:1.25rem;margin-bottom:0.25rem',
  pre: 'background:#D9D9D9;border:1px solid #AC9C8D;border-radius:6px;padding:1rem;overflow-x:auto;margin:0.75rem 0',
};

function h(code: string): string {
  return code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlight(code: string): string {
  return h(code)
    .replace(/(\/\/.*)/g, '<span style="color:#8C8278">$1</span>')
    .replace(/(\/\*[\s\S]*?\*\/)/g, '<span style="color:#8C8278">$1</span>')
    .replace(/("(?:[^"\\]|\\.)*")/g, '<span style="color:#5A514B">$1</span>')
    .replace(/('(?:[^'\\]|\\.)*')/g, '<span style="color:#5A514B">$1</span>')
    .replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#72383D">$1</span>');
}

export function renderMarkdown(text: string): string {
  if (!text) return "";  const blocks: string[] = [];
  let idx = 0;
  let processed = text.replace(/```(\w*)\n?([\s\S]*?)```/g, function (_match, _lang, code) {
    const key = `\x00CODE${idx}\x00`;
    const safe = typeof code === "string" ? code : "";
    blocks.push(`<div style="${S.pre}"><code style="font-family:&quot;JetBrains Mono&quot;,monospace;font-size:var(--bl-code,0.875rem);color:#322D29;line-height:1.5">${highlight(safe)}</code></div>`);
    idx++;
    return key;
  });

  processed = h(processed)
    .replace(/^### (.+)$/gm, `<h3 style="${S.h3}">$1</h3>`)
    .replace(/\*\*(.+?)\*\*/g, `<strong style="${S.strong}">$1</strong>`)
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, function (_m, c) { return `<code style="${S.code}">${h(typeof c === "string" ? c : "")}</code>`; })
    .replace(/^> (.+)$/gm, `<blockquote style="${S.bq}">$1</blockquote>`)
    .replace(/^\- (.+)$/gm, `<li style="${S.li};list-style-type:disc">$1</li>`)
    .replace(/^\d+\. (.+)$/gm, `<li style="${S.li};list-style-type:decimal">$1</li>`)
    .replace(/\n\n/g, `</p><p style="${S.p}">`)
    .replace(/\n/g, "<br />");

  processed = `<p style="${S.p}">` + processed + "</p>";
  processed = processed.replace(/<p style="[^"]*"><\/p>/g, "");
  processed = processed.replace(/<br \/><\/p>/g, "</p>");

  processed = processed.replace(/\|(.+)\|\n\|[-| ]+\|\n((?:\|.+\|\n?)*)/g, (_match, header: string, rows: string) => {
    const th = header.split("|").map((h: string) => h.trim()).filter(Boolean);
    const tr = rows.trim().split("\n").map((r: string) => r.split("|").map((c: string) => c.trim()).filter(Boolean));
    let tbl = '<div style="overflow-x:auto;margin:0.75rem 0"><table style="width:100%;border-collapse:collapse;font-size:var(--bl-code,0.875rem)">';
    tbl += '<thead><tr style="border-bottom:1px solid #AC9C8D">';
    th.forEach((h: string) => { tbl += `<th style="text-align:left;color:#322D29;font-weight:600;padding:0.5rem 0.75rem;font-family:sans-serif">${h}</th>`; });
    tbl += '</tr></thead><tbody>';
    tr.forEach((row: string[]) => {
      tbl += '<tr style="border-bottom:1px solid #D9D9D9">';
      row.forEach((cell: string) => { tbl += `<td style="padding:0.5rem 0.75rem;color:#5A514B;font-family:sans-serif">${cell}</td>`; });
      tbl += '</tr>';
    });
    tbl += '</tbody></table></div>';
    return tbl;
  });

  processed = processed.replace(/\x00CODE\d+\x00/g, (m) => blocks[parseInt(m.replace(/\D/g, ""))]);
  return processed;
}

interface ResearchReportProps {
  sections: ReportSection[];
  isStreaming: boolean;
  fullText: string;
}

export function ResearchReport({ sections, isStreaming, fullText }: ResearchReportProps) {
  if (sections.length === 0 && !fullText) return null;

  function safeRender(content: string): string {
    try {
      return renderMarkdown(content);
    } catch (e) {
      console.warn("[ResearchReport] renderMarkdown failed:", e);
      return `<p style="font-family:sans-serif;font-size:0.875rem;color:#5A514B;line-height:1.75">${h(content)}</p>`;
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div />
        {!isStreaming && fullText && (
          <AnimatedCopyButton text={fullText} className="w-8 h-8" />
        )}
      </div>
      {sections.map((section, i) => (
        <motion.div
          key={section.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.15, duration: 0.4 }}
          className="space-y-3"
        >
          <div className="flex items-center gap-3 border-b border-border pb-2">
            <div className="w-1 h-5 rounded-full bg-accent" />
            <h2 className="font-display text-base font-semibold text-bone">
              {section.title}
            </h2>
          </div>
          <div
            className="font-sans bl-prose max-w-none"
            style={{ color: "#5A514B" }}
            dangerouslySetInnerHTML={{ __html: safeRender(section.content) }}
          />
        </motion.div>
      ))}

      {isStreaming && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-2 py-4"
        >
          <span className="inline-block w-2 h-4 bg-accent/50 animate-pulse" />
          <span className="font-sans text-2xs text-muted">Assembling...</span>
        </motion.div>
      )}
    </div>
  );
}
