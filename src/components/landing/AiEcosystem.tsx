import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";

/* ── Data ── */

interface ProviderItem {
  id: string;
  name: string;
}

const PROVIDERS: ProviderItem[] = [
  { id: "openai", name: "OpenAI" },
  { id: "anthropic", name: "Anthropic" },
  { id: "google", name: "Google Gemini" },
  { id: "meta", name: "Meta AI" },
  { id: "deepseek", name: "DeepSeek" },
  { id: "qwen", name: "Qwen" },
  { id: "mistral", name: "Mistral AI" },
  { id: "xai", name: "xAI (Grok)" },
  { id: "cohere", name: "Cohere" },
  { id: "microsoft", name: "Microsoft AI" },
  { id: "perplexity", name: "Perplexity" },
  { id: "nvidia", name: "NVIDIA" },
  { id: "moonshot", name: "Moonshot AI" },
  { id: "01ai", name: "01.AI" },
  { id: "ai21", name: "AI21" },
  { id: "nous", name: "Nous Research" },
  { id: "liquid", name: "Liquid AI" },
  { id: "alibaba", name: "Alibaba Cloud" },
  { id: "together", name: "Together AI" },
  { id: "openrouter", name: "OpenRouter" },
];

const LOGOS: Record<string, string> = {
  openai: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.911 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.98 4.182a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .511 4.91 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.989 5.989 0 0 0 3.998-2.9 6.056 6.056 0 0 0-.748-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.041l.142-.08 4.778-2.758a.795.795 0 0 0 .393-.681v-6.737l2.02 1.169a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.495 4.494zm-9.66-4.125a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.758a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062l-4.83 2.787a4.5 4.5 0 0 1-6.141-1.646zM2.341 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.677l5.814 3.354-2.02 1.169a.076.076 0 0 1-.071 0l-4.83-2.787A4.504 4.504 0 0 1 2.34 7.872z"/></svg>`,
  anthropic: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-7.258 0h3.767L16.906 20h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.522zm4.132 9.959L8.453 7.687 6.205 13.48H10.7z"/></svg>`,
  google: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M20.616 10.835a14.147 14.147 0 0 1-4.45-3.001 14.111 14.111 0 0 1-3.678-6.452.503.503 0 0 0-.975 0 14.134 14.134 0 0 1-3.679 6.452 14.155 14.155 0 0 1-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 0 0 0 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 0 1 4.45 3.001 14.112 14.112 0 0 1 3.679 6.453.502.502 0 0 0 .975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 0 1 3.001-4.45 14.113 14.113 0 0 1 6.453-3.678.503.503 0 0 0 0-.975 13.245 13.245 0 0 1-2.003-.678z"/></svg>`,
  meta: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4c-2.5 0-4.5 2-4.5 4.5S7 12 7 12s0-1.5 1.5-3S12 6 12 6s2 1 3.5 3S17 12 17 12s-.5-1.5-1.5-3S14.5 4 12 4z"/><path d="M12 20c2.5 0 4.5-2 4.5-4.5S17 12 17 12s0 1.5-1.5 3S12 18 12 18s-2-1-3.5-3S7 12 7 12s.5 1.5 1.5 3S9.5 20 12 20z"/><path d="M5 12h14"/></svg>`,
  deepseek: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 0 1-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 0 0-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 0 1-.465.137 9.597 9.597 0 0 0-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 0 0 1.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588z"/></svg>`,
  qwen: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12.604 1.34c.393.69.784 1.382 1.174 2.075a.18.18 0 0 0 .157.091h5.552c.174 0 .322.11.446.327l1.454 2.57c.19.337.24.478.024.837-.26.43-.513.864-.76 1.3l-.367.658c-.106.196-.223.28-.04.512l2.652 4.637c.172.301.111.494-.043.77-.437.785-.882 1.564-1.335 2.34-.159.272-.352.375-.68.37-.777-.016-1.552-.01-2.327.016a.099.099 0 0 0-.081.05 575.097 575.097 0 0 1-2.705 4.74c-.169.293-.38.363-.725.364-.997.003-2.002.004-3.017.002a.537.537 0 0 1-.465-.271l-1.335-2.323a.09.09 0 0 0-.083-.049H4.982c-.285.03-.553-.001-.805-.092l-1.603-2.77a.543.543 0 0 1-.002-.54l1.207-2.12a.198.198 0 0 0 0-.197 550.951 550.951 0 0 1-1.875-3.272l-.79-1.395c-.16-.31-.173-.496.095-.965.465-.813.927-1.625 1.387-2.436.132-.234.304-.334.584-.335a338.3 338.3 0 0 1 2.589-.001.124.124 0 0 0 .107-.063l2.806-4.895a.488.488 0 0 1 .422-.246c.524-.001 1.053 0 1.583-.006L11.704 1c.341-.003.724.032.9.34z"/></svg>`,
  mistral: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M17.455 0h4.363v4.363h-4.363zM19.636 0h4.364v4.363h-4.364zM0 0h4.363v4.363H0zM0 4.364h4.363v4.363H0zM0 8.727h4.363v4.363H0zM0 13.09h4.363v4.364H0zM0 17.454h4.363v4.363H0z"/><path d="M2.182 0h4.363v4.363H2.182z"/><path d="M19.636 4.364h4.364v4.363h-4.364zM2.182 4.364h4.363v4.363H2.182z"/><path d="M13.09 4.364h4.364v4.363H13.09z"/><path d="M15.273 4.364h4.363v4.363h-4.363zM6.545 4.364h4.364v4.363H6.545z"/><path d="M10.909 8.727h4.364v4.363h-4.364zM15.273 8.727h4.363v4.363h-4.363zM6.545 8.727h4.364v4.363H6.545z"/><path d="M8.727 13.09h4.364v4.364H8.727z"/><path d="M10.909 13.09h4.364v4.364h-4.364z"/><path d="M19.636 8.727h4.364v4.363h-4.364zM2.182 8.727h4.363v4.363H2.182z"/><path d="M17.455 13.09h4.363v4.364h-4.363z"/><path d="M19.636 13.09h4.364v4.364h-4.364z"/><path d="M17.455 17.454h4.363v4.363h-4.363z"/><path d="M2.182 13.09h4.363v4.364H2.182zM19.636 17.454h4.364v4.363h-4.364zM2.182 17.454h4.363v4.363H2.182z"/></svg>`,
  xai: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6.469 8.776L16.512 23h-4.464L2.005 8.776H6.47zm-.004 7.9l2.233 3.164L6.467 23H2l4.465-6.324zM22 2.582V23h-3.659V7.764L22 2.582zM22 1l-9.952 14.095-2.233-3.163L17.533 1H22z"/></svg>`,
  cohere: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M7.776 14.304c.64 0 1.92-.032 3.712-.768 2.08-.864 6.176-2.4 9.152-4 2.08-1.12 2.976-2.592 2.976-4.576C23.616 2.24 21.408 0 18.656 0h-11.52C3.2 0 0 3.2 0 7.136s3.008 7.168 7.776 7.168z"/><path d="M9.728 19.2c0-1.92 1.152-3.68 2.944-4.416l3.616-1.504c5.248-2.144 9.712.64 9.712 4.704 0 3.072-2.496 5.568-5.568 5.568h-3.936c-2.624 0-4.768-2.144-4.768-4.8z"/><path d="M4.128 15.232C1.856 15.232 0 17.088 0 19.36v.544c0 2.272 1.856 4.128 4.128 4.128s4.128-1.856 4.128-4.128v-.544c0-2.272-1.856-4.128-4.128-4.128z"/></svg>`,
  microsoft: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M0 0h11.368v11.368H0zM12.632 0H24v11.368H12.632zM0 12.632h11.368V24H0zM12.632 12.632H24V24H12.632z"/></svg>`,
  perplexity: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M22.398 7.09h-2.311V.068l-7.51 6.354V.158h-1.155v6.197L4.49 0v7.09H1.602v10.397h2.888V24l6.932-6.359v6.2h1.155v-6.047l6.932 6.18v-6.488h2.888V7.09zm-3.466-4.531v4.531h-5.355l5.355-4.531zm-13.286.068 4.869 4.463H5.646V2.626zM2.758 16.332V8.245h7.848l-6.115 6.115v1.972H2.758zm2.888 5.04v-3.885h.001v-2.649l5.776-5.776v7.011l-5.777 5.3zm12.709.025-5.777-5.151V9.062l5.777 5.777v6.558zm2.888-5.065h-1.733v-1.972L13.395 8.245h7.848v8.087z"/></svg>`,
  nvidia: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M8.965.354c-.345.026-.694.065-1.044.12C3.261 1.06.004 4.69 0 9.41c.004-.003.01-.006.014-.009A8.486 8.486 0 0 1 8.965.354zM9.35.486c-.13.014-.26.03-.386.052a8.955 8.955 0 0 0-2.892 1.03C3.464 2.99 1.434 5.629.973 8.655c.22-.212.461-.406.718-.578a8.294 8.294 0 0 1 4.082-1.523c.178-.016.356-.024.533-.024.475 0 .942.047 1.392.136l.022.005a8.31 8.31 0 0 1 4.727 2.981c.925 1.208 1.498 2.638 1.656 4.092.025.238.04.478.04.722 0 .576-.063 1.152-.186 1.719l-.017.07c-.47 2.034-1.75 3.842-3.636 5.025A8.48 8.48 0 0 1 9.35.486zM15.996.163C11.104-.575 5.77 2.093 3.072 6.366c-.258.406-.49.83-.697 1.268A8.959 8.959 0 0 0 .96 10.986c-.023.102-.044.204-.064.307 2.311-3.052 5.84-5.12 9.766-5.555.668-.074 1.345-.089 2.023-.04.595.043 1.19.13 1.777.26l.043.01a8.32 8.32 0 0 1 3.652 1.811c.03.027.06.054.09.082-1.04-4.241-4.346-7.2-8.246-7.682a9.43 9.43 0 0 0-.927-.084l-.018.002z"/></svg>`,
  moonshot: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18.5c-4.694 0-8.5-3.806-8.5-8.5S7.306 3.5 12 3.5s8.5 3.806 8.5 8.5-3.806 8.5-8.5 8.5z"/><path d="M12 6c-1.657 0-3 1.343-3 3s1.343 3 3 3 3-1.343 3-3-1.343-3-3-3z"/><path d="M12 13c-2.761 0-5 2.239-5 5h10c0-2.761-2.239-5-5-5z"/></svg>`,
  "01ai": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><path d="M13 7h-2v6h2V7z"/><path d="M13 15h-2v2h2v-2z"/></svg>`,
  ai21: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`,
  nous: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm0-2.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15z"/><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/><circle cx="12" cy="12" r="2.5"/></svg>`,
  liquid: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>`,
  alibaba: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z"/></svg>`,
  together: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`,
  openrouter: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-4-4 4-4 1.41 1.41L10.83 12H17v2h-6.17l2.58 2.59L11 17z"/></svg>`,
};

