import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { api } from "../lib/api";
import type { ImportedFile } from "../lib/types";

/*
 * Import de fichiers téléchargés à la main (mode CurseForge de l'onglet Explorer).
 *
 * Tant que la surveillance est active, le launcher regarde toutes les deux secondes si un nouveau
 * fichier .jar ou .zip est apparu dans le dossier Téléchargements. Chaque fichier trouvé est
 * analysé puis proposé à l'installation (voir ImportModal). La fenêtre CurseForge du launcher
 * signale en plus chaque téléchargement terminé, ce qui évite d'attendre le passage suivant.
 */

const POLL_MS = 2_000;
/// La surveillance s'arrête toute seule : inutile de scruter le dossier indéfiniment.
const WATCH_MS = 30 * 60_000;

interface ImportState {
  watching: boolean;
  /// Fichiers détectés, en attente d'une décision du joueur.
  queue: ImportedFile[];
  /// Démarre (ou prolonge) la surveillance du dossier Téléchargements.
  start: () => void;
  stop: () => void;
  /// Retire le premier fichier de la file (installé ou ignoré).
  dismiss: () => void;
}

let timer: ReturnType<typeof setInterval> | null = null;
let since = 0;
let deadline = 0;
/// Fichiers déjà traités, et taille vue au passage précédent pour ceux encore en cours d'écriture.
const handled = new Set<string>();

/// Nom du fichier, sans son dossier : la fenêtre CurseForge et la surveillance du dossier peuvent
/// écrire le même chemin de deux façons, et un fichier ne doit être proposé qu'une fois.
function key(path: string) {
  return path.split(/[\\/]/).pop()!.toLowerCase();
}
const lastSize = new Map<string, number>();

export const useImportStore = create<ImportState>((set, get) => {
  async function poll() {
    if (Date.now() > deadline) {
      get().stop();
      return;
    }
    const files = await api.scanDownloads(since).catch(() => []);
    for (const file of files) {
      if (handled.has(key(file.path))) continue;
      // Un fichier n'est pris que lorsque sa taille n'a pas bougé entre deux passages : le
      // navigateur a alors fini de l'écrire.
      if (lastSize.get(file.path) !== file.size) {
        lastSize.set(file.path, file.size);
        continue;
      }
      handled.add(key(file.path));
      try {
        const info = await api.inspectDownload(file.path);
        set((state) => ({ queue: [...state.queue, info] }));
      } catch {
        // Fichier illisible (archive abîmée, autre type de .zip) : on l'ignore en silence.
      }
    }
  }

  // Téléchargement terminé dans la fenêtre CurseForge du launcher.
  listen<string>("curseforge-download", async ({ payload: path }) => {
    if (handled.has(key(path)) || !/\.(jar|zip)$/i.test(path)) return;
    handled.add(key(path));
    try {
      const info = await api.inspectDownload(path);
      set((state) => ({ queue: [...state.queue, info] }));
    } catch {
      // Fichier hors du dossier Téléchargements ou illisible : rien à proposer.
    }
  }).catch(() => {});

  return {
    watching: false,
    queue: [],

    start: () => {
      deadline = Date.now() + WATCH_MS;
      if (timer) return;
      // Petite marge : un téléchargement lancé juste avant le clic compte aussi.
      since = Date.now() - 5_000;
      timer = setInterval(poll, POLL_MS);
      set({ watching: true });
    },

    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
      lastSize.clear();
      set({ watching: false });
    },

    dismiss: () => set((state) => ({ queue: state.queue.slice(1) })),
  };
});
