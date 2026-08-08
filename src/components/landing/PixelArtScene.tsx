import { useRef, useEffect } from "react";

// ─── Palette ──────────────────────────────────────────
const C = {
  paper: "#EFE9E1", ink: "#322D29", brown: "#322D29", mid: "#5C4033",
  tan: "#8B7355", sand: "#A0886A", beige: "#D1C7BD", cream: "#F0E6D3",
  orange: "#D4975A", red: "#72383D", green: "#6B8E5A", lgreen: "#8EB07A",
  dgreen: "#4A6B3A", blue: "#6B93A8", lblue: "#8FB8CC", water: "#7BA7C9",
  purple: "#7B6B8B", dpurple: "#4A3B5A", lila: "#A08BB0",
};

function px(c: CanvasRenderingContext2D, x: number, y: number, s: number, cl: string) {
  c.fillStyle = cl;
  c.fillRect(x | 0, y | 0, Math.max(1, s | 0), Math.max(1, s | 0));
}
function rnd(s: number) { let x = s; return () => { x = (x * 1664525 + 1013904223) | 0; return (x >>> 0) / 4294967296; }; }
function wrap(x: number, max: number, margin = 0) {
  const m = max + margin * 2;
  return ((x % m) + m) % m - margin;
}

// ─── Spacecraft drawing ───────────────────────────────
function drawShip(c: CanvasRenderingContext2D, x: number, y: number, type: number, t: number, size: number) {
  c.imageSmoothingEnabled = false;
  const s = size;
  const f = 0.5 + Math.sin(t * 25 + type) * 0.5;

  switch (type % 6) {
    case 0: // Scout
      px(c, x - s, y, s * 2, C.brown);
      px(c, x + s, y - s * 0.3, s, C.mid);
      px(c, x - s * 2, y, s, C.orange + Math.floor(60 * f).toString(16).padStart(2, "0"));
      return;
    case 1: // Cargo
      px(c, x - s, y - s * 0.5, s * 3, C.tan);
      px(c, x + s * 1.5, y - s * 0.3, s * 0.5, C.orange + "80");
      if (Math.floor(t * 3 + type) % 2) px(c, x - s * 0.5, y - s * 0.5, 2, C.cream);
      return;
    case 2: // Fighter
      px(c, x - s * 0.5, y - s * 0.5, s, C.ink);
      px(c, x, y - s * 0.8, s * 0.5, C.mid);
      px(c, x + s * 0.5, y - s * 0.3, s * 0.3, C.red + Math.floor(80 * f).toString(16).padStart(2, "0"));
      px(c, x - s * 1.5, y, s, C.mid);
      return;
    case 3: // Science vessel
      px(c, x - s, y - s * 0.5, s * 2, C.sand);
      px(c, x, y - s, s * 0.5, C.cream);
      px(c, x - s * 1.5, y, s * 0.5, C.red + Math.floor(50 * f).toString(16).padStart(2, "0"));
      if (Math.floor(t * 2) % 2) px(c, x - s * 0.3, y - s * 0.5, 1, C.orange);
      return;
    case 4: // Carrier
      px(c, x - s * 1.5, y - s, s * 4, C.mid);
      px(c, x + s, y - s * 0.5, s * 0.5, C.orange + "60");
      px(c, x - s * 2, y - s * 1.3, s * 2, C.tan);
      px(c, x - s * 1.5, y - s * 0.3, 1, C.cream);
      px(c, x - s * 0.5, y - s * 0.3, 1, C.cream);
      px(c, x + s * 0.5, y - s * 0.3, 1, C.cream);
      return;
    case 5: // Pod
      px(c, x - s * 0.3, y - s * 0.3, s * 0.8, C.cream);
      px(c, x + s * 0.3, y, s * 0.3, C.red + Math.floor(90 * f).toString(16).padStart(2, "0"));
      return;
  }
}

