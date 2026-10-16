import { ArrowUpRight, Cpu, Globe2 } from "lucide-react";
import { MODEL_CATALOG } from "../../config/models";

/** Provider and model information mirrors the choices exposed by the application. */
export function AiEcosystem() {
  return (
    <section className="relative overflow-hidden px-6 py-20 lg:px-10 lg:py-28" style={{ backgroundColor: "#EFE9E1" }}>
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16">
        <div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "#72383D" }}>Model choice</p>
          <h2 className="font-display text-4xl leading-tight tracking-tight sm:text-5xl" style={{ color: "#322D29" }}>Models for the work at hand.</h2>
          <p className="mt-5 max-w-xl text-base leading-7" style={{ color: "#675B53" }}>
            Choose a configured model through OpenRouter, or select a local Ollama model. The app exposes provider and model settings directly; availability depends on your configuration.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-2 rounded-sm border px-3 py-2 text-sm" style={{ backgroundColor: "#FFFAF3", borderColor: "#D1C7BD", color: "#322D29" }}><Globe2 size={15} /> OpenRouter</span>
            <span className="inline-flex items-center gap-2 rounded-sm border px-3 py-2 text-sm" style={{ backgroundColor: "#FFFAF3", borderColor: "#D1C7BD", color: "#322D29" }}><Cpu size={15} /> Local Ollama</span>
          </div>
        </div>
        <div className="overflow-hidden rounded-sm border" style={{ backgroundColor: "#FFFAF3", borderColor: "#D1C7BD" }}>
          <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "#D1C7BD" }}>
            <div>
              <p className="text-sm font-semibold" style={{ color: "#322D29" }}>Models listed in the app</p>
              <p className="mt-1 text-xs" style={{ color: "#7D6A5B" }}>Configured examples from the current model catalog</p>
            </div>
            <ArrowUpRight size={16} style={{ color: "#72383D" }} aria-hidden="true" />
          </div>
          <ul className="divide-y" style={{ borderColor: "#D1C7BD" }}>
            {MODEL_CATALOG.map((model) => (
              <li key={model.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <span className="text-sm font-medium" style={{ color: "#322D29" }}>{model.label}</span>
                <span className="font-mono text-xs" style={{ color: "#7D6A5B" }}>{model.useCase}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
