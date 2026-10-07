import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { ModrinthHit, ProjectVersion } from "../lib/types";
import { toast } from "../store/toastStore";
import { Icon, Modal, Spinner } from "./ui";

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
        iconUrl: hit.icon_url,
      });
      toast.success(`Modpack « ${instance.name} » installé`);
      onClose();
      navigate(`/instances/${instance.id}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setInstalling(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center gap-4 mb-5">
        {hit.icon_url ? (
          <img src={hit.icon_url} alt="" className="icon-tile w-14 h-14" />
        ) : (
          <div className="icon-tile w-14 h-14" />
        )}
        <div className="min-w-0">
          <div className="eyebrow mb-1">Modpack</div>
          <div className="section-title text-lg truncate">{hit.title}</div>
          <div className="text-xs text-text-muted">Une nouvelle instance sera créée</div>
        </div>
      </div>

      {!selectedVersion ? (
        loadingVersions ? (
          <div className="flex items-center gap-2 text-text-muted py-6 justify-center">
            <Spinner /> Chargement des versions...
          </div>
        ) : versions.length === 0 ? (
          <div className="text-sm text-text-muted py-6 text-center">Aucune version disponible.</div>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto -mx-1 px-1 stagger">
            {versions.map((v) => (
              <button key={v.id} onClick={() => setSelectedVersion(v)} className="row text-left hover:!border-accent/50">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{v.name || v.version_number}</div>
                  <div className="text-xs text-text-muted">{v.game_versions.slice(0, 3).join(", ")}</div>
                </div>
                <span className="badge">{v.version_number}</span>
              </button>
            ))}
          </div>
        )
      ) : (
        <div className="flex flex-col gap-4">
          <button onClick={() => setSelectedVersion(null)} className="row text-left">
            <Icon name="back" className="w-4 h-4 text-text-muted" />
            <div className="flex-1 text-sm">
              Version <span className="font-semibold text-accent">{selectedVersion.version_number}</span>
            </div>
            <span className="text-xs text-text-faint">Changer</span>
          </button>
          <div>
            <label className="label">Nom de l'instance</label>
            <input value={instanceName} onChange={(e) => setInstanceName(e.target.value)} className="input" />
          </div>
        </div>
      )}

      {error && <div className="alert-error mt-4">{error}</div>}

      <div className="flex justify-end gap-2 mt-6">
        <button onClick={onClose} className="btn btn-ghost">
          Annuler
        </button>
        {selectedVersion && (
          <button onClick={handleInstall} disabled={!instanceName.trim() || installing} className="btn btn-primary">
            {installing ? <Spinner /> : <Icon name="download" className="w-4 h-4" />}
            {installing ? "Installation" : "Créer l'instance"}
          </button>
        )}
      </div>
    </Modal>
  );
}