// ─── Creature drawing ─────────────────────────────────
function drawBird(c: CanvasRenderingContext2D, x: number, y: number, s: number, w: number) {
  c.fillStyle = C.ink + "90";
  c.beginPath(); c.moveTo(x, y); c.lineTo(x - s, y - 2 - w); c.lineTo(x - s * 0.4, y); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(x, y); c.lineTo(x + s, y - 2 + w); c.lineTo(x + s * 0.4, y); c.closePath(); c.fill();
}
function drawJelly(c: CanvasRenderingContext2D, x: number, y: number, s: number, t: number) {
  const b = Math.sin(t * 2 + s) * 2;
  c.fillStyle = C.lila + "50";
  c.beginPath(); c.ellipse(x, y + b, s * 0.4, s * 0.3, 0, Math.PI, 0); c.fill();
  c.fillStyle = C.purple + "40";
  for (let i = 0; i < 3; i++) c.fillRect(x - s * 0.25 + i * s * 0.25, y + b, 1, s * 0.4 + Math.sin(t * 3 + i) * 2);
}
function drawWalker(c: CanvasRenderingContext2D, x: number, y: number, s: number, t: number) {
  const leg = Math.sin(t * 4) * 2;
  c.fillStyle = C.brown;
  px(c, x - s * 0.3, y - s * 0.5 + leg, s * 0.6, C.brown);
  px(c, x - s * 0.3, y - s + leg, s * 0.3, C.brown);
  c.fillStyle = C.cream;
  px(c, x - s * 0.1, y - s * 0.3 + leg, s * 0.2, C.cream);
}
function drawDrone(c: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, bl: number) {
  c.fillStyle = C.mid;
  px(c, x - s * 0.3, y - s * 0.2, s * 0.6, C.mid);
  px(c, x - s * 0.2, y - s * 0.1, s * 0.4, C.sand);
  px(c, x, y - s * 0.5, 1, C.brown);
  if (bl) px(c, x + s * 0.15, y - s * 0.05, 1, C.red);
}
function drawInsect(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.fillStyle = C.dgreen + "90";
  px(c, x - s * 0.2, y, s * 0.4, C.dgreen + "90");
  px(c, x - s * 0.1, y - s * 0.2, s * 0.2, C.dgreen + "70");
}

