import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Loader, VersionEntry } from "../lib/types";
import { useInstanceStore } from "../store/instanceStore";
import { toast } from "../store/toastStore";
import { Dropdown, Icon, InstanceIcon, Modal, Spinner } from "./ui";

interface Props {
  onClose: () => void;
}

const LOADERS: { value: Loader; label: string; hint: string; available: boolean }[] = [
  { value: "vanilla", label: "Vanilla", hint: "Jeu de base", available: true },
  { value: "fabric", label: "Fabric", hint: "Léger, moderne", available: true },
  { value: "quilt", label: "Quilt", hint: "Fork de Fabric", available: true },
  { value: "forge", label: "Forge", hint: "Bientôt", available: false },
  { value: "neoforge", label: "NeoForge", hint: "Bientôt", available: false },
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
      toast.success(`Instance « ${name.trim()} » créée`);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal onClose={onClose} width={500}>
      <div className="flex items-center gap-4 mb-6">
        <InstanceIcon name={name || "N"} className="w-14 h-14 text-2xl" />
        <div>
          <div className="eyebrow mb-1">Nouvelle instance</div>
          <h2 className="section-title text-lg">Créer une instance</h2>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <div>
          <label className="label">Nom</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" autoFocus />
        </div>

        <div>
          <label className="label">Loader</label>
          <div className="grid grid-cols-3 gap-2">
            {LOADERS.map((l) => (
              <button
                key={l.value}
                type="button"
                disabled={!l.available}
                onClick={() => setLoader(l.value)}
                className={`relative px-3 py-2.5 rounded-xl border text-left transition-all ${
                  loader === l.value
                    ? "border-accent bg-accent/10 shadow-[0_0_20px_-6px_var(--color-accent)]"
                    : "border-border-strong bg-panel-2 hover:border-accent/40"
                } ${!l.available ? "opacity-35 cursor-not-allowed" : ""}`}
              >
                <div className={`text-sm font-semibold ${loader === l.value ? "text-accent" : ""}`}>{l.label}</div>
                <div className="text-[11px] text-text-faint">{l.hint}</div>
                {loader === l.value && (
                  <Icon name="check" className="w-3.5 h-3.5 text-accent absolute top-2.5 right-2.5" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="label mb-0">Version Minecraft</label>
            <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={showSnapshots}
                onChange={(e) => setShowSnapshots(e.target.checked)}
                className="accent-[var(--color-accent)]"
              />
              Snapshots
            </label>
          </div>
          {loadingVersions ? (
            <div className="input flex items-center gap-2 text-text-muted">
              <Spinner /> Chargement des versions...
            </div>
          ) : (
            <Dropdown
              placement="up"
              ariaLabel="Version Minecraft"
              value={version}
              onChange={setVersion}
              options={visibleVersions.map((v) => ({
                value: v.id,
                label: v.id,
                hint: v.type !== "release" ? "Snapshot" : undefined,
              }))}
            />
          )}
        </div>

        {error && <div className="alert-error">{error}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn btn-ghost">
            Annuler
          </button>
          <button onClick={handleCreate} disabled={creating || loadingVersions || !name.trim()} className="btn btn-primary">
            {creating ? <Spinner /> : <Icon name="plus" className="w-4 h-4" />}
            {creating ? "Création" : "Créer"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
