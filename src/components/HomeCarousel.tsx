import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api } from "../lib/api";
import type { Server, ServerStatus } from "../lib/types";
import { useAccountStore } from "../store/accountStore";
import { useCloudStore, type NewsItem, type NewsKind } from "../store/cloudStore";
import { useGameStore } from "../store/gameStore";
import { Icon, Modal, Spinner, type IconName } from "./ui";

const SLIDE_MS = 8_000;
const PING_MS = 30_000;
const NEWS_MS = 10 * 60_000;
const MAX_NEWS_SLIDES = 3;
const SEEN_KEY = "nexora.newsSeen";

const KINDS: Record<NewsKind, { label: string; icon: IconName }> = {
  info: { label: "Info", icon: "bulb" },
  event: { label: "Événement", icon: "star" },
  maintenance: { label: "Maintenance", icon: "alert" },
  update: { label: "Nouveauté", icon: "sparkles" },
};

type Slide = { type: "server"; server: Server } | { type: "news"; item: NewsItem };

function readSeen(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

function isWebLink(link: string | null): link is string {
  return !!link && /^https:\/\//i.test(link);
}

const TAG = "h-6 px-2.5 rounded-full text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5 whitespace-nowrap";

/// Bandeau de l'accueil : le serveur officiel et les dernières actualités, qui défilent toutes
/// les 8 secondes. Le défilement se met en pause au survol.
export function HomeCarousel() {
  const { joinOfficial, preparingOfficial, officialProgress, launchingId, runningId } = useGameStore();
  const account = useAccountStore((s) => s.active());
  const { news, loadNews } = useCloudStore();
  const [server, setServer] = useState<Server | null>(null);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [modal, setModal] = useState(false);
  const [seen, setSeen] = useState(readSeen);

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
    const timer = setInterval(ping, PING_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [server]);

  useEffect(() => {
    loadNews();
    const timer = setInterval(loadNews, NEWS_MS);
    return () => clearInterval(timer);
  }, [loadNews]);

  const slides: Slide[] = [
    ...(server ? [{ type: "server" as const, server }] : []),
    ...news.slice(0, MAX_NEWS_SLIDES).map((item) => ({ type: "news" as const, item })),
  ];
  const count = slides.length;
  const current = slides[index % Math.max(count, 1)];

  // Défilement automatique. `index` est dans les dépendances : un clic sur un point relance les 8 s.
  useEffect(() => {
    if (count < 2 || hovered || modal || preparingOfficial) return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [count, hovered, modal, preparingOfficial, index]);

  if (!current) return null;

  const newest = news.length > 0 ? Math.max(...news.map((n) => n.id)) : 0;
  const unread = newest > seen;

  function showNews() {
    setModal(true);
    setSeen(newest);
    try {
      localStorage.setItem(SEEN_KEY, String(newest));
    } catch {
      // Stockage indisponible : la pastille « nouveau » reviendra au prochain démarrage.
    }
  }

  const busy = preparingOfficial || launchingId !== null || runningId !== null;
  const online = status?.online ?? false;

  return (
    <>
      <aside
        className="liquid relative rounded-[24px] w-[400px] max-w-full h-[168px] shrink-0 overflow-hidden"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Lueur d'accent en fond, comme l'image d'un bandeau. */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, var(--color-accent) 22%, transparent), transparent 60%)",
          }}
        />

        <div key={index % count} className="rise relative h-full p-5 flex flex-col justify-end gap-2">
          {current.type === "server" ? (
            <>
              {online && status?.favicon && (
                <img
                  src={status.favicon}
                  alt=""
                  className="absolute top-4 right-4 w-11 h-11 rounded-xl icon-tile"
                  style={{ imageRendering: "pixelated" }}
                />
              )}
              <div className="flex items-center gap-2">
                <span
                  className={`${TAG} bg-accent/15 text-accent border border-accent/40`}
                  title="Serveur officiel de Nexora Craft, mis en avant par le launcher"
                >
                  Pub · Serveur officiel
                </span>
                <span className={`${TAG} bg-fg/8 text-text-muted border border-border-strong`}>
                  {status === null ? (
                    "Connexion..."
                  ) : online ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                      {status.players_online} / {status.players_max} en ligne
                    </>
                  ) : (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-text-faint" /> Hors ligne
                    </>
                  )}
                </span>
              </div>
              <div className="min-w-0">
                <div className="text-xl font-bold truncate" style={{ fontFamily: "var(--font-display)" }}>
                  {current.server.name}
                </div>
                <div className="text-xs text-text-muted truncate">
                  {online && status?.motd ? status.motd.split("\n")[0] : current.server.address}
                </div>
              </div>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => joinOfficial(current.server.address)}
                  disabled={!account || busy}
                  title={
                    account
                      ? `Lance le jeu avec le pack de mods du serveur et rejoint ${current.server.address}`
                      : "Connecte un compte pour jouer"
                  }
                  className="btn btn-primary btn-sm btn-shine"
                >
                  {preparingOfficial ? <Spinner className="w-3.5 h-3.5" /> : <Icon name="play" filled className="w-3 h-3" />}
                  {preparingOfficial && officialProgress && officialProgress.total > 0
                    ? `Installation ${officialProgress.done} / ${officialProgress.total}`
                    : preparingOfficial
                      ? "Préparation"
                      : "Rejoindre"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className={`${TAG} bg-accent/15 text-accent border border-accent/40`}>
                  <Icon name={KINDS[current.item.kind].icon} className="w-3 h-3" />
                  {KINDS[current.item.kind].label}
                </span>
                <span className={`${TAG} bg-fg/8 text-text-muted border border-border-strong`}>
                  <Icon name="clock" className="w-3 h-3" />
                  {formatDate(current.item.published_at)}
                </span>
                {unread && <span className="w-2 h-2 rounded-full bg-accent animate-pulse" title="Nouveau" />}
              </div>
              <div className="min-w-0">
                <div className="text-xl font-bold truncate" style={{ fontFamily: "var(--font-display)" }}>
                  {current.item.title}
                </div>
                <div className="text-xs text-text-muted truncate">{current.item.body || "Actualité du launcher"}</div>
              </div>
              <div className="flex gap-2 mt-1">
                <button onClick={showNews} className="btn btn-primary btn-sm">
                  Lire
                </button>
                {isWebLink(current.item.link) && (
                  <button onClick={() => openUrl(current.item.link as string)} className="btn btn-secondary btn-sm">
                    Découvrir <Icon name="external" className="w-3 h-3" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {count > 1 && (
          <div className="absolute bottom-4 right-4 flex items-center gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                aria-label={`Page ${i + 1}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === index % count ? "w-5 bg-fg" : "w-1.5 bg-fg/30 hover:bg-fg/60"
                }`}
              />
            ))}
          </div>
        )}
      </aside>

      {modal && (
        <Modal onClose={() => setModal(false)} width={560}>
          <div className="eyebrow mb-2">Actualités</div>
          <h2 className="page-title mb-5">Quoi de neuf</h2>
          <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto -mr-2 pr-2">
            {news.map((item) => (
              <article key={item.id} className="row items-start !cursor-default">
                <div className="icon-tile w-9 h-9 rounded-[10px] flex items-center justify-center text-accent shrink-0">
                  <Icon name={KINDS[item.kind].icon} className="w-[18px] h-[18px]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-text-faint">
                    {KINDS[item.kind].label} · {formatDate(item.published_at)}
                    {item.pinned ? " · Épinglé" : ""}
                  </div>
                  <div className="font-semibold mt-0.5">{item.title}</div>
                  {item.body && (
                    <p className="text-sm text-text-muted leading-relaxed mt-1.5 whitespace-pre-line select-text">
                      {item.body}
                    </p>
                  )}
                  {isWebLink(item.link) && (
                    <button
                      onClick={() => openUrl(item.link as string)}
                      className="text-xs text-accent hover:underline inline-flex items-center gap-1 mt-2"
                    >
                      En savoir plus <Icon name="external" className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          <div className="flex justify-end mt-5">
            <button onClick={() => setModal(false)} className="btn btn-secondary">
              Fermer
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
