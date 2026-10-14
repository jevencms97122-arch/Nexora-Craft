import { useCallback, useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api } from "../lib/api";
import { supabase } from "../lib/supabase";
import type { ServerStatus } from "../lib/types";
import { useGameStore } from "../store/gameStore";
import { toast } from "../store/toastStore";
import { SkinCanvas } from "../components/AccountSkin";
import { Skin3D } from "../components/Skin3D";
import { Icon, Skeleton, Spinner, type IconName } from "../components/ui";

/*
 * Onglet SMP : classement, joueurs connectés, activité et infos du serveur Nexora-SMP.
 * Tout vient de la base en ligne, alimentée par le serveur Minecraft (voir docs/prompt-serveur-smp.md).
 * Aucune de ces tables n'est obligatoire : ce qui manque est simplement masqué.
 */

interface Stat {
  key: string;
  label: string;
  icon: IconName;
  format: (value: number) => string;
}

const number = (v: number) => v.toLocaleString("fr-FR");
const duration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  if (h >= 24) return `${Math.floor(h / 24)} j ${h % 24} h`;
  if (h >= 1) return `${h} h ${Math.floor((seconds % 3600) / 60)} min`;
  return `${Math.floor(seconds / 60)} min`;
};
const distance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${number(Math.round(m))} m`);

/// Statistiques connues du launcher. Une statistique que le serveur envoie sans être listée ici est ignorée.
const STATS: Stat[] = [
  { key: "playtime_seconds", label: "Temps de jeu", icon: "clock", format: duration },
  { key: "mobs_killed", label: "Monstres tués", icon: "alert", format: number },
  { key: "player_kills", label: "Joueurs tués", icon: "users", format: number },
  { key: "deaths", label: "Morts", icon: "trash", format: number },
  { key: "blocks_mined", label: "Blocs minés", icon: "box", format: number },
  { key: "blocks_placed", label: "Blocs posés", icon: "grid", format: number },
  { key: "distance_m", label: "Distance", icon: "compass", format: distance },
  { key: "advancements", label: "Progrès", icon: "star", format: number },
  { key: "balance", label: "Argent", icon: "sparkles", format: number },
];

interface Row {
  uuid: string;
  username: string;
  value: number;
}

interface SmpStatus {
  online_players: { uuid: string; username: string }[] | null;
  max_players: number | null;
  tps: number | null;
  world_day: number | null;
  version: string | null;
  updated_at: string;
}

interface SmpEvent {
  id: number;
  kind: string;
  username: string | null;
  message: string;
  created_at: string;
}

const EVENT_ICONS: Record<string, IconName> = {
  join: "arrowUp",
  leave: "back",
  death: "trash",
  advancement: "star",
  chat: "list",
};

/// Les données du serveur sont considérées périmées au-delà de ce délai.
const STALE_MS = 5 * 60_000;
const REFRESH_MS = 30_000;

/// Skin publié par le serveur pour un joueur (table smp_players).
interface PlayerSkin {
  url: string;
  slim: boolean;
}

type Skins = Record<string, PlayerSkin | undefined>;

/// Tête d'un joueur : son skin publié par le serveur si on l'a, sinon mc-heads (qui ne connaît que
/// les comptes Microsoft : pour un serveur en mode hors-ligne, il renvoie Steve).
function Head({ uuid, name, size = 32, skin }: { uuid?: string; name: string; size?: number; skin?: PlayerSkin }) {
  const [failed, setFailed] = useState(false);
  const id = uuid || name;
  if (skin) {
    return (
      <div className="rounded-lg overflow-hidden bg-panel-3 shrink-0" style={{ width: size, height: size }}>
        <SkinCanvas src={skin.url} mode="head" className="w-full h-full" />
      </div>
    );
  }
  return (
    <div
      className="rounded-lg overflow-hidden bg-panel-3 flex items-center justify-center text-text-faint shrink-0"
      style={{ width: size, height: size }}
    >
      {failed ? (
        <Icon name="user" className="w-1/2 h-1/2" />
      ) : (
        <img
          src={`https://mc-heads.net/avatar/${encodeURIComponent(id)}/${size * 2}`}
          alt=""
          className="w-full h-full [image-rendering:pixelated]"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

