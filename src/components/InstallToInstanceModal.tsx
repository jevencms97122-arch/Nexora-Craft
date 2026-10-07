import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { ContentType, InstalledContent, Instance, ModrinthHit, ProjectVersion } from "../lib/types";
import { Icon, InstanceIcon, Modal, Spinner, loaderLabel } from "./ui";

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
  /// Dépendances installées en plus, affichées avant de fermer.
  const [installedDeps, setInstalledDeps] = useState<InstalledContent[] | null>(null);

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
      const result = await api.installContent({
        instanceId: selectedInstance.id,
        projectId: hit.project_id,
        versionId: selectedVersionId,
        title: hit.title,
        iconUrl: hit.icon_url,
        contentType,
      });
      onInstalled();
      if (result.dependencies.length > 0) setInstalledDeps(result.dependencies);
      else onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setInstalling(false);
    }
  }

  if (installedDeps) {
    return (
      <Modal onClose={onClose}>
        <div className="flex items-center gap-4 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-accent/12 text-accent flex items-center justify-center shrink-0">
            <Icon name="check" className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="eyebrow mb-1">Installé</div>
            <div className="section-title text-lg truncate">{hit.title}</div>
          </div>
        </div>
        <p className="text-sm text-text-muted mb-3">
          {installedDeps.length > 1
            ? `${installedDeps.length} mods dont il a besoin ont été installés automatiquement :`
            : "Un mod dont il a besoin a été installé automatiquement :"}
        </p>
        <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto -mx-1 px-1 stagger">
          {installedDeps.map((dep) => (
            <div key={dep.project_id} className="row">
              {dep.icon_url ? (
                <img src={dep.icon_url} alt="" className="icon-tile w-9 h-9" />
              ) : (
                <div className="icon-tile w-9 h-9" />
              )}
              <div className="flex-1 font-medium truncate">{dep.title}</div>
              <span className="badge">Dépendance</span>
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-6">
          <button onClick={onClose} className="btn btn-primary">
            Terminé
          </button>
        </div>
      </Modal>
    );
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
          <div className="eyebrow mb-1">{selectedInstance ? "Étape 2 / 2 · Version" : "Étape 1 / 2 · Instance"}</div>
          <div className="section-title text-lg truncate">{hit.title}</div>
        </div>
      </div>

      {!selectedInstance ? (
        instances.length === 0 ? (
          <div className="text-sm text-text-muted py-6 text-center">
            Aucune instance. Crée-en une d'abord depuis l'onglet Instances.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto -mx-1 px-1 stagger">
            {instances.map((instance) => (
              <button
                key={instance.id}
                onClick={() => setSelectedInstance(instance)}
                className="row text-left hover:!border-accent/50"
              >
                <InstanceIcon name={instance.name} icon={instance.icon} className="w-10 h-10 text-base" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{instance.name}</div>
                  <div className="text-xs text-text-muted">
                    {instance.mc_version} · {loaderLabel(instance.loader)}
                  </div>
                </div>
                <Icon name="back" className="w-4 h-4 rotate-180 text-text-faint" />
              </button>
            ))}
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3">
          <button
            onClick={() => {
              setSelectedInstance(null);
              setSelectedVersionId(null);
            }}
            className="row text-left"
          >
            <Icon name="back" className="w-4 h-4 text-text-muted" />
            <InstanceIcon name={selectedInstance.name} icon={selectedInstance.icon} className="w-8 h-8 text-sm" />
            <div className="flex-1 text-sm font-medium truncate">{selectedInstance.name}</div>
            <span className="text-xs text-text-faint">Changer</span>
          </button>

          {loadingVersions ? (
            <div className="flex items-center gap-2 text-text-muted py-6 justify-center">
              <Spinner /> Chargement des versions...
            </div>
          ) : sortedVersions.length === 0 ? (
            <div className="text-sm text-text-muted py-6 text-center">Aucune version disponible.</div>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto -mx-1 px-1 stagger">
              {sortedVersions.map((v) => {
                const compatible = isCompatible(v, selectedInstance, contentType);
                const selected = selectedVersionId === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => compatible && setSelectedVersionId(v.id)}
                    disabled={!compatible}
                    className={`row text-left ${
                      !compatible
                        ? "opacity-35 cursor-not-allowed"
                        : selected
                          ? "!border-accent !bg-accent/10"
                          : "hover:!border-accent/40"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{v.name || v.version_number}</div>
                      <div className="text-xs text-text-muted truncate">
                        {v.game_versions.slice(0, 4).join(", ")}
                        {v.game_versions.length > 4 ? "…" : ""}
                        {v.loaders.length > 0 ? ` · ${v.loaders.join(", ")}` : ""}
                      </div>
                    </div>
                    {compatible ? (
                      <span className={`badge ${selected ? "badge-accent" : ""}`}>
                        {selected ? "Choisie" : "Compatible"}
                      </span>
                    ) : (
                      <span className="badge text-danger!">Incompatible</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {error && <div className="alert-error mt-4">{error}</div>}

      <div className="flex justify-end gap-2 mt-6">
        <button onClick={onClose} className="btn btn-ghost">
          Annuler
        </button>
        {selectedInstance && (
          <button onClick={handleInstall} disabled={!selectedVersionId || installing} className="btn btn-primary">
            {installing ? <Spinner /> : <Icon name="download" className="w-4 h-4" />}
            {installing ? "Installation" : "Installer"}
          </button>
        )}
      </div>
    </Modal>
  );
}
