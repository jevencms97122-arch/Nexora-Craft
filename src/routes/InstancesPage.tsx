import { useEffect, useMemo, useState } from "react";
import { CreateInstanceModal } from "../components/CreateInstanceModal";
import { InstanceCard } from "../components/InstanceCard";
import { ImportCodeModal } from "../components/ShareModals";
import { Icon, PageHeader, Skeleton } from "../components/ui";
import { formatPlaytime } from "../lib/format";
import { useInstanceStore } from "../store/instanceStore";

type View = "grid" | "list";
const VIEW_KEY = "nexora.instancesView";

function storedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

export function InstancesPage() {
  const { instances, refresh, loading } = useInstanceStore();
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<View>(storedView);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function changeView(next: View) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Préférence non mémorisée : sans conséquence.
    }
  }

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return instances;
    return instances.filter(
      (i) => i.name.toLowerCase().includes(q) || i.mc_version.includes(q) || i.loader.includes(q),
    );
  }, [instances, filter]);

  const totalPlaytime = instances.reduce((sum, i) => sum + (i.playtime_seconds ?? 0), 0);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Bibliothèque"
        title="Instances"
        subtitle={
          totalPlaytime >= 60 ? (
            <>
              Chaque instance a sa propre version, ses mods et ses mondes. Temps de jeu total :{" "}
              <span className="text-accent font-semibold">{formatPlaytime(totalPlaytime)}</span>.
            </>
          ) : (
            "Chaque instance a sa propre version, ses mods et ses mondes."
          )
        }
        actions={
          <>
            <button onClick={() => setShowImport(true)} className="btn btn-secondary">
              <Icon name="download" className="w-4 h-4" /> Importer un code
            </button>
            <button onClick={() => setShowCreate(true)} className="btn btn-primary">
              <Icon name="plus" className="w-4 h-4" /> Nouvelle instance
            </button>
          </>
        }
      />

      {instances.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Icon name="search" className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-faint" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrer par nom, version, loader..."
              className="input pl-10"
            />
          </div>
          <div className="flex rounded-xl bg-panel-2 border border-border-strong p-1 ml-auto" role="group" aria-label="Affichage">
            {(
              [
                { value: "grid", icon: "grid", label: "Grille" },
                { value: "list", icon: "list", label: "Liste" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                onClick={() => changeView(opt.value)}
                title={`Affichage en ${opt.label.toLowerCase()}`}
                aria-pressed={view === opt.value}
                className={`w-9 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  view === opt.value ? "bg-accent text-accent-ink" : "text-text-muted hover:text-text"
                }`}
              >
                <Icon name={opt.icon} className="w-4 h-4" />
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && instances.length === 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[212px] !rounded-[20px]" />
          ))}
        </div>
      ) : instances.length === 0 ? (
        <div className="empty-state">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mb-1">
            <Icon name="box" className="w-7 h-7" />
          </div>
          <div className="section-title text-text">Aucune instance</div>
          <p className="text-sm max-w-xs">Crée ta première instance pour choisir une version de Minecraft.</p>
          <button onClick={() => setShowCreate(true)} className="btn btn-primary mt-2">
            <Icon name="plus" className="w-4 h-4" /> Créer une instance
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="text-text-muted">Aucune instance ne correspond à « {filter} ».</div>
      ) : view === "list" ? (
        <div key="list" className="flex flex-col gap-2 stagger">
          {visible.map((instance) => (
            <InstanceCard key={instance.id} instance={instance} view="list" />
          ))}
        </div>
      ) : (
        <div key="grid" className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4 stagger">
          {visible.map((instance) => (
            <InstanceCard key={instance.id} instance={instance} />
          ))}
        </div>
      )}

      {showCreate && <CreateInstanceModal onClose={() => setShowCreate(false)} />}
      {showImport && <ImportCodeModal onClose={() => setShowImport(false)} />}
    </div>
  );
}
