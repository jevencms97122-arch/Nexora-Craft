import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useImportStore } from "../store/importStore";
import { Icon } from "./ui";

/// Glisser-déposer de fichiers n'importe où dans la fenêtre : un voile indique la zone de dépôt, puis
/// les .jar et .zip déposés sont analysés et proposés à l'installation (voir ImportModal).
export function DropImport() {
  const [over, setOver] = useState(false);

  useEffect(() => {
    let off: (() => void) | undefined;
    let gone = false;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        const { type } = event.payload;
        if (type === "enter" || type === "over") setOver(true);
        else if (type === "leave") setOver(false);
        else if (type === "drop") {
          setOver(false);
          useImportStore.getState().importPaths(event.payload.paths);
        }
      })
      .then((unlisten) => (gone ? unlisten() : (off = unlisten)))
      .catch(() => {});
    return () => {
      gone = true;
      off?.();
    };
  }, []);

  if (!over) return null;
  return (
    <div className="fixed inset-0 z-[90] pointer-events-none flex items-center justify-center bg-bg/70 backdrop-blur-sm">
      <div className="rounded-[32px] border-2 border-dashed border-accent px-16 py-14 flex flex-col items-center gap-3 bg-panel/80">
        <Icon name="upload" className="w-12 h-12 text-accent" />
        <div className="section-title text-xl">Dépose pour importer</div>
        <div className="text-sm text-text-muted">Mods, packs de ressources et shaders (.jar ou .zip)</div>
      </div>
    </div>
  );
}
