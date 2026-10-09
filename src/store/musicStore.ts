import { create } from "zustand";
import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "../lib/api";

/*
 * Musique d'ambiance du launcher.
 *
 * Les morceaux viennent de deux endroits :
 *  - les fichiers du jeu : les musiques que Minecraft a téléchargées chez Mojang en installant une
 *    version. Le launcher les lit sur place, il n'en embarque aucune. Elles apparaissent donc
 *    après un premier lancement du jeu ;
 *  - le dossier `src/assets/music/` du projet, pour des musiques à soi, embarquées à la compilation.
 *
 * La musique ne joue que lorsque la fenêtre du launcher est au premier plan, même si une partie
 * est en cours.
 *
 * Elle laisse aussi la place aux autres sons du PC : si une autre application joue déjà (musique,
 * vidéo YouTube, appel...), elle ne démarre pas, ou se met en pause, et reprend quand le silence
 * revient. Le son du launcher et du jeu ne compte pas.
 */

export interface Track {
  /// Identifiant stable : nom du fichier embarqué, ou empreinte du fichier du jeu.
  id: string;
  /// Nom affiché.
  name: string;
  url: string;
}

const files = import.meta.glob("../assets/music/*.{mp3,ogg,wav,m4a,flac}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

/// Musiques embarquées (dossier du projet).
const BUNDLED: Track[] = Object.entries(files)
  .map(([path, url]) => {
    const id = path.split("/").pop()!.replace(/\.[^.]+$/, "");
    return { id, name: id.replace(/[_-]+/g, " ").trim(), url };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

/// "once" : un seul morceau par ouverture du launcher. "loop" : sans interruption.
/// "pause" : un silence de quelques minutes entre deux morceaux, comme dans Minecraft.
export type Repeat = "once" | "loop" | "pause";

/// Morceau à jouer : au hasard, ou toujours le même.
export const RANDOM = "random";

export const DEFAULT_VOLUME = 15;
export const DEFAULT_PAUSE_MINUTES = 5;

interface MusicSettings {
  enabled: boolean;
  /// `RANDOM` ou l'identifiant d'un morceau.
  track: string;
  repeat: Repeat;
  pauseMinutes: number;
  /// De 0 à 100.
  volume: number;
}

interface MusicState extends MusicSettings {
  /// Morceaux disponibles : musiques embarquées, puis musiques trouvées dans les fichiers du jeu.
  tracks: Track[];
  /// Relit les musiques du jeu (à appeler au démarrage et après une installation du jeu).
  loadTracks: () => Promise<void>;
  /// Morceau en cours (en lecture ou en pause), sinon `null`.
  current: Track | null;
  playing: boolean;
  setEnabled: (enabled: boolean) => void;
  setTrack: (track: string) => void;
  setRepeat: (repeat: Repeat) => void;
  setPauseMinutes: (minutes: number) => void;
  setVolume: (volume: number) => void;
  /// Passe tout de suite à un autre morceau.
  skip: () => void;
  /// La musique n'est autorisée que lorsque la fenêtre du launcher est au premier plan.
  setAllowed: (allowed: boolean) => void;
  /// Une autre application joue du son : la musique d'ambiance reste en retrait.
  otherMedia: boolean;
}

const KEY = "nexora.music";

function load(): MusicSettings {
  const defaults: MusicSettings = {
    enabled: true,
    track: RANDOM,
    repeat: "pause",
    pauseMinutes: DEFAULT_PAUSE_MINUTES,
    volume: DEFAULT_VOLUME,
  };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<MusicSettings>;
    return { ...defaults, ...saved };
  } catch {
    return defaults;
  }
}

// ---------- Lecteur ----------

const audio = new Audio();
audio.preload = "auto";

let allowed = false;
/// Une autre application joue du son : on s'efface pour ne pas la couvrir.
let yielding = false;
/// Relevés consécutifs avec / sans autre son : un bruit passager ne doit pas couper la musique.
let noise = 0;
let quiet = 0;
let polling = false;

/// Intervalle entre deux relevés du son des autres applications.
const MEDIA_POLL_MS = 2_000;
/// Relevés de suite avec du son avant de se mettre en pause quand la musique joue.
const PAUSE_AFTER_NOISE = 2;
/// Relevés de suite sans son avant de reprendre.
const RESUME_AFTER_QUIET = 3;
/// Vrai dès qu'un premier morceau a été lancé depuis l'ouverture du launcher.
let startedOnce = false;
/// Vrai quand un morceau doit démarrer dès que la musique sera de nouveau autorisée.
let pending = false;
let lastId: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
/// Le navigateur a refusé la lecture automatique : on attend le premier clic.
let waitingGesture = false;

// Fondus : la musique ne se coupe ni ne reprend jamais d'un coup.
const FADE_MS = 900;
const FADE_STEP_MS = 30;
/// Volume réglé par le joueur (0 à 1) : la cible des fondus d'entrée.
let targetVolume = DEFAULT_VOLUME / 100;
let fade: ReturnType<typeof setInterval> | null = null;

function cancelFade() {
  if (fade) clearInterval(fade);
  fade = null;
}

/// Amène progressivement le volume à `to`, puis appelle `done`.
function fadeTo(to: number, done?: () => void) {
  cancelFade();
  const from = audio.volume;
  const steps = Math.max(1, Math.round(FADE_MS / FADE_STEP_MS));
  let step = 0;
  fade = setInterval(() => {
    step++;
    audio.volume = Math.min(1, Math.max(0, from + ((to - from) * step) / steps));
    if (step >= steps) {
      cancelFade();
      done?.();
    }
  }, FADE_STEP_MS);
}

function clearTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}

export const useMusicStore = create<MusicState>((set, get) => {
  const initial = load();
  targetVolume = initial.volume / 100;
  audio.volume = targetVolume;

  function save() {
    const { enabled, track, repeat, pauseMinutes, volume } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ enabled, track, repeat, pauseMinutes, volume }));
    } catch {
      // Stockage indisponible : les réglages ne seront pas mémorisés.
    }
  }

  /// La musique peut sonner : fenêtre au premier plan et aucune autre application ne joue.
  function playable() {
    return allowed && !yielding;
  }

  function setOther(value: boolean) {
    yielding = value;
    set({ otherMedia: value });
  }

  /// Relève tout de suite le son des autres applications, avant de lancer quoi que ce soit.
  async function refreshYield() {
    const other = await api.otherMediaPlaying().catch(() => false);
    noise = other ? 1 : 0;
    quiet = other ? 0 : 1;
    setOther(other);
  }

  /// Fait coller la lecture à l'état : coupe si la musique n'est plus permise, sinon reprend ou
  /// lance le morceau en attente.
  function applyPlayable() {
    if (!playable()) {
      fadeOutAndPause();
      return;
    }
    if (!get().enabled) return;
    if (get().current) resume();
    else if (pending) start();
  }

  async function pollMedia() {
    if (polling || !allowed || !get().enabled) return;
    polling = true;
    try {
      const other = await api.otherMediaPlaying().catch(() => false);
      // La fenêtre a pu perdre le premier plan pendant le relevé.
      if (!allowed || !get().enabled) return;
      if (other) {
        noise++;
        quiet = 0;
      } else {
        quiet++;
        noise = 0;
      }
      if (!yielding) {
        // Rien ne joue encore chez nous : un seul relevé suffit pour ne pas démarrer par-dessus.
        const needed = audio.paused ? 1 : PAUSE_AFTER_NOISE;
        if (noise >= needed) {
          setOther(true);
          applyPlayable();
        }
      } else if (quiet >= RESUME_AFTER_QUIET) {
        setOther(false);
        applyPlayable();
      }
    } finally {
      polling = false;
    }
  }

  setInterval(pollMedia, MEDIA_POLL_MS);

  function pick(): Track | null {
    const TRACKS = get().tracks;
    if (TRACKS.length === 0) return null;
    const { track } = get();
    // Morceau choisi mais disparu (fichier retiré) : on retombe sur le hasard.
    const chosen = track !== RANDOM ? TRACKS.find((t) => t.id === track) : undefined;
    if (chosen) return chosen;
    // Au hasard, mais jamais deux fois de suite le même morceau.
    const pool = TRACKS.length > 1 ? TRACKS.filter((t) => t.id !== lastId) : TRACKS;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /// Lance ou reprend la lecture, avec un fondu d'entrée.
  function resume() {
    cancelFade();
    // Retour sur la fenêtre pendant un fondu de sortie : on remonte depuis le volume du moment.
    if (audio.paused) audio.volume = 0;
    audio
      .play()
      .then(() => {
        waitingGesture = false;
        fadeTo(targetVolume);
      })
      .catch(() => {
        if (waitingGesture) return;
        waitingGesture = true;
        const retry = () => {
          window.removeEventListener("pointerdown", retry);
          window.removeEventListener("keydown", retry);
          waitingGesture = false;
          if (playable() && get().enabled && get().current) resume();
        };
        window.addEventListener("pointerdown", retry);
        window.addEventListener("keydown", retry);
      });
  }

  /// Démarre un nouveau morceau (ou le note en attente si la musique n'est pas autorisée).
  function start() {
    clearTimer();
    if (!get().enabled) return;
    if (!playable()) {
      pending = true;
      return;
    }
    const track = pick();
    // Aucune musique connue pour l'instant : on réessaiera quand la liste sera chargée.
    if (!track) {
      pending = true;
      return;
    }
    pending = false;
    startedOnce = true;
    lastId = track.id;
    // Changement de morceau en cours de lecture : l'ancien s'efface avant que le nouveau n'arrive.
    fadeOutAndPause(() => {
      audio.src = track.url;
      audio.currentTime = 0;
      set({ current: track });
      if (playable() && get().enabled) resume();
    });
  }

  /// Met en pause après un fondu de sortie (le morceau reprendra où il s'est arrêté).
  function fadeOutAndPause(after?: () => void) {
    if (audio.paused) {
      cancelFade();
      after?.();
      return;
    }
    fadeTo(0, () => {
      audio.pause();
      after?.();
    });
  }

  function stop() {
    clearTimer();
    pending = false;
    fadeOutAndPause(() => {
      audio.removeAttribute("src");
      set({ current: null, playing: false });
    });
  }

  audio.addEventListener("play", () => set({ playing: true }));
  audio.addEventListener("pause", () => set({ playing: false }));
  audio.addEventListener("ended", () => {
    set({ current: null, playing: false });
    const { repeat, pauseMinutes } = get();
    if (repeat === "loop") start();
    else if (repeat === "pause") timer = setTimeout(start, Math.max(1, pauseMinutes) * 60_000);
  });
  // Fichier illisible : on essaie un autre morceau un peu plus tard plutôt que de boucler dessus.
  audio.addEventListener("error", () => {
    if (!get().current) return;
    set({ current: null, playing: false });
    if (get().tracks.length > 1 && get().track === RANDOM) timer = setTimeout(start, 10_000);
  });

  // Premier morceau à l'ouverture du launcher (dès que la fenêtre est au premier plan).
  pending = initial.enabled;

  return {
    ...initial,
    current: null,
    playing: false,
    otherMedia: false,
    tracks: BUNDLED,

    loadTracks: async () => {
      const game = await api.listGameMusic().catch(() => []);
      const tracks = [...BUNDLED, ...game.map((t) => ({ id: t.id, name: t.name, url: convertFileSrc(t.path) }))];
      if (tracks.length === get().tracks.length) return;
      set({ tracks });
      // Les musiques viennent d'apparaître (premier téléchargement du jeu) : on lance le morceau
      // d'ouverture s'il n'a pas encore pu être joué.
      if (!startedOnce && get().enabled && !get().current) start();
    },

    setEnabled: (enabled) => {
      set({ enabled });
      save();
      if (enabled) void refreshYield().then(start);
      else stop();
    },

    setTrack: (track) => {
      set({ track });
      save();
      if (get().enabled) start();
    },

    setRepeat: (repeat) => {
      set({ repeat });
      save();
      // Rien en cours ni en attente : le nouveau réglage s'applique tout de suite.
      if (get().enabled && !get().current && !pending) {
        if (repeat === "once") clearTimer();
        else if (!timer) start();
      }
    },

    setPauseMinutes: (minutes) => {
      const pauseMinutes = Math.min(60, Math.max(1, Math.round(minutes) || DEFAULT_PAUSE_MINUTES));
      set({ pauseMinutes });
      save();
      // Un silence déjà entamé repart avec la nouvelle durée.
      if (timer) {
        clearTimer();
        timer = setTimeout(start, pauseMinutes * 60_000);
      }
    },

    setVolume: (volume) => {
      const clamped = Math.min(100, Math.max(0, Math.round(volume)));
      targetVolume = clamped / 100;
      // Pendant un fondu de sortie, on ne remonte pas le son : le réglage servira à la reprise.
      if (!fade) audio.volume = targetVolume;
      else if (!audio.paused && playable()) fadeTo(targetVolume);
      set({ volume: clamped });
      save();
    },

    skip: () => {
      if (get().enabled) start();
    },

    setAllowed: (value) => {
      if (allowed === value) return;
      allowed = value;
      if (!value) {
        fadeOutAndPause();
        return;
      }
      if (!get().enabled) return;
      // De retour au premier plan : on regarde d'abord si un autre média joue, puis on décide.
      void refreshYield().then(applyPlayable);
    },
  };
});
