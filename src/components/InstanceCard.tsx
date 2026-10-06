import { Link } from "react-router-dom";
import type { Instance } from "../lib/types";
import { useGameStore } from "../store/gameStore";

interface Props {
  instance: Instance;
}

export function InstanceCard({ instance }: Props) {
  const { launch, launchingId, runningId, progress } = useGameStore();

  const isBusy = launchingId === instance.id || runningId === instance.id;
  const currentProgress = isBusy ? progress : null;

  return (
    <div className="group relative bg-panel-2 border border-border rounded-2xl p-4 flex flex-col gap-3 shadow-sm hover:border-border-strong hover:shadow-md transition-all">
      <Link
        to={`/instances/${instance.id}`}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-text-muted hover:text-text text-xs transition-opacity"
        title="Gérer l'instance"
      >
        ⚙
      </Link>

      <div className="w-full aspect-square rounded-2xl bg-panel flex items-center justify-center text-3xl font-bold text-accent/70">
        {instance.name.charAt(0).toUpperCase()}
      </div>

      <div>
        <div className="font-medium truncate">{instance.name}</div>
        <div className="text-xs text-text-muted">
          {instance.mc_version} · {instance.loader}
        </div>
      </div>

      <button
        onClick={() => launch(instance.id)}
        disabled={isBusy}
        className="w-full py-2 rounded-full bg-accent hover:bg-accent-hover active:scale-[0.98] disabled:opacity-60 text-sm font-medium flex items-center justify-center gap-2 transition-all"
      >
        {isBusy ? (
          currentProgress ? (
            <span className="truncate">
              {currentProgress.stage} {Math.round((currentProgress.completed / Math.max(currentProgress.total, 1)) * 100)}%
            </span>
          ) : (
            "Lancement..."
          )
        ) : (
          "Jouer"
        )}
      </button>
    </div>
  );
}
