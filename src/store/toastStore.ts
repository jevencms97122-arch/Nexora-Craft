import { create } from "zustand";
import { play } from "../lib/sound";

export type ToastKind = "success" | "error" | "info";

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

interface ToastState {
  toasts: Toast[];
  push: (kind: ToastKind, text: string) => void;
  dismiss: (id: number) => void;
}

const DURATION_MS = 3600;
const MAX_VISIBLE = 4;
let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (kind, text) => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts, { id, kind, text }].slice(-MAX_VISIBLE) }));
    if (kind !== "info") play(kind);
    // Les erreurs restent un peu plus longtemps : elles demandent d'être lues.
    setTimeout(() => get().dismiss(id), kind === "error" ? DURATION_MS * 1.8 : DURATION_MS);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/// Raccourcis utilisables partout, y compris hors des composants.
export const toast = {
  success: (text: string) => useToastStore.getState().push("success", text),
  error: (text: string) => useToastStore.getState().push("error", text),
  info: (text: string) => useToastStore.getState().push("info", text),
};
