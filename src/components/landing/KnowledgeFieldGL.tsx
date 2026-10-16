import { useEffect, useRef } from "react";
import { Camera, Geometry, Mesh, Program, Renderer, Transform } from "ogl";
import type { KnowledgeFieldProps } from "./KnowledgeField";

/**
 * KnowledgeFieldGL — the GPU render of the hero knowledge field.
 *
 * Same composition as the software renderer (a sphere of research nodes, each
 * linked to its nearest neighbours), but the per-node projection, depth falloff
 * and sprite drawing happen in the vertex/fragment shaders. That turns what was
 * a per-frame JS loop with per-node canvas ops into two draw calls, which is what
 * lets the field stay smooth on a large hero and scale past the 160-node ceiling
 * the 2D path needs to stay cheap.
 *
 * Deliberately small: ogl, one `gl.LINES` mesh, one `gl.POINTS` mesh, no textures,
 * no render targets, no post-processing, one context. It runs on a light
 * background, so it composites with normal alpha blending and dark ink rather
 * than additive glow.
 *
 * Behaviour (mirrors KnowledgeField):
 *  - slow ambient rotation plus pointer parallax that eases toward the cursor,
 *    driven by rAF with a plain object — no React state per pointer event
 *  - pauses when the tab is hidden or the canvas leaves the viewport
 *  - renders a single static frame under `prefers-reduced-motion`
 *  - the caller falls back to the software renderer when WebGL is unavailable
 */

// Same palette as the software renderer, so switching paths is invisible.
const INK: [number, number, number] = [50 / 255, 45 / 255, 41 / 255];
const LINK: [number, number, number] = [172 / 255, 156 / 255, 141 / 255];
const ACCENT: [number, number, number] = [246 / 255, 36 / 255, 64 / 255];

const SPHERE = 1.6;
const CAMERA_Z = 4.2;
const FOV = 42;
// View-space z spans -(CAMERA_Z + SPHERE) at the back to -(CAMERA_Z - SPHERE) at the front.
const FAR_Z = (CAMERA_Z + SPHERE).toFixed(1);
const DEPTH_RANGE = (SPHERE * 2).toFixed(1);

function depthShader(): string {
  return `
    float depthFalloff(float viewZ) {
      return clamp((viewZ + ${FAR_Z}) / ${DEPTH_RANGE}, 0.0, 1.0);
    }`;
}

const LINK_VERTEX = `
  attribute vec3 position;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform float uOpacity;
  varying float vAlpha;
  ${depthShader()}
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float depth = depthFalloff(mv.z);
    vAlpha = uOpacity * depth * depth;
    gl_Position = projectionMatrix * mv;
  }
`;

const LINK_FRAGMENT = `
  precision highp float;
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    if (vAlpha < 0.004) discard;
    gl_FragColor = vec4(uColor, vAlpha);
  }
`;

const NODE_VERTEX = `
  attribute vec3 position;
  attribute float aSize;
  attribute float aHub;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform float uFocal;
  varying float vFade;
  varying float vHub;
  ${depthShader()}
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float depth = depthFalloff(mv.z);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(aSize * uFocal / max(0.4, -mv.z), 1.5, 96.0);
    vFade = mix(0.10, 1.0, depth);
    vHub = aHub;
  }
`;

const NODE_FRAGMENT = `
  precision highp float;
  uniform vec3 uInk;
  uniform vec3 uAccent;
  varying float vFade;
  varying float vHub;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv) * 2.0;
    float core = 1.0 - smoothstep(0.30, 0.62, d);
    float halo = (1.0 - smoothstep(0.0, 1.0, d)) * 0.42;
    float alpha = (core + halo) * vFade;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(mix(uInk, uAccent, vHub), alpha);
  }
`;

interface FieldData {
  nodePositions: Float32Array;
  nodeSizes: Float32Array;
  nodeHubs: Float32Array;
  linkPositions: Float32Array;
}