// ─── Landscape drawing ────────────────────────────────
function drawMountain(c: CanvasRenderingContext2D, x: number, w: number, h: number, col: string) {
  c.fillStyle = col;
  c.beginPath(); c.moveTo(x - 5, 0); c.lineTo(x + w * 0.5, -h); c.lineTo(x + w + 5, 0); c.closePath(); c.fill();
  // Snow cap for large mountains
  if (h > 60) {
    c.fillStyle = C.cream + "60";
    c.beginPath(); c.moveTo(x + w * 0.4, -h * 0.7); c.lineTo(x + w * 0.5, -h); c.lineTo(x + w * 0.6, -h * 0.7); c.closePath(); c.fill();
    px(c, x + w * 0.5 - 3, -h + 3, 3, C.cream + "60");
  }
}
function drawTree(c: CanvasRenderingContext2D, x: number, y: number, t: number) {
  switch (t % 5) {
    case 0: // Pine
      c.fillStyle = C.brown; px(c, x - 1, y - 10, 3, C.brown);
      c.fillStyle = C.dgreen; px(c, x - 5, y - 14, 10, C.dgreen); px(c, x - 4, y - 16, 8, C.dgreen); px(c, x - 3, y - 18, 6, C.dgreen);
      break;
    case 1: // Mushroom
      c.fillStyle = C.mid; px(c, x - 1, y - 10, 3, C.mid);
      c.fillStyle = C.orange + "80"; px(c, x - 6, y - 12, 12, C.orange + "80"); px(c, x - 4, y - 14, 8, C.orange + "80");
      break;
    case 2: // Alien curved
      c.fillStyle = C.lgreen; px(c, x - 1, y - 14, 2, C.lgreen); px(c, x + 1, y - 8, 2, C.lgreen);
      c.fillStyle = C.green; px(c, x - 3, y - 16, 6, C.green); px(c, x - 2, y - 18, 4, C.green);
      break;
    case 3: // Palm
      c.fillStyle = C.brown; px(c, x - 1, y - 12, 2, C.brown);
      c.fillStyle = C.lgreen; px(c, x - 5, y - 14, 3, C.lgreen); px(c, x + 2, y - 14, 3, C.lgreen); px(c, x - 1, y - 16, 3, C.lgreen);
      break;
    case 4: // Crystal tree
      c.fillStyle = C.lila; px(c, x - 1, y - 8, 2, C.lila);
      c.fillStyle = C.purple + "80"; px(c, x - 3, y - 12, 6, C.purple + "80"); px(c, x - 2, y - 14, 4, C.purple + "80");
      break;
  }
}
function drawBuilding(c: CanvasRenderingContext2D, x: number, y: number, t: number) {
  switch (t % 4) {
    case 0: // Research station
      c.fillStyle = C.sand + "90"; px(c, x - 5, y - 8, 10, C.sand + "90");
      c.fillStyle = C.cream + "70"; c.beginPath(); c.ellipse(x, y - 8, 4, 2.5, 0, Math.PI, 0); c.fill();
      px(c, x, y - 10, 1, C.orange + "80");
      break;
    case 1: // Observatory
      c.fillStyle = C.mid + "80"; px(c, x - 4, y - 5, 8, C.mid + "80");
      c.fillStyle = C.tan; c.beginPath(); c.arc(x, y - 8, 4, Math.PI, 0); c.fill();
      px(c, x + 1, y - 9, 1, C.orange + "70");
      break;
    case 2: // Tower
      c.fillStyle = C.tan + "80"; px(c, x - 3, y - 16, 6, C.tan + "80"); px(c, x - 4, y - 3, 8, C.tan + "80");
      if (Math.floor(Math.random() * 3)) px(c, x - 1, y - 10, 2, C.cream + "60");
      break;
    case 3: // Ruin
      c.fillStyle = C.brown + "70"; px(c, x - 3, y - 6, 2, C.brown + "70"); px(c, x + 1, y - 8, 2, C.brown + "70");
      c.fillStyle = C.mid + "50"; px(c, x - 2, y - 3, 4, C.mid + "50");
      break;
  }
}
function drawCrystal(c: CanvasRenderingContext2D, x: number, y: number, h: number) {
  c.fillStyle = C.lila + "80"; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 2, y - h); c.lineTo(x + 2, y - h); c.closePath(); c.fill();
  c.fillStyle = C.purple + "60"; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 3, y - h * 0.6); c.lineTo(x + 4, y); c.closePath(); c.fill();
}

// ─── Atmosphere ───────────────────────────────────────
function drawAurora(c: CanvasRenderingContext2D, w: number, t: number) {
  c.save();
  c.globalAlpha = 0.08;
  for (let i = 0; i < 3; i++) {
    c.fillStyle = [C.red, C.lila, C.lgreen][i] + "60";
    c.beginPath();
    c.ellipse(Math.sin(t * 0.0004 + i * 2) * w * 0.3 + w * 0.5, 40 + i * 20 + Math.sin(t * 0.0006 + i) * 10, w * 0.35, 25, 0, 0, 6.28);
    c.fill();
  }
  c.restore();
}

