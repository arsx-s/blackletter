import { useEffect, useRef, useState } from "react";
import { KnowledgeFieldGL } from "./KnowledgeFieldGL";

/**
 * KnowledgeField — an interactive, perspective-projected field of research
 * nodes and their links. The composition is the product metaphor — a knowledge
 * graph suspended in space — not decoration, so it earns its place in the hero.
 *
 * Two renderers sit behind this export and draw the same composition:
 *
 *  - `KnowledgeFieldGL` (default) — shader-projected nodes and links on the GPU.
 *  - `KnowledgeFieldCanvas` (fallback) — a software 3D projection onto a 2D
 *    canvas. No WebGL, so it also runs under jsdom and on machines where a
 *    context cannot be created, and it is what low-core devices get so they are
 *    never asked to hold a GL context for a background element.
 *
 * The choice is made on the client, once, so nothing changes shape between the
 * two paths and there is no layout shift while the decision is pending.
 *
 * Behaviour (both paths):
 *  - slow ambient rotation, plus pointer parallax that eases toward the cursor
 *  - depth-faded nodes with scale falloff and hub nodes in the accent
 *  - pauses when the tab is hidden or the canvas leaves the viewport
 *  - renders a single static frame under `prefers-reduced-motion`
 */

export interface KnowledgeFieldProps {
  className?: string;
  /** Density multiplier for the node count. */
  density?: number;
  /** Pointer parallax + rotation. Automatically disabled for reduced motion. */
  interactive?: boolean;
}

interface FieldNode {
  x: number;
  y: number;
  z: number;
  hub: boolean;
}

const INK = "50,45,41";
const MUTED = "172,156,141";
const ACCENT = "246,36,64";
const FOCAL = 780;
const SPHERE = 320;

