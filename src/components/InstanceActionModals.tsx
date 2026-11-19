import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Instance, Loader, VersionEntry } from "../lib/types";
import { useInstanceStore } from "../store/instanceStore";
import { toast } from "../store/toastStore";
import { LOADERS } from "./CreateInstanceModal";
import { Dropdown, Icon, Modal, Spinner } from "./ui";

/// Copie une instance : réglages, mods, configuration, et au choix les mondes.
export function DuplicateInstanceModal({ instance, onClose, onDone }: {
  instance: Instance;
  onClose: () => void;
  /// Reçoit la copie une fois créée.
  onDone: (copy: Instance) => void;
}) {
  const refresh = useInstanceStore((s) => s.refresh);
  const [name, setName] = useState(`${instance.name} (copie)`);
  const [withWorlds, setWithWorlds] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDuplicate() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const copy = await api.duplicateInstance(instance.id, name.trim(), withWorlds);
      await refresh();
      toast.success(`« ${copy.name} » créée`);
      onDone(copy);
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  return (
    <Modal onClose={busy ? () => {} : onClose} width={460}>
      <div className="eyebrow mb-1">Instance</div>
      <h2 className="section-title text-lg mb-5">Dupliquer « {instance.name} »</h2>
      <div className="flex flex-col gap-4">
        <div>
          <label className="label">Nom de la copie</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" autoFocus />
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={withWorlds}
            onChange={(e) => setWithWorlds(e.target.checked)}
            className="accent-[var(--color-accent)] mt-1"
          />
          <span>
            <span className="text-sm font-medium">Copier aussi les mondes</span>
            <span className="block text-[11px] text-text-faint leading-relaxed">
              Pratique pour tester une version ou des mods sans risquer ta partie. Plus long si les mondes sont gros.
            </span>
          </span>
        </label>
        {error && <div className="alert-error">{error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="btn btn-ghost">
            Annuler
          </button>
          <button onClick={handleDuplicate} disabled={busy || !name.trim()} className="btn btn-primary">
            {busy ? <Spinner /> : <Icon name="copy" className="w-4 h-4" />}
            {busy ? "Copie en cours" : "Dupliquer"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/// Change la version de Minecraft et/ou le loader d'une instance qui existe déjà.
export function ChangeVersionModal({ instance, onClose, onDone }: {
  instance: Instance;
  onClose: () => void;
  onDone: () => void;
}) {
  const refresh = useInstanceStore((s) => s.refresh);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(instance.mc_version);
  const [loader, setLoader] = useState<Loader>(instance.loader);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listMcVersions()
      .then((manifest) => setVersions(manifest.versions))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const visible = versions.filter((v) =>
    v.id === instance.mc_version || (showSnapshots ? v.type === "release" || v.type === "snapshot" : v.type === "release"),
  );
  const changed = version !== instance.mc_version || loader !== instance.loader;

  async function handleApply() {
    setBusy(true);
    setError(null);
    try {
      await api.changeInstanceVersion(instance.id, version, loader);
      await refresh();
      toast.success(`Instance passée en ${version}. Tes mondes ont été sauvegardés avant.`);
      onDone();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  return (
    <Modal onClose={busy ? () => {} : onClose} width={500}>
      <div className="eyebrow mb-1">Instance</div>
      <h2 className="section-title text-lg mb-5">Changer la version de « {instance.name} »</h2>
      <div className="flex flex-col gap-5">
        <div>
          <label className="label">Loader</label>
          <div className="grid grid-cols-3 gap-2">
            {LOADERS.map((l) => (
              <button
                key={l.value}
                type="button"
                onClick={() => setLoader(l.value)}
                className={`relative px-3 py-2.5 rounded-xl border text-left transition-all ${
                  loader === l.value
                    ? "border-accent bg-accent/10 shadow-[0_0_20px_-6px_var(--color-accent)]"
                    : "border-border-strong bg-panel-2 hover:border-accent/40"
                }`}
              >
                <div className={`text-sm font-semibold ${loader === l.value ? "text-accent" : ""}`}>{l.label}</div>
                <div className="text-[11px] text-text-faint">{l.hint}</div>
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
          {loading ? (
            <div className="input flex items-center gap-2 text-text-muted">
              <Spinner /> Chargement des versions...
            </div>
          ) : (
            <Dropdown
              placement="up"
              ariaLabel="Version Minecraft"
              value={version}
              onChange={setVersion}
              options={visible.map((v) => ({
                value: v.id,
                label: v.id,
                hint: v.id === instance.mc_version ? "Version actuelle" : v.type !== "release" ? "Snapshot" : undefined,
              }))}
            />
          )}
        </div>

        <div className="rounded-xl border border-border-strong bg-panel-2 px-3.5 py-3 text-[11px] text-text-muted leading-relaxed flex gap-2.5">
          <Icon name="alert" className="w-4 h-4 shrink-0 text-accent mt-px" />
          <div>
            Tes mondes sont sauvegardés automatiquement avant le changement. Les mods installés ne sont pas
            forcément compatibles avec la nouvelle version : la liste des contenus te proposera ensuite les mises
            à jour disponibles. Un monde ouvert dans une version plus ancienne que celle où il a été joué peut être abîmé.
          </div>
        </div>

        {error && <div className="alert-error">{error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="btn btn-ghost">
            Annuler
          </button>
          <button onClick={handleApply} disabled={busy || loading || !changed} className="btn btn-primary">
            {busy ? <Spinner /> : <Icon name="check" className="w-4 h-4" />}
            {busy ? "Sauvegarde et changement" : "Appliquer"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