// ─── Scene init ───────────────────────────────────────
function init(w: number, h: number) {
  const R = rnd(173);
  const gy = h * 0.68;

  const stars: { x: number; y: number; r: number; sp: number; ph: number; tw: number }[] = [];
  for (let i = 0; i < 150; i++) stars.push({ x: R() * w, y: R() * gy * 0.5, r: 0.5 + R() * 1.5, sp: 0.02 + R() * 0.04, ph: R() * 6.28, tw: 0.2 + R() * 0.8 });

  const clouds: { x: number; y: number; w: number; h: number; sp: number }[] = [];
  for (let i = 0; i < 8; i++) clouds.push({ x: R() * w, y: 30 + R() * 120, w: 40 + R() * 80, h: 10 + R() * 15, sp: 0.15 + R() * 0.2 });

  const mountains: { x: number; w: number; h: number; col: string; sp: number }[][] = [];
  for (let layer = 0; layer < 3; layer++) {
    const m: { x: number; w: number; h: number; col: string; sp: number }[] = [];
    const cols = [C.beige + "80", C.tan + "70", C.brown + "60"];
    const sps = [0.1, 0.2, 0.35];
    for (let x = -200; x < w + 200; x += 40 + R() * 80) m.push({ x, w: 50 + R() * 100, h: 25 + R() * 70 + layer * 15, col: cols[layer], sp: sps[layer] });
    mountains.push(m);
  }

  const trees: { x: number; t: number }[] = [];
  for (let x = -60; x < w + 60; x += 20 + R() * 40) trees.push({ x, t: (R() * 5) | 0 });

  const buildings: { x: number; t: number }[] = [];
  for (let i = 0; i < 8; i++) buildings.push({ x: R() * w, t: (R() * 4) | 0 });

  const crystals: { x: number; h: number }[] = [];
  for (let i = 0; i < 6; i++) crystals.push({ x: R() * w, h: 8 + R() * 16 });

  const ships: { x: number; y: number; sp: number; size: number; type: number; ph: number; blink: number; hover: boolean; trail: boolean }[] = [];
  for (let i = 0; i < 10; i++) {
    const close = i < 4;
    ships.push({
      x: R() * w, y: gy * (0.2 + R() * 0.45), sp: close ? 0.3 + R() * 0.8 : 0.08 + R() * 0.15,
      size: close ? 3 + R() * 5 : 1.5 + R() * 2, type: i % 6, ph: R() * 6.28,
      blink: (R() * 3) | 0, hover: i < 3, trail: close && i > 1,
    });
  }

  const creatures: { x: number; y: number; sp: number; type: number; size: number; ph: number }[] = [];
  // Birds
  for (let i = 0; i < 5; i++) creatures.push({ x: R() * w, y: gy * 0.2 + R() * gy * 0.3, sp: 0.4 + R() * 0.5, type: 0, size: 3 + R() * 3, ph: R() * 6.28 });
  // Jellyfish
  for (let i = 0; i < 3; i++) creatures.push({ x: R() * w, y: gy * 0.3 + R() * gy * 0.2, sp: 0.1 + R() * 0.15, type: 1, size: 6 + R() * 6, ph: R() * 6.28 });
  // Walkers
  for (let i = 0; i < 4; i++) creatures.push({ x: R() * w, y: 0, sp: 0.3 + R() * 0.3, type: 2, size: 4 + R() * 4, ph: R() * 6.28 });
  // Drones
  for (let i = 0; i < 4; i++) creatures.push({ x: R() * w, y: gy * 0.15 + R() * gy * 0.35, sp: 0.2 + R() * 0.4, type: 3, size: 4 + R() * 3, ph: R() * 6.28 });
  // Insects
  for (let i = 0; i < 6; i++) creatures.push({ x: R() * w, y: gy * 0.5 + R() * gy * 0.3, sp: 0.6 + R() * 0.8, type: 4, size: 1.5 + R() * 1.5, ph: R() * 6.28 });

  const effects: { x: number; y: number; vx: number; vy: number; life: number; max: number; type: string }[] = [];
  for (let i = 0; i < 40; i++) {
    effects.push({ x: R() * w, y: R() * h, vx: (R() - 0.5) * 0.2, vy: -0.1 - R() * 0.3, life: R() * 100, max: 100 + R() * 100, type: "dust" });
  }

  const fireflies: { x: number; y: number; ph: number }[] = [];
  for (let i = 0; i < 12; i++) fireflies.push({ x: R() * w, y: gy * 0.6 + R() * gy * 0.3, ph: R() * 6.28 });

  const leaves: { x: number; y: number; vx: number; vy: number; r: number }[] = [];
  for (let i = 0; i < 8; i++) leaves.push({ x: R() * w, y: R() * gy, vx: -0.3 - R() * 0.5, vy: 0.3 + R() * 0.5, r: 2 + R() * 3 });

  const comets: { x: number; y: number; vx: number; vy: number; life: number; active: boolean }[] = [];
  for (let i = 0; i < 3; i++) comets.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, active: false });

  return { w, h, gy, time: 0, offset: 0, R,
    stars, clouds, mountains, trees, buildings, crystals, ships, creatures, effects, fireflies, leaves, comets,
    meteorTimer: 0, activeMeteor: 0, moonPhase: 0,
  };
}

type Scene = ReturnType<typeof init>;

