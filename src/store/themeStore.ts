import { create } from "zustand";
import { setSoundsEnabled } from "../lib/sound";

export type Theme = "dark" | "light";

const THEME_KEY = "nexora.theme";
const ANIMATED_KEY = "nexora.sceneAnimated";
const ACCENT_KEY = "nexora.accent";
const SCENE_MODE_KEY = "nexora.sceneMode";
const WEATHER_KEY = "nexora.sceneWeather";
const SOUNDS_KEY = "nexora.sounds";

/// "theme" : nuit en sombre, jour en clair. "realtime" : la scène suit l'heure de l'ordinateur.
export type SceneMode = "theme" | "realtime";

export const DEFAULT_ACCENT = "#f43f4e";

export const ACCENT_PRESETS: { name: string; color: string }[] = [
  { name: "Rouge", color: DEFAULT_ACCENT },
  { name: "Orange", color: "#fb7a2c" },
  { name: "Ambre", color: "#f5b82e" },
  { name: "Vert", color: "#34e089" },
  { name: "Cyan", color: "#22d3ee" },
  { name: "Bleu", color: "#3b8bff" },
  { name: "Violet", color: "#9b6bff" },
  { name: "Rose", color: "#f25fb4" },
];

/// Thème complet : mode, couleur principale et ambiance de la scène, appliqués d'un seul clic.
export interface ThemePreset {
  id: string;
  name: string;
  hint: string;
  theme: Theme;
  accent: string;
  sceneMode: SceneMode;
  weather: boolean;
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: "braise", name: "Braise", hint: "Nuit au coin du feu", theme: "dark", accent: DEFAULT_ACCENT, sceneMode: "theme", weather: false },
  { id: "emeraude", name: "Émeraude", hint: "Nuit verte", theme: "dark", accent: "#34e089", sceneMode: "theme", weather: false },
  { id: "abysse", name: "Abysse", hint: "Nuit bleue sous la pluie", theme: "dark", accent: "#3b8bff", sceneMode: "theme", weather: true },
  { id: "amethyste", name: "Améthyste", hint: "Nuit violette", theme: "dark", accent: "#9b6bff", sceneMode: "theme", weather: false },
  { id: "aube", name: "Aube", hint: "Jour clair et chaud", theme: "light", accent: "#fb7a2c", sceneMode: "theme", weather: false },
  { id: "horloge", name: "Horloge", hint: "Suit l'heure réelle et la météo", theme: "dark", accent: "#22d3ee", sceneMode: "realtime", weather: true },
];

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Stockage indisponible : la préférence ne sera simplement pas mémorisée.
  }
}

// ---------- Couleurs ----------

type Hsl = { h: number; s: number; l: number };

export function hexToHsl(hex: string): Hsl {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s: s * 100, l: l * 100 };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const lig = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lig - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

function isHex(value: string | null): value is string {
  return !!value && /^#[0-9a-f]{6}$/i.test(value);
}

/// Applique le thème et dérive toutes les teintes d'accent à partir de la couleur principale.
function apply(theme: Theme, accent: string) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  const hsl = hexToHsl(accent);
  // En thème clair, l'accent est légèrement assombri pour rester lisible sur fond blanc.
  const base = theme === "light" ? hslToHex({ ...hsl, l: Math.min(hsl.l, 52) }) : accent;
  const baseHsl = hexToHsl(base);
  const hover = hslToHex({ ...baseHsl, l: baseHsl.l + (theme === "light" ? -6 : 8) });
  const secondary = hslToHex({ ...baseHsl, h: (baseHsl.h + 40) % 360 });
  // Texte posé sur l'accent : sombre sur une couleur claire, blanc sur une couleur foncée.
  const ink = luminance(base) > 0.4 ? hslToHex({ h: hsl.h, s: 60, l: 6 }) : "#ffffff";

  root.style.setProperty("--color-accent", base);
  root.style.setProperty("--color-accent-hover", hover);
  root.style.setProperty("--color-accent-ink", ink);
  root.style.setProperty("--color-cyan", secondary);
}

function initialTheme(): Theme {
  const stored = read(THEME_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function initialAnimated(): boolean {
  const stored = read(ANIMATED_KEY);
  if (stored !== null) return stored === "1";
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

interface ThemeState {
  /// Sombre = scène de nuit, clair = scène de jour.
  theme: Theme;
  animated: boolean;
  /// Couleur principale de l'interface (hex).
  accent: string;
  sceneMode: SceneMode;
  /// Pluie ou neige de temps en temps dans la scène.
  weather: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setAnimated: (animated: boolean) => void;
  setAccent: (accent: string) => void;
  setSceneMode: (mode: SceneMode) => void;
  setWeather: (weather: boolean) => void;
  /// Sons d'interface (clics, confirmations, lancement).
  sounds: boolean;
  setSounds: (sounds: boolean) => void;
  applyPreset: (preset: ThemePreset) => void;
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const theme = initialTheme();
  const stored = read(ACCENT_KEY);
  const accent = isHex(stored) ? stored : DEFAULT_ACCENT;
  apply(theme, accent);
  const sounds = read(SOUNDS_KEY) !== "0";
  setSoundsEnabled(sounds);
  return {
    theme,
    animated: initialAnimated(),
    accent,
    sceneMode: read(SCENE_MODE_KEY) === "realtime" ? "realtime" : "theme",
    weather: read(WEATHER_KEY) === "1",
    setTheme: (theme) => {
      apply(theme, get().accent);
      write(THEME_KEY, theme);
      set({ theme });
    },
    toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),
    setAnimated: (animated) => {
      write(ANIMATED_KEY, animated ? "1" : "0");
      set({ animated });
    },
    setSceneMode: (sceneMode) => {
      write(SCENE_MODE_KEY, sceneMode);
      set({ sceneMode });
    },
    setWeather: (weather) => {
      write(WEATHER_KEY, weather ? "1" : "0");
      set({ weather });
    },
    sounds,
    setSounds: (sounds) => {
      setSoundsEnabled(sounds);
      write(SOUNDS_KEY, sounds ? "1" : "0");
      set({ sounds });
    },
    applyPreset: (preset) => {
      get().setTheme(preset.theme);
      get().setAccent(preset.accent);
      get().setSceneMode(preset.sceneMode);
      get().setWeather(preset.weather);
    },
    setAccent: (accent) => {
      if (!isHex(accent)) return;
      apply(get().theme, accent);
      write(ACCENT_KEY, accent);
      set({ accent });
    },
  };
});
