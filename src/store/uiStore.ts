import { create } from "zustand";

interface UiState {
  /// Palette de commandes (Ctrl+K).
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
}));
