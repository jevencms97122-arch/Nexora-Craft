import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ShareCodeModal } from "../components/ShareModals";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Icon,
  InstanceIcon,
  LoaderBadge,
  ProgressBar,
  Spinner,
  Toggle,
  imageSrc,
  instanceBanner,
  progressPercent,
} from "../components/ui";
import { api } from "../lib/api";
import { formatPlaytime, formatRam, normalizeRam } from "../lib/format";
import type { ContentUpdate, InstalledContent, Instance } from "../lib/types";
import { useGameStore } from "../store/gameStore";
import { useInstanceStore } from "../store/instanceStore";
import { toast } from "../store/toastStore";

const CONTENT_LABELS: Record<InstalledContent["content_type"], string> = {
  mod: "Mods",
  shader: "Shaders",
  resourcepack: "Packs de textures",
  datapack: "Datapacks",
  modpack: "Modpacks",
};

function NumberField({ label, value, onChange, suffix }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="input pr-12" />
        {suffix && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-text-faint">{suffix}</span>
        )}
      </div>
    </div>
  );
}

/// Champs du formulaire que le joueur modifie lui-même.
const EDITABLE = ["name", "min_ram_mb", "max_ram_mb", "width", "height", "jvm_args"] as const;

export function InstanceDetailPage() {
  const { instanceId } = useParams<{ instanceId: string }>();
  const navigate = useNavigate();
  const { instances, refresh, update, remove } = useInstanceStore();
  const { launch, launchingId, runningId, progress } = useGameStore();
  const [form, setForm] = useState<Instance | null>(null);
  const [content, setContent] = useState<InstalledContent[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [updates, setUpdates] = useState<ContentUpdate[]>([]);
  const [checking, setChecking] = useState(false);
  /// Identifiant du contenu en cours de mise à jour, ou "all" pour tous.
  const [updating, setUpdating] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // La liste des instances est relue souvent (fin de partie, installation d'un contenu...). Ce
  // que le joueur est en train de modifier dans le formulaire ne doit pas être remplacé par les
  // valeurs enregistrées : seuls les champs qu'il n'a pas touchés suivent la liste.
  const [saved_, setSaved_] = useState<Instance | null>(null);
  useEffect(() => {
    const instance = instances.find((i) => i.id === instanceId);
    if (!instance) return;
    setForm((prev) => {
      if (!prev || prev.id !== instance.id || !saved_) return instance;
      const next = { ...instance };
      for (const field of EDITABLE) {
        if (prev[field] !== saved_[field]) (next as Record<string, unknown>)[field] = prev[field];
      }
      return next;
    });
    setSaved_(instance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances, instanceId]);

  /// Vrai si le formulaire contient des modifications pas encore enregistrées.
  const dirty = !!form && !!saved_ && EDITABLE.some((field) => form[field] !== saved_[field]);

  async function loadContent() {
    if (!instanceId) return;
    setContent(await api.listInstalledContent(instanceId));
  }

  async function checkUpdates() {
    if (!instanceId) return;
    setChecking(true);
    try {
      setUpdates(await api.checkContentUpdates(instanceId));
    } catch (e) {
      setContentError(String(e));
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    setUpdates([]);
    loadContent().then(checkUpdates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId]);

  /// Met à jour un contenu, ou tous si aucun identifiant n'est donné.
  async function handleUpdate(projectId?: string) {
    if (!instanceId) return;
    setUpdating(projectId ?? "all");
    setContentError(null);
    try {
      const count = await api.updateContent(instanceId, projectId);
      await loadContent();
      await checkUpdates();
      toast.success(count > 1 ? `${count} contenus mis à jour` : count === 1 ? "Contenu mis à jour" : "Tout est déjà à jour");
    } catch (e) {
      setContentError(String(e));
    } finally {
      setUpdating(null);
    }
  }

  async function handleToggle(projectId: string, enabled: boolean) {
    if (!instanceId) return;
    setContentError(null);
    try {
      setContent(await api.setContentEnabled(instanceId, projectId, enabled));
      const title = content.find((c) => c.project_id === projectId)?.title ?? "Contenu";
      toast.info(`${title} ${enabled ? "activé" : "désactivé"}`);
    } catch (e) {
      setContentError(String(e));
    }
  }

  /// Enregistre le formulaire. Retourne faux si l'enregistrement a échoué.
  async function handleSave(): Promise<boolean> {
    if (!form) return false;
    setSaving(true);
    try {
      const max = normalizeRam(form.max_ram_mb);
      const cleaned = { ...form, max_ram_mb: max, min_ram_mb: Math.min(normalizeRam(form.min_ram_mb), max) };
      setForm(cleaned);
      setSaved_(cleaned);
      await update(cleaned);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success(`Paramètres enregistrés (mémoire : ${formatRam(max)})`);
      return true;
    } catch (e) {
      toast.error(String(e));
      return false;
    } finally {
      setSaving(false);
    }
  }

  /// Lance le jeu ; des réglages modifiés mais pas encore enregistrés le sont d'abord, pour que
  /// la partie démarre bien avec ce qui est affiché.
  async function handlePlay() {
    if (!form) return;
    if (dirty && !(await handleSave())) return;
    launch(form.id);
  }

  async function handleRemoveContent(projectId: string) {
    if (!instanceId) return;
    const title = content.find((c) => c.project_id === projectId)?.title;
    await api.removeContent(instanceId, projectId);
    await loadContent();
    toast.success(title ? `${title} supprimé` : "Contenu supprimé");
  }

  /// Choisit (ou retire, avec `pick` à faux) l'icône ou la bannière de l'instance.
  async function handleImage(kind: "icon" | "banner", pick: boolean) {
    if (!instanceId) return;
    let path: string | null = null;
    if (pick) {
      const chosen = await open({
        multiple: false,
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
      });
      if (!chosen || Array.isArray(chosen)) return;
      path = chosen;
    }
    try {
      const updated = await api.setInstanceImage(instanceId, kind, path);
      setForm((prev) => (prev ? { ...prev, icon: updated.icon, banner: updated.banner } : prev));
      await refresh();
      toast.success(
        kind === "icon" ? (pick ? "Icône mise à jour" : "Icône retirée") : pick ? "Bannière mise à jour" : "Bannière retirée",
      );
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function handleDeleteInstance() {
    if (!instanceId) return;
    await remove(instanceId);
    toast.success("Instance supprimée");
    navigate("/instances");
  }

  if (!form) {
    return (
      <div className="page text-text-muted flex-row items-center">
        <Spinner /> Chargement...
      </div>
    );
  }

  const isRunning = runningId === form.id;
  const isLaunching = launchingId === form.id && !isRunning;
  const percent = isLaunching ? progressPercent(progress) : null;

  return (
    <div className="flex flex-col">
      {/* Bannière */}
      <div className="relative h-56 shrink-0 overflow-hidden" style={instanceBanner(form)}>
        {!imageSrc(form.banner) && <div className="absolute inset-0 grid-pattern opacity-70" />}
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/45 to-transparent" />
        <div className="absolute inset-x-0 bottom-0">
        <div className="w-full max-w-[1360px] mx-auto box-border px-9 pb-6 flex items-end justify-between gap-6">
          <div className="min-w-0 flex items-end gap-4">
            <InstanceIcon name={form.name} icon={form.icon} className="w-20 h-20 text-3xl !rounded-2xl shadow-xl" />
            <div className="min-w-0">
            <Link
              to="/instances"
              className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text mb-2 transition-colors"
            >
              <Icon name="back" className="w-3.5 h-3.5" /> Instances
            </Link>
            <h1 className="page-title truncate">{form.name}</h1>
            <div className="flex gap-1.5 mt-3 flex-wrap">
              <span className="badge badge-accent">{form.mc_version}</span>
              <span className="badge">
                <LoaderBadge loader={form.loader} />
                {form.loader_version && <span className="ml-1.5">{form.loader_version}</span>}
              </span>
              <span className="badge">{content.length} contenu{content.length > 1 ? "s" : ""}</span>
              <span className="badge">
                <Icon name="clock" className="w-3 h-3 mr-1" />
                {formatPlaytime(form.playtime_seconds)}
              </span>
            </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 w-56">
            <button
              onClick={handlePlay}
              disabled={isLaunching || isRunning}
              className="btn btn-primary h-12 px-8 rounded-2xl text-[15px] font-extrabold uppercase tracking-wider w-full"
            >
              {isRunning ? "En jeu" : isLaunching ? <><Spinner /> Lancement</> : <><Icon name="play" filled className="w-4 h-4" /> Jouer</>}
            </button>
            {isLaunching && (
              <div className="w-full">
                <ProgressBar value={percent} />
                <div className="text-[11px] text-text-muted mt-1 truncate">{progress?.stage ?? "Préparation..."}</div>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      <div className="page pt-6 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
        {/* Contenu installé */}
        <section className="flex flex-col gap-4 min-w-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="section-title flex items-center gap-2">
              Contenu installé
              {updates.length > 0 && (
                <span className="badge badge-accent">
                  {updates.length} mise{updates.length > 1 ? "s" : ""} à jour
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              {updates.length > 0 ? (
                <button onClick={() => handleUpdate()} disabled={updating !== null} className="btn btn-primary btn-sm">
                  {updating === "all" ? <Spinner className="w-3.5 h-3.5" /> : <Icon name="arrowUp" className="w-3.5 h-3.5" />}
                  Tout mettre à jour
                </button>
              ) : (
                content.length > 0 && (
                  <button onClick={checkUpdates} disabled={checking} className="btn btn-ghost btn-sm">
                    {checking ? <Spinner className="w-3.5 h-3.5" /> : <Icon name="refresh" className="w-3.5 h-3.5" />}
                    {checking ? "Vérification" : "À jour"}
                  </button>
                )
              )}
              <Link to="/content" className="btn btn-secondary btn-sm">
                <Icon name="plus" className="w-3.5 h-3.5" /> Ajouter
              </Link>
            </div>
          </div>
          {contentError && <div className="alert-error">{contentError}</div>}
          {content.length === 0 ? (
            <div className="empty-state py-10">
              <Icon name="compass" className="w-8 h-8 text-text-faint" />
              <p className="text-sm">Aucun mod ni pack installé.</p>
              <Link to="/content" className="btn btn-primary btn-sm mt-1">
                Explorer Modrinth
              </Link>
            </div>
          ) : (
            (Object.keys(CONTENT_LABELS) as InstalledContent["content_type"][]).map((type) => {
              const items = content.filter((i) => i.content_type === type);
              if (items.length === 0) return null;
              return (
                <div key={type} className="flex flex-col gap-2 stagger">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-faint">
                    {CONTENT_LABELS[type]} · {items.length}
                  </div>
                  {items.map((item) => {
                    const update = updates.find((u) => u.project_id === item.project_id);
                    return (
                      <div key={item.project_id} className={`row group ${item.disabled ? "opacity-55" : ""}`}>
                        {item.icon_url ? (
                          <img src={item.icon_url} alt="" className={`icon-tile w-10 h-10 ${item.disabled ? "grayscale" : ""}`} />
                        ) : (
                          <div className="icon-tile w-10 h-10" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{item.title}</div>
                          {item.disabled ? (
                            <div className="text-[11px] text-text-faint">Désactivé</div>
                          ) : (
                            update && (
                              <div className="text-[11px] text-accent truncate">
                                Nouvelle version : {update.latest_version_number}
                              </div>
                            )
                          )}
                        </div>
                        {update && (
                          <button
                            onClick={() => handleUpdate(item.project_id)}
                            disabled={updating !== null}
                            className="btn btn-secondary btn-sm"
                            title={`Mettre à jour vers ${update.latest_version_number}`}
                          >
                            {updating === item.project_id || updating === "all" ? (
                              <Spinner className="w-3.5 h-3.5" />
                            ) : (
                              <Icon name="arrowUp" className="w-3.5 h-3.5" />
                            )}
                            Mettre à jour
                          </button>
                        )}
                        <button
                          onClick={() => handleRemoveContent(item.project_id)}
                          className="btn btn-danger btn-sm w-8 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                          title="Supprimer"
                        >
                          <Icon name="trash" className="w-4 h-4" />
                        </button>
                        <Toggle
                          checked={!item.disabled}
                          onChange={(enabled) => handleToggle(item.project_id, enabled)}
                          label={item.disabled ? "Activer" : "Désactiver"}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </section>

        {/* Paramètres */}
        <aside className="card p-5 flex flex-col gap-4">
          <h2 className="section-title flex items-center gap-2">
            <Icon name="settings" className="w-4 h-4 text-accent" /> Paramètres
          </h2>

          <div>
            <label className="label">Nom</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumberField label={`RAM min (${formatRam(form.min_ram_mb)})`} suffix="Mo" value={form.min_ram_mb} onChange={(v) => setForm({ ...form, min_ram_mb: v })} />
            <NumberField label={`RAM max (${formatRam(form.max_ram_mb)})`} suffix="Mo" value={form.max_ram_mb} onChange={(v) => setForm({ ...form, max_ram_mb: v })} />
            <div className="col-span-2 flex items-center gap-1.5 flex-wrap -mt-1">
              <span className="text-[11px] text-text-faint mr-1">Mémoire max :</span>
              {[2, 4, 6, 8, 12].map((gb) => (
                <button
                  key={gb}
                  onClick={() => setForm({ ...form, max_ram_mb: gb * 1024, min_ram_mb: Math.min(form.min_ram_mb, gb * 1024) })}
                  className={`chip !h-7 ${form.max_ram_mb === gb * 1024 ? "chip-active" : ""}`}
                >
                  {gb} Go
                </button>
              ))}
            </div>
            <NumberField label="Largeur" suffix="px" value={form.width} onChange={(v) => setForm({ ...form, width: v })} />
            <NumberField label="Hauteur" suffix="px" value={form.height} onChange={(v) => setForm({ ...form, height: v })} />
          </div>

          <div>
            <label className="label">Arguments JVM</label>
            <input
              value={form.jvm_args}
              onChange={(e) => setForm({ ...form, jvm_args: e.target.value })}
              placeholder="-XX:+UseG1GC"
              className="input font-mono text-xs"
            />
          </div>

          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saving ? <Spinner /> : saved ? <Icon name="check" className="w-4 h-4" /> : null}
            {saving ? "Enregistrement" : saved ? "Enregistré" : dirty ? "Enregistrer les modifications" : "Enregistrer"}
          </button>

          <div className="border-t border-border pt-4 flex flex-col gap-2">
            <div className="label mb-0">Apparence</div>
            {(
              [
                { kind: "icon", label: "Icône", current: form.icon },
                { kind: "banner", label: "Bannière", current: form.banner },
              ] as const
            ).map((img) => (
              <div key={img.kind} className="flex items-center gap-2">
                <button onClick={() => handleImage(img.kind, true)} className="btn btn-secondary btn-sm flex-1">
                  <Icon name="image" className="w-3.5 h-3.5" />
                  {img.current ? `Changer ${img.kind === "icon" ? "l'icône" : "la bannière"}` : `Choisir une ${img.label.toLowerCase()}`}
                </button>
                {img.current && (
                  <button
                    onClick={() => handleImage(img.kind, false)}
                    className="btn btn-ghost btn-sm w-8 p-0"
                    title={`Retirer ${img.kind === "icon" ? "l'icône" : "la bannière"}`}
                  >
                    <Icon name="refresh" className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button onClick={() => setShowShare(true)} className="btn btn-secondary">
            <Icon name="share" className="w-4 h-4" /> Partager par code
          </button>

          <div className="border-t border-border pt-4">
            {confirmDelete ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-text-muted">Supprimer définitivement cette instance et ses mondes ?</p>
                <div className="flex gap-2">
                  <button onClick={handleDeleteInstance} className="btn btn-danger-solid btn-sm flex-1">
                    Supprimer
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="btn btn-secondary btn-sm flex-1">
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="btn btn-danger btn-sm w-full">
                <Icon name="trash" className="w-4 h-4" /> Supprimer l'instance
              </button>
            )}
          </div>
        </aside>
      </div>

      {showShare && <ShareCodeModal instance={form} onClose={() => setShowShare(false)} />}
    </div>
  );
}
