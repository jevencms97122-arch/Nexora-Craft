import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { ImportKind, ImportedFile } from "../lib/types";
import { useImportStore } from "../store/importStore";
import { useInstanceStore } from "../store/instanceStore";
import { Icon, Skeleton, loaderLabel, type IconName } from "./ui";

const SECTIONS: { kind: ImportKind; label: string; icon: IconName }[] = [
  { kind: "mod", label: "Mods", icon: "box" },
  { kind: "resourcepack", label: "Packs de ressources", icon: "image" },
  { kind: "shader", label: "Shaders", icon: "sparkles" },
];

/// Onglet « Nexora » de l'Explorer : les mods, packs de ressources et shaders fournis avec le launcher
/// (dossier `nexora-content/` du projet). Chacun indique avec combien de tes instances il est compatible ;
/// « Installer » ouvre la même fenêtre que l'import de fichiers, pour choisir l'instance.
export function NexoraPanel() {
  const importPaths = useImportStore((s) => s.importPaths);
  const { instances, refresh } = useInstanceStore();
  const [items, setItems] = useState<ImportedFile[] | null>(null);

  useEffect(() => {
    refresh();
    api
      .nexoraContent()
      .then(setItems)
      .catch(() => setItems([]));
  }, [refresh]);

  if (items === null) {
    return (
      <div className="flex flex-col gap-2 max-w-3xl">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 !rounded-xl" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="empty-state max-w-3xl">
        <Icon name="box" className="w-8 h-8 text-text-faint" />
        <div className="section-title text-text">Rien dans Nexora pour l'instant</div>
        <p className="text-sm max-w-md">
          Les mods, packs de ressources et shaders proposés par Nexora apparaîtront ici. En attendant, tu peux en
          chercher sur Modrinth ou importer tes propres fichiers.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7 max-w-3xl">
      {SECTIONS.map((section) => {
        const list = items.filter((item) => item.kind === section.kind);
        if (list.length === 0) return null;
        return (
          <section key={section.kind} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Icon name={section.icon} className="w-4 h-4 text-accent" />
              <h2 className="section-title">{section.label}</h2>
              <span className="text-xs text-text-muted">{list.length}</span>
            </div>
            <div className="flex flex-col gap-2 stagger">
              {list.map((item) => {
                const ok = item.compat.filter((c) => c.verdict === "ok").length;
                const maybe = item.compat.filter((c) => c.verdict === "unknown").length;
                const total = instances.length;
                return (
                  <div key={item.path} className="row !cursor-default">
                    <span className="w-11 h-11 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0">
                      <Icon name={section.icon} className="w-5 h-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{item.title}</div>
                      <div className="flex gap-1.5 flex-wrap mt-1">
                        {item.loaders.map((loader) => (
                          <span key={loader} className="badge">
                            {loaderLabel(loader)}
                          </span>
                        ))}
                        {item.minecraft && <span className="badge">Minecraft {item.minecraft}</span>}
                      </div>
                      <div className={`text-[11px] mt-1 ${ok > 0 ? "text-accent" : "text-text-faint"}`}>
                        {total === 0
                          ? "Crée une instance pour l'installer"
                          : ok > 0
                            ? `Compatible avec ${ok} de tes ${total} instance${total > 1 ? "s" : ""}`
                            : maybe > 0
                              ? "À vérifier selon l'instance"
                              : "Aucune de tes instances n'est compatible"}
                      </div>
                    </div>
                    <button onClick={() => importPaths([item.path])} className="btn btn-primary btn-sm shrink-0">
                      <Icon name="download" className="w-3.5 h-3.5" /> Installer
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
