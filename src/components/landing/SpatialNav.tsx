import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring } from "framer-motion";
import { ArrowRight, X } from "lucide-react";
import { Logo } from "../ui/logo";
import { EASE_CINEMATIC, EASE_OUT } from "../../lib/motion";

export interface NavSection {
  id: string;
  label: string;
}

interface SpatialNavProps {
  onLaunch: () => void;
  sections: NavSection[];
}

/**
 * SpatialNav — BlackLetter's navigation as an index of the page, not a bar of links.
 *
 * Three coordinated pieces:
 *  1. a reading-progress line pinned to the top of the viewport,
 *  2. a vertical section rail that reports where you are as you scroll,
 *  3. a full-screen index overlay with large typographic entries.
 *
 * The overlay is a real dialog: Escape closes it, Tab is trapped inside it,
 * focus moves in on open and returns to the trigger on close, and page scroll is
 * locked while it is up. All motion collapses under `prefers-reduced-motion`.
 */
export function SpatialNav({ onLaunch, sections }: SpatialNavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(sections[0]?.id ?? "top");
  const reduce = useReducedMotion();

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const firstLinkRef = useRef<HTMLAnchorElement | null>(null);

  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 130, damping: 26, mass: 0.4 });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Deterministic position tracking: the active section is the last one whose
  // top edge has crossed the upper third of the viewport. IntersectionObserver
  // ratios are unreliable for sections of wildly different heights.
  useEffect(() => {
    const compute = () => {
      const trigger = window.innerHeight * 0.35;
      let current = sections[0]?.id ?? "top";
      for (const section of sections) {
        const el = document.getElementById(section.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= trigger) current = section.id;
      }
      setActive(current);
    };
    compute();
    window.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
    };
  }, [sections]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    const focusTimer = window.setTimeout(() => firstLinkRef.current?.focus(), 80);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const goTo = (event: ReactMouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    setOpen(false);
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: reduce ? "auto" : "smooth",
        block: "start",
      });
    }, 80);
  };

  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusables = panelRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const activeLabel = sections.find((section) => section.id === active)?.label ?? "Index";

  return (
    <>
      {/* Reading progress */}
      <motion.div
        aria-hidden="true"
        className="fixed left-0 right-0 top-0 z-[60] h-[2px] origin-left"
        style={{
          scaleX: reduce ? scrollYProgress : progress,
          background: "linear-gradient(90deg, #F62440 0%, #72383D 55%, #AC9C8D 100%)",
        }}
      />

      {/* Command bar */}
      <motion.header
        className="fixed left-0 right-0 top-0 z-50"
        initial={{ y: -18, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: EASE_CINEMATIC, delay: 0.1 }}
      >
        <div
          className="transition-all duration-300"
          style={{
            backgroundColor: scrolled ? "rgba(255,250,243,0.86)" : "transparent",
            backdropFilter: scrolled ? "blur(16px)" : "none",
            borderBottom: scrolled ? "1px solid #D1C7BD" : "1px solid transparent",
          }}
        >
          <div className="mx-auto max-w-7xl px-6 lg:px-10">
            <div className="flex h-16 items-center justify-between gap-4 lg:h-20">
              <a href="#top" className="flex select-none items-center gap-3">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full"
                  style={{ backgroundColor: "#322D29" }}
                >
                  <Logo variant="white" size={16} />
                </span>
                <span
                  className="text-sm font-semibold tracking-tight"
                  style={{ fontFamily: "'Inter', sans-serif", color: "#322D29" }}
                >
                  BlackLetter
                </span>
                <span
                  className="hidden font-mono text-[10px] uppercase tracking-widest sm:inline"
                  style={{ color: "#7D6A5B" }}
                >
                  Research OS
                </span>
              </a>

              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  ref={triggerRef}
                  type="button"
                  onClick={() => setOpen(true)}
                  aria-haspopup="dialog"
                  aria-expanded={open}
                  className="group flex items-center gap-2.5 rounded-sm border px-3 py-2 text-xs font-medium transition-colors duration-200"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    borderColor: "#D1C7BD",
                    color: "#322D29",
                    backgroundColor: "rgba(255,250,243,0.4)",
                  }}
                >
                  <span className="relative flex h-3.5 w-3.5 flex-col justify-between">
                    <span className="h-px w-full transition-all duration-300 group-hover:w-2/3" style={{ backgroundColor: "#322D29" }} />
                    <span className="h-px w-2/3 transition-all duration-300 group-hover:w-full" style={{ backgroundColor: "#F62440" }} />
                    <span className="h-px w-full transition-all duration-300 group-hover:w-1/2" style={{ backgroundColor: "#322D29" }} />
                  </span>
                  <span className="hidden sm:inline">Index</span>
                  <span className="hidden text-muted md:inline" style={{ color: "#7D6A5B" }}>
                    · {activeLabel}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onLaunch}
                  className="flex items-center gap-2 rounded-sm px-5 py-2.5 text-sm font-semibold transition-all duration-200 active:scale-[0.97]"
                  style={{ backgroundColor: "#D41E34", color: "#FFFAF3", fontFamily: "'Inter', sans-serif" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#B0172B")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#D41E34")}
                >
                  Launch <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Section rail */}
      <nav
        aria-label="Section index"
        className="pointer-events-none fixed left-5 top-1/2 z-40 hidden -translate-y-1/2 2xl:block"
      >
        <ul className="flex flex-col gap-4">
          {sections.map((section, i) => {
            const isActive = active === section.id;
            return (
              <li key={section.id} className="pointer-events-auto">
                <a
                  href={`#${section.id}`}
                  onClick={(event) => goTo(event, section.id)}
                  aria-current={isActive ? "true" : undefined}
                  className="group flex items-center gap-3"
                >
                  <span
                    className="w-5 text-right font-mono text-[10px] tabular-nums transition-colors duration-200"
                    style={{ color: isActive ? "#D41E34" : "#7D6A5B" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className="h-px transition-all duration-300"
                    style={{
                      width: isActive ? 30 : 14,
                      backgroundColor: isActive ? "#D41E34" : "#D1C7BD",
                    }}
                  />
                  <span
                    className="text-[11px] uppercase tracking-widest transition-all duration-300"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      color: isActive ? "#322D29" : "#AC9C8D",
                      opacity: isActive ? 1 : 0,
                    }}
                  >
                    {section.label}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Index overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[70]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div
              className="absolute inset-0"
              style={{ backgroundColor: "#322D29" }}
              onClick={close}
              aria-hidden="true"
            />
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="BlackLetter index"
              onKeyDown={trapFocus}
              initial={{ opacity: 0, y: reduce ? 0 : 26 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : 18 }}
              transition={{ duration: 0.5, ease: EASE_CINEMATIC }}
              className="relative flex h-full w-full flex-col overflow-y-auto px-6 py-6 lg:px-16 lg:py-10"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full"
                    style={{ backgroundColor: "#FFFAF3" }}
                  >
                    <Logo size={18} />
                  </span>
                  <span
                    className="font-mono text-[10px] uppercase tracking-[0.25em]"
                    style={{ color: "#AC9C8D" }}
                  >
                    Index
                  </span>
                </div>
                <button
                  type="button"
                  onClick={close}
                  className="flex items-center gap-2 rounded-sm border px-3 py-2 text-xs font-medium transition-colors duration-200"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    borderColor: "rgba(255,250,243,0.25)",
                    color: "#FFFAF3",
                  }}
                >
                  Close <X size={14} />
                </button>
              </div>

              <nav aria-label="Page sections" className="mt-10 flex-1 lg:mt-16">
                <ul className="grid gap-1 sm:grid-cols-2 sm:gap-x-10">
                  {sections.map((section, i) => (
                    <li key={section.id}>
                      <motion.a
                        ref={i === 0 ? firstLinkRef : undefined}
                        href={`#${section.id}`}
                        onClick={(event) => goTo(event, section.id)}
                        initial={reduce ? false : { opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.06 + i * 0.035 }}
                        className="group flex items-baseline gap-4 border-b py-3 transition-colors duration-200 lg:py-4"
                        style={{ borderColor: "rgba(255,250,243,0.12)" }}
                      >
                        <span
                          className="font-mono text-[10px] tabular-nums"
                          style={{ color: "#AC9C8D" }}
                        >
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span
                          className="flex-1 text-3xl leading-tight transition-transform duration-300 group-hover:translate-x-1 sm:text-4xl lg:text-5xl"
                          style={{ fontFamily: "'Instrument Serif', serif", color: "#FFFAF3" }}
                        >
                          {section.label}
                        </span>
                        <ArrowRight
                          size={18}
                          className="translate-x-0 opacity-0 transition-all duration-300 group-hover:translate-x-1 group-hover:opacity-100"
                          style={{ color: "#F62440" }}
                        />
                      </motion.a>
                    </li>
                  ))}
                </ul>
              </nav>

              <div
                className="mt-10 flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between"
                style={{ borderColor: "rgba(255,250,243,0.12)" }}
              >
                <p
                  className="max-w-md text-sm leading-relaxed"
                  style={{ fontFamily: "'Inter', sans-serif", color: "#AC9C8D" }}
                >
                  Research sessions, documents, a knowledge graph and a canvas — in one local-first workspace.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onLaunch();
                  }}
                  className="flex items-center justify-center gap-2 rounded-sm px-7 py-3.5 text-sm font-semibold transition-all duration-200 active:scale-[0.97]"
                  style={{ backgroundColor: "#D41E34", color: "#FFFAF3", fontFamily: "'Inter', sans-serif" }}
                >
                  Launch BlackLetter <ArrowRight size={15} />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