function timeAgo(date: string) {
  const minutes = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}

const MEDALS = ["text-[#e8b923]", "text-[#b8c0cc]", "text-[#c9854a]"];

const LINK_LABELS: [string, string][] = [
  ["map", "Carte du monde"],
  ["discord", "Discord"],
  ["rules", "Règlement"],
  ["vote", "Voter"],
  ["wiki", "Wiki"],
];


function Panel({ title, icon, aside, children, className = "" }: {
  title: string;
  icon: IconName;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card flex flex-col min-h-0 overflow-hidden ${className}`}>
      <header className="flex items-center gap-2 px-4 pt-3.5 pb-2.5 shrink-0">
        <Icon name={icon} className="w-4 h-4 text-accent" />
        <h2 className="section-title">{title}</h2>
        {aside && <div className="ml-auto text-xs text-text-muted">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

function Podium({ rows, format, skins }: { rows: Row[]; format: (v: number) => string; skins: Skins }) {
  // Ordre d'affichage : 2e, 1er, 3e ; le premier est plus haut.
  const order = [1, 0, 2].filter((i) => rows[i]);
  return (
    <div className="grid grid-cols-3 gap-2 items-end px-3 pb-3 shrink-0">
      {order.map((i) => {
        const row = rows[i];
        const first = i === 0;
        return (
          <div
            key={row.uuid}
            className={`rounded-2xl border border-border-strong bg-fg/[0.03] flex flex-col items-center gap-1 px-2 text-center min-w-0 ${
              first ? "pt-4 pb-3 !border-accent/40 bg-accent/[0.06]" : "pt-3 pb-2.5"
            }`}
          >
            <span className={`text-xs font-bold ${MEDALS[i]}`}>#{i + 1}</span>
            <Head uuid={row.uuid} name={row.username} size={first ? 56 : 44} skin={skins[row.uuid]} />
            <div className="font-semibold text-sm truncate max-w-full">{row.username}</div>
            <div className="text-xs text-text-muted tabular-nums">{format(row.value)}</div>
          </div>
        );
      })}
    </div>
  );
}

const FILTERS: { key: string; label: string; kinds: string[] | null }[] = [
  { key: "all", label: "Tout", kinds: null },
  { key: "join", label: "Connexions", kinds: ["join", "leave"] },
  { key: "death", label: "Morts", kinds: ["death"] },
  { key: "advancement", label: "Progrès", kinds: ["advancement"] },
  { key: "chat", label: "Chat", kinds: ["chat"] },
];

/// Statistiques détaillées du joueur sélectionné, dans l'ordre d'affichage.
const PROFILE_TILES: { key: string; label: string; icon: IconName }[] = [
  { key: "advancements", label: "Progrès", icon: "star" },
  { key: "player_kills", label: "Joueurs tués", icon: "users" },
  { key: "balance", label: "Argent", icon: "sparkles" },
  { key: "deaths", label: "Morts", icon: "trash" },
];

export function SmpPage() {
  const { joinOfficial, preparingOfficial, launchingId, runningId } = useGameStore();
  const [stat, setStat] = useState(STATS[0].key);
  const [address, setAddress] = useState<string | null>(null);
  const [ping, setPing] = useState<ServerStatus | null>(null);
  const [status, setStatus] = useState<SmpStatus | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [available, setAvailable] = useState<string[] | null>(null);
  const [events, setEvents] = useState<SmpEvent[]>([]);
  const [filter, setFilter] = useState("all");
  const [info, setInfo] = useState<Record<string, unknown>>({});
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<{ uuid: string; username: string } | null>(null);
  const [playtimes, setPlaytimes] = useState<Record<string, number>>({});
  const [mine, setMine] = useState<Record<string, number>>({});
  const [skins, setSkins] = useState<Skins>({});

  useEffect(() => {
    api
      .listServers()
      .then((list) => setAddress(list.find((s) => s.official)?.address ?? null))
      .catch(() => {});
  }, []);

  const loadStatus = useCallback(async () => {
    if (address) api.pingServer(address).then(setPing).catch(() => setPing(null));
    // La liste des connectés passe par une fonction qui en retire les joueurs masqués (table
    // smp_hidden) ; si elle n'existe pas encore, on lit la table directement.
    const filtered = await supabase.rpc("smp_status_public");
    if (!filtered.error) {
      const row = (filtered.data as SmpStatus[] | SmpStatus | null) ?? null;
      setStatus(Array.isArray(row) ? (row[0] ?? null) : row);
      return;
    }
    const { data } = await supabase.from("smp_status").select("*").eq("id", 1).maybeSingle();
    setStatus((data as SmpStatus | null) ?? null);
  }, [address]);

  useEffect(() => {
    loadStatus();
    const timer = setInterval(loadStatus, REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadStatus]);

  // Statistiques que le serveur a effectivement publiées : seules celles-là sont proposées.
  useEffect(() => {
    supabase
      .from("smp_stats")
      .select("stat")
      .limit(1000)
      .then(({ data, error }) => {
        if (error) {
          setFailed(true);
          setAvailable([]);
          return;
        }
        const keys = new Set((data ?? []).map((r) => (r as { stat: string }).stat));
        const known = STATS.filter((s) => keys.has(s.key)).map((s) => s.key);
        setAvailable(known);
        if (known.length > 0 && !known.includes(stat)) setStat(known[0]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      supabase
        .from("smp_stats")
        .select("uuid, username, value")
        .eq("stat", stat)
        .order("value", { ascending: false })
        .limit(25)
        .then(({ data }) => !cancelled && setRows((data as Row[] | null) ?? []));
    setRows(null);
    load();
    const timer = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [stat]);

  useEffect(() => {
    const load = () => {
      supabase
        .from("smp_events")
        .select("id, kind, username, message, created_at")
        .order("created_at", { ascending: false })
        .limit(60)
        .then(({ data }) => setEvents((data as SmpEvent[] | null) ?? []));
      supabase
        .from("smp_info")
        .select("key, value")
        .then(({ data }) => {
          const next: Record<string, unknown> = {};
          for (const row of (data ?? []) as { key: string; value: unknown }[]) next[row.key] = row.value;
          setInfo(next);
        });
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const fresh = !!status && Date.now() - new Date(status.updated_at).getTime() < STALE_MS;
  const players = fresh ? (status?.online_players ?? []) : [];
  const onlineKey = players.map((p) => p.uuid).join(",");

  // Temps de jeu des joueurs connectés, affiché sous leur pseudo.
  useEffect(() => {
    if (!onlineKey) return;
    supabase
      .from("smp_stats")
      .select("uuid, value")
      .eq("stat", "playtime_seconds")
      .in("uuid", onlineKey.split(","))
      .then(({ data }) => {
        const next: Record<string, number> = {};
        for (const r of (data ?? []) as { uuid: string; value: number }[]) next[r.uuid] = r.value;
        setPlaytimes(next);
      });
  }, [onlineKey]);

  // Skins publiés par le serveur pour les joueurs affichés (classement et connectés).
  const skinIds = [...new Set([...(rows ?? []).map((r) => r.uuid), ...players.map((p) => p.uuid)])].sort().join(",");
  useEffect(() => {
    if (!skinIds) return;
    supabase
      .from("smp_players")
      .select("uuid, skin_url, skin_model")
      .in("uuid", skinIds.split(","))
      .then(({ data, error }) => {
        if (error) return;
        const next: Skins = {};
        for (const r of (data ?? []) as { uuid: string; skin_url: string | null; skin_model: string | null }[]) {
          if (r.skin_url && /^https?:\/\//i.test(r.skin_url)) next[r.uuid] = { url: r.skin_url, slim: r.skin_model === "slim" };
        }
        setSkins((old) => ({ ...old, ...next }));
      });
  }, [skinIds]);

  // Joueur mis en avant : celui qu'on a choisi, sinon le premier connecté, sinon le premier du classement.
  const fallback = players[0] ?? (rows && rows[0] ? { uuid: rows[0].uuid, username: rows[0].username } : null);
  const selected = picked ?? fallback;
  const selectedId = selected?.uuid ?? null;

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setMine({});
    supabase
      .from("smp_stats")
      .select("stat, value")
      .eq("uuid", selectedId)
      .then(({ data }) => {
        if (cancelled) return;
        const next: Record<string, number> = {};
        for (const r of (data ?? []) as { stat: string; value: number }[]) next[r.stat] = r.value;
        setMine(next);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const current = STATS.find((s) => s.key === stat) ?? STATS[0];
  const busy = preparingOfficial || launchingId !== null || runningId !== null;
  const links = (info.links ?? {}) as Record<string, string>;
  const validLinks = LINK_LABELS.filter(([key]) => /^https?:\/\//i.test(links[key] ?? ""));
  const rules = Array.isArray(info.rules) ? (info.rules as string[]) : [];
  const announcement = typeof info.announcement === "string" ? info.announcement : null;
  const noStats = available !== null && available.length === 0;
  const kinds = FILTERS.find((f) => f.key === filter)?.kinds ?? null;
  const shownEvents = kinds ? events.filter((e) => kinds.includes(e.kind)) : events;
  const myStats = STATS.filter((s) => mine[s.key] != null);
  const myTiles = PROFILE_TILES.filter((t) => mine[t.key] != null);

  const facts: { label: string; value: string; tone?: string }[] = [
    {
      label: "Statut",
      value: ping ? (ping.online ? "En ligne" : "Hors ligne") : "…",
      tone: ping?.online ? "text-accent" : "text-text-muted",
    },
    {
      label: "Joueurs",
      // Le ping compte aussi les joueurs masqués : quand on a la liste du serveur, on la préfère.
      value: ping?.online ? `${fresh ? players.length : ping.players_online} / ${ping.players_max}` : "—",
    },
    { label: "Latence", value: ping?.online ? `${ping.latency_ms} ms` : "—" },
    { label: "TPS", value: fresh && status?.tps != null ? status.tps.toFixed(1).replace(".", ",") : "—" },
  ];

  return (
    // Sur grand écran la page tient dans la fenêtre : seules les listes défilent, chacune dans sa carte.
    <div className="w-full box-border flex flex-col gap-4 px-6 sm:px-8 pt-6 pb-6 min-h-full lg:h-full">
      {/* Bandeau : identité du serveur, état en direct et bouton Rejoindre. */}
      <header className="flex items-center gap-x-6 gap-y-3 flex-wrap shrink-0">
        <div className="min-w-0">
          <div className="eyebrow mb-1.5">Serveur officiel</div>
          <div className="flex items-center gap-3">
            <h1 className="page-title">Nexora-SMP</h1>
            {address && (
              <button
                onClick={() => navigator.clipboard.writeText(address).then(() => toast.success("Adresse copiée"))}
                className="chip !h-7 text-[11px] normal-case tracking-normal"
                title="Copier l'adresse"
              >
                <Icon name="copy" className="w-3 h-3" /> {address}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-stretch gap-2 flex-wrap lg:ml-auto">
          {facts.map((item) => (
            <div key={item.label} className="card !rounded-2xl px-4 py-2 min-w-[92px]">
              <div className="text-[10px] uppercase tracking-wider text-text-faint">{item.label}</div>
              <div className={`text-base font-bold tabular-nums ${item.tone ?? ""}`}>{item.value}</div>
            </div>
          ))}
          {address && (
            <button onClick={() => joinOfficial(address)} disabled={busy} className="btn btn-primary btn-shine h-auto px-6">
              {preparingOfficial ? <Spinner className="w-4 h-4" /> : <Icon name="play" filled className="w-4 h-4" />}
              Rejoindre
            </button>
          )}
        </div>
      </header>

      <div className="grid gap-4 flex-1 min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)] lg:grid-rows-[auto_minmax(0,1fr)] xl:grid-cols-[minmax(340px,0.9fr)_minmax(0,1.4fr)_minmax(320px,0.9fr)] xl:grid-rows-[minmax(0,1fr)]">
        {/* Gauche : le joueur mis en avant (connectés, skin, statistiques, profil) et les infos du serveur. */}
        <div className="order-2 flex flex-col gap-4 min-h-0 lg:col-start-2 xl:col-start-1 lg:row-start-1 overflow-y-auto lg:max-h-[46vh] xl:max-h-full">
          <Panel title="Panneau du joueur" icon="users" aside={fresh ? `${players.length} connecté${players.length > 1 ? "s" : ""}` : undefined} className="shrink-0">
            <div className="px-3 pb-3 flex gap-3 min-w-0">
              <div className="flex-1 min-w-0 flex flex-col gap-1.5 max-h-60 overflow-y-auto">
                {players.length === 0 ? (
                  <p className="text-sm text-text-muted px-1 py-2">Personne en ligne pour le moment.</p>
                ) : (
                  players.map((p) => {
                    const active = p.uuid === selectedId;
                    return (
                      <button
                        key={p.uuid}
                        onClick={() => setPicked(p)}
                        className={`flex items-center gap-2.5 min-w-0 rounded-xl px-2 py-1.5 text-left border transition-colors ${
                          active ? "bg-accent/12 border-accent/40" : "border-transparent hover:bg-fg/5"
                        }`}
                      >
                        <Head uuid={p.uuid} name={p.username} size={30} skin={skins[p.uuid]} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold truncate">{p.username}</span>
                          {playtimes[p.uuid] != null && (
                            <span className="block text-[11px] text-text-faint truncate">
                              {duration(playtimes[p.uuid])} de jeu
                            </span>
                          )}
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                      </button>
                    );
                  })
                )}
              </div>
              {selected && (
                <div className="hidden sm:flex items-end gap-1 shrink-0">
                  {skins[selected.uuid] ? (
                    <Skin3D src={skins[selected.uuid]!.url} slim={skins[selected.uuid]!.slim} height={150} />
                  ) : (
                    ["body", "player"].map((kind) => (
                      <img
                        key={kind}
                        src={`https://mc-heads.net/${kind}/${encodeURIComponent(selected.uuid)}/160`}
                        alt=""
                        className="h-[150px] w-auto max-w-[84px] object-contain [image-rendering:pixelated] drop-shadow-[0_8px_10px_rgba(0,0,0,0.45)]"
                        loading="lazy"
                        onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = "hidden")}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          </Panel>

          {selected && myStats.length > 0 && (
            <Panel title="Statistiques personnelles" icon="signal" aside={selected.username} className="shrink-0">
              <div className="px-4 pb-4 grid grid-cols-2 gap-x-4 gap-y-2.5">
                {myStats.map((s) => (
                  <div key={s.key} className="flex items-center gap-2 min-w-0 text-[13px]">
                    <Icon name={s.icon} className="w-4 h-4 text-accent shrink-0" />
                    <span className="text-text-muted truncate">{s.label}</span>
                    <span className="ml-auto font-semibold tabular-nums whitespace-nowrap">{s.format(mine[s.key])}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {selected && (
            <Panel title="Profil du joueur" icon="user" className="shrink-0">
              <div className="px-4 pb-4 flex flex-col gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Head uuid={selected.uuid} name={selected.username} size={40} skin={skins[selected.uuid]} />
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{selected.username}</div>
                    <div className="text-xs text-text-muted">Joueur de Nexora-SMP</div>
                  </div>
                </div>
                {myTiles.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {myTiles.map((t) => {
                      const definition = STATS.find((s) => s.key === t.key);
                      return (
                        <div key={t.key} className="rounded-xl border border-border-strong bg-fg/[0.03] px-3 py-2 flex items-center gap-2.5 min-w-0">
                          <Icon name={t.icon} className="w-4 h-4 text-accent shrink-0" />
                          <div className="min-w-0">
                            <div className="text-[11px] text-text-muted truncate">{t.label}</div>
                            <div className="text-sm font-bold tabular-nums">{definition?.format(mine[t.key]) ?? mine[t.key]}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Panel>
          )}

          {(announcement || validLinks.length > 0 || rules.length > 0) && (
            <Panel title="Infos du serveur" icon="globe" className="shrink-0">
              <div className="px-4 pb-4 flex flex-col gap-3">
                {announcement && (
                  <p className="text-sm leading-relaxed rounded-xl bg-accent/[0.08] border border-accent/25 px-3 py-2">
                    {announcement}
                  </p>
                )}
                {validLinks.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {validLinks.map(([key, label]) => (
                      <button key={key} onClick={() => openUrl(links[key])} className="btn btn-secondary btn-sm">
                        {label} <Icon name="external" className="w-3 h-3" />
                      </button>
                    ))}
                  </div>
                )}
                {rules.length > 0 && (
                  <ol className="list-decimal pl-5 flex flex-col gap-1 text-[13px] text-text-muted">
                    {rules.map((rule, i) => (
                      <li key={i}>{rule}</li>
                    ))}
                  </ol>
                )}
              </div>
            </Panel>
          )}

          <div className="text-[11px] text-text-faint px-1 flex flex-col gap-0.5">
            {(ping?.version || status?.version) && <span>Version {ping?.version || status?.version}</span>}
            {fresh && status?.world_day != null && <span>Jour {number(status.world_day)} du monde</span>}
          </div>
        </div>

        {/* Centre : le classement, qui occupe toute la hauteur disponible. */}
        <Panel
          title="Classement"
          icon="star"
          aside={current.label}
          className="order-1 lg:col-start-1 lg:row-start-1 lg:row-span-2 xl:col-start-2 xl:row-span-1 min-h-[420px] lg:min-h-0"
        >
          {noStats ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-8">
              <Icon name="star" className="w-8 h-8 text-text-faint" />
              <div className="section-title">{failed ? "Classement indisponible" : "Le classement arrive bientôt"}</div>
              <p className="text-sm text-text-muted max-w-sm">
                Le serveur n'a pas encore publié les statistiques des joueurs. Elles apparaîtront ici toutes seules.
              </p>
            </div>
          ) : (
            <>
              <div className="flex gap-1.5 overflow-x-auto px-4 pb-3 shrink-0 [scrollbar-width:none]">
                {STATS.filter((s) => !available || available.includes(s.key)).map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setStat(s.key)}
                    title={s.label}
                    aria-label={s.label}
                    className={`chip shrink-0 !px-3 ${stat === s.key ? "chip-active" : ""}`}
                  >
                    <Icon name={s.icon} className="w-4 h-4" />
                  </button>
                ))}
              </div>
              {rows === null ? (
                <div className="px-4 pb-4 flex flex-col gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-11 !rounded-xl" />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <p className="text-sm text-text-muted px-4 pb-4">Aucune donnée pour cette statistique.</p>
              ) : (
                <>
                  <Podium rows={rows} format={current.format} skins={skins} />
                  <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
                    {rows.map((row, index) => (
                      <button
                        key={row.uuid}
                        onClick={() => setPicked({ uuid: row.uuid, username: row.username })}
                        className={`w-full flex items-center gap-3 rounded-xl px-2.5 py-2 min-w-0 text-left border-b border-border-strong/40 last:border-b-0 transition-colors ${
                          row.uuid === selectedId ? "bg-accent/10" : "hover:bg-fg/5"
                        }`}
                      >
                        <span className={`w-6 text-center text-xs font-bold tabular-nums ${MEDALS[index] ?? "text-text-faint"}`}>
                          {index + 1}
                        </span>
                        <Head uuid={row.uuid} name={row.username} size={28} skin={skins[row.uuid]} />
                        <span className="flex-1 min-w-0 truncate text-sm font-semibold">{row.username}</span>
                        <span className="tabular-nums text-sm text-text-muted">{current.format(row.value)}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </Panel>

        {/* Droite : journal d'activité, filtrable. */}
        <Panel
          title="Journal d'activité"
          icon="signal"
          className="order-3 min-h-[300px] lg:min-h-0 lg:col-start-2 lg:row-start-2 xl:col-start-3 xl:row-start-1"
        >
          <div className="flex gap-1.5 overflow-x-auto px-4 pb-3 shrink-0 [scrollbar-width:none]">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`chip shrink-0 !h-7 text-[11px] ${filter === f.key ? "chip-active" : ""}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 flex flex-col gap-2">
            {shownEvents.length === 0 ? (
              <p className="text-sm text-text-muted px-1">Rien à signaler pour l'instant.</p>
            ) : (
              shownEvents.map((event) => (
                <div
                  key={event.id}
                  className="rounded-xl border border-border-strong bg-fg/[0.03] px-3 py-2.5 flex items-center gap-3 min-w-0"
                >
                  <span className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
                    <Icon name={EVENT_ICONS[event.kind] ?? "list"} className="w-4 h-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] leading-snug">{event.message}</span>
                    <span className="block text-[10px] text-text-faint mt-0.5">{timeAgo(event.created_at)}</span>
                  </span>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
