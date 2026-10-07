import { useEffect, useMemo, useRef, useState } from "react";
import { InstallModpackModal } from "../components/InstallModpackModal";
import { InstallToInstanceModal } from "../components/InstallToInstanceModal";
import { Icon, PageHeader, Skeleton, Spinner } from "../components/ui";
import { api } from "../lib/api";
import type { ContentType, Favorite, ModrinthHit } from "../lib/types";
import { useInstanceStore } from "../store/instanceStore";
import { toast } from "../store/toastStore";

/// Nombre de résultats par page (fixé côté backend dans la requête Modrinth).
const PAGE_SIZE = 30;

const TABS: { type: ContentType; label: string }[] = [
  { type: "mod", label: "Mods" },
  { type: "shader", label: "Shaders" },
  { type: "resourcepack", label: "Packs de textures" },
  { type: "datapack", label: "Datapacks" },
  { type: "modpack", label: "Modpacks" },
];

const FAVORITE_CATEGORIES: { value: ContentType | "all"; label: string }[] = [
  { value: "all", label: "Tout" },
  ...TABS.map((t) => ({ value: t.type, label: t.label })),
];

const CONTENT_LABELS: Record<ContentType, string> = {
  mod: "Mods",
  shader: "Shaders",
  resourcepack: "Packs de textures",
  datapack: "Datapacks",
  modpack: "Modpacks",
};

