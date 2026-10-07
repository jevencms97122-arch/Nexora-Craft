import { useEffect, useRef } from "react";
import type { Theme } from "../store/themeStore";

/*
 * Scène Minecraft animée.
 *
 * Le décor est dessiné en pixel-art basse résolution (320x180), puis agrandi sans lissage sur un
 * canvas à la taille de l'écran. Les effets de lumière (halos, obscurité, brume, rayons) sont
 * dessinés directement en haute résolution par-dessus, pour rester doux et sans paliers.
 *
 * La nuit, une couche d'obscurité recouvre le premier plan ; les sources de lumière (feu, fenêtres,
 * torche, lanterne) y découpent des zones éclairées où les vraies couleurs réapparaissent.
 *
 * L'ambiance est décrite par un `Env` continu (niveau de nuit, crépuscule, position du soleil et
 * de la lune, météo) : il vient soit du thème (nuit en sombre, jour en clair), soit de l'heure
 * réelle, avec lever et coucher de soleil.
 */

const W = 320;
const H = 180;
const GROUND = 148;
const FRAME_MS = 40; // ~25 images/s : fluide pour du pixel-art, léger pour le GPU.
const MAX_RES = 1.5; // facteur max appliqué à devicePixelRatio pour le canvas haute résolution.

const FIRE_X = 152;
const DOG_X = 124;
const HOUSE = { x0: 184, x1: 236, top: 114 };
const WINDOWS = [
  { x: 190, y: 120 },
  { x: 222, y: 120 },
];
const TORCH = { x: 215, y: 133 };
const POND = { x0: 70, x1: 112 };
const FENCE = { x0: 240, x1: 280 };
const LANTERN = { x: 280, y: 135 };
const THEME_SUN = { x: 62, y: 26 };
const THEME_MOON = { x: 266, y: 26 };
const CHIMNEY = { x: 225, y: 89 };

const DOG = [
  "            g  g",
  "           gwwwwg",
  "           wwkwwwwd",
  "           wwwwwwwg",
  "           gwwwwg",
  "           rrrrr",
  "        wwwwwwww",
  "      gwwwwwwwww",
  "     gwwwwwwwwww",
  "    gwwwwwwwwg ww",
  "    gwwwwwwwg  ww",
  "    gwwwwwwwg  ww",
  "    gggggggg   gg",
];
const DOG_COLORS: Record<string, string> = {
  w: "#e8e8e8",
  g: "#b4b4b4",
  k: "#1e1e1e",
  d: "#2b2b2b",
  r: "#c0392b",
};
// Positions de la queue (relatives au chien) pour l'animation de remuement.
const TAIL_FRAMES = [
  [[3, 8], [2, 7], [1, 6]],
  [[3, 9], [2, 8], [1, 8]],
  [[3, 9], [2, 9], [1, 10]],
];

// ---------- Utilitaires ----------

type Ctx = CanvasRenderingContext2D;
type Rgb = [number, number, number];

interface Point {
  x: number;
  y: number;
}

export type Weather = "clear" | "rain" | "snow";

