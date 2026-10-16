import { useRef, useState, type KeyboardEvent } from "react";
import { BookOpen, FileText, Network, PenTool, Search } from "lucide-react";

const CASES = [
  { id: "research", label: "Research", icon: Search, eyebrow: "Research session", title: "Start with a question.", body: "Explore a topic through a structured report, with your session and its source material kept in one workspace.", detail: ["Question: How does judicial precedent work?", "Structured explanation", "Session saved to workspace"] },
  { id: "learn", label: "Learn", icon: BookOpen, eyebrow: "Learning", title: "Build understanding step by step.", body: "Use subject-aware explanations to connect a new idea to the concepts around it.", detail: ["Subject context: Law", "Key concept: binding authority", "Follow-up questions"] },
  { id: "connect", label: "Connect", icon: Network, eyebrow: "Knowledge graph", title: "See how ideas relate.", body: "Concepts extracted across sessions can form a connected map that you can explore and refine.", detail: ["Precedent", "Court hierarchy", "Case authority"] },
  { id: "create", label: "Create", icon: PenTool, eyebrow: "Canvas", title: "Shape research into working notes.", body: "Bring related material into a canvas to organize thoughts, summaries, and next steps.", detail: ["Case notes", "Key questions", "Reading plan"] },
  { id: "remember", label: "Remember", icon: FileText, eyebrow: "Workspace memory", title: "Keep useful work close.", body: "Return to saved sessions, documents, and notes as your research continues.", detail: ["Saved session", "Uploaded document", "Pinned note"] },
];

export function UseCaseTabs() {
  const [active, setActive] = useState(0);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    let next = active;
    if (event.key === "ArrowRight") next = (active + 1) % CASES.length;
    else if (event.key === "ArrowLeft") next = (active - 1 + CASES.length) % CASES.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = CASES.length - 1;
    else return;
    event.preventDefault(); setActive(next); refs.current[next]?.focus();
  };
  const item = CASES[active];
  return <section id="use-cases" className="px-6 py-20 lg:px-10 lg:py-28" style={{ scrollMarginTop: "6rem" }}>
    <div className="mx-auto max-w-7xl">
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#7d6a5b]">One workspace, many ways in</p>
      <h2 className="max-w-2xl font-display text-4xl leading-tight text-[#322d29] sm:text-5xl">Follow the work from question to memory.</h2>
      <div role="tablist" aria-label="BlackLetter use cases" className="mt-8 flex gap-2 overflow-x-auto border-b border-[#d1c7bd] pb-2">
        {CASES.map((entry, index) => { const Icon = entry.icon; return <button key={entry.id} ref={el => { refs.current[index] = el; }} id={`case-tab-${entry.id}`} role="tab" type="button" aria-selected={active === index} aria-controls="case-panel" tabIndex={active === index ? 0 : -1} onClick={() => setActive(index)} onKeyDown={onKeyDown} className="flex shrink-0 items-center gap-2 rounded-sm px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7d4145]" style={{ color: active === index ? "#7d4145" : "#6b625a", background: active === index ? "#f0e8df" : "transparent" }}><Icon size={15}/>{entry.label}</button>; })}
      </div>
      <div id="case-panel" role="tabpanel" aria-labelledby={`case-tab-${item.id}`} className="grid min-h-[22rem] gap-8 border-b border-[#d1c7bd] py-8 md:grid-cols-2 md:items-center lg:gap-16">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7d4145]">{item.eyebrow}</p><h3 className="mt-3 font-display text-3xl leading-tight text-[#322d29] sm:text-4xl">{item.title}</h3><p className="mt-4 max-w-lg text-sm leading-6 text-[#625a53] sm:text-base">{item.body}</p></div>
        <div className="border border-[#d1c7bd] bg-white p-5 shadow-sm sm:p-7"><div className="mb-5 flex items-center justify-between border-b border-[#e6dfd7] pb-4"><span className="text-sm font-semibold text-[#322d29]">{item.label} workspace</span><span className="text-[10px] uppercase tracking-widest text-[#7d6a5b]">Example view</span></div><div className="space-y-3">{item.detail.map((detail, index) => <div key={detail} className="flex items-center gap-3 border border-[#ece6de] bg-[#fbf8f3] px-3 py-3 text-sm text-[#49423c]"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f0e8df] font-mono text-[10px] text-[#7d4145]">0{index + 1}</span>{detail}</div>)}</div></div>
      </div>
      <p className="mt-3 text-xs text-[#7d6a5b]">Illustrative interface content. The examples describe workspace areas; they do not represent live generated results.</p>
    </div>
  </section>;
}
