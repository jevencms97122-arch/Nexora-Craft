import { useEffect } from "react";
import { useGameStore } from "../store/gameStore";
import { useUpdateStore } from "../store/updateStore";
import { Logo } from "./Logo";
import { Icon, ProgressBar, Spinner } from "./ui";

/// Carte « Mise à jour disponible », en bas à gauche. La vérification se fait au démarrage.
export function UpdatePrompt() {
  const { status, version, notes, progress, error, dismissed, checkForUpdate, install, dismiss } = useUpdateStore();
  const gameBusy = useGameStore((s) => s.runningId !== null || s.launchingId !== null);

  useEffect(() => {
    checkForUpdate();
  }, [checkForUpdate]);

  const downloading = status === "downloading" || status === "installed";
  const visible = downloading || (status === "available" && !dismissed) || (status === "error" && version !== null && !dismissed);
  if (!visible) return null;

  return (
    <aside
      className="liquid liquid-strong fixed left-[104px] bottom-5 z-40 w-[340px] rounded-[22px] p-4 flex flex-col gap-3 toast"
      role="dialog"
      aria-label="Mise à jour du launcher"
    >
      <div className="flex items-center gap-3">
        <Logo size={40} />
        <div className="min-w-0">
          <div className="eyebrow">Mise à jour</div>
          <div className="font-semibold truncate">
            {status === "installed" ? "Redémarrage..." : `Version ${version} disponible`}
          </div>
        </div>
      </div>

      {notes && !downloading && (
        <p className="text-xs text-text-muted leading-relaxed whitespace-pre-line line-clamp-4">{notes}</p>
      )}

      {downloading ? (
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-xs text-text-muted">
            <span>{status === "installed" ? "Installation terminée" : "Téléchargement..."}</span>
            {progress !== null && <span className="text-accent font-semibold tabular-nums">{Math.round(progress * 100)}%</span>}
          </div>
          <ProgressBar value={progress === null ? null : progress * 100} />
        </div>
      ) : (
        <>
          {error && <div className="alert-error">La mise à jour a échoué : {error}</div>}
          {gameBusy && (
            <p className="text-[11px] text-text-faint">Ferme le jeu avant de mettre à jour : le launcher va redémarrer.</p>
          )}
          <div className="flex gap-2">
            <button onClick={install} disabled={gameBusy} className="btn btn-primary btn-sm flex-1">
              <Icon name="download" className="w-3.5 h-3.5" />
              {error ? "Réessayer" : "Mettre à jour"}
            </button>
            <button onClick={dismiss} className="btn btn-ghost btn-sm">
              Plus tard
            </button>
          </div>
        </>
      )}
      {status === "installed" && (
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Spinner className="w-3.5 h-3.5" /> Le launcher redémarre.
        </div>
      )}
    </aside>
  );
}
