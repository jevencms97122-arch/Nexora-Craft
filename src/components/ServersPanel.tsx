import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Server, ServerStatus } from "../lib/types";
import { useAccountStore } from "../store/accountStore";
import { useGameStore } from "../store/gameStore";
import { useInstanceStore } from "../store/instanceStore";
import { toast } from "../store/toastStore";
import { Dropdown, Icon, Spinner, loaderLabel } from "./ui";

const REFRESH_MS = 30_000;

function LatencyBars({ ms }: { ms: number }) {
  const level = ms < 80 ? 4 : ms < 150 ? 3 : ms < 300 ? 2 : 1;
  return (
    <span className="flex items-end gap-[2px] h-3.5" title={`${ms} ms`}>
      {[1, 2, 3, 4].map((n) => (
        <span
          key={n}
          className={`w-[3px] rounded-sm ${n <= level ? "bg-accent" : "bg-fg/15"}`}
          style={{ height: `${n * 25}%` }}
        />
      ))}
    </span>
  );
}

/// Serveurs favoris : statut en direct et connexion en un clic.
export function ServersPanel() {
  const { instances, refresh: refreshInstances } = useInstanceStore();
  const { launch, joinOfficial, preparingOfficial, launchingId, runningId } = useGameStore();
  const account = useAccountStore((s) => s.active());
  const [servers, setServers] = useState<Server[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ServerStatus | "loading">>({});
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Par défaut, « Rejoindre » utilise la dernière instance jouée.
  const sortedInstances = useMemo(
    () =>
      [...instances].sort(
        (a, b) => new Date(b.last_played ?? 0).getTime() - new Date(a.last_played ?? 0).getTime(),
      ),
    [instances],
  );

  async function pingAll(list: Server[]) {
    setStatuses((prev) => {
      const next = { ...prev };
      for (const s of list) if (!next[s.id]) next[s.id] = "loading";
      return next;
    });
    await Promise.all(
      list.map(async (s) => {
        const status = await api.pingServer(s.address).catch(() => null);
        setStatuses((prev) => ({ ...prev, [s.id]: status ?? { online: false } as ServerStatus }));
      }),
    );
  }

  useEffect(() => {
    refreshInstances();
    api
      .listServers()
      .then((list) => {
        setServers(list);
        pingAll(list);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoaded(true));
  }, [refreshInstances]);

  // Rafraîchissement périodique du statut.
  useEffect(() => {
    if (servers.length === 0) return;
    const timer = setInterval(() => pingAll(servers), REFRESH_MS);
    return () => clearInterval(timer);
  }, [servers]);

  async function handleAdd() {
    if (!address.trim()) return;
    setError(null);
    try {
      const list = await api.addServer(name, address);
      setServers(list);
      setName("");
      setAddress("");
      pingAll(list);
      toast.success("Serveur ajouté");
    } catch (e) {
      setError(String(e));
    }
  }

  const busy = preparingOfficial || launchingId !== null || runningId !== null;

  return (
    <div className="flex flex-col gap-6">
      <div className="card p-4 flex gap-2 flex-wrap items-end max-w-3xl">
        <div className="flex-1 min-w-[150px]">
          <label className="label">Nom</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mon serveur" className="input" />
        </div>
        <div className="flex-[2] min-w-[220px]">
          <label className="label">Adresse</label>
          <div className="relative">
            <Icon name="globe" className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-faint" />
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="play.exemple.net ou adresse:port"
              className="input pl-10 font-mono"
            />
          </div>
        </div>
        <button onClick={handleAdd} disabled={!address.trim()} className="btn btn-primary">
          <Icon name="plus" className="w-4 h-4" /> Ajouter
        </button>
      </div>

      {error && <div className="alert-error max-w-3xl">{error}</div>}

      {loaded && servers.length === 0 ? (
        <div className="empty-state max-w-3xl">
          <Icon name="globe" className="w-8 h-8 text-text-faint" />
          <div className="section-title text-text">Aucun serveur</div>
          <p className="text-sm max-w-xs">Ajoute l'adresse d'un serveur pour voir qui est connecté et le rejoindre en un clic.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-3 stagger">
          {servers.map((server) => {
            const status = statuses[server.id];
            const loading = !status || status === "loading";
            const online = !loading && status.online;
            const instance =
              sortedInstances.find((i) => i.id === server.instance_id) ?? sortedInstances[0] ?? null;
            return (
              <div
                key={server.id}
                className={`card card-hover p-4 flex flex-col gap-3 group ${server.official ? "!border-accent/40" : ""}`}
              >
                <div className="flex items-start gap-3">
                  {online && status.favicon ? (
                    <img
                      src={status.favicon}
                      alt=""
                      className="icon-tile w-14 h-14 rounded-2xl"
                      style={{ imageRendering: "pixelated" }}
                    />
                  ) : (
                    <div className="icon-tile w-14 h-14 rounded-2xl flex items-center justify-center text-text-faint">
                      <Icon name="globe" className="w-6 h-6" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold truncate">{server.name}</div>
                      {server.official ? (
                        <span className="badge badge-accent ml-auto shrink-0" title="Serveur officiel de Nexora Craft">
                          Officiel
                        </span>
                      ) : (
                        <button
                          onClick={() =>
                            api.removeServer(server.id).then((list) => {
                              setServers(list);
                              toast.info(`${server.name} retiré`);
                            })
                          }
                          className="ml-auto text-text-faint hover:text-danger opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                          title="Retirer ce serveur"
                        >
                          <Icon name="trash" className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-text-faint font-mono truncate select-text">{server.address}</div>
                    <div className="mt-1.5 flex items-center gap-2 text-xs min-w-0">
                      {loading ? (
                        <span className="flex items-center gap-1.5 text-text-muted">
                          <Spinner className="w-3 h-3" /> Connexion...
                        </span>
                      ) : online ? (
                        <>
                          <span className="flex items-center gap-1.5 text-accent font-semibold whitespace-nowrap">
                            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                            {status.players_online} / {status.players_max} joueurs
                          </span>
                          <LatencyBars ms={status.latency_ms} />
                          {status.version && <span className="text-text-faint truncate min-w-0">{status.version}</span>}
                        </>
                      ) : (
                        <span className="flex items-center gap-1.5 text-text-faint">
                          <span className="w-1.5 h-1.5 rounded-full bg-text-faint" /> Hors ligne
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {online && status.motd && (
                  <p className="text-xs text-text-muted whitespace-pre-line line-clamp-2 leading-relaxed">{status.motd}</p>
                )}

                <div className="flex items-center gap-2 mt-auto">
                  {server.official ? (
                    <span className="flex-1 text-xs text-text-faint leading-snug">
                      Instance dédiée, installée automatiquement avec le pack de mods du serveur.
                    </span>
                  ) : sortedInstances.length > 0 && instance ? (
                    <Dropdown
                      className="flex-1 min-w-0"
                      placement="up"
                      ariaLabel="Instance utilisée pour rejoindre"
                      value={instance.id}
                      onChange={(id) => api.setServerInstance(server.id, id).then(setServers)}
                      options={sortedInstances.map((i) => ({
                        value: i.id,
                        label: i.name,
                        hint: `${i.mc_version} · ${loaderLabel(i.loader)}`,
                      }))}
                    />
                  ) : (
                    <span className="flex-1 text-xs text-text-faint">Crée d'abord une instance.</span>
                  )}
                  <button
                    onClick={() =>
                      server.official ? joinOfficial(server.address) : instance && launch(instance.id, server.address)
                    }
                    disabled={(!server.official && !instance) || !account || busy}
                    title={!account ? "Connecte un compte pour jouer" : undefined}
                    className="btn btn-primary btn-shine"
                  >
                    {(server.official ? preparingOfficial : launchingId === instance?.id) ? (
                      <Spinner />
                    ) : (
                      <Icon name="play" filled className="w-4 h-4" />
                    )}
                    Rejoindre
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
