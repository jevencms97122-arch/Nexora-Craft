import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { ContentType, Instance, ModrinthHit, ProjectVersion } from "../lib/types";

interface Props {
  hit: ModrinthHit;
  contentType: ContentType;
  instances: Instance[];
  onClose: () => void;
  onInstalled: () => void;
}

function isCompatible(version: ProjectVersion, instance: Instance, contentType: ContentType): boolean {
  const versionOk = version.game_versions.includes(instance.mc_version);
  if (!versionOk) return false;
  // Seuls les mods dépendent directement du loader de l'instance (fabric/quilt/...).
  // Les shaders utilisent des tags comme "iris"/"canvas" (pas le loader lui-même),
  // et les resourcepacks/datapacks ne dépendent d'aucun loader.
  if (contentType !== "mod" || instance.loader === "vanilla") return true;
  return version.loaders.includes(instance.loader);
}

export function InstallToInstanceModal({ hit, contentType, instances, onClose, onInstalled }: Props) {
  const [selectedInstance, setSelectedInstance] = useState<Instance | null>(null);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedInstance) return;
    setLoadingVersions(true);
    setVersions([]);
    setSelectedVersionId(null);
    api
      .listContentVersions(hit.project_id)
      .then(setVersions)
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingVersions(false));
  }, [hit.project_id, selectedInstance]);

  const sortedVersions = useMemo(() => {
    if (!selectedInstance) return [];
    const compatible = versions.filter((v) => isCompatible(v, selectedInstance, contentType));
    const incompatible = versions.filter((v) => !isCompatible(v, selectedInstance, contentType));
    return [...compatible, ...incompatible];
  }, [versions, selectedInstance, contentType]);

  async function handleInstall() {
    if (!selectedInstance || !selectedVersionId) return;
    setInstalling(true);
    setError(null);
    try {
      await api.installContent({
        instanceId: selectedInstance.id,
        projectId: hit.project_id,
        versionId: selectedVersionId,
        title: hit.title,
        iconUrl: hit.icon_url,
        contentType,
      });
      onInstalled();
      onClose();
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
              {selectedInstance ? "Choisis la version à installer" : "Choisis l'instance"}
            </div>
          </div>
        </div>

        {!selectedInstance ? (
          <>
            {instances.length === 0 ? (
              <div className="text-sm text-text-muted mb-4">
                Aucune instance. Crée-en une d'abord depuis l'onglet Instances.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 mb-4 max-h-72 overflow-y-auto">
                {instances.map((instance) => (
                  <button
                    key={instance.id}
                    onClick={() => setSelectedInstance(instance)}
                    className="flex items-center justify-between px-3 py-2 rounded-xl border border-border hover:border-accent/60 text-sm text-left"
                  >
                    <div>
                      <div className="font-medium">{instance.name}</div>
                      <div className="text-xs text-text-muted">
                        {instance.mc_version} · {instance.loader}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <button
              onClick={() => {
                setSelectedInstance(null);
                setSelectedVersionId(null);
              }}
              className="text-xs text-text-muted hover:text-text mb-2"
            >
              ← Changer d'instance ({selectedInstance.name})
            </button>

            {loadingVersions ? (
              <div className="text-sm text-text-muted mb-4">Chargement des versions...</div>
            ) : sortedVersions.length === 0 ? (
              <div className="text-sm text-text-muted mb-4">Aucune version disponible.</div>
            ) : (
              <div className="flex flex-col gap-1.5 mb-4 max-h-64 overflow-y-auto">
                {sortedVersions.map((v) => {
                  const compatible = isCompatible(v, selectedInstance, contentType);
                  return (
                    <button
                      key={v.id}
                      onClick={() => compatible && setSelectedVersionId(v.id)}
                      disabled={!compatible}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl border text-sm text-left ${
                        !compatible
                          ? "border-border opacity-40 cursor-not-allowed"
                          : selectedVersionId === v.id
                            ? "border-accent bg-panel-2"
                            : "border-border hover:border-accent/40"
                      }`}
                    >
                      <div>
                        <div className="font-medium">{v.name || v.version_number}</div>
                        <div className="text-xs text-text-muted truncate max-w-[280px]">
                          {v.game_versions.slice(0, 4).join(", ")}
                          {v.game_versions.length > 4 ? "…" : ""}
                          {v.loaders.length > 0 ? ` · ${v.loaders.join(", ")}` : ""}
                        </div>
                      </div>
                      <span
                        className={`text-xs font-medium ${compatible ? "text-green-400" : "text-red-400"}`}
                      >
                        {compatible ? "✓" : "✗"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {error && <div className="text-sm text-red-400 mb-3">{error}</div>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-xl text-sm text-text-muted hover:text-text">
            Annuler
          </button>
          {selectedInstance && (
            <button
              onClick={handleInstall}
              disabled={!selectedVersionId || installing}
              className="px-4 py-2 rounded-full text-sm bg-accent hover:bg-accent-hover active:scale-[0.98] transition-all disabled:opacity-50 font-medium"
            >
              {installing ? "Installation..." : "Installer"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
