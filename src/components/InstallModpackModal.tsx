import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { ModrinthHit, ProjectVersion } from "../lib/types";

interface Props {
  hit: ModrinthHit;
  onClose: () => void;
}

export function InstallModpackModal({ hit, onClose }: Props) {
  const navigate = useNavigate();
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState<ProjectVersion | null>(null);
  const [instanceName, setInstanceName] = useState(hit.title);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listContentVersions(hit.project_id)
      .then(setVersions)
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingVersions(false));
  }, [hit.project_id]);

  async function handleInstall() {
    if (!selectedVersion || !instanceName.trim()) return;
    setInstalling(true);
    setError(null);
    try {
      const instance = await api.installModpack({
        projectId: hit.project_id,
        versionId: selectedVersion.id,
        instanceName: instanceName.trim(),
      });
      onClose();
      navigate(`/instances/${instance.id}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-panel border border-border rounded-xl w-[460px] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          {hit.icon_url ? (
            <img src={hit.icon_url} alt="" className="w-10 h-10 rounded-xl" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-panel-2" />
          )}
          <div>
            <div className="font-semibold">{hit.title}</div>
            <div className="text-xs text-text-muted">
              Ce modpack va créer une nouvelle instance
            </div>
          </div>
        </div>

        {!selectedVersion ? (
          <>
            {loadingVersions ? (
              <div className="text-sm text-text-muted mb-4">Chargement des versions...</div>
            ) : versions.length === 0 ? (
              <div className="text-sm text-text-muted mb-4">Aucune version disponible.</div>
            ) : (
              <div className="flex flex-col gap-1.5 mb-4 max-h-72 overflow-y-auto">
                {versions.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVersion(v)}
                    className="flex items-center justify-between px-3 py-2 rounded-xl border border-border hover:border-accent/60 text-sm text-left"
                  >
                    <div>
                      <div className="font-medium">{v.name || v.version_number}</div>
                      <div className="text-xs text-text-muted">
                        {v.game_versions.slice(0, 3).join(", ")}
                      </div>
                    </div>
                    <span className="text-xs text-text-muted">{v.version_number}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <button
              onClick={() => setSelectedVersion(null)}
              className="text-xs text-text-muted hover:text-text mb-3"
            >
              ← Changer de version ({selectedVersion.version_number})
            </button>

            <label className="block text-xs text-text-muted mb-1">Nom de l'instance</label>
            <input
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
              className="w-full mb-4 bg-panel-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </>
        )}

        {error && <div className="text-sm text-red-400 mb-3">{error}</div>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-xl text-sm text-text-muted hover:text-text">
            Annuler
          </button>
          {selectedVersion && (
            <button
              onClick={handleInstall}
              disabled={!instanceName.trim() || installing}
              className="px-4 py-2 rounded-full text-sm bg-accent hover:bg-accent-hover active:scale-[0.98] transition-all disabled:opacity-50 font-medium"
            >
              {installing ? "Création..." : "Créer l'instance"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
