import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { RemoteSkin } from "../lib/types";
import { SkinCanvas } from "./AccountSkin";
import { Icon, Skeleton, Spinner } from "./ui";

interface Props {
  variant: "classic" | "slim";
  onApply: (skin: RemoteSkin) => Promise<void>;
  busy: boolean;
}

/// Sélecteur de skins en ligne: recherche par pseudo (API Mojang) et galerie récente (MineSkin).
export function SkinBrowser({ variant, onApply, busy }: Props) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<RemoteSkin | null>(null);
  const [searching, setSearching] = useState(false);
  const [gallery, setGallery] = useState<RemoteSkin[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore(after: string | null) {
    setLoading(true);
    try {
      const page = await api.browseSkins(after);
      setGallery((prev) => (after ? [...prev, ...page.skins] : page.skins));
      setNext(page.next);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMore(null);
  }, []);

  async function handleSearch() {
    if (!query.trim()) return;
    setError(null);
    setFound(null);
    setSearching(true);
    try {
      setFound(await api.lookupPlayerSkin(query.trim()));
    } catch (e) {
      setError(String(e));
    } finally {
      setSearching(false);
    }
  }

  function card(skin: RemoteSkin, useOwnVariant: boolean, label?: string) {
    return (
      <button
        key={skin.url}
        onClick={() => onApply({ ...skin, variant: useOwnVariant ? skin.variant : variant })}
        disabled={busy}
        className="group relative row flex-col !gap-2 !py-3 disabled:opacity-50 overflow-hidden"
        title="Appliquer ce skin"
      >
        <div className="absolute bottom-10 w-16 h-4 rounded-[50%] bg-accent/0 group-hover:bg-accent/30 blur-md transition-colors" />
        <SkinCanvas src={skin.url} mode="body" className="relative h-28 transition-transform group-hover:-translate-y-1" />
        <span className="text-[11px] font-semibold text-text-faint group-hover:text-accent transition-colors">
          {label ?? "Appliquer"}
        </span>
      </button>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="eyebrow mb-1.5">En ligne</div>
          <h2 className="section-title text-lg">Trouver un skin en ligne</h2>
        </div>
        <div className="flex gap-2 w-full max-w-md">
          <div className="relative flex-1">
            <Icon name="search" className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Pseudo d'un joueur (ex: Dream)"
              className="input pl-10"
            />
          </div>
          <button onClick={handleSearch} disabled={!query.trim() || searching} className="btn btn-secondary">
            {searching ? <Spinner /> : "Chercher"}
          </button>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {found && (
        <div className="flex items-center gap-4">
          <div className="w-32">{card(found, true, query.trim())}</div>
          <p className="text-xs text-text-muted">Clique pour appliquer le skin de ce joueur.</p>
        </div>
      )}

      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-faint">
        Skins récents · galerie MineSkin
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3 stagger">
        {gallery.map((s) => card(s, false))}
        {loading && gallery.length === 0 && [0, 1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} className="h-[168px] !rounded-[20px]" />)}
      </div>
      {next && (
        <button onClick={() => loadMore(next)} disabled={loading} className="btn btn-secondary self-center">
          {loading ? <Spinner /> : null}
          {loading ? "Chargement" : "Voir plus"}
        </button>
      )}
    </section>
  );
}
