import { useRef, useEffect, useState } from "react";

interface ModelItem {
  id: string;
  name: string;
  href?: string;
}

const LOGOS: Record<string, string> = {
  openai: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.911 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.98 4.182a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .511 4.91 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.989 5.989 0 0 0 3.998-2.9 6.056 6.056 0 0 0-.748-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.041l.142-.08 4.778-2.758a.795.795 0 0 0 .393-.681v-6.737l2.02 1.169a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.495 4.494zm-9.66-4.125a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.758a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062l-4.83 2.787a4.5 4.5 0 0 1-6.141-1.646zM2.341 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.677l5.814 3.354-2.02 1.169a.076.076 0 0 1-.071 0l-4.83-2.787A4.504 4.504 0 0 1 2.34 7.872z"/></svg>`,
  anthropic: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-7.258 0h3.767L16.906 20h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.522zm4.132 9.959L8.453 7.687 6.205 13.48H10.7z"/></svg>`,
  google: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M20.616 10.835a14.147 14.147 0 0 1-4.45-3.001 14.111 14.111 0 0 1-3.678-6.452.503.503 0 0 0-.975 0 14.134 14.134 0 0 1-3.679 6.452 14.155 14.155 0 0 1-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 0 0 0 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 0 1 4.45 3.001 14.112 14.112 0 0 1 3.679 6.453.502.502 0 0 0 .975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 0 1 3.001-4.45 14.113 14.113 0 0 1 6.453-3.678.503.503 0 0 0 0-.975 13.245 13.245 0 0 1-2.003-.678z"/></svg>`,
  xai: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6.469 8.776L16.512 23h-4.464L2.005 8.776H6.47zm-.004 7.9l2.233 3.164L6.467 23H2l4.465-6.324zM22 2.582V23h-3.659V7.764L22 2.582zM22 1l-9.952 14.095-2.233-3.163L17.533 1H22z"/></svg>`,
  meta: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4c-2.5 0-4.5 2-4.5 4.5S7 12 7 12s0-1.5 1.5-3S12 6 12 6s2 1 3.5 3S17 12 17 12s-.5-1.5-1.5-3S14.5 4 12 4z"/><path d="M12 20c2.5 0 4.5-2 4.5-4.5S17 12 17 12s0 1.5-1.5 3S12 18 12 18s-2-1-3.5-3S7 12 7 12s.5 1.5 1.5 3S9.5 20 12 20z"/><path d="M5 12h14"/></svg>`,
  deepseek: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 0 1-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 0 0-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 0 1-.465.137 9.597 9.597 0 0 0-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 0 0 1.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588z"/></svg>`,
  perplexity: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M22.398 7.09h-2.311V.068l-7.51 6.354V.158h-1.155v6.197L4.49 0v7.09H1.602v10.397h2.888V24l6.932-6.359v6.2h1.155v-6.047l6.932 6.18v-6.488h2.888V7.09zm-3.466-4.531v4.531h-5.355l5.355-4.531zm-13.286.068 4.869 4.463H5.646V2.626zM2.758 16.332V8.245h7.848l-6.115 6.115v1.972H2.758zm2.888 5.04v-3.885h.001v-2.649l5.776-5.776v7.011l-5.777 5.3zm12.709.025-5.777-5.151V9.062l5.777 5.777v6.558zm2.888-5.065h-1.733v-1.972L13.395 8.245h7.848v8.087z"/></svg>`,
  mistral: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M17.455 0h4.363v4.363h-4.363zM19.636 0h4.364v4.363h-4.364zM0 0h4.363v4.363H0zM0 4.364h4.363v4.363H0zM0 8.727h4.363v4.363H0zM0 13.09h4.363v4.364H0zM0 17.454h4.363v4.363H0z"/><path d="M2.182 0h4.363v4.363H2.182z"/><path d="M19.636 4.364h4.364v4.363h-4.364zM2.182 4.364h4.363v4.363H2.182z"/><path d="M13.09 4.364h4.364v4.363H13.09z"/><path d="M15.273 4.364h4.363v4.363h-4.363zM6.545 4.364h4.364v4.363H6.545z"/><path d="M10.909 8.727h4.364v4.363h-4.364zM15.273 8.727h4.363v4.363h-4.363zM6.545 8.727h4.364v4.363H6.545z"/><path d="M8.727 13.09h4.364v4.364H8.727z"/><path d="M10.909 13.09h4.364v4.364h-4.364z"/><path d="M19.636 8.727h4.364v4.363h-4.364zM2.182 8.727h4.363v4.363H2.182z"/><path d="M17.455 13.09h4.363v4.364h-4.363z"/><path d="M19.636 13.09h4.364v4.364h-4.364z"/><path d="M17.455 17.454h4.363v4.363h-4.363z"/><path d="M2.182 13.09h4.363v4.364H2.182zM19.636 17.454h4.364v4.363h-4.364zM2.182 17.454h4.363v4.363H2.182z"/></svg>`,
  qwen: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12.604 1.34c.393.69.784 1.382 1.174 2.075a.18.18 0 0 0 .157.091h5.552c.174 0 .322.11.446.327l1.454 2.57c.19.337.24.478.024.837-.26.43-.513.864-.76 1.3l-.367.658c-.106.196-.223.28-.04.512l2.652 4.637c.172.301.111.494-.043.77-.437.785-.882 1.564-1.335 2.34-.159.272-.352.375-.68.37-.777-.016-1.552-.01-2.327.016a.099.099 0 0 0-.081.05 575.097 575.097 0 0 1-2.705 4.74c-.169.293-.38.363-.725.364-.997.003-2.002.004-3.017.002a.537.537 0 0 1-.465-.271l-1.335-2.323a.09.09 0 0 0-.083-.049H4.982c-.285.03-.553-.001-.805-.092l-1.603-2.77a.543.543 0 0 1-.002-.54l1.207-2.12a.198.198 0 0 0 0-.197 550.951 550.951 0 0 1-1.875-3.272l-.79-1.395c-.16-.31-.173-.496.095-.965.465-.813.927-1.625 1.387-2.436.132-.234.304-.334.584-.335a338.3 338.3 0 0 1 2.589-.001.124.124 0 0 0 .107-.063l2.806-4.895a.488.488 0 0 1 .422-.246c.524-.001 1.053 0 1.583-.006L11.704 1c.341-.003.724.032.9.34z"/></svg>`,
  cohere: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M7.776 14.304c.64 0 1.92-.032 3.712-.768 2.08-.864 6.176-2.4 9.152-4 2.08-1.12 2.976-2.592 2.976-4.576C23.616 2.24 21.408 0 18.656 0h-11.52C3.2 0 0 3.2 0 7.136s3.008 7.168 7.776 7.168z"/><path d="M9.728 19.2c0-1.92 1.152-3.68 2.944-4.416l3.616-1.504c5.248-2.144 9.712.64 9.712 4.704 0 3.072-2.496 5.568-5.568 5.568h-3.936c-2.624 0-4.768-2.144-4.768-4.8z"/><path d="M4.128 15.232C1.856 15.232 0 17.088 0 19.36v.544c0 2.272 1.856 4.128 4.128 4.128s4.128-1.856 4.128-4.128v-.544c0-2.272-1.856-4.128-4.128-4.128z"/></svg>`,
  copilot: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M18.728 3.561A2.504 2.504 0 0 0 16.364 2h-.728a2.504 2.504 0 0 0-2.464 2.052L11.82 11.04l.31-1.062a2.504 2.504 0 0 1 2.403-1.801h4.248l1.782.694 1.717-.694h-.501a2.504 2.504 0 0 1-2.403-1.798l-.709-2.414z"/><path d="M7.495 22.439A2.504 2.504 0 0 0 9.893 24h1.552a2.504 2.504 0 0 0 2.504-2.44l.168-6.58-.353 1.207a2.504 2.504 0 0 1-2.403 1.801H7.083l-1.527-.829-1.654.829h.493a2.504 2.504 0 0 1 2.406 1.81l.692 2.393z"/><path d="M15.756 2H7.06C4.38 2 2.19 5.279.893 8.556-.54 12.6-2.01 17.58 3.16 17.58h3.747a2.504 2.504 0 0 0 2.41-1.816 1124.67 1124.67 0 0 1 2.69-9.282c.456-1.538.835-2.859 1.418-3.682.553-.78 1.15-1.29 2.057-1.29h8.296l1.782.694 1.717-.694h-.501c-.765 0-1.454-.427-1.828-1.064C19.688 3.28 18.045 2 15.756 2z"/><path d="M9.854 22h8.698c2.678 0 4.868-5.279 6.165-8.556 1.433-4.043 2.903-9.023-2.274-9.023h-3.745a2.504 2.504 0 0 0-2.41 1.816 1127.64 1127.64 0 0 0-2.69 9.282c-.456 1.538-.835 2.859-1.418 3.682-.553.78-1.15 1.29-2.057 1.29H1.452c-1.528.583-2.26 1.69-2.26 3.509 0 3 2.976 3 5.976 3h2.686z"/></svg>`,
};

