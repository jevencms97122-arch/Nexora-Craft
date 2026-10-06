import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { api } from "../lib/api";
import type { DownloadProgress, GameExited, GameLogLine } from "../lib/types";

interface GameState {
  launchingId: string | null;
  runningId: string | null;
  progress: DownloadProgress | null;
  logs: GameLogLine[];
  error: string | null;
  launch: (instanceId: string) => Promise<void>;
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

  listen<GameExited>("game-exited", () => {
    set({ runningId: null, launchingId: null, progress: null });
  });
}

export const useGameStore = create<GameState>((set, get) => {
  ensureListeners(set, get);
  return {
    launchingId: null,
    runningId: null,
    progress: null,
    logs: [],
    error: null,

    launch: async (instanceId: string) => {
      set({ launchingId: instanceId, error: null, logs: [] });
      try {
        await api.launchInstance(instanceId);
      } catch (e) {
        set({ error: String(e), launchingId: null, progress: null });
      }
    },

    clearError: () => set({ error: null }),
  };
});
