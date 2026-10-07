import { create } from "zustand";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/*
 * Mise à jour automatique du launcher.
 *
 * Le launcher consulte le fichier latest.json de la dernière release GitHub (adresse dans
 * tauri.conf.json). Si une version plus récente existe, il la télécharge, vérifie sa signature
 * avec la clé publique embarquée, l'installe, puis redémarre.
 */

export type UpdateStatus = "idle" | "checking" | "available" | "downloading" | "installed" | "uptodate" | "error";

interface UpdateState {
  status: UpdateStatus;
  /// Version proposée et notes de la release, quand une mise à jour est disponible.
  version: string | null;
  notes: string | null;
  /// Avancement du téléchargement, de 0 à 1 ; null si la taille est inconnue.
  progress: number | null;
  error: string | null;
  /// L'utilisateur a choisi « Plus tard » : la fenêtre reste masquée jusqu'au prochain démarrage.
  dismissed: boolean;
  /// `manual` : vérification demandée par l'utilisateur (les erreurs sont alors affichées).
  checkForUpdate: (manual?: boolean) => Promise<void>;
  install: () => Promise<void>;
  dismiss: () => void;
}

// L'objet de mise à jour du plugin, gardé hors du store (il n'est pas sérialisable).
let pending: Update | null = null;

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: "idle",
  version: null,
  notes: null,
  progress: null,
  error: null,
  dismissed: false,

  checkForUpdate: async (manual = false) => {
    if (get().status === "checking" || get().status === "downloading") return;
    set({ status: "checking", error: null });
    try {
      pending = await check();
      if (pending) {
        set({ status: "available", version: pending.version, notes: pending.body ?? null, dismissed: false });
      } else {
        set({ status: "uptodate" });
      }
    } catch (e) {
      // Au démarrage, un échec (pas de réseau, aucune release publiée) reste silencieux.
      set(manual ? { status: "error", error: String(e) } : { status: "idle" });
    }
  },

  install: async () => {
    if (!pending) return;
    set({ status: "downloading", progress: 0, error: null });
    try {
      let total = 0;
      let received = 0;
      await pending.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
          set({ progress: total > 0 ? 0 : null });
        } else if (event.event === "Progress") {
          received += event.data.chunkLength;
          if (total > 0) set({ progress: Math.min(1, received / total) });
        }
      });
      set({ status: "installed", progress: 1 });
      await relaunch();
    } catch (e) {
      set({ status: "error", error: String(e) });
    }
  },

  dismiss: () => set({ dismissed: true }),
}));
