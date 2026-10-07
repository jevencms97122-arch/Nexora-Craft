import { Link } from "react-router-dom";
import { formatPlaytime } from "../lib/format";
import type { Instance } from "../lib/types";
import { useGameStore } from "../store/gameStore";
import { Icon, InstanceIcon, LoaderBadge, ProgressBar, Spinner, imageSrc, instanceBanner, progressPercent } from "./ui";

interface Props {
  instance: Instance;
  /// "grid" : carte avec bannière. "list" : ligne compacte, pour les longues bibliothèques.
  view?: "grid" | "list";
}

export function InstanceCard({ instance, view = "grid" }: Props) {
  const { launch, launchingId, runningId, progress } = useGameStore();

  const isRunning = runningId === instance.id;
  const isLaunching = launchingId === instance.id && !isRunning;
  const percent = isLaunching ? progressPercent(progress) : null;

  const playButton = (
    <button
      onClick={() => launch(instance.id)}
      disabled={isLaunching || isRunning}
      title="Jouer"
      className={`btn btn-primary p-0 rounded-xl shrink-0 ${view === "list" ? "w-9 h-9" : "w-11 h-11"}`}
    >
      {isLaunching ? <Spinner /> : <Icon name="play" filled className="w-4 h-4" />}
    </button>
  );

  if (view === "list") {
    return (
      <div className="row group">
        <Link to={`/instances/${instance.id}`} className="flex items-center gap-3.5 flex-1 min-w-0">
          <InstanceIcon name={instance.name} icon={instance.icon} className="w-10 h-10 text-base" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold truncate group-hover:text-accent transition-colors">{instance.name}</div>
            {isLaunching ? (
              <div className="mt-1.5 max-w-xs">
                <ProgressBar value={percent} />
              </div>
            ) : (
              <div className="text-xs text-text-faint flex items-center gap-3 mt-0.5">
                <span>{instance.mc_version}</span>
                <LoaderBadge loader={instance.loader} />
              </div>
            )}
          </div>
          {isRunning && <span className="badge badge-accent">● En jeu</span>}
          <span className="text-xs text-text-faint w-24 text-right flex items-center justify-end gap-1 shrink-0">
            <Icon name="clock" className="w-3 h-3" />
            {formatPlaytime(instance.playtime_seconds, "—")}
          </span>
        </Link>
        {playButton}
      </div>
    );
  }

  const hasBanner = !!imageSrc(instance.banner);

  return (
    <div className="group card card-hover overflow-hidden flex flex-col">
      <Link to={`/instances/${instance.id}`} className="relative h-32 block overflow-hidden" style={instanceBanner(instance)}>
        {!hasBanner && <div className="absolute inset-0 grid-pattern opacity-60" />}
        {hasBanner && <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />}
        {!hasBanner && !instance.icon && (
          <span
            className="absolute -bottom-5 right-3 text-[96px] leading-none font-black text-white/10 select-none"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {instance.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="absolute top-3 left-3 flex gap-1.5">
          <span className="badge bg-black/45! text-white/90! backdrop-blur">{instance.mc_version}</span>
          <span className="badge bg-black/45! text-white/90! backdrop-blur">
            <LoaderBadge loader={instance.loader} />
          </span>
        </div>
        {isRunning && <span className="absolute top-3 right-3 badge badge-accent backdrop-blur">● En jeu</span>}
        {instance.icon && (
          <InstanceIcon
            name={instance.name}
            icon={instance.icon}
            className="absolute left-3 bottom-3 w-14 h-14 rounded-2xl shadow-lg !border-white/20"
          />
        )}
      </Link>

      <div className="p-4 flex items-center gap-3">
        <Link to={`/instances/${instance.id}`} className="min-w-0 flex-1">
          <div className="font-semibold truncate group-hover:text-accent transition-colors">{instance.name}</div>
          <div className="text-xs text-text-faint mt-0.5 flex items-center gap-1">
            <Icon name="clock" className="w-3 h-3" />
            {formatPlaytime(instance.playtime_seconds)}
          </div>
        </Link>
        {playButton}
      </div>

      {isLaunching && (
        <div className="px-4 pb-4 -mt-1 flex flex-col gap-1.5">
          <div className="text-[11px] text-text-muted truncate">{progress?.stage ?? "Préparation..."}</div>
          <ProgressBar value={percent} />
        </div>
      )}
    </div>
  );
}
