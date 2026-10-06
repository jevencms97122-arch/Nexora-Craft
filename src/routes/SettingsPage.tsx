import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../lib/api";
import type { Settings } from "../lib/types";
import { useBackgroundStore } from "../store/backgroundStore";

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const backgroundImage = useBackgroundStore((s) => s.image);
  const setBackgroundFromPath = useBackgroundStore((s) => s.setFromPath);
  const clearBackground = useBackgroundStore((s) => s.clear);

  useEffect(() => {
    api.getSettings().then(setSettings);
  }, []);

  async function handlePickBackground() {
    const path = await open({
      multiple: false,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (!path || Array.isArray(path)) return;
    setPickingImage(true);
    try {
      await setBackgroundFromPath(path);
    } finally {
      setPickingImage(false);
    }
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    try {
      await api.saveSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return <div className="p-6 text-text-muted text-sm">Chargement...</div>;
  }

  return (
    <div className="p-6 max-w-xl flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Paramètres</h1>

      <section>
        <h2 className="text-sm font-medium mb-2">Compte Microsoft</h2>
        <label className="block text-xs text-text-muted mb-1">Client ID Azure AD</label>
        <input
          value={settings.ms_client_id ?? ""}
          onChange={(e) => setSettings({ ...settings, ms_client_id: e.target.value })}
          placeholder="ex: 5a4c9d2e-..."
          className="w-full bg-panel-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <p className="text-xs text-text-muted mt-2 leading-relaxed">
          Crée une application gratuite sur{" "}
          <span className="text-accent">portal.azure.com</span> → Inscriptions d'applications →
          Nouvelle inscription → type de compte "Comptes personnels Microsoft uniquement" →
          plateforme "Mobile et applications de bureau" avec l'URI de redirection{" "}
          <code className="bg-panel-2 px-1 rounded">http://localhost:43110</code>. Aucun secret
          client n'est nécessaire.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-medium mb-2">Mémoire par défaut (nouvelles instances)</h2>
        <div className="flex gap-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">Min (Mo)</label>
            <input
              type="number"
              value={settings.default_min_ram_mb}
              onChange={(e) =>
                setSettings({ ...settings, default_min_ram_mb: Number(e.target.value) })
              }
              className="w-32 bg-panel-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Max (Mo)</label>
            <input
              type="number"
              value={settings.default_max_ram_mb}
              onChange={(e) =>
                setSettings({ ...settings, default_max_ram_mb: Number(e.target.value) })
              }
              className="w-32 bg-panel-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium mb-2">Image de fond (page Jouer)</h2>
        {backgroundImage ? (
          <div className="relative w-full max-w-sm rounded-2xl overflow-hidden border border-border mb-2">
            <img src={backgroundImage} alt="" className="w-full h-32 object-cover" />
          </div>
        ) : (
          <div className="w-full max-w-sm h-32 rounded-2xl border border-dashed border-border flex items-center justify-center text-xs text-text-muted mb-2">
            Aucune image sélectionnée
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={handlePickBackground}
            disabled={pickingImage}
            className="px-3 py-2 rounded-xl text-sm border border-border hover:border-accent/60 disabled:opacity-50"
          >
            {pickingImage ? "Chargement..." : "Choisir une image"}
          </button>
          {backgroundImage && (
            <button
              onClick={() => clearBackground()}
              className="px-3 py-2 rounded-xl text-sm text-text-muted hover:text-red-400"
            >
              Retirer
            </button>
          )}
        </div>
      </section>

      <button
        onClick={handleSave}
        disabled={saving}
        className="self-start px-4 py-2 rounded-full bg-accent hover:bg-accent-hover active:scale-[0.98] transition-all disabled:opacity-50 text-sm font-medium"
      >
        {saving ? "Enregistrement..." : saved ? "Enregistré ✓" : "Enregistrer"}
      </button>
    </div>
  );
}
