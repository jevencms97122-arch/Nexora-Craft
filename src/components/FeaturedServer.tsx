import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Server, ServerStatus } from "../lib/types";
import { useAccountStore } from "../store/accountStore";
import { useGameStore } from "../store/gameStore";
import { Icon, Spinner } from "./ui";

const REFRESH_MS = 30_000;

/// Widget de l'accueil : statut du serveur officiel du launcher et connexion en un clic. Le
/// launcher utilise une instance dédiée, créée automatiquement à la version du serveur.
export function FeaturedServer() {
  const { joinOfficial, preparingOfficial, launchingId, runningId } = useGameStore();
  const account = useAccountStore((s) => s.active());
  const [server, setServer] = useState<Server | null>(null);
  const [status, setStatus] = useState<ServerStatus | null>(null);

  useEffect(() => {
    api
      .listServers()
      .then((list) => setServer(list.find((s) => s.official) ?? null))
      .catch(() => setServer(null));
  }, []);

  useEffect(() => {
    if (!server) return;
    let cancelled = false;
    const ping = () =>
      api
        .pingServer(server.address)
        .then((s) => !cancelled && setStatus(s))
        .catch(() => !cancelled && setStatus({ online: false } as ServerStatus));
    ping();
    const timer = setInterval(ping, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [server]);

  if (!server) return null;

  const busy = preparingOfficial || launchingId !== null || runningId !== null;
  const online = status?.online ?? false;

  const joinTitle = !account
    ? "Connecte un compte pour jouer"
    : `Lance le jeu à la bonne version et rejoint ${server.address}`;

  return (
    <aside
      className="liquid card-hover rounded-[20px] p-2 pr-2.5 shrink-0 flex items-center gap-2.5"
      title={online && status?.motd ? `${status.motd}\n${server.address}` : server.address}
    >
      {online && status?.favicon ? (
        <img
          src={status.favicon}
          alt=""
          className="icon-tile w-9 h-9 rounded-[10px]"
          style={{ imageRendering: "pixelated" }}
        />
      ) : (
        <div className="icon-tile w-9 h-9 rounded-[10px] flex items-center justify-center text-accent">
          <Icon name="globe" className="w-[18px] h-[18px]" />
        </div>
      )}

      <div className="min-w-0 pr-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold truncate">{server.name}</span>
          <span
            className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-px rounded bg-fg/8 text-text-faint"
            title="Serveur officiel de Nexora Craft, mis en avant par le launcher"
          >
            Pub
          </span>
        </div>
        <div className="text-[11px] leading-tight mt-0.5">
          {status === null ? (
            <span className="text-text-faint">Connexion...</span>
          ) : online ? (
            <span className="flex items-center gap-1.5 text-text-muted whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              {status.players_online} / {status.players_max} en ligne
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-text-faint">
              <span className="w-1.5 h-1.5 rounded-full bg-text-faint" /> Hors ligne
            </span>
          )}
        </div>
      </div>

      <button
        onClick={() => joinOfficial(server.address)}
        disabled={!account || busy}
        title={joinTitle}
        className="btn btn-primary btn-sm btn-shine ml-1"
      >
        {preparingOfficial ? (
          <Spinner className="w-3.5 h-3.5" />
        ) : (
          <Icon name="play" filled className="w-3 h-3" />
        )}
        Rejoindre
      </button>
    </aside>
  );
}
