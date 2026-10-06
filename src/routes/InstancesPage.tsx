import { useEffect, useState } from "react";
import { CreateInstanceModal } from "../components/CreateInstanceModal";
import { InstanceCard } from "../components/InstanceCard";
import { useInstanceStore } from "../store/instanceStore";

export function InstancesPage() {
  const { instances, refresh, loading } = useInstanceStore();
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Instances</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-full bg-accent hover:bg-accent-hover active:scale-[0.98] transition-all text-sm font-medium"
        >
          + Créer une instance
        </button>
      </div>

      {loading && instances.length === 0 ? (
        <div className="text-text-muted text-sm">Chargement...</div>
      ) : instances.length === 0 ? (
        <div className="text-text-muted text-sm">
          Aucune instance. Crée-en une pour commencer à jouer.
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
          {instances.map((instance) => (
            <InstanceCard key={instance.id} instance={instance} />
          ))}
        </div>
      )}

      {showCreate && <CreateInstanceModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