const MODELS: ModelItem[] = [
  { id: "openai", name: "OpenAI", href: "https://openai.com" },
  { id: "anthropic", name: "Anthropic", href: "https://anthropic.com" },
  { id: "google", name: "Google AI", href: "https://ai.google.dev" },
  { id: "xai", name: "xAI", href: "https://x.ai" },
  { id: "meta", name: "Meta AI", href: "https://ai.meta.com" },
  { id: "deepseek", name: "DeepSeek", href: "https://deepseek.com" },
  { id: "perplexity", name: "Perplexity", href: "https://perplexity.ai" },
  { id: "mistral", name: "Mistral AI", href: "https://mistral.ai" },
  { id: "qwen", name: "Qwen", href: "https://qwen.ai" },
  { id: "cohere", name: "Cohere", href: "https://cohere.com" },
  { id: "copilot", name: "Microsoft Copilot", href: "https://copilot.microsoft.com" },
];

function ModelLogo({ id, name }: { id: string; name: string }) {
  const svg = LOGOS[id];
  if (!svg) return null;
  return (
    <span className="flex items-center gap-2.5 text-sm tracking-wide text-bone/45 whitespace-nowrap uppercase select-none group">
      <span
        className="shrink-0 w-5 h-5 text-bone/50 group-hover:text-bone transition-colors duration-200"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {name}
    </span>
  );
}