// ─── Main draw ────────────────────────────────────────
function draw(c: CanvasRenderingContext2D, s: Scene) {
  const { w, h, gy } = s;
  const off = s.offset;
  const t = s.time;
  const R = s.R;

  c.imageSmoothingEnabled = false;

  // ── Sky ──
  c.fillStyle = C.paper;
  c.fillRect(0, 0, w, h);

  // Upper sky gradient
  c.fillStyle = C.cream + "60";
  c.fillRect(0, 0, w, gy * 0.3);

  // ── Stars ──
  for (const st of s.stars) {
    const tw = Math.sin(t * 0.002 + st.ph) * 0.5 + 0.5;
    const a = st.tw * (0.15 + tw * 0.85);
    if (a > 0.02) {
      const sx = wrap(st.x - off * st.sp, w, 5);
      c.fillStyle = C.cream + Math.floor(a * 160).toString(16).padStart(2, "0");
      px(c, sx | 0, st.y | 0, Math.max(1, st.r | 0), C.cream + Math.floor(a * 160).toString(16).padStart(2, "0"));
    }
  }

  // ── Nebulas ──
  for (let i = 0; i < 3; i++) {
    const nx = wrap((i * w * 0.4 + Math.sin(t * 0.0003 + i * 2) * 80) - off * 0.02, w, 100);
    c.fillStyle = [C.lila + "12", C.red + "08", C.lblue + "10"][i];
    c.beginPath(); c.ellipse(nx, 50 + i * 25, 120 + i * 30, 30 + i * 10, 0, 0, 6.28); c.fill();
  }

  // ── Aurora ──
  drawAurora(c, w, t);

  // ── Constellations ──
  for (let g = 0; g < 3; g++) {
    const cx = wrap((g * w * 0.33 + 50) - off * 0.01, w, 0);
    const cy = 20 + g * 25;
    c.fillStyle = C.cream + "60";
    for (let i = 0; i < 4; i++) {
      const sx = cx + Math.sin(i * 1.5 + g) * 25;
      const sy = cy + Math.cos(i * 1.5 + g) * 10;
      px(c, sx, sy, 1.5, C.cream + "60");
      if (i > 0) {
        const px2 = cx + Math.sin((i - 1) * 1.5 + g) * 25;
        const py2 = cy + Math.cos((i - 1) * 1.5 + g) * 10;
        c.strokeStyle = C.cream + "30";
        c.lineWidth = 0.5;
        c.beginPath(); c.moveTo(sx, sy); c.lineTo(px2, py2); c.stroke();
      }
    }
  }

  // ── Moons (2) ──
  const moon1X = wrap((-off * 0.01) - 50, w + 200, 0);
  c.fillStyle = C.cream + "90";
  c.beginPath(); c.arc(moon1X, 30, 14, 0, 6.28); c.fill();
  c.fillStyle = C.cream + "50";
  c.beginPath(); c.arc(moon1X + 3, 28, 11, 0, 6.28); c.fill();
  c.fillStyle = C.brown + "40";
  px(c, moon1X - 3, 27, 2, C.brown + "40");
  px(c, moon1X + 2, 32, 2, C.brown + "40");

  const moon2X = wrap((-off * 0.008) - 200, w + 300, 0);
  c.fillStyle = C.tan + "60";
  c.beginPath(); c.arc(moon2X, 55, 8, 0, 6.28); c.fill();
  c.fillStyle = C.tan + "40";
  px(c, moon2X - 1, 53, 1, C.tan + "40");

  // ── Distant planet ──
  const plX = wrap((-off * 0.015) - 300, w + 400, 0);
  c.fillStyle = C.orange + "50";
  c.beginPath(); c.arc(plX, 20, 20, 0, 6.28); c.fill();
  c.fillStyle = C.orange + "30";
  c.beginPath(); c.ellipse(plX, 20, 18, 4, 0.3, 0, 6.28); c.fill();
  c.fillStyle = C.brown + "40";
  c.beginPath(); c.ellipse(plX, 20, 18, 2, -0.3, 0, 6.28); c.fill();
  // Ring
  c.strokeStyle = C.cream + "40";
  c.lineWidth = 2;
  c.beginPath(); c.ellipse(plX, 22, 28, 5, 0.2, 0, 6.28); c.stroke();

  // ── Shooting stars ──
  if (s.comets) {
    s.meteorTimer += 1 / 60;
    const m = s.comets[s.activeMeteor];
    if (!m.active && s.meteorTimer > 4 + (s.activeMeteor % 3) * 5) {
      m.active = true; m.x = w + 10; m.y = 15 + R() * 40;
      m.vx = -2.5 - R() * 1.5; m.vy = 0.5 + R() * 0.8; m.life = 0;
      s.meteorTimer = 0;
      s.activeMeteor = (s.activeMeteor + 1) % s.comets.length;
    }
    if (m.active) {
      m.x += m.vx; m.y += m.vy; m.life += 1 / 60;
      for (let i = 0; i < 5; i++) {
        const al = 60 - i * 10;
        if (al > 0) px(c, m.x + i * 2.5, m.y - i * 0.5, 2 - i * 0.3, C.cream + Math.floor(al).toString(16).padStart(2, "0"));
      }
      px(c, m.x, m.y, 2, C.cream);
      if (m.x < -20 || m.life > 3) m.active = false;
    }
  }

  // ── Satellites ──
  for (let i = 0; i < 2; i++) {
    const sx = wrap((-off * 0.05 + i * w * 0.6), w, 20);
    const sy = 20 + i * 40 + Math.sin(t * 0.001 + i) * 5;
    px(c, sx, sy, 2, C.cream + "80");
    px(c, sx + 2, sy, 2, C.mid + "60");
    px(c, sx - 1, sy + 2, 1, C.cream + "40");
  }

  // ── Clouds ──
  for (const cl of s.clouds) {
    const cx = wrap(cl.x - off * cl.sp, w + cl.w, 0);
    c.fillStyle = C.cream + "50";
    c.beginPath();
    c.ellipse(cx, cl.y, cl.w * 0.5, cl.h * 0.5, 0, 0, 6.28);
    c.fill();
    c.fillStyle = C.cream + "35";
    c.beginPath();
    c.ellipse(cx + cl.w * 0.15, cl.y - cl.h * 0.15, cl.w * 0.35, cl.h * 0.4, 0, 0, 6.28);
    c.fill();
  }

  // ── Mountains (3 parallax layers) ──
  for (const layer of s.mountains) {
    for (const m of layer) {
      const mx = wrap(m.x - off * m.sp, w + m.w + 20, 10);
      drawMountain(c, mx, m.w, m.h, m.col);
    }
  }

  // ── Terrain ground ──
  const segs = Math.ceil(w / 8);
  c.fillStyle = C.beige;
  c.beginPath(); c.moveTo(0, gy);
  for (let i = 0; i <= segs; i++) {
    const gx = i * 8;
    const ty = gy + Math.sin((gx + off * 2) * 0.04) * 5 + Math.sin((gx + off * 2) * 0.08) * 3;
    c.lineTo(gx, ty);
  }
  c.lineTo(w, gy); c.lineTo(w, h); c.lineTo(0, h);
  c.closePath(); c.fill();

  // ── Grass layer ──
  c.fillStyle = C.lgreen + "40";
  c.fillRect(0, gy, w, 3);

  // ── River ──
  const riverX = w * 0.65;
  const riverOff = Math.sin(off * 0.02) * 15;
  c.fillStyle = C.water + "50";
  c.beginPath();
  c.moveTo(riverX - 8 + riverOff, gy);
  for (let i = 0; i <= 20; i++) {
    const ry = gy + i * ((h - gy) / 20);
    const rx = riverX + Math.sin(off * 0.015 + i * 0.8) * 10 + riverOff * 0.3;
    c.lineTo(rx - 3, ry);
  }
  for (let i = 20; i >= 0; i--) {
    const ry = gy + i * ((h - gy) / 20);
    const rx = riverX + Math.sin(off * 0.015 + i * 0.8) * 10 + riverOff * 0.3;
    c.lineTo(rx + 3, ry);
  }
  c.closePath(); c.fill();

  // ── Flowers ──
  for (let i = 0; i < 15; i++) {
    const fx = wrap((i * 67 + 13 - off * 2), w, 5);
    const fy = gy + Math.sin((fx + off * 2) * 0.04) * 5 + Math.sin((fx + off * 2) * 0.08) * 3;
    px(c, fx, fy - 3, 2, C.red + "60");
    px(c, fx, fy - 2, 1, C.orange + "80");
  }

  // ── Small rocks ──
  for (let i = 0; i < 10; i++) {
    const rx = wrap((i * 43 + 7 - off * 2), w, 5);
    const ry = gy + Math.sin((rx + off * 2) * 0.04) * 5 + Math.sin((rx + off * 2) * 0.08) * 3;
    px(c, rx, ry - 2, 3, C.mid + "60");
    px(c, rx + 1, ry - 3, 2, C.mid + "40");
  }

  // ── Buildings ──
  for (const b of s.buildings) {
    const bx = wrap(b.x - off * 1.8, w, 15);
    drawBuilding(c, bx, gy + Math.sin((b.x + off * 2) * 0.04) * 5 + Math.sin((b.x + off * 2) * 0.08) * 3, b.t);
  }

  // ── Crystals ──
  for (const cr of s.crystals) {
    const cx = wrap(cr.x - off * 1.8, w, 10);
    drawCrystal(c, cx, gy + Math.sin((cr.x + off * 2) * 0.04) * 5 + Math.sin((cr.x + off * 2) * 0.08) * 3, cr.h);
  }

  // ── Trees ──
  for (const tr of s.trees) {
    const tx = wrap(tr.x - off * 2, w, 30);
    const ty = gy + Math.sin((tr.x + off * 2) * 0.04) * 5 + Math.sin((tr.x + off * 2) * 0.08) * 3;
    drawTree(c, tx, ty, tr.t);
  }

  // ── Cave ──
  const cvX = wrap(250 - off * 2, w, 20);
  c.fillStyle = C.ink + "70";
  c.beginPath(); c.ellipse(cvX, gy + 2, 12, 8, 0, 0, 6.28); c.fill();
  c.fillStyle = C.ink + "50";
  c.beginPath(); c.ellipse(cvX, gy + 4, 8, 5, 0, 0, 6.28); c.fill();

  // ── Bridge ──
  const brX = wrap(500 - off * 2, w, 20);
  c.fillStyle = C.brown + "70";
  c.beginPath();
  c.moveTo(brX - 6, gy); c.quadraticCurveTo(brX, gy - 8, brX + 6, gy);
  c.fill();
  c.fillStyle = C.mid + "60";
  px(c, brX - 1, gy - 7, 2, C.mid + "60");

  // ── Creatures ──
  for (const cr of s.creatures) {
    const bx = wrap(cr.x - off * cr.sp, w, 60);
    const by = cr.type === 2 ? gy + Math.sin((cr.x + off * 2) * 0.04) * 5 + Math.sin((cr.x + off * 2) * 0.08) * 3 : cr.y + Math.sin(cr.ph + t * 0.003) * 4;
    switch (cr.type) {
      case 0: drawBird(c, bx, by, cr.size, Math.sin(t * 0.006 + cr.ph) * 2); break;
      case 1: drawJelly(c, bx, by, cr.size, t * 0.002); break;
      case 2: drawWalker(c, bx, by, cr.size, t * 0.003); break;
      case 3: drawDrone(c, bx, by, cr.size, t * 0.002, Math.floor(t * 0.003 + cr.ph) % 2); break;
      case 4: drawInsect(c, bx + Math.sin(t * 0.005 + cr.ph) * 8, by + Math.cos(t * 0.004 + cr.ph) * 4, cr.size); break;
    }
  }

  // ── Ships ──
  for (const sh of s.ships) {
    let sx: number, sy: number;
    if (sh.hover) {
      sx = sh.x;
      sy = sh.y + Math.sin(t * 0.001 + sh.ph) * 6;
    } else {
      sx = wrap(sh.x - off * sh.sp, w + sh.size * 4, sh.size * 2);
      sy = sh.y + Math.sin(t * 0.0008 + sh.ph) * 4;
    }
    drawShip(c, sx | 0, sy | 0, sh.type, t * 0.001, sh.size);
    // Nav lights
    if (Math.floor(t * 2 + sh.blink) % 2) {
      px(c, sx - sh.size * 0.5, sy - sh.size * 0.3, 1, C.red + "80");
    }
    // Engine trail
    if (sh.trail && Math.random() < 0.3) {
      px(c, sx - sh.size, sy + (Math.random() - 0.5) * 2, 1.5, C.orange + Math.floor(30 + Math.random() * 40).toString(16).padStart(2, "0"));
    }
  }

  // ── Fireflies ──
  for (const ff of s.fireflies) {
    const gl = Math.sin(t * 0.003 + ff.ph) * 0.5 + 0.5;
    if (gl > 0.3) {
      const fx = wrap(ff.x - off * 0.1, w, 0);
      px(c, fx, ff.y + Math.sin(t * 0.002 + ff.ph) * 5, 2, C.orange + Math.floor(gl * 100).toString(16).padStart(2, "0"));
    }
  }

  // ── Leaves ──
  for (const lf of s.leaves) {
    lf.x += lf.vx; lf.y += lf.vy;
    if (lf.x < -10) lf.x = w + 10; if (lf.y > gy) lf.y = 10;
    c.fillStyle = C.lgreen + "70";
    c.fillRect(lf.x | 0, lf.y | 0, lf.r | 0, lf.r * 0.5 | 0);
  }

  // ── Dust particles ──
  for (const p of s.effects) {
    p.x += p.vx; p.y += p.vy; p.life++;
    if (p.life > p.max || p.y < -5) { p.x = R() * w; p.y = h * 0.3 + R() * h * 0.5; p.life = 0; }
    const al = 1 - p.life / p.max;
    if (al > 0) px(c, p.x, p.y, 1.5, C.cream + Math.floor(al * 40).toString(16).padStart(2, "0"));
  }

  // ── Fog ──
  for (let i = 0; i < 3; i++) {
    const fx = wrap((i * w * 0.35 + Math.sin(t * 0.0003 + i * 2) * 50) - off * 0.8, w, 0);
    c.fillStyle = C.paper + "20";
    c.beginPath(); c.ellipse(fx, gy - 15 + i * 15, 100, 18, 0, 0, 6.28); c.fill();
  }

  // ── Floating crystals (hovering) ──
  for (let i = 0; i < 2; i++) {
    const fx = wrap((i * w * 0.5 + 30) - off * 0.5, w, 0);
    const fy = gy * 0.35 + i * 50 + Math.sin(t * 0.001 + i) * 8;
    c.fillStyle = C.lila + "70";
    c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx - 4, fy - 8); c.lineTo(fx, fy - 16); c.lineTo(fx + 4, fy - 8); c.closePath(); c.fill();
    c.fillStyle = C.lila + "40";
    c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx - 2, fy - 6); c.lineTo(fx, fy - 12); c.lineTo(fx + 2, fy - 6); c.closePath(); c.fill();
    // Glow
    c.fillStyle = C.lila + "15";
    c.beginPath(); c.arc(fx, fy - 8, 10, 0, 6.28); c.fill();
  }

  // Bottom fade for readability
  c.fillStyle = C.paper + "40";
  c.fillRect(0, h - 50, w, 50);
}

// ─── React ────────────────────────────────────────────
export function PixelArtScene() {
  const ref = useRef<HTMLCanvasElement>(null);
  const sc = useRef<Scene | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let id: number;
    let last = 0;

    function resize() {
      const p = canvas!.parentElement!;
      const r = p.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = r.width * dpr;
      canvas!.height = r.height * dpr;
      canvas!.style.width = r.width + "px";
      canvas!.style.height = r.height + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      sc.current = init(r.width, r.height);
    }

    resize();
    window.addEventListener("resize", resize);

    function frame(now: number) {
      const s = sc.current;
      if (!s || !canvas || !ctx) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      s.time += dt;
      s.offset += dt * 30;
      draw(ctx, s);
      id = requestAnimationFrame(frame);
    }

    last = performance.now();
    id = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(id); window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 w-full h-full block" style={{ imageRendering: "pixelated" }} />;
}