/// Ambiance de la scène à un instant donné.
interface Env {
  /// 0 = plein jour, 1 = nuit noire.
  night: number;
  /// 0 à 1 : intensité des couleurs chaudes du lever et du coucher de soleil.
  twilight: number;
  sun: Point | null;
  moon: Point | null;
  weather: Weather;
  /// 0 à 1 : intensité de la pluie ou de la neige.
  wet: number;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function rgba(c: Rgb, a = 1) {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a.toFixed(3)})`;
}

function envFromTheme(night: boolean): Omit<Env, "weather" | "wet"> {
  return night
    ? { night: 1, twilight: 0, sun: null, moon: THEME_MOON }
    : { night: 0, twilight: 0, sun: THEME_SUN, moon: null };
}

/// Position d'un astre sur son arc : `phase` va de 0 (lever, à gauche) à 1 (coucher, à droite).
function arc(phase: number, altitude: number): Point {
  return { x: 24 + phase * 272, y: GROUND - 12 - altitude * 112 };
}

/// Ambiance à une heure donnée (0 à 24) : soleil levé de 6 h à 18 h, lune le reste du temps.
function envFromHour(hour: number): Omit<Env, "weather" | "wet"> {
  const sunAlt = Math.sin(((hour - 6) / 12) * Math.PI);
  const moonHour = (hour + 12) % 24;
  return {
    night: clamp01((0.12 - sunAlt) / 0.42),
    twilight: clamp01(1 - Math.abs(sunAlt) / 0.38),
    sun: sunAlt > -0.14 ? arc((hour - 6) / 12, sunAlt) : null,
    moon: -sunAlt > -0.14 ? arc((moonHour - 6) / 12, -sunAlt) : null,
  };
}

/// Météo du moment : par tranches de dix minutes, environ une sur trois est pluvieuse
/// (neigeuse en hiver), avec une montée et une accalmie progressives.
function weatherAt(ms: number): { weather: Weather; wet: number } {
  const slot = Math.floor(ms / 600_000);
  if (hash(slot, 17) > 0.3) return { weather: "clear", wet: 0 };
  const within = (ms % 600_000) / 1000;
  const month = new Date(ms).getMonth();
  return {
    weather: month === 11 || month <= 1 ? "snow" : "rain",
    wet: clamp01(Math.min(within / 25, (600 - within) / 25)),
  };
}

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/// Bruit déterministe dans [0, 1) pour deux entiers (scintillement des feuilles, reflets...).
function hash(a: number, b: number) {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function px(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function pick<T>(r: () => number, list: T[]): T {
  return list[Math.floor(r() * list.length)];
}

function mixHex(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) =>
    Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function makeCanvas(w = W, h = H) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function ctxOf(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

// ---------- Ciel ----------

const SKY_DAY: Rgb[] = [[58, 128, 218], [134, 189, 242], [214, 236, 255]];
const SKY_NIGHT: Rgb[] = [[3, 5, 15], [12, 21, 52], [40, 54, 95]];
const SKY_DUSK: Rgb[] = [[52, 50, 110], [200, 112, 128], [255, 164, 98]];
const HAZE_DAY: Rgb = [200, 226, 255];
const HAZE_NIGHT: Rgb = [14, 20, 50];
const HAZE_DUSK: Rgb = [255, 176, 130];

function drawSky(ctx: Ctx, env: Env) {
  const stop = (i: number) =>
    rgba(mixRgb(mixRgb(SKY_DAY[i], SKY_NIGHT[i], env.night), SKY_DUSK[i], env.twilight * [0.55, 0.7, 0.9][i]));
  const g = ctx.createLinearGradient(0, 0, 0, GROUND);
  g.addColorStop(0, stop(0));
  g.addColorStop(0.58, stop(1));
  g.addColorStop(1, stop(2));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (env.night > 0.3) {
    // Voie lactée : bande diagonale de poussière d'étoiles.
    const visibility = clamp01((env.night - 0.3) / 0.7);
    const r = rng(5);
    for (let i = 0; i < 1700; i++) {
      const u = r();
      const center = 100 - u * 86;
      const off = (r() + r() + r() - 1.5) * 15;
      const y = Math.round(center + off);
      if (y < 0 || y > GROUND - 30) continue;
      const a = (0.03 + r() * 0.11 * (1 - Math.min(1, Math.abs(off) / 22))) * visibility;
      px(ctx, Math.round(u * W), y, 1, 1, `rgba(196,206,255,${a.toFixed(3)})`);
    }
  }
}

// ---------- Arrière-plans (montagnes, collines) ----------

function drawMountains(ctx: Ctx) {
  const r = rng(21);
  for (let x = 0; x < W; x += 3) {
    const h = Math.round((88 + Math.sin(x * 0.021 + 0.5) * 15 + Math.sin(x * 0.057) * 6) / 2) * 2;
    for (let y = h; y < GROUND; y++) {
      for (let k = 0; k < 3; k++) {
        const snow = y < h + 3 && h < 86 && r() > 0.15;
        let c = "#8193ab";
        if (snow) c = "#eef4ff";
        else if (y < h + 2) c = "#97a8bf";
        else if (r() < 0.12) c = "#72849c";
        px(ctx, x + k, y, 1, 1, c);
      }
    }
  }
}

function drawFarHills(ctx: Ctx) {
  for (let x = 0; x < W; x += 4) {
    const h = 114 + Math.round(Math.sin(x * 0.03) * 6 + Math.sin(x * 0.011 + 1) * 8);
    px(ctx, x, h, 4, GROUND - h, "#7fb874");
    px(ctx, x, h, 4, 1, "#93c886");
  }
}

function drawNearHills(ctx: Ctx) {
  for (let x = 0; x < W; x += 6) {
    const h = 130 + Math.round(Math.sin(x * 0.05 + 2) * 4 + Math.sin(x * 0.017) * 5);
    px(ctx, x, h, 6, GROUND - h, "#5e9e50");
    px(ctx, x, h, 6, 1, "#70b25f");
  }
}

/// Les couches lointaines sont voilées vers la couleur de l'horizon (perspective atmosphérique).
function buildBackLayer(env: Env) {
  const haze = mixRgb(mixRgb(HAZE_DAY, HAZE_NIGHT, env.night), HAZE_DUSK, env.twilight * 0.45);
  const tint = (day: number, night: number) => rgba(haze, day + (night - day) * env.night);
  const out = makeCanvas();
  const o = ctxOf(out);
  const layer = (draw: (c: Ctx) => void, tint: string) => {
    const c = makeCanvas();
    const x = ctxOf(c);
    draw(x);
    x.globalCompositeOperation = "source-atop";
    x.fillStyle = tint;
    x.fillRect(0, 0, W, H);
    o.drawImage(c, 0, 0);
  };
  layer(drawMountains, tint(0.55, 0.8));
  layer(drawFarHills, tint(0.3, 0.76));
  layer(drawNearHills, tint(0.12, 0.7));
  return out;
}

// ---------- Premier plan statique ----------

interface Blade {
  x: number;
  h: number;
  color: string;
  flower: string | null;
}

interface Foreground {
  canvas: HTMLCanvasElement;
  leaves: Point[];
  canopies: Point[];
  blades: Blade[];
}

function drawTree(ctx: Ctx, r: () => number, x: number, height: number, leaves: Point[]) {
  const top = GROUND - height;
  px(ctx, x, top, 2, height, "#6b4f2a");
  px(ctx, x, top, 1, height, "#5a4122");
  for (let k = 2; k < height; k += 3) px(ctx, x + 1, top + k, 1, 1, "#4e3a20");

  // Feuillage en deux étages, façon chêne Minecraft, plus clair en haut.
  const layers = [
    { y0: -4, y1: 2, x0: -8, x1: 9 },
    { y0: -10, y1: -5, x0: -5, x1: 6 },
  ];
  for (const l of layers) {
    for (let dy = l.y0; dy <= l.y1; dy++) {
      for (let dx = l.x0; dx <= l.x1; dx++) {
        const corner = (dx === l.x0 || dx === l.x1) && (dy === l.y0 || dy === l.y1);
        if (corner && r() < 0.7) continue;
        if (r() < 0.04) continue;
        const shadeT = (dy + 10) / 12;
        let c = shadeT < 0.35 ? "#6cbf45" : shadeT < 0.75 ? "#57a83a" : "#438f2e";
        if (r() < 0.18) c = "#3a7a28";
        else if (r() < 0.08) c = "#7dcf52";
        px(ctx, x + dx, top + dy, 1, 1, c);
        leaves.push({ x: x + dx, y: top + dy });
      }
    }
  }
}

function drawHouse(ctx: Ctx, r: () => number) {
  const { x0, x1, top } = HOUSE;

  // Cheminée (dessinée avant le toit qui recouvre sa base).
  for (let y = top - 24; y < top - 6; y++) {
    for (let x = x1 - 14; x < x1 - 9; x++) px(ctx, x, y, 1, 1, pick(r, ["#7d7d7d", "#6a6a6a", "#8f8f8f"]));
  }
  px(ctx, x1 - 15, top - 25, 7, 1, "#5b5b5b");

  // Murs en planches.
  for (let y = top; y < GROUND; y++) {
    for (let x = x0; x < x1; x++) {
      let c = "#b48a52";
      const row = Math.floor((y - top) / 4);
      if ((y - top) % 4 === 3) c = "#8d6a3a";
      else if ((x - x0 + (row % 2) * 4) % 8 === 0) c = "#9c7744";
      else if (r() < 0.12) c = "#a67f4a";
      px(ctx, x, y, 1, 1, c);
    }
  }

  // Rondins aux angles et poutre haute.
  for (const lx of [x0, x1 - 3]) {
    for (let y = top; y < GROUND; y++) {
      for (let k = 0; k < 3; k++) px(ctx, lx + k, y, 1, 1, k === 1 ? "#6e5230" : y % 5 === 0 ? "#4e3a20" : "#5c4426");
    }
  }
  for (let x = x0 - 1; x < x1 + 1; x++) px(ctx, x, top, 1, 2, x % 4 === 0 ? "#4e3a20" : "#5c4426");

  // Fondations en pierre.
  for (let y = GROUND - 3; y < GROUND; y++) {
    for (let x = x0 - 1; x < x1 + 1; x++) px(ctx, x, y, 1, 1, pick(r, ["#7d7d7d", "#6a6a6a", "#8f8f8f", "#5b5b5b"]));
  }

  // Toit en escalier, arête claire sur chaque marche.
  let left = x0 - 5;
  let right = x1 + 5;
  let y = top - 1;
  while (left < right) {
    for (let k = 0; k < 2; k++) {
      for (let x = left; x < right; x++) {
        const edge = x === left || x === right - 1;
        let c = (x + y) % 5 === 0 ? "#4a3220" : "#5b3c22";
        if (k === 1) c = "#6f4a2a";
        if (edge) c = "#3b2716";
        px(ctx, x, y - k, 1, 1, c);
      }
    }
    y -= 2;
    left += 3;
    right -= 3;
  }

  // Porte et marche.
  for (let dy = 129; dy < GROUND; dy++) {
    for (let dx = 205; dx < 213; dx++) {
      const frame = dx === 205 || dx === 212 || dy === 129;
      px(ctx, dx, dy, 1, 1, frame ? "#3e2a17" : (dy - 129) % 5 === 0 ? "#4d3520" : "#5a3d22");
    }
  }
  px(ctx, 207, 132, 1, 3, "#2a1d10");
  px(ctx, 210, 132, 1, 3, "#2a1d10");
  px(ctx, 211, 139, 1, 1, "#c9a227");
  px(ctx, 204, GROUND - 1, 10, 1, "#8f8f8f");

  // Fenêtres avec rebord et pot de fleurs.
  for (const w of WINDOWS) {
    px(ctx, w.x - 1, w.y - 1, 10, 10, "#5c4426");
    px(ctx, w.x, w.y, 8, 8, "#9fd3f5");
    px(ctx, w.x + 1, w.y + 1, 2, 2, "#d8f0ff");
    px(ctx, w.x + 4, w.y, 1, 8, "#5c4426");
    px(ctx, w.x, w.y + 4, 8, 1, "#5c4426");
    px(ctx, w.x - 2, w.y + 9, 12, 1, "#4e3a20");
    px(ctx, w.x + 1, w.y + 7, 6, 2, "#a0522d");
    px(ctx, w.x + 1, w.y + 6, 1, 1, "#e33b3b");
    px(ctx, w.x + 3, w.y + 5, 1, 2, "#4f9636");
    px(ctx, w.x + 3, w.y + 4, 1, 1, "#f5d142");
    px(ctx, w.x + 5, w.y + 6, 1, 1, "#e84f9b");
  }

  // Support de la torche.
  px(ctx, TORCH.x, TORCH.y + 2, 1, 4, "#6e5230");
}

function drawFence(ctx: Ctx) {
  for (let x = FENCE.x0; x <= FENCE.x1; x += 6) {
    const top = x === FENCE.x1 ? LANTERN.y + 4 : GROUND - 8;
    px(ctx, x, top, 2, GROUND - top, "#9c7744");
    px(ctx, x + 1, top, 1, GROUND - top, "#7d5d34");
  }
  for (const ry of [GROUND - 6, GROUND - 3]) px(ctx, FENCE.x0 + 2, ry, FENCE.x1 - FENCE.x0 - 2, 1, "#b48a52");
  // Cadre de la lanterne (la flamme est dessinée avec les éléments lumineux).
  px(ctx, LANTERN.x - 1, LANTERN.y - 1, 3, 1, "#2e2e2e");
  px(ctx, LANTERN.x - 1, LANTERN.y, 1, 3, "#3a3a3a");
  px(ctx, LANTERN.x + 1, LANTERN.y, 1, 3, "#3a3a3a");
  px(ctx, LANTERN.x - 1, LANTERN.y + 3, 3, 1, "#2e2e2e");
}

function pondDepth(x: number) {
  if (x <= POND.x0 || x >= POND.x1) return 0;
  return Math.round(Math.sin((Math.PI * (x - POND.x0)) / (POND.x1 - POND.x0)) * 9);
}

function drawGround(ctx: Ctx, r: () => number) {
  for (let x = 0; x < W; x++) {
    const depth = pondDepth(x);
    let y = GROUND;
    if (depth > 0) {
      for (; y <= GROUND + depth; y++) {
        const t = (y - GROUND) / 9;
        px(ctx, x, y, 1, 1, y === GROUND ? "#5b93f2" : mixHex("#3f76e4", "#26479c", t));
      }
    } else {
      px(ctx, x, y++, 1, 1, r() < 0.5 ? "#72b842" : "#64a838");
      px(ctx, x, y++, 1, 1, r() < 0.5 ? "#5a9a30" : "#4f8a2c");
      // Bord du bloc d'herbe qui « coule » sur la terre.
      if (r() < 0.55) px(ctx, x, y++, 1, 1, "#4f8a2c");
      if (r() < 0.2) px(ctx, x, y++, 1, 1, "#4a7f2a");
    }
    for (; y < H; y++) {
      const c = r() < 0.025 ? "#8a8a8a" : pick(r, ["#866043", "#79573b", "#6b4a32", "#866043", "#8d6748"]);
      px(ctx, x, y, 1, 1, c);
    }
  }

  // Nénuphars.
  px(ctx, 80, GROUND, 3, 1, "#3e8f2e");
  px(ctx, 97, GROUND, 3, 1, "#3e8f2e");
  px(ctx, 98, GROUND - 1, 1, 1, "#f4a6c8");

  // Ombre du chien.
  px(ctx, DOG_X + 5, GROUND, 13, 1, "rgba(0,0,0,0.22)");

  // Feu de camp : pierres, bûches, cendres.
  for (const sx of [FIRE_X - 7, FIRE_X - 6, FIRE_X + 6, FIRE_X + 7]) px(ctx, sx, GROUND - 1, 1, 1, "#7d7d7d");
  px(ctx, FIRE_X - 7, GROUND - 2, 1, 1, "#8f8f8f");
  px(ctx, FIRE_X + 7, GROUND - 2, 1, 1, "#8f8f8f");
  px(ctx, FIRE_X - 6, GROUND - 3, 13, 2, "#5c4426");
  px(ctx, FIRE_X - 4, GROUND - 5, 9, 2, "#6e5230");
  px(ctx, FIRE_X - 6, GROUND - 3, 1, 2, "#a07a48");
  px(ctx, FIRE_X + 6, GROUND - 3, 1, 2, "#a07a48");
  px(ctx, FIRE_X - 5, GROUND - 1, 11, 1, "#3a3a3a");
}

function buildForeground(): Foreground {
  const canvas = makeCanvas();
  const ctx = ctxOf(canvas);
  const r = rng(1337);
  const leaves: Point[] = [];

  const trees: [number, number][] = [
    [28, 15],
    [52, 11],
    [292, 17],
    [312, 12],
  ];
  for (const [x, h] of trees) drawTree(ctx, r, x, h, leaves);
  drawHouse(ctx, r);
  drawFence(ctx);
  drawGround(ctx, r);

  // Herbes hautes et fleurs : dessinées à chaque image pour onduler au vent.
  const blades: Blade[] = [];
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(r() * W);
    if ((x > 66 && x < 116) || (x > 118 && x < 166) || (x > 178 && x < 238)) continue;
    const flower = r() < 0.3 ? pick(r, ["#e33b3b", "#f5d142", "#9b6bff", "#ffffff", "#e84f9b"]) : null;
    blades.push({
      x,
      h: flower ? 3 : 1 + Math.floor(r() * 3),
      color: r() < 0.5 ? "#5aa83d" : "#4f9636",
      flower,
    });
  }

  return {
    canvas,
    leaves,
    canopies: trees.map(([x, h]) => ({ x, y: GROUND - h - 4 })),
    blades,
  };
}

// ---------- Éléments animés ----------

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  seed: number;
}

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  start: number;
  duration: number;
}

interface SceneState {
  smoke: Particle[];
  embers: Particle[];
  falling: Particle[];
  star: ShootingStar | null;
  nextStar: number;
  nextLeaf: number;
  lastSmoke: number;
  lastChimney: number;
  lastEmber: number;
}

const STARS = (() => {
  const r = rng(7);
  return Array.from({ length: 95 }, () => ({
    x: Math.floor(r() * W),
    y: Math.floor(r() * 110),
    phase: r() * Math.PI * 2,
    speed: 0.5 + r() * 2,
    big: r() < 0.1,
    tint: pick(r, ["255,255,255", "255,255,255", "200,215,255", "255,236,200"]),
  }));
})();

const FIREFLIES = (() => {
  const r = rng(99);
  return Array.from({ length: 16 }, (_, i) => ({
    x: i < 6 ? POND.x0 + r() * (POND.x1 - POND.x0) : r() < 0.5 ? 12 + r() * 50 : 250 + r() * 66,
    y: 122 + r() * 22,
    phase: r() * Math.PI * 2,
  }));
})();

const DAY_CLOUDS = [
  { x: 10, y: 24, w: 44, h: 6, speed: 2.2 },
  { x: 110, y: 12, w: 60, h: 8, speed: 1.5 },
  { x: 205, y: 36, w: 34, h: 5, speed: 2.9 },
  { x: 270, y: 18, w: 50, h: 6, speed: 1.9 },
  { x: 160, y: 52, w: 26, h: 4, speed: 3.4 },
];

const NIGHT_CLOUDS = [
  { x: 40, y: 30, w: 70, h: 3, speed: 1.1 },
  { x: 200, y: 22, w: 54, h: 3, speed: 0.8 },
  { x: 120, y: 58, w: 40, h: 2, speed: 1.4 },
];

const FOG = [
  { x: 0, y: 128, rx: 110, ry: 12, speed: 3 },
  { x: 180, y: 136, rx: 90, ry: 9, speed: 4.5 },
  { x: 90, y: 142, rx: 120, ry: 8, speed: 2.2 },
];

const BUTTERFLIES = [
  { cx: 40, phase: 0, color: "#ffffff" },
  { cx: 262, phase: 2.1, color: "#f5d142" },
  { cx: 300, phase: 4.2, color: "#7fb2ff" },
];

function wind(t: number, x: number) {
  return Math.sin(x * 0.09 - t * 1.6) * 0.6 + Math.sin(t * 0.55) * 0.5;
}

function drawSkyObjects(ctx: Ctx, t: number, env: Env) {
  const day = 1 - env.night;

  if (env.night > 0.05) {
    for (const s of STARS) {
      const a = (0.3 + 0.7 * Math.max(0, Math.sin(t * s.speed + s.phase))) * env.night;
      px(ctx, s.x, s.y, 1, 1, `rgba(${s.tint},${a.toFixed(2)})`);
      if (s.big && a > 0.75) {
        const b = (a * 0.45).toFixed(2);
        px(ctx, s.x - 1, s.y, 3, 1, `rgba(${s.tint},${b})`);
        px(ctx, s.x, s.y - 1, 1, 3, `rgba(${s.tint},${b})`);
      }
    }
  }

  if (env.moon) {
    const { x, y } = env.moon;
    ctx.globalAlpha = 0.35 + 0.65 * env.night;
    px(ctx, x - 6, y - 6, 12, 12, "#ecebd6");
    px(ctx, x - 6, y - 6, 12, 1, "#f8f7e6");
    px(ctx, x - 4, y - 3, 3, 2, "#cdcbb4");
    px(ctx, x + 1, y + 1, 2, 3, "#cdcbb4");
    px(ctx, x - 2, y + 3, 1, 1, "#cdcbb4");
    px(ctx, x + 3, y - 4, 1, 1, "#d9d7c0");
    ctx.globalAlpha = 1;
  }

  if (env.sun) {
    // Le soleil rougit en approchant de l'horizon.
    const { x, y } = env.sun;
    const warm = env.twilight;
    // Voilé par les nuages quand il pleut ou neige.
    ctx.globalAlpha = 1 - env.wet * 0.75;
    px(ctx, x - 8, y - 8, 16, 16, rgba(mixRgb([255, 224, 102], [255, 132, 52], warm)));
    px(ctx, x - 6, y - 6, 12, 12, rgba(mixRgb([255, 243, 166], [255, 176, 92], warm)));
    px(ctx, x - 4, y - 4, 8, 8, rgba(mixRgb([255, 251, 224], [255, 214, 150], warm)));
    ctx.globalAlpha = 1;
  }

  if (env.night > 0.1) {
    for (const c of NIGHT_CLOUDS) {
      const span = W + c.w + 20;
      const x = Math.round(((c.x + t * c.speed) % span) - c.w);
      for (let row = 0; row < c.h + 2; row++) {
        const inset = Math.abs(row - (c.h + 1) / 2) * 6;
        const a = (row === 0 ? 0.32 : 0.38) * env.night;
        px(ctx, x + inset, c.y + row - 1, c.w - inset * 2, 1, row === 0 ? `rgba(92,106,156,${a})` : `rgba(34,44,82,${a})`);
      }
    }
  }

  if (day > 0.08) {
    // Nuages : rosés au crépuscule, gris sous la pluie.
    const lit = mixRgb(mixRgb([255, 255, 255], [255, 196, 170], env.twilight), [150, 158, 172], env.wet * 0.8);
    const shade = mixRgb(mixRgb([214, 228, 246], [214, 150, 150], env.twilight), [112, 120, 136], env.wet * 0.8);
    const a = 0.95 * day;
    for (const c of DAY_CLOUDS) {
      const span = W + c.w + 20;
      const x = Math.round(((c.x + t * c.speed) % span) - c.w);
      px(ctx, x, c.y, c.w, c.h, rgba(lit, a));
      px(ctx, x + 5, c.y - 3, Math.floor(c.w * 0.55), 3, rgba(lit, a));
      px(ctx, x + Math.floor(c.w * 0.3), c.y - 5, Math.floor(c.w * 0.25), 2, rgba(lit, a));
      px(ctx, x, c.y + c.h - 2, c.w, 2, rgba(shade, a));
    }
  }

  if (env.night < 0.3 && env.wet < 0.3) {
    // Petite volée d'oiseaux en V.
    for (let i = 0; i < 3; i++) {
      const bx = Math.round(((t * 8 + 40) % (W + 60)) - 30) - i * 6;
      const by = 48 + (i === 0 ? 0 : 3 * (i % 2 ? 1 : 2)) + Math.round(Math.sin(t * 0.7) * 2);
      const flap = Math.floor(t * 5 + i) % 2;
      px(ctx, bx, by, 1, 1, "#2d3a4a");
      px(ctx, bx - 1, by - 1 + flap, 1, 1, "#2d3a4a");
      px(ctx, bx + 1, by - 1 + flap, 1, 1, "#2d3a4a");
    }
  }
}

function updateParticles(state: SceneState, t: number, dt: number, fg: Foreground, env: Env) {
  if (t - state.lastSmoke > 0.17) {
    state.smoke.push({ x: FIRE_X + (Math.random() - 0.5) * 2, y: GROUND - 15, vx: 2.4, vy: -8, life: 4.2, max: 4.2, seed: Math.random() * 10 });
    state.lastSmoke = t;
  }
  if (t - state.lastChimney > 0.42) {
    state.smoke.push({ x: CHIMNEY.x + Math.random(), y: CHIMNEY.y, vx: 3, vy: -6, life: 3.4, max: 3.4, seed: Math.random() * 10 });
    state.lastChimney = t;
  }
  if (t - state.lastEmber > 0.28 && Math.random() < 0.7) {
    state.embers.push({ x: FIRE_X - 2 + Math.random() * 5, y: GROUND - 10, vx: 0, vy: -16 - Math.random() * 8, life: 1.3, max: 1.3, seed: Math.random() * 10 });
    state.lastEmber = t;
  }
  if (t > state.nextLeaf) {
    const c = fg.canopies[Math.floor(Math.random() * fg.canopies.length)];
    state.falling.push({ x: c.x + (Math.random() - 0.5) * 14, y: c.y, vx: 3, vy: 6, life: 9, max: 9, seed: Math.random() * 10 });
    state.nextLeaf = t + 1.8 + Math.random() * 3;
  }
  if (env.night > 0.8 && env.wet < 0.1 && !state.star && t > state.nextStar) {
    const dir = Math.random() < 0.5 ? -1 : 1;
    state.star = { x: 60 + Math.random() * 200, y: 8 + Math.random() * 40, vx: dir * (120 + Math.random() * 60), vy: 55 + Math.random() * 25, start: t, duration: 0.9 };
  }
  if (state.star && t - state.star.start > state.star.duration) {
    state.star = null;
    state.nextStar = t + 6 + Math.random() * 9;
  }

  for (const p of state.smoke) {
    p.y += p.vy * dt;
    p.x += (p.vx + Math.sin(t * 0.9 + p.seed) * 1.6) * dt;
    p.life -= dt;
  }
  for (const p of state.embers) {
    p.y += p.vy * dt;
    p.x += Math.sin(t * 5 + p.seed) * 7 * dt;
    p.life -= dt;
  }
  for (const p of state.falling) {
    if (p.y < GROUND - 1) {
      p.y += p.vy * dt;
      p.x += (p.vx * wind(t, p.x) + Math.sin(t * 2 + p.seed) * 5) * dt;
    } else {
      p.y = GROUND - 1;
    }
    p.life -= dt;
  }
  state.smoke = state.smoke.filter((p) => p.life > 0);
  state.embers = state.embers.filter((p) => p.life > 0);
  state.falling = state.falling.filter((p) => p.life > 0 && p.x > -5 && p.x < W + 5);
}

/// Éléments éclairés par l'environnement (assombris la nuit hors des zones de lumière).
function drawLitDynamic(ctx: Ctx, t: number, state: SceneState, fg: Foreground, env: Env) {
  // Herbes et fleurs qui ondulent.
  for (const b of fg.blades) {
    const w = wind(t, b.x);
    const top = Math.max(-1, Math.min(1, Math.round(w * 1.2)));
    const mid = Math.abs(w) > 0.8 ? top : 0;
    for (let k = 0; k < b.h; k++) {
      const dx = k === b.h - 1 ? top : k === b.h - 2 && b.h >= 3 ? mid : 0;
      px(ctx, b.x + dx, GROUND - 1 - k, 1, 1, b.color);
    }
    if (b.flower) px(ctx, b.x + top, GROUND - 1 - b.h, 1, 1, b.flower);
  }

  // Feuillage qui frémit sous les rafales.
  const gust = Math.max(0, Math.sin(t * 0.55)) * 0.07 + 0.015;
  const tick = Math.floor(t * 3);
  for (let i = 0; i < fg.leaves.length; i++) {
    if (hash(i, tick) < gust) px(ctx, fg.leaves[i].x, fg.leaves[i].y, 1, 1, "#86d35a");
  }
  for (const p of state.falling) {
    const a = Math.min(1, p.life / 2);
    px(ctx, Math.round(p.x), Math.round(p.y), 1, 1, `rgba(${p.seed > 5 ? "122,190,72" : "196,160,62"},${a.toFixed(2)})`);
  }

  // Reflets de l'étang (de jour ; la nuit ils sont dessinés comme éléments lumineux).
  if (env.night < 0.5) {
    for (let x = POND.x0 + 2; x < POND.x1 - 1; x++) {
      if (Math.sin(x * 0.7 - t * 2.4) > 0.86) px(ctx, x, GROUND, 1, 1, "#b8d4ff");
      if (Math.sin(x * 0.45 + t * 1.3) > 0.93 && pondDepth(x) > 3) px(ctx, x, GROUND + 2, 1, 1, "#7aa6f5");
    }
    for (const b of env.night < 0.3 && env.wet < 0.2 ? BUTTERFLIES : []) {
      const x = Math.round(b.cx + Math.sin(t * 0.6 + b.phase) * 14 + Math.sin(t * 1.7 + b.phase) * 4);
      const y = Math.round(GROUND - 9 + Math.sin(t * 1.1 + b.phase * 2) * 4);
      const open = Math.floor(t * 8 + b.phase) % 2 === 0;
      if (open) px(ctx, x - 1, y, 3, 1, b.color);
      else {
        px(ctx, x, y, 1, 1, "#3a3a3a");
        px(ctx, x - 1, y - 1, 1, 1, b.color);
        px(ctx, x + 1, y - 1, 1, 1, b.color);
      }
    }
  }

  drawDog(ctx, t);

  // Fumée : les volutes grossissent et se dissipent.
  const rgb = env.night > 0.5 ? "150,152,168" : "214,214,220";
  for (const p of state.smoke) {
    const age = 1 - p.life / p.max;
    const size = 1 + Math.round(age * 4);
    const a = Math.min(0.5, (p.life / p.max) * 0.6);
    px(ctx, Math.round(p.x - size / 2), Math.round(p.y - size / 2), size, size, `rgba(${rgb},${a.toFixed(2)})`);
  }
}

function drawDog(ctx: Ctx, t: number) {
  const top = GROUND - DOG.length;
  const blink = t % 4.2 < 0.14;
  const earDown = t % 5.3 < 0.22;
  const panting = Math.sin(t * 0.35) > 0.25;
  DOG.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      let ch = row[x];
      if (ch === " ") continue;
      if (ch === "k" && blink) ch = "g";
      if (y === 0 && x === 15 && earDown) continue;
      px(ctx, DOG_X + x, top + y, 1, 1, DOG_COLORS[ch]);
    }
  });
  if (panting && Math.floor(t * 4) % 2 === 0) px(ctx, DOG_X + 17, top + 4, 1, 1, "#e06b74");
  // Queue qui remue, plus vite par moments.
  const speed = Math.sin(t * 0.4) > 0.3 ? 14 : 6;
  const frame = Math.round(Math.sin(t * speed) + 1) % TAIL_FRAMES.length;
  TAIL_FRAMES[frame].forEach(([x, y], i) => {
    px(ctx, DOG_X + x, top + y, 1, 1, i === 2 ? DOG_COLORS.g : DOG_COLORS.w);
  });
}

function flameHeight(i: number, t: number) {
  const base = [2, 4, 7, 10, 12, 10, 7, 4, 2][i];
  return Math.max(1, Math.round(base + Math.sin(t * 9 + i * 1.3) * 2.2 + Math.sin(t * 14.7 + i * 2.1) * 1.4 + Math.sin(t * 23 + i) * 0.8));
}

/// 0 à 1 : à quel point les fenêtres de la maison sont allumées.
function lampLevel(env: Env) {
  return clamp01((env.night - 0.3) / 0.3);
}

function fireflyLevel(env: Env) {
  return clamp01((env.night - 0.6) / 0.3) * (env.wet < 0.2 ? 1 : 0);
}

/// Éléments qui émettent leur propre lumière (jamais assombris).
function drawEmissive(ctx: Ctx, t: number, state: SceneState, env: Env) {
  // Braises sur les bûches.
  for (let x = FIRE_X - 4; x <= FIRE_X + 4; x++) {
    const a = 0.45 + 0.45 * Math.sin(t * 3 + x * 1.7);
    px(ctx, x, GROUND - 5, 1, 1, `rgba(255,${100 + Math.round(a * 60)},30,${a.toFixed(2)})`);
  }
  // Flammes.
  for (let i = 0; i < 9; i++) {
    const h = flameHeight(i, t);
    const x = FIRE_X - 4 + i;
    for (let k = 0; k < h; k++) {
      const f = k / h;
      const core = i >= 3 && i <= 5;
      const c = core && f < 0.3 ? "#fff6c8" : f < 0.5 ? "#ffd84a" : f < 0.78 ? "#ff9a1f" : "#e8481c";
      px(ctx, x, GROUND - 6 - k, 1, 1, c);
    }
    if (h > 8 && Math.sin(t * 11 + i * 3) > 0.6) px(ctx, x, GROUND - 8 - h, 1, 1, "rgba(255,120,30,0.8)");
  }
  for (const e of state.embers) {
    const f = e.life / e.max;
    px(ctx, Math.round(e.x), Math.round(e.y), 1, 1, `rgba(255,${Math.round(110 + f * 120)},${Math.round(f * 60)},${f.toFixed(2)})`);
  }

  // Torche et lanterne.
  const flick = Math.sin(t * 11) > 0;
  px(ctx, TORCH.x, TORCH.y, 1, 1, "#fff2a8");
  px(ctx, TORCH.x, TORCH.y + 1, 1, 1, flick ? "#ffd84a" : "#ff9a1f");
  px(ctx, LANTERN.x, LANTERN.y, 1, 3, env.night > 0.5 ? "#ffcf6b" : "#ffe3a0");

  // Les lumières de la maison s'allument à la tombée du jour.
  const lamps = lampLevel(env);
  if (lamps <= 0) return;

  // Fenêtres éclairées avec rideaux, à la lueur vacillante.
  ctx.globalAlpha = lamps;
  const candle = 0.85 + Math.sin(t * 7) * 0.08 + Math.sin(t * 13.3) * 0.05;
  for (const w of WINDOWS) {
    px(ctx, w.x, w.y, 8, 8, "#ffc861");
    px(ctx, w.x + 1, w.y + 1, 3, 3, "#ffe7a6");
    px(ctx, w.x, w.y, 1, 8, "#b5523b");
    px(ctx, w.x + 7, w.y, 1, 8, "#b5523b");
    px(ctx, w.x + 4, w.y, 1, 8, "#3a2a17");
    px(ctx, w.x, w.y + 4, 8, 1, "#3a2a17");
    px(ctx, w.x, w.y, 8, 8, `rgba(120,50,0,${((1 - candle) * 1.5).toFixed(2)})`);
  }
  ctx.globalAlpha = 1;
  if (env.night < 0.6) return;

  // Reflets de lune sur l'étang.
  for (let x = POND.x0 + 2; x < POND.x1 - 1; x++) {
    if (Math.sin(x * 0.7 - t * 2) > 0.88) px(ctx, x, GROUND, 1, 1, "rgba(190,210,255,0.55)");
  }

  // Lucioles et leur reflet dans l'eau (elles se cachent quand il pleut).
  for (const f of FIREFLIES) {
    const a = Math.max(0, Math.sin(t * 1.7 + f.phase)) * fireflyLevel(env);
    if (a < 0.05) continue;
    const x = Math.round(f.x + Math.sin(t * 0.5 + f.phase) * 7);
    const y = Math.round(f.y + Math.cos(t * 0.7 + f.phase) * 4);
    px(ctx, x, y, 1, 1, `rgba(214,255,120,${a.toFixed(2)})`);
    if (pondDepth(x) > 0 && y < GROUND) {
      px(ctx, x, GROUND + (GROUND - y) / 4 + 1, 1, 1, `rgba(214,255,120,${(a * 0.35).toFixed(2)})`);
    }
  }
}

// ---------- Effets haute résolution ----------

interface View {
  s: number;
  ox: number;
  oy: number;
  w: number;
  h: number;
}

function glow(ctx: Ctx, v: View, x: number, y: number, r: number, stops: [number, string][]) {
  const cx = v.ox + x * v.s;
  const cy = v.oy + y * v.s;
  const rr = r * v.s;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
}

function fireFlicker(t: number) {
  return 0.92 + Math.sin(t * 13) * 0.05 + Math.sin(t * 7.3 + 1) * 0.04 + Math.sin(t * 23) * 0.02;
}

/// Couche d'obscurité : trouée autour des lumières puis limitée aux pixels du premier plan.
function drawDarkness(dark: Ctx, v: View, t: number, litMask: HTMLCanvasElement, env: Env) {
  const k = fireFlicker(t);
  const candle = 0.9 + Math.sin(t * 7) * 0.06;
  dark.globalCompositeOperation = "source-over";
  dark.clearRect(0, 0, v.w, v.h);
  dark.fillStyle = `rgba(4,7,24,${(0.72 * env.night).toFixed(3)})`;
  dark.fillRect(0, 0, v.w, v.h);

  dark.globalCompositeOperation = "destination-out";
  glow(dark, v, FIRE_X, GROUND - 8, 62 * k, [[0, "rgba(0,0,0,1)"], [0.35, "rgba(0,0,0,0.75)"], [1, "rgba(0,0,0,0)"]]);
  for (const w of WINDOWS) glow(dark, v, w.x + 4, w.y + 6, 24 * candle, [[0, "rgba(0,0,0,0.7)"], [1, "rgba(0,0,0,0)"]]);
  glow(dark, v, TORCH.x, TORCH.y + 1, 14 * k, [[0, "rgba(0,0,0,0.6)"], [1, "rgba(0,0,0,0)"]]);
  glow(dark, v, LANTERN.x, LANTERN.y + 1, 16, [[0, "rgba(0,0,0,0.65)"], [1, "rgba(0,0,0,0)"]]);

  dark.globalCompositeOperation = "destination-in";
  dark.imageSmoothingEnabled = false;
  dark.drawImage(litMask, v.ox, v.oy, W * v.s, H * v.s);
  dark.globalCompositeOperation = "source-over";
}

function drawLightGlows(ctx: Ctx, v: View, t: number, state: SceneState, env: Env) {
  const k = fireFlicker(t);
  const n = env.night;
  const lamps = lampLevel(env);
  const none = "rgba(0,0,0,0)";
  ctx.globalCompositeOperation = "lighter";

  if (env.moon && n > 0.1) {
    glow(ctx, v, env.moon.x, env.moon.y, 46, [[0, `rgba(200,212,255,${(0.22 * n).toFixed(3)})`], [0.3, `rgba(160,180,255,${(0.08 * n).toFixed(3)})`], [1, none]]);
  }
  if (env.sun && n < 0.95) {
    // Halo du soleil : plus large et plus orangé près de l'horizon.
    const warm = env.twilight;
    const core = mixRgb([255, 246, 200], [255, 170, 90], warm);
    const day = (1 - n) * (1 - env.wet * 0.8);
    glow(ctx, v, env.sun.x, env.sun.y, 70 + warm * 50, [[0, rgba(core, 0.55 * day)], [0.25, rgba(core, (0.18 + warm * 0.14) * day)], [1, none]]);
  }

  // Feu : large halo la nuit, simple lueur le jour.
  const fireAlpha = 0.18 + (0.42 - 0.18) * n;
  glow(ctx, v, FIRE_X, GROUND - 8, (22 + 48 * n) * k, [[0, `rgba(255,150,60,${(fireAlpha * k).toFixed(3)})`], [0.4, `rgba(255,110,40,${(0.12 * n).toFixed(3)})`], [1, none]]);
  if (n > 0.2) {
    glow(ctx, v, FIRE_X, GROUND - 10, 14 * k, [[0, `rgba(255,230,150,${(0.55 * n).toFixed(3)})`], [1, none]]);
    glow(ctx, v, TORCH.x, TORCH.y, 13 * k, [[0, `rgba(255,180,80,${(0.4 * n).toFixed(3)})`], [1, none]]);
    glow(ctx, v, LANTERN.x, LANTERN.y + 1, 15, [[0, `rgba(255,200,110,${(0.4 * n).toFixed(3)})`], [1, none]]);
  }
  if (lamps > 0) {
    for (const w of WINDOWS) glow(ctx, v, w.x + 4, w.y + 4, 22, [[0, `rgba(255,190,90,${(0.26 * lamps).toFixed(3)})`], [1, none]]);
  }

  const flies = fireflyLevel(env);
  if (flies > 0) {
    for (const f of FIREFLIES) {
      const a = Math.max(0, Math.sin(t * 1.7 + f.phase)) * flies;
      if (a < 0.2) continue;
      glow(ctx, v, f.x + Math.sin(t * 0.5 + f.phase) * 7 + 0.5, f.y + Math.cos(t * 0.7 + f.phase) * 4 + 0.5, 5, [[0, `rgba(200,255,120,${(a * 0.4).toFixed(2)})`], [1, none]]);
    }
  }
  for (const e of state.embers) {
    const f = e.life / e.max;
    glow(ctx, v, e.x + 0.5, e.y + 0.5, 3, [[0, `rgba(255,150,50,${(f * (0.25 + 0.25 * n)).toFixed(2)})`], [1, none]]);
  }
  ctx.globalCompositeOperation = "source-over";
}

function drawGodRays(ctx: Ctx, v: View, t: number, sun: Point, strength: number) {
  const sx = v.ox + sun.x * v.s;
  const sy = v.oy + sun.y * v.s;
  const aim = Math.atan2(GROUND - sun.y, W / 2 - sun.x);
  const len = 340 * v.s;
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 5; i++) {
    const a = aim + (i - 2) * 0.22 + Math.sin(t * 0.15 + i * 1.7) * 0.04;
    const spread = 0.06 + 0.015 * Math.sin(t * 0.3 + i);
    const g = ctx.createLinearGradient(sx, sy, sx + Math.cos(a) * len, sy + Math.sin(a) * len);
    g.addColorStop(0, `rgba(255,244,200,${((0.035 + 0.015 * Math.sin(t * 0.4 + i)) * strength).toFixed(3)})`);
    g.addColorStop(0.08, `rgba(255,244,200,${((0.03 + 0.012 * Math.sin(t * 0.4 + i)) * strength).toFixed(3)})`);
    g.addColorStop(1, "rgba(255,244,200,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(a - spread) * len, sy + Math.sin(a - spread) * len);
    ctx.lineTo(sx + Math.cos(a + spread) * len, sy + Math.sin(a + spread) * len);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}

function drawShootingStar(ctx: Ctx, v: View, t: number, star: ShootingStar) {
  const e = t - star.start;
  const p = e / star.duration;
  const hx = v.ox + (star.x + star.vx * e) * v.s;
  const hy = v.oy + (star.y + star.vy * e) * v.s;
  const n = Math.hypot(star.vx, star.vy);
  const tail = 26 * v.s;
  const tx = hx - (star.vx / n) * tail;
  const ty = hy - (star.vy / n) * tail;
  const alpha = Math.sin(Math.PI * Math.min(1, p));
  const g = ctx.createLinearGradient(hx, hy, tx, ty);
  g.addColorStop(0, `rgba(255,255,255,${alpha.toFixed(2)})`);
  g.addColorStop(1, "rgba(200,220,255,0)");
  ctx.strokeStyle = g;
  ctx.lineWidth = Math.max(1, v.s * 0.55);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(tx, ty);
  ctx.stroke();
}

function drawFog(ctx: Ctx, v: View, t: number, env: Env) {
  const color = mixRgb(mixRgb([255, 255, 255], [130, 150, 210], env.night), [255, 190, 150], env.twilight * 0.5);
  // La brume s'épaissit avec la pluie.
  const alpha = (0.16 + (0.1 - 0.16) * env.night) * (1 + env.wet);
  for (const f of FOG) {
    const span = W + f.rx * 2;
    const cx = ((f.x + t * f.speed) % span) - f.rx;
    ctx.save();
    ctx.translate(v.ox + cx * v.s, v.oy + f.y * v.s);
    ctx.scale(1, f.ry / f.rx);
    const r = f.rx * v.s;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, rgba(color, alpha));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }
}

function drawVignette(ctx: Ctx, v: View, env: Env) {
  const cx = v.w / 2;
  const cy = v.h / 2;
  const r = Math.hypot(cx, cy);
  const g = ctx.createRadialGradient(cx, cy, r * 0.45, cx, cy, r);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, rgba(mixRgb([20, 40, 80], [0, 0, 12], env.night), 0.14 + (0.5 - 0.14) * env.night));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, v.w, v.h);
}

/// Pluie ou neige, dessinée en haute résolution par-dessus la scène.
function drawWeather(ctx: Ctx, v: View, t: number, env: Env) {
  if (env.wet <= 0.01) return;

  // Le ciel se couvre : voile gris le jour, plus sombre la nuit.
  ctx.fillStyle = rgba(mixRgb([78, 88, 106], [8, 12, 26], env.night), (env.weather === "snow" ? 0.26 : 0.42) * env.wet);
  ctx.fillRect(0, 0, v.w, v.h);

  const unit = v.s / 4;
  if (env.weather === "rain") {
    const count = Math.round(240 * env.wet);
    const length = 18 * unit;
    ctx.strokeStyle = rgba(mixRgb([200, 216, 255], [150, 170, 220], env.night), 0.38);
    ctx.lineWidth = Math.max(1, v.s * 0.2);
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const speed = v.h * (1.5 + hash(i, 5) * 0.8);
      const y = ((hash(i, 7) * (v.h + 60) + t * speed) % (v.h + 60)) - 30;
      const x = ((hash(i, 3) * (v.w + 240) + t * speed * 0.2) % (v.w + 240)) - 120;
      ctx.moveTo(x, y);
      ctx.lineTo(x + length * 0.2, y + length);
    }
    ctx.stroke();
    return;
  }

  // Neige : flocons carrés (pour rester dans le style) qui dérivent en tombant.
  const count = Math.round(190 * env.wet);
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  for (let i = 0; i < count; i++) {
    const speed = v.h * (0.07 + hash(i, 5) * 0.09);
    const y = ((hash(i, 7) * (v.h + 20) + t * speed) % (v.h + 20)) - 10;
    const drift = Math.sin(t * 0.8 + i) * 14 * unit + t * 10 * unit;
    const x = (((hash(i, 3) * (v.w + 40) + drift) % (v.w + 40)) + (v.w + 40)) % (v.w + 40) - 20;
    const size = Math.max(1.5, v.s * (0.45 + hash(i, 9) * 0.55));
    ctx.fillRect(x, y, size, size);
  }
}

// ---------- Composant ----------

interface Props {
  theme: Theme;
  animated: boolean;
  paused?: boolean;
  /// "theme" : nuit en sombre, jour en clair. "realtime" : suit l'heure de l'ordinateur.
  mode?: "theme" | "realtime";
  /// Pluie ou neige de temps en temps.
  weatherEnabled?: boolean;
  /// Forçages pour les aperçus et les tests.
  hourOverride?: number;
  weatherOverride?: Weather;
  className?: string;
}

/// Intervalle de recalcul de l'ambiance en mode « heure réelle ».
const ENV_REFRESH_MS = 30_000;

export function MinecraftScene({
  theme,
  animated,
  paused,
  mode = "theme",
  weatherEnabled = false,
  hourOverride,
  weatherOverride,
  className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = ctxOf(canvas);

    const computeEnv = (): Env => {
      const now = new Date();
      const base =
        hourOverride !== undefined
          ? envFromHour(hourOverride)
          : mode === "realtime"
            ? envFromHour(now.getHours() + now.getMinutes() / 60)
            : envFromTheme(theme === "dark");
      const sky = weatherOverride
        ? { weather: weatherOverride, wet: weatherOverride === "clear" ? 0 : 1 }
        : weatherEnabled
          ? weatherAt(now.getTime())
          : { weather: "clear" as Weather, wet: 0 };
      return { ...base, ...sky };
    };

    let env = computeEnv();
    const sky = makeCanvas();
    let back = buildBackLayer(env);
    const rebuildLayers = () => {
      drawSky(ctxOf(sky), env);
      back = buildBackLayer(env);
    };
    drawSky(ctxOf(sky), env);
    let lastEnvUpdate = performance.now();
    const fg = buildForeground();

    const main = makeCanvas();
    const mainCtx = ctxOf(main);
    const lit = makeCanvas();
    const litCtx = ctxOf(lit);
    const emissive = makeCanvas();
    const emCtx = ctxOf(emissive);
    const dark = document.createElement("canvas");
    const darkCtx = ctxOf(dark);

    const state: SceneState = {
      smoke: [],
      embers: [],
      falling: [],
      star: null,
      nextStar: 3,
      nextLeaf: 0,
      lastSmoke: -1,
      lastChimney: -1,
      lastEmber: -1,
    };

    const view: View = { s: 1, ox: 0, oy: 0, w: 0, h: 0 };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const k = Math.min(window.devicePixelRatio || 1, MAX_RES);
      const w = Math.max(1, Math.round(rect.width * k));
      const h = Math.max(1, Math.round(rect.height * k));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = dark.width = w;
        canvas.height = dark.height = h;
      }
      const s = Math.max(w / W, h / H);
      Object.assign(view, { s, w, h, ox: (w - W * s) / 2, oy: (h - H * s) / 2 });
    };

    const render = (t: number, dt: number) => {
      if (dt > 0) updateParticles(state, t, dt, fg, env);

      // 1. Décor basse résolution.
      mainCtx.drawImage(sky, 0, 0);
      drawSkyObjects(mainCtx, t, env);
      mainCtx.drawImage(back, 0, 0);
      litCtx.clearRect(0, 0, W, H);
      litCtx.drawImage(fg.canvas, 0, 0);
      drawLitDynamic(litCtx, t, state, fg, env);
      mainCtx.drawImage(lit, 0, 0);
      emCtx.clearRect(0, 0, W, H);
      drawEmissive(emCtx, t, state, env);

      // 2. Agrandissement net + éclairage haute résolution.
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(main, view.ox, view.oy, W * view.s, H * view.s);
      if (env.night > 0.02) {
        drawDarkness(darkCtx, view, t, lit, env);
        ctx.drawImage(dark, 0, 0);
      }
      // Rayons de soleil par beau temps, tant que le soleil est assez haut.
      const rays = (1 - env.night * 4) * (1 - env.wet * 2);
      if (env.sun && rays > 0.02) drawGodRays(ctx, view, t, env.sun, Math.min(1, rays));
      ctx.drawImage(emissive, view.ox, view.oy, W * view.s, H * view.s);
      drawLightGlows(ctx, view, t, state, env);
      if (state.star) drawShootingStar(ctx, view, t, state.star);
      drawFog(ctx, view, t, env);
      drawWeather(ctx, view, t, env);
      drawVignette(ctx, view, env);
    };

    const still = !animated || paused;
    const renderStill = () => {
      // Image fixe : on simule quelques secondes pour que fumée et braises soient en place.
      for (let i = 0; i < 60; i++) updateParticles(state, i * 0.1, 0.1, fg, env);
      render(6, 0);
    };

    resize();
    const observer = new ResizeObserver(() => {
      resize();
      if (still) render(6, 0);
    });
    observer.observe(canvas);

    if (still) {
      renderStill();
      return () => observer.disconnect();
    }

    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!last) {
        // Préchauffage : quelques secondes simulées pour ne pas démarrer sans fumée.
        const t0 = now / 1000;
        state.nextStar = t0 + 2;
        for (let i = 50; i > 0; i--) updateParticles(state, t0 - i * 0.1, 0.1, fg, env);
      }
      if (now - last < FRAME_MS) return;
      const dt = last ? Math.min(0.2, (now - last) / 1000) : FRAME_MS / 1000;
      last = now;

      // L'heure avance et la météo évolue : l'ambiance est recalculée régulièrement.
      if (mode === "realtime" || weatherEnabled) {
        const next = computeEnv();
        const skyChanged = now - lastEnvUpdate > ENV_REFRESH_MS;
        env = skyChanged ? next : { ...env, weather: next.weather, wet: next.wet };
        if (skyChanged) {
          lastEnvUpdate = now;
          rebuildLayers();
        }
      }
      render(now / 1000, dt);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [theme, animated, paused, mode, weatherEnabled, hourOverride, weatherOverride]);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}
