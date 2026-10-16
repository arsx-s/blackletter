import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { FileText, Network, Search } from "lucide-react";

/** Local interface illustration, built from DOM so it stays crisp at every size. */
export function MacbookReveal() {
  const ref = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });
  const scale = useTransform(scrollYProgress, [0, 1], [0.88, 1]);
  const rotateX = useTransform(scrollYProgress, [0, 1], [8, 0]);
  return (
    <section ref={ref} id="product" className="px-5 py-16 sm:px-8 lg:px-10 lg:py-24" style={{ scrollMarginTop: "6rem" }}>
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "#7D6A5B" }}>Inside BlackLetter</p>
          <h2 className="font-display text-4xl leading-tight tracking-tight sm:text-5xl lg:text-6xl" style={{ color: "#322D29" }}>A question becomes a workspace.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed sm:text-lg" style={{ color: "#72383D" }}>Research, documents, connected concepts, and saved notes stay together as your work grows.</p>
        </div>
        <motion.div style={reduceMotion ? undefined : { scale, rotateX, transformPerspective: 1400 }} className="mx-auto mt-10 max-w-6xl origin-bottom sm:mt-14">
          <div className="rounded-t-xl border border-[#8b837c] bg-[#252321] p-2 shadow-2xl sm:rounded-t-2xl sm:p-3">
            <div className="overflow-hidden rounded-md bg-[#fbf7f0]">
              <div className="flex h-9 items-center justify-between border-b border-[#e3ddd5] bg-white px-3 sm:h-11 sm:px-5">
                <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#b9aea3]"/><span className="h-2 w-2 rounded-full bg-[#b9aea3]"/><span className="h-2 w-2 rounded-full bg-[#b9aea3]"/></div>
                <span className="text-[10px] font-medium text-[#786f67] sm:text-xs">BlackLetter · Research workspace</span>
                <span className="w-8" />
              </div>
              <div className="grid min-h-64 sm:min-h-80 md:grid-cols-[190px_minmax(0,1fr)] lg:min-h-[390px] lg:grid-cols-[210px_minmax(0,1fr)_190px]">
                <aside className="hidden border-r border-[#e3ddd5] bg-[#f6f2ec] p-4 text-xs text-[#5e554e] md:block">
                  <div className="mb-5 flex items-center gap-2 font-semibold text-[#322d29]"><Search size={13}/> Research sessions</div>
                  <p className="rounded-sm border-l-2 border-[#7d4145] bg-[#ece5dd] px-2 py-2 font-medium">Linear algebra foundations</p>
                  <p className="px-2 py-3">Matrix transformations</p><p className="px-2 py-2">Eigenvectors and meaning</p>
                  <div className="mt-8 flex items-center gap-2 text-[#786f67]"><FileText size={13}/> Documents</div>
                  <p className="mt-3 pl-5">lecture-notes.pdf</p>
                </aside>
                <main className="p-4 sm:p-7 lg:p-9">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7d4145] sm:text-xs"><FileText size={14}/> Research report · Mathematics</div>
                  <h3 className="mt-3 max-w-xl font-display text-2xl leading-tight text-[#322d29] sm:text-3xl lg:text-4xl">What does a matrix transformation do?</h3>
                  <p className="mt-3 max-w-2xl text-xs leading-5 text-[#625a53] sm:text-sm sm:leading-6">A matrix maps vectors from one space to another. Its columns show where each basis direction moves, connecting the algebra to geometric ideas like rotation, scaling, and projection.</p>
                  <div className="mt-5 grid gap-3 sm:mt-7 sm:grid-cols-2">
                    <div className="border border-[#e3ddd5] bg-white p-3 sm:p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-[#7d4145]">Key idea</p><p className="mt-2 text-xs leading-5 text-[#322d29] sm:text-sm">Columns encode the transformed basis.</p></div>
                    <div className="border border-[#e3ddd5] bg-white p-3 sm:p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-[#7d4145]">Saved note</p><p className="mt-2 text-xs leading-5 text-[#322d29] sm:text-sm">Connect the map to its geometric effect.</p></div>
                  </div>
                </main>
                <aside className="hidden border-l border-[#e3ddd5] bg-[#f6f2ec] p-4 lg:block">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#322d29]"><Network size={14}/> Connected ideas</div>
                  <div className="mt-5 space-y-3 text-xs text-[#5e554e]"><p className="border border-[#d8cec3] bg-white p-2">Vector space</p><div className="ml-4 h-4 border-l border-[#c4515a]"/><p className="border border-[#d8cec3] bg-white p-2">Linear map</p><div className="ml-4 h-4 border-l border-[#c4515a]"/><p className="border border-[#d8cec3] bg-white p-2">Matrix</p></div>
                </aside>
              </div>
            </div>
          </div>
          <div className="mx-auto h-2 w-[104%] -translate-x-[2%] rounded-b-lg bg-gradient-to-b from-[#b9b2aa] to-[#77716a] sm:h-3" />
          <p className="mt-4 text-center text-xs text-[#7d6a5b]">Illustrative interface preview · sample content, not a live session</p>
        </motion.div>
      </div>
    </section>
  );
}
