import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../lib/api";
import type { DownloadedFile } from "../lib/types";
import { useImportStore } from "../store/importStore";
import { Icon, Skeleton } from "./ui";

function size(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
  return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

function when(ms: number) {
  const minutes = Math.round((Date.now() - ms) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}

/// Onglet « Mes fichiers » de l'Explorer : on y dépose ses propres mods, packs de ressources, shaders,
/// ou on les choisit dans la liste des fichiers récents de Téléchargements. Le launcher reconnaît le
/// type, dit dans quelles instances il est compatible, et l'installe là où on le décide.
export function ImportPanel() {
  const importPaths = useImportStore((s) => s.importPaths);
  const [recent, setRecent] = useState<DownloadedFile[] | null>(null);

  const load = useCallback(() => {
    api
      .recentDownloads()
      .then(setRecent)
      .catch(() => setRecent([]));
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5_000);
    return () => clearInterval(timer);
  }, [load]);

  async function browse() {
    const picked = await open({
      multiple: true,
      filters: [{ name: "Mods, packs de ressources et shaders", extensions: ["jar", "zip"] }],
    }).catch(() => null);
    if (!picked) return;
    importPaths(Array.isArray(picked) ? picked : [picked]);
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <button
        onClick={browse}
        className="card p-8 flex flex-col items-center gap-3 text-center border-dashed !border-accent/40 hover:!border-accent transition-colors"
      >
        <span className="w-14 h-14 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
          <Icon name="upload" className="w-7 h-7" />
        </span>
        <span className="section-title text-lg">Dépose tes fichiers ici</span>
        <span className="text-sm text-text-muted max-w-md leading-relaxed">
          Mods, packs de ressources, shaders : glisse-les n'importe où dans le launcher, ou clique pour les choisir.
          Le launcher reconnaît leur type, te dit s'ils sont compatibles, et tu choisis l'instance.
        </span>
        <span className="btn btn-primary mt-1">
          <Icon name="folder" className="w-4 h-4" /> Parcourir mes fichiers
        </span>
      </button>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="section-title">Récemment dans Téléchargements</h2>
          <span className="text-xs text-text-muted">.jar et .zip</span>
        </div>
        {recent === null ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 !rounded-xl" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <p className="text-sm text-text-muted">Aucun fichier .jar ou .zip dans ton dossier Téléchargements.</p>
        ) : (
          <div className="flex flex-col gap-2 stagger">
            {recent.map((file) => (
              <button key={file.path} onClick={() => importPaths([file.path])} className="row text-left">
                <span className="w-10 h-10 rounded-xl bg-fg/5 text-text-muted flex items-center justify-center shrink-0">
                  <Icon name="box" className="w-5 h-5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold truncate">{file.name}</span>
                  <span className="block text-[11px] text-text-faint">
                    {size(file.size)} · {when(file.modified)}
                  </span>
                </span>
                <span className="btn btn-secondary btn-sm shrink-0">Analyser</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
