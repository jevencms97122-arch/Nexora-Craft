import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "../lib/api";
import { formatBytes } from "../lib/format";
import type { CatalogSong, MusicDownloadProgress } from "../lib/types";
import { useMusicStore } from "../store/musicStore";
import { toast } from "../store/toastStore";
import { Dropdown, Icon, Spinner, Toggle } from "./ui";

/// Nombre de morceaux affichés d'un coup : la liste complète pèse sur l'affichage.
const PAGE = 60;

type View = "all" | "downloaded";

function Cover({ url, title }: { url: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div className="icon-tile w-11 h-11 flex items-center justify-center text-text-faint shrink-0">
        <Icon name="volume" className="w-5 h-5" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={`Pochette de ${title}`}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      className="w-11 h-11 rounded-xl object-cover shrink-0 bg-panel-2"
    />
  );
}

/// Catalogue Nexora Music : parcourir, télécharger, et choisir les morceaux que le launcher joue.
export function NexoraMusicLibrary() {
  const library = useMusicStore((s) => s.library);
  const gameMusic = useMusicStore((s) => s.gameMusic);
  const setGameMusic = useMusicStore((s) => s.setGameMusic);
  const loadTracks = useMusicStore((s) => s.loadTracks);

  const [catalog, setCatalog] = useState<CatalogSong[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("all");
  const [view, setView] = useState<View>("all");
  const [shown, setShown] = useState(PAGE);
  /// Téléchargements en cours : identifiant → avancement (0 à 1, ou -1 si la taille est inconnue).
  const [downloading, setDownloading] = useState<Record<string, number>>({});

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCatalog(await api.nexoraMusicCatalog());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
    loadTracks();
  }, [loadCatalog, loadTracks]);

  useEffect(() => {
    const unlisten = listen<MusicDownloadProgress>("music-download", (event) => {
      const { id, received, total } = event.payload;
      setDownloading((d) => (id in d ? { ...d, [id]: total > 0 ? received / total : -1 } : d));
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const local = useMemo(() => new Map(library.map((s) => [s.id, s])), [library]);

  // Le catalogue, plus les morceaux téléchargés qui n'y sont plus (retirés du serveur).
  const songs: CatalogSong[] = useMemo(() => {
    const base = catalog ?? [];
    const known = new Set(base.map((s) => s.id));
    const extra = library
      .filter((s) => !known.has(s.id))
      .map((s) => ({ id: s.id, title: s.title, artist: s.artist, genre: s.genre, cover_url: null }));
    return [...base, ...extra];
  }, [catalog, library]);

  const genres = useMemo(
    () => [...new Set(songs.map((s) => s.genre).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [songs],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return songs.filter((s) => {
      if (view === "downloaded" && !local.has(s.id)) return false;
      if (genre !== "all" && s.genre !== genre) return false;
      return !needle || `${s.title} ${s.artist} ${s.genre}`.toLowerCase().includes(needle);
    });
  }, [songs, query, genre, view, local]);

  useEffect(() => setShown(PAGE), [query, genre, view]);

  const enabledCount = library.filter((s) => s.enabled).length;
  const totalSize = library.reduce((sum, s) => sum + s.size_bytes, 0);

  async function handleDownload(song: CatalogSong) {
    setDownloading((d) => ({ ...d, [song.id]: 0 }));
    try {
      await api.downloadNexoraSong(song.id);
      await loadTracks();
      toast.success(`« ${song.title} » téléchargé`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setDownloading((d) => {
        const { [song.id]: _done, ...rest } = d;
        return rest;
      });
    }
  }

  async function handleRemove(song: CatalogSong) {
    try {
      await api.removeNexoraSong(song.id);
      await loadTracks();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function setEnabled(ids: string[], enabled: boolean) {
    try {
      await api.setNexoraSongsEnabled(ids, enabled);
      await loadTracks();
    } catch (e) {
      toast.error(String(e));
    }
  }

  const visible = filtered.slice(0, shown);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Nexora Music</h3>
          <p className="text-[11px] text-text-faint leading-relaxed mt-0.5">
            {catalog
              ? `${songs.length} morceaux · ${library.length} téléchargé${library.length > 1 ? "s" : ""}${
                  library.length > 0 ? ` (${formatBytes(totalSize)}) · ${enabledCount} dans le launcher` : ""
                }`
              : "Les musiques du launcher viennent de Nexora Music. Télécharge celles que tu veux entendre."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {library.length > 0 && (
            <>
              <button
                onClick={() => setEnabled(library.map((s) => s.id), true)}
                disabled={enabledCount === library.length}
                className="btn btn-ghost btn-sm"
              >
                Tout activer
              </button>
              <button onClick={() => setEnabled(library.map((s) => s.id), false)} disabled={enabledCount === 0} className="btn btn-ghost btn-sm">
                Tout désactiver
              </button>
            </>
          )}
          <button onClick={loadCatalog} disabled={loading} className="btn btn-secondary btn-sm" title="Recharger le catalogue">
            {loading ? <Spinner className="w-3.5 h-3.5" /> : <Icon name="refresh" className="w-3.5 h-3.5" />}
            Actualiser
          </button>
        </div>
      </div>

      {/* Musiques de Minecraft : retirées du launcher par défaut. */}
      <div className="row items-center gap-3 !cursor-default">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Musiques de Minecraft</div>
          <div className="text-[11px] text-text-faint leading-relaxed mt-0.5">
            {gameMusic
              ? "Les musiques du jeu sont mélangées à celles de Nexora Music."
              : "Retirées : le launcher ne joue que les morceaux de Nexora Music. Les fichiers du jeu ne sont pas touchés."}
          </div>
        </div>
        <button onClick={() => setGameMusic(!gameMusic)} className={`btn btn-sm ${gameMusic ? "btn-danger" : "btn-secondary"}`}>
          {gameMusic ? "Retirer les musiques de Minecraft" : "Les remettre"}
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Icon name="search" className="w-4 h-4 text-text-faint absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un titre, un artiste, un genre"
            className="input pl-9 h-10"
            aria-label="Rechercher dans Nexora Music"
          />
        </div>
        <Dropdown
          className="w-44"
          ariaLabel="Filtrer par genre"
          value={genre}
          onChange={setGenre}
          options={[{ value: "all", label: "Tous les genres" }, ...genres.map((g) => ({ value: g, label: g }))]}
        />
        <div className="grid grid-cols-2 rounded-xl bg-panel-2 border border-border-strong p-1 gap-1">
          {(
            [
              { value: "all", label: "Tous" },
              { value: "downloaded", label: `Téléchargés${library.length ? ` · ${library.length}` : ""}` },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setView(opt.value)}
              className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                view === opt.value ? "bg-accent text-accent-ink" : "text-text-muted hover:text-text"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="alert-error flex items-center gap-3">
          <span className="flex-1 min-w-0">{error}</span>
          <button onClick={loadCatalog} className="btn btn-secondary btn-sm shrink-0">
            Réessayer
          </button>
        </div>
      )}

      {loading && !catalog ? (
        <div className="text-sm text-text-muted flex items-center gap-2 py-6">
          <Spinner /> Chargement du catalogue...
        </div>
      ) : filtered.length === 0 && !error ? (
        <div className="empty-state py-8">
          <Icon name="volume" className="w-7 h-7 text-text-faint" />
          <p className="text-sm">{view === "downloaded" ? "Aucun morceau téléchargé." : "Aucun morceau ne correspond."}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[34rem] overflow-y-auto pr-1">
          {visible.map((song) => {
            const stored = local.get(song.id);
            const progress = downloading[song.id];
            const isDownloading = progress !== undefined;
            return (
              <div key={song.id} className={`row ${stored && !stored.enabled ? "opacity-60" : ""}`}>
                <Cover url={song.cover_url} title={song.title} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{song.title}</div>
                  <div className="text-[11px] text-text-faint truncate">
                    {song.artist}
                    {song.genre ? ` · ${song.genre}` : ""}
                    {stored ? ` · ${formatBytes(stored.size_bytes)}` : ""}
                  </div>
                </div>
                {isDownloading ? (
                  <div className="flex items-center gap-2 w-36 shrink-0">
                    <div className="flex-1 h-1.5 rounded-full bg-fg/10 overflow-hidden">
                      <div
                        className={`h-full bg-accent rounded-full transition-[width] duration-200 ${progress < 0 ? "w-1/3 animate-pulse" : ""}`}
                        style={progress >= 0 ? { width: `${Math.round(progress * 100)}%` } : undefined}
                      />
                    </div>
                    <span className="text-[11px] tabular-nums text-text-muted w-9 text-right">
                      {progress >= 0 ? `${Math.round(progress * 100)} %` : "..."}
                    </span>
                  </div>
                ) : stored ? (
                  <>
                    <span className="text-[11px] text-text-faint hidden sm:inline">Dans le launcher</span>
                    <Toggle
                      checked={stored.enabled}
                      onChange={(enabled) => setEnabled([song.id], enabled)}
                      label={stored.enabled ? "Ne plus jouer ce morceau" : "Jouer ce morceau"}
                    />
                    <button
                      onClick={() => handleRemove(song)}
                      className="btn btn-danger btn-sm w-8 p-0"
                      title="Supprimer le téléchargement"
                    >
                      <Icon name="trash" className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <button onClick={() => handleDownload(song)} className="btn btn-secondary btn-sm shrink-0">
                    <Icon name="download" className="w-3.5 h-3.5" /> Télécharger
                  </button>
                )}
              </div>
            );
          })}
          {filtered.length > shown && (
            <button onClick={() => setShown((n) => n + PAGE)} className="btn btn-ghost btn-sm self-center">
              Afficher plus ({filtered.length - shown} restants)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