function formatDownloads(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".0", "")} M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".0", "")} k`;
  return String(n);
}

export function ContentPage() {
  const { instances, refresh } = useInstanceStore();
  const [tab, setTab] = useState<ContentType | "favorites">("mod");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ModrinthHit[]>([]);
  /// Page affichée (à partir de 0) et nombre total de résultats de la recherche en cours.
  const [page, setPage] = useState(0);
  const [totalHits, setTotalHits] = useState(0);
  const topRef = useRef<HTMLDivElement>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedHit, setSelectedHit] = useState<ModrinthHit | null>(null);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [favoriteCategory, setFavoriteCategory] = useState<ContentType | "all">("all");

  useEffect(() => {
    refresh();
    api.listFavorites().then(setFavorites);
  }, [refresh]);

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.project_id)), [favorites]);

  async function toggleFavorite(hit: ModrinthHit, contentType: ContentType) {
    if (favoriteIds.has(hit.project_id)) {
      setFavorites(await api.removeFavorite(hit.project_id));
      toast.info(`${hit.title} retiré des favoris`);
    } else {
      toast.success(`${hit.title} ajouté aux favoris`);
      setFavorites(
        await api.addFavorite({
          projectId: hit.project_id,
          title: hit.title,
          iconUrl: hit.icon_url,
          contentType,
        }),
      );
    }
  }

  /// Lance la recherche et affiche la page demandée (la première par défaut).
  async function runSearch(pageIndex = 0) {
    if (tab === "favorites") return;
    setSearching(true);
    setError(null);
    try {
      const res = await api.searchModrinth({ query, contentType: tab, offset: pageIndex * PAGE_SIZE });
      setResults(res.hits);
      setTotalHits(res.total_hits);
      setPage(pageIndex);
      // En changeant de page, on remonte en haut de la liste.
      if (pageIndex !== page) topRef.current?.scrollIntoView({ block: "start" });
    } catch (e) {
      setError(String(e));
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    if (tab !== "favorites") runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const pageCount = Math.ceil(totalHits / PAGE_SIZE);

  const groupedFavorites = useMemo(() => {
    const filtered =
      favoriteCategory === "all" ? favorites : favorites.filter((f) => f.content_type === favoriteCategory);
    const groups: Record<ContentType, Favorite[]> = {
      mod: [],
      shader: [],
      resourcepack: [],
      datapack: [],
      modpack: [],
    };
    for (const f of filtered) groups[f.content_type].push(f);
    return groups;
  }, [favorites, favoriteCategory]);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Modrinth"
        title="Explorer"
        subtitle="Mods, shaders, packs de textures et modpacks, installés en un clic dans tes instances."
      />

      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button key={t.type} onClick={() => setTab(t.type)} className={`chip ${tab === t.type ? "chip-active" : ""}`}>
            {t.label}
          </button>
        ))}
        <span className="w-px bg-border mx-1" />
        <button onClick={() => setTab("favorites")} className={`chip ${tab === "favorites" ? "chip-active" : ""}`}>
          <Icon name="star" filled className="w-3.5 h-3.5" /> Favoris
          {favorites.length > 0 && <span className="opacity-70">{favorites.length}</span>}
        </button>
      </div>

      {tab === "favorites" ? (
        <>
          <div className="flex gap-1.5 flex-wrap">
            {FAVORITE_CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => setFavoriteCategory(c.value)}
                className={`btn btn-sm ${favoriteCategory === c.value ? "btn-secondary !border-accent/50 !text-accent" : "btn-ghost"}`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {favorites.length === 0 ? (
            <div className="empty-state">
              <Icon name="star" className="w-8 h-8 text-text-faint" />
              <div className="section-title text-text">Aucun favori</div>
              <p className="text-sm">Clique sur l'étoile d'un projet pour le retrouver ici.</p>
            </div>
          ) : (
            (Object.keys(groupedFavorites) as ContentType[]).map((type) => {
              const items = groupedFavorites[type];
              if (items.length === 0) return null;
              return (
                <section key={type} className="flex flex-col gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-faint">
                    {CONTENT_LABELS[type]} · {items.length}
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2 stagger">
                    {items.map((fav) => (
                      <div key={fav.project_id} className="row">
                        {fav.icon_url ? (
                          <img src={fav.icon_url} alt="" className="icon-tile" />
                        ) : (
                          <div className="icon-tile" />
                        )}
                        <div className="flex-1 font-medium truncate">{fav.title}</div>
                        <button
                          onClick={() => api.removeFavorite(fav.project_id).then(setFavorites)}
                          className="btn btn-ghost btn-sm w-8 p-0 !text-accent"
                          title="Retirer des favoris"
                        >
                          <Icon name="star" filled className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() =>
                            setSelectedHit({
                              project_id: fav.project_id,
                              slug: fav.project_id,
                              title: fav.title,
                              description: "",
                              icon_url: fav.icon_url,
                              downloads: 0,
                              project_type: fav.content_type,
                              categories: [],
                            })
                          }
                          className="btn btn-primary btn-sm"
                        >
                          <Icon name="download" className="w-3.5 h-3.5" /> Installer
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </>
      ) : (
        <>
          <div ref={topRef} className="flex gap-2 scroll-mt-6">
            <div className="relative flex-1">
              <Icon name="search" className="w-[18px] h-[18px] absolute left-4 top-1/2 -translate-y-1/2 text-text-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch(0)}
                placeholder={`Rechercher des ${TABS.find((t) => t.type === tab)?.label.toLowerCase()}...`}
                className="input h-12 pl-12 rounded-2xl text-[14px]"
              />
            </div>
            <button onClick={() => runSearch(0)} disabled={searching} className="btn btn-primary h-12 px-6 rounded-2xl">
              {searching ? <Spinner /> : "Rechercher"}
            </button>
          </div>

          {error && <div className="alert-error">{error}</div>}

          <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3 stagger">
            {results.map((hit) => {
              const fav = favoriteIds.has(hit.project_id);
              return (
                <div key={hit.project_id} className="card card-hover p-4 flex gap-4">
                  {hit.icon_url ? (
                    <img src={hit.icon_url} alt="" className="icon-tile w-16 h-16 rounded-2xl" />
                  ) : (
                    <div className="icon-tile w-16 h-16 rounded-2xl" />
                  )}
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="flex items-start gap-2">
                      <div className="font-semibold truncate flex-1">{hit.title}</div>
                      <button
                        onClick={() => toggleFavorite(hit, tab)}
                        className={`shrink-0 -mt-0.5 transition-colors ${fav ? "text-accent" : "text-text-faint hover:text-text"}`}
                        title={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
                      >
                        <Icon name="star" filled={fav} className="w-[18px] h-[18px]" />
                      </button>
                    </div>
                    <p className="text-xs text-text-muted line-clamp-2 mt-1 leading-relaxed">{hit.description}</p>
                    <div className="mt-auto pt-3 flex items-center gap-2">
                      <span className="text-[11px] text-text-faint flex items-center gap-1">
                        <Icon name="download" className="w-3.5 h-3.5" />
                        {formatDownloads(hit.downloads)}
                      </span>
                      {hit.categories.slice(0, 2).map((c) => (
                        <span key={c} className="badge normal-case tracking-normal">
                          {c}
                        </span>
                      ))}
                      <button onClick={() => setSelectedHit(hit)} className="btn btn-primary btn-sm ml-auto">
                        Installer
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {searching && results.length === 0 && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-[116px] !rounded-[20px]" />
              ))}
            </div>
          )}
          {!searching && results.length === 0 && <div className="text-text-muted">Aucun résultat.</div>}

          {pageCount > 1 && results.length > 0 && (
            <nav className="flex items-center justify-center gap-3 pt-2" aria-label="Pages de résultats">
              <button
                onClick={() => runSearch(page - 1)}
                disabled={searching || page === 0}
                className="btn btn-secondary"
              >
                <Icon name="back" className="w-4 h-4" /> Précédent
              </button>
              <span className="text-sm text-text-muted tabular-nums px-2">
                Page <span className="text-text font-semibold">{page + 1}</span> sur {pageCount.toLocaleString("fr-FR")}
              </span>
              <button
                onClick={() => runSearch(page + 1)}
                disabled={searching || page >= pageCount - 1}
                className="btn btn-primary"
              >
                {searching ? <Spinner /> : null}
                Suivant <Icon name="back" className="w-4 h-4 rotate-180" />
              </button>
            </nav>
          )}
        </>
      )}

      {selectedHit &&
        (tab === "modpack" || selectedHit.project_type === "modpack" ? (
          <InstallModpackModal hit={selectedHit} onClose={() => setSelectedHit(null)} />
        ) : (
          <InstallToInstanceModal
            hit={selectedHit}
            contentType={tab === "favorites" ? (selectedHit.project_type as ContentType) : tab}
            instances={instances}
            onClose={() => setSelectedHit(null)}
            onInstalled={() => toast.success(`${selectedHit.title} installé`)}
          />
        ))}
    </div>
  );
}