function buildField(count: number): FieldData {
  const points: Array<[number, number, number]> = [];
  const nodePositions = new Float32Array(count * 3);
  const nodeSizes = new Float32Array(count);
  const nodeHubs = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = SPHERE * (0.35 + Math.cbrt(Math.random()) * 0.65);
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.cos(phi) * 0.72;
    const z = r * Math.sin(phi) * Math.sin(theta);
    points.push([x, y, z]);
    nodePositions[i * 3] = x;
    nodePositions[i * 3 + 1] = y;
    nodePositions[i * 3 + 2] = z;
    const hub = Math.random() < 0.08;
    nodeHubs[i] = hub ? 1 : 0;
    nodeSizes[i] = hub ? 0.085 : 0.042;
  }

  // Connect each node to its nearest neighbours, capped to bound the line count.
  const links: Array<[number, number]> = [];
  const seen = new Set<string>();
  const limit = 190;
  for (let i = 0; i < count && links.length < limit; i += 1) {
    const a = points[i];
    const nearest: Array<{ j: number; d: number }> = [];
    for (let j = 0; j < count; j += 1) {
      if (j === i) continue;
      const b = points[j];
      const dx = a[0] - b[0];
      const dy = a[1] - b[1];
      const dz = a[2] - b[2];
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

  const linkPositions = new Float32Array(links.length * 6);
  for (let l = 0; l < links.length; l += 1) {
    const [i, j] = links[l];
    linkPositions.set(points[i], l * 6);
    linkPositions.set(points[j], l * 6 + 3);
  }

  return { nodePositions, nodeSizes, nodeHubs, linkPositions };
}

export function KnowledgeFieldGL({
  className = "",
  density = 1,
  interactive = true,
}: KnowledgeFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersReduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function measure() {
      const parent = canvas!.parentElement;
      const rect = parent ? parent.getBoundingClientRect() : canvas!.getBoundingClientRect();
      return {
        w: Math.max(320, Math.round(rect.width || window.innerWidth || 320)),
        h: Math.max(320, Math.round(rect.height || window.innerHeight || 320)),
      };
    }

    const initial = measure();

    let renderer: Renderer;
    try {
      renderer = new Renderer({
        canvas,
        alpha: true,
        antialias: true,
        depth: false,
        // We clear ourselves so the canvas stays fully transparent over the page.
        autoClear: false,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      });
    } catch {
      return;
    }
    const gl = renderer.gl;
    if (!gl) return;

    const count = Math.max(
      52,
      Math.min(Math.round(((initial.w * initial.h) / 19000) * density), 160),
    );
    const field = buildField(count);

    const camera = new Camera(gl, { fov: FOV, near: 0.1, far: 100 });
    camera.position.set(0, 0, CAMERA_Z);

    const scene = new Transform();

    const linkGeometry = new Geometry(gl, {
      position: { size: 3, data: field.linkPositions },
    });
    const linkProgram = new Program(gl, {
      vertex: LINK_VERTEX,
      fragment: LINK_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uColor: { value: LINK },
        uOpacity: { value: 0.55 },
      },
    });
    const linkMesh = new Mesh(gl, {
      geometry: linkGeometry,
      program: linkProgram,
      mode: gl.LINES,
      frustumCulled: false,
    });
    linkMesh.setParent(scene);

    const nodeGeometry = new Geometry(gl, {
      position: { size: 3, data: field.nodePositions },
      aSize: { size: 1, data: field.nodeSizes },
      aHub: { size: 1, data: field.nodeHubs },
    });
    const nodeProgram = new Program(gl, {
      vertex: NODE_VERTEX,
      fragment: NODE_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uInk: { value: INK },
        uAccent: { value: ACCENT },
        uFocal: { value: initial.h },
      },
    });
    const nodeMesh = new Mesh(gl, {
      geometry: nodeGeometry,
      program: nodeProgram,
      mode: gl.POINTS,
      frustumCulled: false,
    });
    nodeMesh.setParent(scene);

    let raf = 0;
    let visible = true;
    let elapsed = 0;
    let lastTime = 0;
    const target = { x: 0, y: 0 };
    const eased = { x: 0, y: 0 };

    function draw() {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      renderer.render({ scene, camera, clear: false });
    }

    function resize() {
      const { w, h } = measure();

      renderer.setSize(w, h);
      // ogl writes pixel dimensions to the inline style; we want the canvas to
      // fill its positioned parent instead.
      canvas!.style.width = "100%";
      canvas!.style.height = "100%";

      camera.perspective({ aspect: w / h, fov: FOV, near: 0.1, far: 100 });

      // World units -> device pixels at unit depth, so gl_PointSize stays
      // physically consistent across dpr and viewport changes.
      nodeProgram.uniforms.uFocal.value =
        (0.5 * gl.canvas.height) / Math.tan((FOV * Math.PI) / 360);

      if (prefersReduced) draw();
    }

    function loop(time: number) {
      if (!visible) {
        raf = 0;
        return;
      }
      const dt = lastTime ? Math.min(0.05, (time - lastTime) / 1000) : 0.016;
      lastTime = time;
      elapsed += dt;

      eased.x += (target.x - eased.x) * 0.045;
      eased.y += (target.y - eased.y) * 0.045;

      scene.rotation.y = elapsed * 0.13 + eased.x * 0.4;
      scene.rotation.x = -0.24 + eased.y * 0.16;

      draw();
      raf = requestAnimationFrame(loop);
    }

    function start() {
      if (prefersReduced || raf) return;
      lastTime = 0;
      raf = requestAnimationFrame(loop);
    }

    const onPointerMove = (event: PointerEvent) => {
      target.x = (event.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      target.y = (event.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
    };

    const onVisibilityChange = () => {
      visible = !document.hidden;
      if (visible) start();
    };

    resize();

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibilityChange);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && canvas.parentElement) {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvas.parentElement);
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
      draw();
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      resizeObserver?.disconnect();
      intersection?.disconnect();
      // Note: the WebGL context is intentionally *not* force-lost here. React
      // StrictMode remounts this effect onto the same canvas element, and a
      // lost context cannot be re-acquired from that canvas — it would leave the
      // hero blank in development. Dropping the references is enough: the canvas
      // is removed with the component and the context is reclaimed with it.
    };
  }, [density, interactive]);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