function KnowledgeFieldCanvas({
  className = "",
  density = 1,
  interactive = true,
}: KnowledgeFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let raf = 0;
    let visible = true;
    let rotation = 0;

    const nodes: FieldNode[] = [];
    const links: Array<[number, number]> = [];

    const target = { x: 0, y: 0 };
    const eased = { x: 0, y: 0 };

    function buildField() {
      nodes.length = 0;
      links.length = 0;

      const count = Math.max(
        52,
        Math.min(Math.round(((width * height) / 19000) * density), 160),
      );

      for (let i = 0; i < count; i += 1) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = SPHERE * (0.35 + Math.cbrt(Math.random()) * 0.65);
        nodes.push({
          x: r * Math.sin(phi) * Math.cos(theta),
          y: r * Math.cos(phi) * 0.72,
          z: r * Math.sin(phi) * Math.sin(theta),
          hub: Math.random() < 0.08,
        });
      }

      // Connect each node to its nearest neighbours, capped for draw cost.
      const seen = new Set<string>();
      for (let i = 0; i < nodes.length && links.length < 190; i += 1) {
        const a = nodes[i];
        const nearest: Array<{ j: number; d: number }> = [];
        for (let j = 0; j < nodes.length; j += 1) {
          if (j === i) continue;
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dz = a.z - b.z;
          nearest.push({ j, d: dx * dx + dy * dy + dz * dz });
        }
        nearest.sort((m, n) => m.d - n.d);
        for (let k = 0; k < Math.min(2, nearest.length); k += 1) {
          const j = nearest[k].j;
          const key = i < j ? `${i}:${j}` : `${j}:${i}`;
          if (seen.has(key)) continue;
          seen.add(key);
          links.push([i, j]);
        }
      }
    }

    function resize() {
      const parent = canvas!.parentElement;
      const rect = parent ? parent.getBoundingClientRect() : canvas!.getBoundingClientRect();
      width = Math.max(320, Math.round(rect.width || window.innerWidth || 320));
      height = Math.max(320, Math.round(rect.height || window.innerHeight || 320));

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      canvas!.style.width = "100%";
      canvas!.style.height = "100%";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      buildField();
      if (prefersReduced) render();
    }

    function render() {
      const cosY = Math.cos(rotation + eased.x * 0.4);
      const sinY = Math.sin(rotation + eased.x * 0.4);
      const cosX = Math.cos(-0.3 + eased.y * 0.16);
      const sinX = Math.sin(-0.3 + eased.y * 0.16);

      const cx = width / 2;
      const cy = height / 2 - height * 0.05;

      ctx!.clearRect(0, 0, width, height);

      const projected = nodes.map((n) => {
        const x1 = n.x * cosY - n.z * sinY;
        const z1 = n.x * sinY + n.z * cosY;
        const y1 = n.y * cosX - z1 * sinX;
        const z2 = n.y * sinX + z1 * cosX;
        const scale = FOCAL / (FOCAL + z2 + 430);
        return { x: cx + x1 * scale, y: cy + y1 * scale, scale, z: z2 };
      });

      ctx!.lineWidth = 0.7;
      for (let l = 0; l < links.length; l += 1) {
        const a = projected[links[l][0]];
        const b = projected[links[l][1]];
        const depth = (a.scale + b.scale) / 2;
        const alpha = Math.max(0, Math.min(0.22, (depth - 0.45) * 0.34));
        if (alpha <= 0.005) continue;
        ctx!.strokeStyle = `rgba(${MUTED},${alpha.toFixed(3)})`;
        ctx!.beginPath();
        ctx!.moveTo(a.x, a.y);
        ctx!.lineTo(b.x, b.y);
        ctx!.stroke();
      }

      const order = projected.map((_, i) => i).sort((m, n) => projected[m].z - projected[n].z);
      for (let o = 0; o < order.length; o += 1) {
        const i = order[o];
        const p = projected[i];
        const node = nodes[i];
        const alpha = Math.max(0.07, Math.min(0.82, (p.scale - 0.42) * 1.3));
        if (node.hub) {
          const radius = Math.max(1.6, p.scale * 5.4);
          const glow = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 5);
          glow.addColorStop(0, `rgba(${ACCENT},${Math.min(0.42, alpha).toFixed(3)})`);
          glow.addColorStop(1, `rgba(${ACCENT},0)`);
          ctx!.fillStyle = glow;
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, radius * 5, 0, Math.PI * 2);
          ctx!.fill();
        }
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, Math.max(0.7, p.scale * (node.hub ? 3.4 : 2.5)), 0, Math.PI * 2);
        ctx!.fillStyle = node.hub
          ? `rgba(${ACCENT},${Math.min(0.9, alpha + 0.22).toFixed(3)})`
          : `rgba(${INK},${alpha.toFixed(3)})`;
        ctx!.fill();
      }
    }

    function loop() {
      if (!visible) {
        raf = 0;
        return;
      }
      rotation += 0.0022;
      eased.x += (target.x - eased.x) * 0.045;
      eased.y += (target.y - eased.y) * 0.045;
      render();
      raf = requestAnimationFrame(loop);
    }

    function start() {
      if (prefersReduced || raf) return;
      raf = requestAnimationFrame(loop);
    }

    const onPointerMove = (e: PointerEvent) => {
      target.x = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      target.y = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
    };

    const onVisibilityChange = () => {
      visible = !document.hidden;
      if (visible) start();
    };

    resize();

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibilityChange);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && canvas.parentElement) {
      observer = new ResizeObserver(resize);
      observer.observe(canvas.parentElement);
    }

    let intersection: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined" && !prefersReduced) {
      intersection = new IntersectionObserver(
        (entries) => {
          visible = entries.some((entry) => entry.isIntersecting) && !document.hidden;
          if (visible) start();
        },
        { threshold: 0 },
      );
      intersection.observe(canvas);
    }

    if (interactive && !prefersReduced) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      start();
    } else {
      render();
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      observer?.disconnect();
      intersection?.disconnect();
    };
  }, [density, interactive]);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}

/**
 * Probe for a usable WebGL context. The probe canvas is discarded immediately
 * and its context is reclaimed along with it. This never runs during SSR/jsdom
 * in a way that throws — `getContext` is guarded and the whole probe is wrapped.
 */
function supportsWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") || probe.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Devices that should not be asked to hold a GL context for a decorative
 * background element: very few cores, or very little memory.
 */
function isLowPowerDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const cores = navigator.hardwareConcurrency;
  if (typeof cores === "number" && cores > 0 && cores <= 2) return true;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof memory === "number" && memory > 0 && memory <= 2;
}

export function KnowledgeField(props: KnowledgeFieldProps) {
  const [renderer, setRenderer] = useState<"gpu" | "software" | null>(null);

  useEffect(() => {
    setRenderer(supportsWebGL() && !isLowPowerDevice() ? "gpu" : "software");
  }, []);

  // Renders the same element and class as both renderers, so the hero keeps its
  // exact size while the capability check resolves — no layout shift.
  if (renderer === null) {
    return <canvas aria-hidden="true" className={props.className} />;
  }

  return renderer === "gpu" ? <KnowledgeFieldGL {...props} /> : <KnowledgeFieldCanvas {...props} />;
}
