import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Loader, VersionEntry } from "../lib/types";
import { useInstanceStore } from "../store/instanceStore";

interface Props {
  onClose: () => void;
}

const LOADERS: { value: Loader; label: string; available: boolean }[] = [
  { value: "vanilla", label: "Vanilla", available: true },
  { value: "fabric", label: "Fabric", available: true },
  { value: "quilt", label: "Quilt", available: true },
  { value: "forge", label: "Forge (bientôt)", available: false },
  { value: "neoforge", label: "NeoForge (bientôt)", available: false },
];

export function CreateInstanceModal({ onClose }: Props) {
  const { create } = useInstanceStore();
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const [loader, setLoader] = useState<Loader>("vanilla");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listMcVersions()
      .then((manifest) => {
        setVersions(manifest.versions);
        setVersion(manifest.latest.release);
        setName(`Nouvelle instance ${manifest.latest.release}`);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingVersions(false));
  }, []);

  const visibleVersions = versions.filter((v) =>
    showSnapshots ? v.type === "release" || v.type === "snapshot" : v.type === "release",
  );

  async function handleCreate() {
    if (!name.trim() || !version) return;
    setCreating(true);
    setError(null);
    try {
      await create({ name: name.trim(), mc_version: version, loader });
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-panel border border-border rounded-xl w-[420px] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4">Créer une instance</h2>

        <label className="block text-xs text-text-muted mb-1">Nom</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full mb-4 bg-panel-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-accent"
        />

        <label className="block text-xs text-text-muted mb-1">Loader</label>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {LOADERS.map((l) => (
            <button
              key={l.value}
              type="button"
              disabled={!l.available}
              onClick={() => setLoader(l.value)}
              className={`px-2 py-2 rounded-xl text-xs border transition-colors ${
                loader === l.value
                  ? "border-accent bg-panel-2 text-text"
                  : "border-border text-text-muted hover:text-text"
              } ${!l.available ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              {l.label}
            </button>
          ))}
        </div>

        <label className="block text-xs text-text-muted mb-1">Version Minecraft</label>
        {loadingVersions ? (
          <div className="text-sm text-text-muted mb-4">Chargement des versions...</div>
        ) : (
          <select
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            className="w-full mb-2 bg-panel-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {visibleVersions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.id} {v.type !== "release" ? `(${v.type})` : ""}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-2 text-xs text-text-muted mb-4 select-none">
          <input
            type="checkbox"
            checked={showSnapshots}
            onChange={(e) => setShowSnapshots(e.target.checked)}
          />
          Afficher les snapshots
        </label>

        {error && <div className="text-sm text-red-400 mb-3">{error}</div>}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-xl text-sm text-text-muted hover:text-text"
          >
            Annuler
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || loadingVersions}
            className="px-4 py-2 rounded-full text-sm bg-accent hover:bg-accent-hover active:scale-[0.98] transition-all disabled:opacity-50 font-medium"
          >
            {creating ? "Création..." : "Créer"}
          </button>
        </div>
      </div>
    </div>
  );
}
