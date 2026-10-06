import { useEffect, useMemo, useState } from "react";
import { InstallModpackModal } from "../components/InstallModpackModal";
import { InstallToInstanceModal } from "../components/InstallToInstanceModal";
import { api } from "../lib/api";
import type { ContentType, Favorite, ModrinthHit } from "../lib/types";
import { useInstanceStore } from "../store/instanceStore";

const TABS: { type: ContentType; label: string }[] = [
  { type: "mod", label: "Mods" },
  { type: "shader", label: "Shaders" },
  { type: "resourcepack", label: "Packs de textures" },
  { type: "datapack", label: "Datapacks" },
  { type: "modpack", label: "Modpacks" },
];

const FAVORITE_CATEGORIES: { value: ContentType | "all"; label: string }[] = [
  { value: "all", label: "Tout" },
  { value: "mod", label: "Mods" },
  { value: "shader", label: "Shaders" },
  { value: "resourcepack", label: "Packs de textures" },
  { value: "datapack", label: "Datapacks" },
  { value: "modpack", label: "Modpacks" },
];

const CONTENT_LABELS: Record<ContentType, string> = {
  mod: "Mods",
  shader: "Shaders",
  resourcepack: "Packs de textures",
  datapack: "Datapacks",
  modpack: "Modpacks",
};

export function ContentPage() {
  const { instances, refresh } = useInstanceStore();
  const [tab, setTab] = useState<ContentType | "favorites">("mod");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ModrinthHit[]>([]);
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
    } else {
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

  async function runSearch() {
    if (tab === "favorites") return;
    setSearching(true);
    setError(null);
    try {
      const res = await api.searchModrinth({ query, contentType: tab });
      setResults(res.hits);
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
    <div className="p-6 flex flex-col gap-5">
      <h1 className="text-xl font-semibold">Contenu Modrinth</h1>

      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.type}
            onClick={() => setTab(t.type)}
            className={`px-3 py-1.5 rounded-xl text-sm ${
              tab === t.type ? "bg-accent text-white" : "bg-panel-2 text-text-muted hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={() => setTab("favorites")}
          className={`px-3 py-1.5 rounded-xl text-sm flex items-center gap-1.5 ${
            tab === "favorites" ? "bg-accent text-white" : "bg-panel-2 text-text-muted hover:text-text"
          }`}
        >
          ★ Favoris
        </button>
      </div>

      {tab === "favorites" ? (
        <>
          <div className="flex gap-2 flex-wrap">
            {FAVORITE_CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => setFavoriteCategory(c.value)}
                className={`px-3 py-1.5 rounded-xl text-xs border ${
                  favoriteCategory === c.value
                    ? "border-accent text-text"
                    : "border-border text-text-muted hover:text-text"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {favorites.length === 0 ? (
            <div className="text-sm text-text-muted">Aucun favori pour l'instant.</div>
          ) : (
            (Object.keys(groupedFavorites) as ContentType[]).map((type) => {
              const items = groupedFavorites[type];
              if (items.length === 0) return null;
              return (
                <div key={type}>
                  <div className="text-xs text-text-muted mb-1.5">{CONTENT_LABELS[type]}</div>
                  <div className="flex flex-col gap-2">
                    {items.map((fav) => (
                      <div
                        key={fav.project_id}
                        className="flex items-center gap-3 bg-panel border border-border rounded-2xl p-3"
                      >
                        {fav.icon_url ? (
                          <img src={fav.icon_url} alt="" className="w-10 h-10 rounded-xl" />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-panel-2" />
                        )}
                        <div className="flex-1 text-sm font-medium">{fav.title}</div>
                        <button
                          onClick={() => api.removeFavorite(fav.project_id).then(setFavorites)}
                          className="text-accent text-lg"
                          title="Retirer des favoris"
                        >
                          ★
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
                          className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium bg-accent hover:bg-accent-hover"
                        >
                          Installer
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder={`Rechercher un ${TABS.find((t) => t.type === tab)?.label.toLowerCase()}...`}
              className="flex-1 bg-panel-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              onClick={runSearch}
              disabled={searching}
              className="px-4 py-2 rounded-full bg-accent hover:bg-accent-hover active:scale-[0.98] transition-all disabled:opacity-50 text-sm font-medium"
            >
              {searching ? "..." : "Rechercher"}
            </button>
          </div>

          {error && <div className="text-sm text-red-400">{error}</div>}

          <div className="flex flex-col gap-2">
            {results.map((hit) => (
              <div
                key={hit.project_id}
                className="flex items-center gap-3 bg-panel border border-border rounded-2xl p-3"
              >
                {hit.icon_url ? (
                  <img src={hit.icon_url} alt="" className="w-10 h-10 rounded-xl" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-panel-2" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{hit.title}</div>
                  <div className="text-xs text-text-muted truncate">{hit.description}</div>
                </div>
                <div className="text-xs text-text-muted shrink-0">
                  {hit.downloads.toLocaleString("fr-FR")} téléchargements
                </div>
                <button
                  onClick={() => toggleFavorite(hit, tab)}
                  className={`text-lg shrink-0 ${
                    favoriteIds.has(hit.project_id) ? "text-accent" : "text-text-muted hover:text-text"
                  }`}
                  title="Ajouter aux favoris"
                >
                  {favoriteIds.has(hit.project_id) ? "★" : "☆"}
                </button>
                <button
                  onClick={() => setSelectedHit(hit)}
                  className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium bg-accent hover:bg-accent-hover"
                >
                  Installer
                </button>
              </div>
            ))}
            {!searching && results.length === 0 && (
              <div className="text-sm text-text-muted">Aucun résultat.</div>
            )}
          </div>
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
            onInstalled={() => {}}
          />
        ))}
    </div>
  );
}
