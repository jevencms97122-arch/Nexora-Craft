import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { InstalledContent, Instance } from "../lib/types";
import { useInstanceStore } from "../store/instanceStore";

const CONTENT_LABELS: Record<InstalledContent["content_type"], string> = {
  mod: "Mods",
  shader: "Shaders",
  resourcepack: "Packs de textures",
  datapack: "Datapacks",
  modpack: "Modpacks",
};

export function InstanceDetailPage() {
  const { instanceId } = useParams<{ instanceId: string }>();
  const navigate = useNavigate();
  const { instances, refresh, update, remove } = useInstanceStore();
  const [form, setForm] = useState<Instance | null>(null);
  const [content, setContent] = useState<InstalledContent[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const instance = instances.find((i) => i.id === instanceId);
    if (instance) setForm(instance);
  }, [instances, instanceId]);

  async function loadContent() {
    if (!instanceId) return;
    setContent(await api.listInstalledContent(instanceId));
  }

  useEffect(() => {
    loadContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId]);

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    try {
      await update(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveContent(projectId: string) {
    if (!instanceId) return;
    await api.removeContent(instanceId, projectId);
    await loadContent();
  }

  async function handleDeleteInstance() {
    if (!instanceId) return;
    await remove(instanceId);
    navigate("/instances");
  }

  if (!form) {
    return <div className="p-6 text-text-muted text-sm">Chargement...</div>;
  }

  return (
    <div className="p-6 max-w-2xl flex flex-col gap-6">
      <div>
        <Link to="/instances" className="text-xs text-text-muted hover:text-text">
          ← Instances
        </Link>
        <h1 className="text-xl font-semibold mt-1">
          {form.name}{" "}
          <span className="text-sm text-text-muted font-normal">
            ({form.mc_version} · {form.loader}
            {form.loader_version ? ` ${form.loader_version}` : ""})
          </span>
        </h1>
      </div>

      <section className="bg-panel-2 border border-border rounded-2xl p-4 flex flex-col gap-4">
        <h2 className="text-sm font-medium">Paramètres</h2>

        <div>
          <label className="block text-xs text-text-muted mb-1">Nom</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full bg-panel border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-xs text-text-muted mb-1">RAM min (Mo)</label>
            <input
              type="number"
              value={form.min_ram_mb}
              onChange={(e) => setForm({ ...form, min_ram_mb: Number(e.target.value) })}
              className="w-full bg-panel border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-text-muted mb-1">RAM max (Mo)</label>
            <input
              type="number"
              value={form.max_ram_mb}
              onChange={(e) => setForm({ ...form, max_ram_mb: Number(e.target.value) })}
              className="w-full bg-panel border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-xs text-text-muted mb-1">Largeur fenêtre</label>
            <input
              type="number"
              value={form.width}
              onChange={(e) => setForm({ ...form, width: Number(e.target.value) })}
              className="w-full bg-panel border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-text-muted mb-1">Hauteur fenêtre</label>
            <input
              type="number"
              value={form.height}
              onChange={(e) => setForm({ ...form, height: Number(e.target.value) })}
              className="w-full bg-panel border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-text-muted mb-1">Arguments JVM additionnels</label>
          <input
            value={form.jvm_args}
            onChange={(e) => setForm({ ...form, jvm_args: e.target.value })}
            placeholder="ex: -XX:+UseG1GC"
            className="w-full bg-panel border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-accent font-mono"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-full bg-accent hover:bg-accent-hover active:scale-[0.98] transition-all disabled:opacity-50 text-sm font-medium"
          >
            {saving ? "Enregistrement..." : saved ? "Enregistré ✓" : "Enregistrer"}
          </button>
          <button
            onClick={handleDeleteInstance}
            className="px-3 py-2 rounded-xl text-sm text-text-muted hover:text-red-400"
          >
            Supprimer l'instance
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-text-muted">Contenu installé</h2>
        {content.length === 0 ? (
          <div className="text-sm text-text-muted">
            Rien d'installé.{" "}
            <Link to="/content" className="text-accent underline">
              Parcourir Modrinth
            </Link>
          </div>
        ) : (
          (Object.keys(CONTENT_LABELS) as InstalledContent["content_type"][]).map((type) => {
            const items = content.filter((i) => i.content_type === type);
            if (items.length === 0) return null;
            return (
              <div key={type}>
                <div className="text-xs text-text-muted mb-1.5">{CONTENT_LABELS[type]}</div>
                <div className="flex flex-col gap-1.5">
                  {items.map((item) => (
                    <div
                      key={item.project_id}
                      className="flex items-center gap-3 bg-panel border border-border rounded-2xl p-2.5"
                    >
                      {item.icon_url ? (
                        <img src={item.icon_url} alt="" className="w-8 h-8 rounded-xl" />
                      ) : (
                        <div className="w-8 h-8 rounded-xl bg-panel-2" />
                      )}
                      <div className="flex-1 text-sm font-medium">{item.title}</div>
                      <button
                        onClick={() => handleRemoveContent(item.project_id)}
                        className="text-xs text-text-muted hover:text-red-400"
                      >
                        Retirer
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