export function ModelMarquee() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const speedRef = useRef(0.5);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const items = container.children;
    if (items.length < 2) return;

    const firstSet = items[0] as HTMLElement;
    speedRef.current = firstSet.offsetWidth / (55 * 60);
    let animId: number;
    let offset = 0;

    function frame() {
      if (!paused) {
        offset += speedRef.current;
        const halfW = firstSet.offsetWidth;
        if (offset >= halfW) offset -= halfW;
        container!.style.transform = `translateX(${-offset}px)`;
      }
      animId = requestAnimationFrame(frame);
    }

    animId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animId);
  }, [paused]);

  return (
    <div
      className="w-full overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="w-full overflow-hidden relative">
        <div ref={containerRef} className="flex gap-12 py-1 w-max">
          <div className="flex gap-12 shrink-0 items-center">
            {MODELS.map((m) => (
              <a key={m.id} href={m.href} target="_blank" rel="noopener noreferrer"
                className="transition-opacity duration-300 flex items-center opacity-70 hover:opacity-100"
              >
                <ModelLogo id={m.id} name={m.name} />
              </a>
            ))}
          </div>
          <div className="flex gap-12 shrink-0 items-center" aria-hidden="true">
            {MODELS.map((m) => (
              <span key={m.id} className="select-none flex items-center opacity-70">
                <ModelLogo id={m.id} name={m.name} />
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