/* ── Inline Styles for Marquee Animation ── */

const MARQUEE_STYLES = `
  @keyframes marquee-left {
    from { transform: translateX(0); }
    to { transform: translateX(-50%); }
  }
  @keyframes marquee-right {
    from { transform: translateX(-50%); }
    to { transform: translateX(0); }
  }
`;

/* ── Sub-components ── */

function ProviderLogo({ id, name }: { id: string; name: string }) {
  const svg = LOGOS[id];
  if (!svg) return null;
  return (
    <span className="group relative flex items-center gap-3 shrink-0 select-none">
      <span
        className="shrink-0 w-6 h-6 opacity-40 group-hover:opacity-100 transition-all duration-500 ease-out"
        style={{ color: "#322D29" }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <span
        className="text-sm font-medium tracking-wide opacity-35 group-hover:opacity-100 transition-all duration-500 ease-out whitespace-nowrap"
        style={{ fontFamily: "'Inter', sans-serif", color: "#322D29" }}
      >
        {name}
      </span>
      <span
        className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] font-medium tracking-wider uppercase opacity-0 group-hover:opacity-40 transition-all duration-400 ease-out pointer-events-none whitespace-nowrap"
        style={{ fontFamily: "'Inter', sans-serif", color: "#AC9C8D" }}
      >
        {id === "openrouter" ? "Gateway" : "Available"}
      </span>
    </span>
  );
}

