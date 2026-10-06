import { create } from "zustand";
import { api } from "../lib/api";

interface BackgroundState {
  image: string | null;
  loaded: boolean;
  refresh: () => Promise<void>;
  setFromPath: (path: string) => Promise<void>;
  clear: () => Promise<void>;
}

export const useBackgroundStore = create<BackgroundState>((set) => ({
  image: null,
  loaded: false,

  refresh: async () => {
    const settings = await api.getSettings();
    set({ image: settings.background_image, loaded: true });
  },

  setFromPath: async (path: string) => {
    const dataUri = await api.setBackgroundImage(path);
    set({ image: dataUri });
  },

  clear: async () => {
    await api.clearBackgroundImage();
    set({ image: null });
  },
}));
