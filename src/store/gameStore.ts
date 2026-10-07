import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { api } from "../lib/api";
import { analyzeLogs, type CrashReport } from "../lib/crash";
import { play } from "../lib/sound";
import type { DownloadProgress, GameExited, GameLogLine } from "../lib/types";
import { useInstanceStore } from "./instanceStore";

interface GameState {
  launchingId: string | null;
  runningId: string | null;
  progress: DownloadProgress | null;
  logs: GameLogLine[];
  /// Dernière instance lancée : sa configuration accompagne les journaux lors d'une analyse.
  lastInstanceId: string | null;
  error: string | null;
  /// Diagnostic affiché quand le jeu s'arrête anormalement (ou à la demande).
  crash: CrashReport | null;
  /// `server` : adresse à rejoindre automatiquement au démarrage.
  launch: (instanceId: string, server?: string | null) => Promise<void>;
  /// Vrai pendant la préparation de l'instance dédiée au serveur officiel.
  preparingOfficial: boolean;
  /// Rejoint le serveur officiel avec son instance dédiée (créée à la bonne version si besoin).
  joinOfficial: (address: string) => Promise<void>;
  /// Analyse les journaux actuels sans attendre un plantage.
  diagnose: () => void;
  dismissCrash: () => void;
  clearError: () => void;
}

let listenersReady = false;

function ensureListeners(set: (partial: Partial<GameState>) => void, get: () => GameState) {
  if (listenersReady) return;
  listenersReady = true;

  listen<DownloadProgress>("download-progress", (event) => {
    set({ progress: event.payload });
  });

  listen<GameLogLine>("game-log", (event) => {
    const logs = [...get().logs, event.payload].slice(-500);
    set({ logs, runningId: event.payload.instance_id });
  });

  listen<GameExited>("game-exited", (event) => {
    const code = event.payload.code;
    // Code 0 : fermeture normale. Tout autre code est traité comme un plantage et analysé.
    const crash = code !== 0 ? analyzeLogs(get().logs, code) : null;
    if (crash) play("error");
    set({ runningId: null, launchingId: null, progress: null, crash });
    // Le temps de jeu vient d'être enregistré : on recharge les instances pour l'afficher.
    useInstanceStore.getState().refresh();
  });
}

export const useGameStore = create<GameState>((set, get) => {
  ensureListeners(set, get);
  return {
    launchingId: null,
    runningId: null,
    progress: null,
    logs: [],
    lastInstanceId: null,
    error: null,
    crash: null,
    preparingOfficial: false,

    joinOfficial: async (address) => {
      set({ preparingOfficial: true, error: null });
      try {
        const instance = await api.ensureOfficialInstance();
        await useInstanceStore.getState().refresh();
        set({ preparingOfficial: false });
        await get().launch(instance.id, address);
      } catch (e) {
        set({ error: String(e), preparingOfficial: false });
      }
    },

    launch: async (instanceId, server) => {
      set({ launchingId: instanceId, lastInstanceId: instanceId, error: null, logs: [], crash: null });
      play("launch");
      try {
        await api.launchInstance(instanceId, server);
      } catch (e) {
        set({ error: String(e), launchingId: null, progress: null });
      }
    },

    diagnose: () => set({ crash: analyzeLogs(get().logs) }),
    dismissCrash: () => set({ crash: null }),
    clearError: () => set({ error: null }),
  };
});
