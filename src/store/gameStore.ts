import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { api } from "../lib/api";
import { analyzeLogs, type CrashReport } from "../lib/crash";
import type { DownloadProgress, GameExited, GameLogLine, ImportProgress } from "../lib/types";
import { isSignedIn } from "./cloudStore";
import { useInstanceStore } from "./instanceStore";
import { toast } from "./toastStore";

/// Message affiché quand on tente de jouer sans compte Nexora connecté.
export const ACCOUNT_REQUIRED = "Connecte-toi à ton compte Nexora (onglet Compte) pour lancer le jeu.";

interface GameState {
  launchingId: string | null;
  runningId: string | null;
  progress: DownloadProgress | null;
  logs: GameLogLine[];
  /// Dernière instance lancée : sa configuration accompagne les journaux lors d'une analyse.
  lastInstanceId: string | null;
  /// Serveur rejoint au lancement de la partie en cours (affiché aux amis), s'il y en a un.
  currentServer: string | null;
  error: string | null;
  /// Diagnostic affiché quand le jeu s'arrête anormalement (ou à la demande).
  crash: CrashReport | null;
  /// `server` : adresse à rejoindre automatiquement au démarrage.
  launch: (instanceId: string, server?: string | null) => Promise<void>;
  /// Vrai pendant la préparation de l'instance dédiée au serveur officiel.
  preparingOfficial: boolean;
  /// Avancement de l'installation du pack officiel (mods et shaders), pendant cette préparation.
  officialProgress: ImportProgress | null;
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

  listen<ImportProgress>("share-progress", (event) => {
    if (get().preparingOfficial) set({ officialProgress: event.payload });
  });

  listen<GameLogLine>("game-log", (event) => {
    const logs = [...get().logs, event.payload].slice(-500);
    set({ logs, runningId: event.payload.instance_id });
  });

  listen<GameExited>("game-exited", (event) => {
    const code = event.payload.code;
    // Code 0 : fermeture normale. Tout autre code est traité comme un plantage et analysé.
    const crash = code !== 0 ? analyzeLogs(get().logs, code) : null;
    set({ runningId: null, launchingId: null, progress: null, crash, currentServer: null });
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
    currentServer: null,
    error: null,
    crash: null,
    preparingOfficial: false,
    officialProgress: null,

    joinOfficial: async (address) => {
      if (!(await isSignedIn())) {
        set({ error: ACCOUNT_REQUIRED });
        toast.error(ACCOUNT_REQUIRED);
        return;
      }
      set({ preparingOfficial: true, officialProgress: null, error: null });
      try {
        const instance = await api.ensureOfficialInstance();
        await useInstanceStore.getState().refresh();
        set({ preparingOfficial: false, officialProgress: null });
        await get().launch(instance.id, address);
      } catch (e) {
        set({ error: String(e), preparingOfficial: false, officialProgress: null });
      }
    },

    launch: async (instanceId, server) => {
      // Sans compte Nexora connecté, aucune instance ne se lance.
      if (!(await isSignedIn())) {
        set({ error: ACCOUNT_REQUIRED });
        toast.error(ACCOUNT_REQUIRED);
        return;
      }
      set({ launchingId: instanceId, lastInstanceId: instanceId, currentServer: server ?? null, error: null, logs: [], crash: null });
      try {
        await api.launchInstance(instanceId, server);
      } catch (e) {
        set({ error: String(e), launchingId: null, progress: null, currentServer: null });
      }
    },

    diagnose: () => set({ crash: analyzeLogs(get().logs) }),
    dismissCrash: () => set({ crash: null }),
    clearError: () => set({ error: null }),
  };
});