function MarqueeRow({ items, direction }: { items: ProviderItem[]; direction: "left" | "right" }) {
  return (
    <div className="overflow-hidden">
      <div
        className={`flex gap-10 sm:gap-14 md:gap-16 w-max py-3 marquee-${direction}`}
        style={{
          animationPlayState: "running",
          animationDuration: "50s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.animationPlayState = "paused"; }}
        onMouseLeave={(e) => { e.currentTarget.style.animationPlayState = "running"; }}
      >
        {items.map((m) => (
          <ProviderLogo key={m.id} id={m.id} name={m.name} />
        ))}
        {items.map((m) => (
          <ProviderLogo key={`dup-${m.id}`} id={m.id} name={m.name} />
        ))}
      </div>
    </div>
  );
}

function StatCounter({ value, label, suffix = "" }: { value: number; label: string; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          const duration = 1600;
          const steps = 60;
          const increment = value / steps;
          let current = 0;
          const timer = setInterval(() => {
            current += increment;
            if (current >= value) {
              setCount(value);
              clearInterval(timer);
            } else {
              setCount(Math.floor(current));
            }
          }, duration / steps);
        }
      },
      { threshold: 0.3 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div ref={ref} className="text-center">
      <div
        className="text-5xl sm:text-6xl lg:text-7xl font-medium leading-none tracking-tight mb-2"
        style={{ fontFamily: "'Instrument Serif', serif", color: "#322D29" }}
      >
        {count}{suffix}
      </div>
      <div
        className="text-xs sm:text-sm font-medium tracking-wider uppercase"
        style={{ fontFamily: "'Inter', sans-serif", color: "#AC9C8D" }}
      >
        {label}
      </div>
    </div>
  );
}

/* ── Main Export ── */

export function AiEcosystem() {
  return (
    <>
      <style>{MARQUEE_STYLES}</style>

      <section className="relative px-6 lg:px-10 py-20 lg:py-28 overflow-hidden" style={{ backgroundColor: "#FFFAF3" }}>
        {/* Animated grid background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(rgba(50,45,41,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(50,45,41,0.04) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
            maskImage: "radial-gradient(ellipse 70% 50% at center, black, transparent 80%)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 50% at center, black, transparent 80%)",
          }}
        />

        <div className="max-w-7xl mx-auto relative">
          {/* Section label */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5 }}
          >
            <p
              className="text-xs font-semibold tracking-[0.2em] uppercase mb-4 text-center"
              style={{ fontFamily: "'Inter', sans-serif", color: "#AC9C8D" }}
            >
              AI Ecosystem
            </p>
          </motion.div>

          {/* Headline */}
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl lg:text-5xl xl:text-6xl font-medium leading-[1.1] tracking-tight text-center max-w-4xl mx-auto"
            style={{ fontFamily: "'Instrument Serif', serif", color: "#322D29" }}
          >
            400+ AI Models. One Intelligent<br className="hidden sm:block" /> Research System.
          </motion.h2>

          {/* Subheading */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-base lg:text-lg max-w-2xl mx-auto mt-5 leading-relaxed text-center"
            style={{ fontFamily: "'Inter', sans-serif", color: "#72383D" }}
          >
            BlackLetter intelligently selects the best AI model for every task — from learning and research to coding, legal analysis, mathematics and reasoning.
          </motion.p>

          {/* Stat Counter */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-14 lg:mt-16"
          >
            <StatCounter value={400} label="Available AI Models" suffix="+" />

            <div className="flex items-center justify-center gap-6 mt-4">
              <div className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full" style={{ backgroundColor: "#AC9C8D" }} />
                <span className="text-xs tracking-wider uppercase" style={{ fontFamily: "'Inter', sans-serif", color: "#AC9C8D" }}>
                  Automatically Routed
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full" style={{ backgroundColor: "#AC9C8D" }} />
                <span className="text-xs tracking-wider uppercase" style={{ fontFamily: "'Inter', sans-serif", color: "#AC9C8D" }}>
                  Optimized Per Task
                </span>
              </div>
            </div>
          </motion.div>

          {/* Desktop: two rows */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-14 lg:mt-16 space-y-4 hidden md:block"
          >
            <MarqueeRow items={PROVIDERS} direction="left" />
            <MarqueeRow items={[...PROVIDERS].reverse()} direction="right" />
          </motion.div>

          {/* Mobile: one row */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-14 lg:mt-16 block md:hidden"
          >
            <MarqueeRow items={PROVIDERS} direction="left" />
          </motion.div>

          {/* Feature tags */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="flex flex-wrap items-center justify-center gap-3 mt-12 lg:mt-14"
          >
            {[
              "Automatic Model Selection",
              "Multi-Provider AI",
              "Future-Proof Architecture",
              "Unified Research Engine",
              "Optimized For Every Subject",
            ].map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium tracking-wide rounded-full select-none transition-all duration-300"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  color: "#72383D",
                  backgroundColor: "rgba(114,56,61,0.06)",
                  border: "1px solid rgba(114,56,61,0.1)",
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0">
                  <path d="M8.5 2.5L3.75 7.5L1.5 5.25" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {tag}
              </span>
            ))}
          </motion.div>
        </div>
      </section>
    </>
  );
}
