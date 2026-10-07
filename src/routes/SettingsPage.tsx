import { useEffect, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-dialog";
import { Dropdown, Icon, PageHeader, Spinner, Toggle, type IconName } from "../components/ui";
import { setStatsEnabled, statsEnabled } from "../lib/telemetry";
import { api } from "../lib/api";
import type { Settings } from "../lib/types";
import { useBackgroundStore } from "../store/backgroundStore";
import { toast } from "../store/toastStore";
import { RANDOM, useMusicStore, type Repeat } from "../store/musicStore";
import { useUpdateStore } from "../store/updateStore";
import { ACCENT_PRESETS, DEFAULT_ACCENT, THEME_PRESETS, hexToHsl, hslToHex, useThemeStore } from "../store/themeStore";

function SettingsSection({ icon, title, description, children }: {
  icon: IconName;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card p-6 grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6">
      <div>
        <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-3">
          <Icon name={icon} className="w-5 h-5" />
        </div>
        <h2 className="section-title">{title}</h2>
        {description && <p className="text-xs text-text-muted mt-1.5 leading-relaxed">{description}</p>}
      </div>
      <div className="flex flex-col gap-3 min-w-0">{children}</div>
    </section>
  );
}

const REPEAT_OPTIONS: { value: Repeat; label: string; hint: string }[] = [
  { value: "once", label: "Une seule fois", hint: "Un morceau à l'ouverture du launcher, puis le silence." },
  { value: "loop", label: "En boucle", hint: "Les morceaux s'enchaînent sans interruption." },
  { value: "pause", label: "Avec une pause", hint: "Un silence entre deux morceaux, comme dans Minecraft." },
];

function MusicSettings() {
  const music = useMusicStore();
  const TRACKS = music.tracks;

  if (TRACKS.length === 0) {
    return (
      <div className="row items-start max-w-md !cursor-default">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Pas encore de musique</div>
          <div className="text-[11px] text-text-faint leading-relaxed mt-0.5">
            Le launcher joue les musiques de Minecraft, qui se téléchargent avec le jeu. Lance une instance une
            première fois : elles apparaîtront ici.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md flex flex-col gap-3">
      <div className="row items-start">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Musique d'ambiance</div>
          <div className="text-[11px] text-text-faint leading-relaxed mt-0.5">
            {music.enabled && music.current
              ? `${music.playing ? "En lecture" : "En pause"} : ${music.current.name}`
              : "Joue tant que la fenêtre du launcher est au premier plan."}
          </div>
        </div>
        <Toggle checked={music.enabled} onChange={music.setEnabled} label="Musique d'ambiance" />
      </div>

      {music.enabled && (
        <>
          <div>
            <div className="flex items-center justify-between">
              <label className="label">Volume</label>
              <span className="text-xs text-text-muted tabular-nums">{music.volume} %</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={music.volume}
              onChange={(e) => music.setVolume(Number(e.target.value))}
              className="w-full accent-[var(--color-accent)]"
              aria-label="Volume de la musique"
            />
          </div>

          <div>
            <label className="label">Morceau</label>
            <div className="flex gap-2">
              <Dropdown
                className="flex-1 min-w-0"
                ariaLabel="Choisir le morceau"
                value={music.track}
                onChange={music.setTrack}
                options={[
                  { value: RANDOM, label: "Aléatoire", hint: "Un morceau différent à chaque fois" },
                  ...TRACKS.map((t) => ({ value: t.id, label: t.name })),
                ]}
              />
              {music.track === RANDOM && TRACKS.length > 1 && (
                <button onClick={music.skip} className="btn btn-secondary" title="Jouer un autre morceau maintenant">
                  <Icon name="refresh" className="w-4 h-4" /> Suivant
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="label">Répétition</label>
            <div className="flex flex-col gap-2">
              {REPEAT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => music.setRepeat(opt.value)}
                  className={`row items-start text-left ${music.repeat === opt.value ? "!border-accent/50 !bg-accent/5" : ""}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-[11px] text-text-faint leading-relaxed mt-0.5">{opt.hint}</div>
                  </div>
                  {music.repeat === opt.value && <Icon name="check" className="w-4 h-4 text-accent mt-0.5" />}
                </button>
              ))}
            </div>
          </div>

          {music.repeat === "pause" && (
            <div>
              <label className="label">Durée de la pause</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={music.pauseMinutes}
                  onChange={(e) => music.setPauseMinutes(Number(e.target.value))}
                  className="input w-24"
                  aria-label="Minutes de pause entre deux morceaux"
                />
                <span className="text-sm text-text-muted">minutes entre deux morceaux</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const backgroundImage = useBackgroundStore((s) => s.image);
  const setBackgroundFromPath = useBackgroundStore((s) => s.setFromPath);
  const clearBackground = useBackgroundStore((s) => s.clear);
  const {
    theme,
    setTheme,
    animated,
    setAnimated,
    accent,
    setAccent,
    sceneMode,
    setSceneMode,
    weather,
    setWeather,
    sounds,
    setSounds,
    applyPreset,
  } = useThemeStore();

  const update = useUpdateStore();
  const [stats, setStats] = useState(statsEnabled);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    api.getSettings().then(setSettings);
    getVersion().then(setAppVersion).catch(() => {});
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
      toast.success("Réglages enregistrés");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return (
      <div className="page text-text-muted flex-row items-center">
        <Spinner /> Chargement...
      </div>
    );
  }

  return (
    <div className="page max-w-5xl">
      <PageHeader
        eyebrow="Préférences"
        title="Réglages"
        actions={
          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saving ? <Spinner /> : saved ? <Icon name="check" className="w-4 h-4" /> : null}
            {saving ? "Enregistrement" : saved ? "Enregistré" : "Enregistrer"}
          </button>
        }
      />

      <SettingsSection
        icon={theme === "dark" ? "moon" : "sun"}
        title="Apparence"
        description="Choisis un thème tout fait, ou règle chaque détail en dessous."
      >
        <div className="flex flex-col gap-2">
          <span className="label mb-0">Thèmes</span>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
            {THEME_PRESETS.map((preset) => {
              const active =
                preset.theme === theme &&
                preset.accent.toLowerCase() === accent.toLowerCase() &&
                preset.sceneMode === sceneMode &&
                preset.weather === weather;
              return (
                <button
                  key={preset.id}
                  onClick={() => {
                    applyPreset(preset);
                    toast.info(`Thème ${preset.name} appliqué`);
                  }}
                  aria-pressed={active}
                  className={`rounded-2xl overflow-hidden text-left border transition-all ${
                    active
                      ? "border-accent shadow-[0_0_24px_-8px_var(--color-accent)]"
                      : "border-border-strong hover:border-accent/50"
                  }`}
                >
                  <div
                    className="h-12 relative"
                    style={{
                      background:
                        preset.theme === "dark"
                          ? "linear-gradient(180deg,#060918,#202c58)"
                          : "linear-gradient(180deg,#4a90e2,#cfe8ff)",
                    }}
                  >
                    <span
                      className="absolute left-3 bottom-2 w-7 h-7 rounded-lg border border-white/30"
                      style={{ background: preset.accent, boxShadow: `0 4px 14px -2px ${preset.accent}` }}
                    />
                    {active && <Icon name="check" className="absolute right-2.5 top-2.5 w-4 h-4 text-white" />}
                  </div>
                  <div className="px-3 py-2 bg-panel">
                    <div className="text-sm font-semibold">{preset.name}</div>
                    <div className="text-[11px] text-text-faint leading-snug">{preset.hint}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <span className="label mb-0 mt-2">Mode</span>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          {(
            [
              { value: "dark", label: "Nuit", hint: "Thème sombre", icon: "moon" },
              { value: "light", label: "Jour", hint: "Thème clair", icon: "sun" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={`relative rounded-2xl overflow-hidden text-left border transition-all ${
                theme === opt.value
                  ? "border-accent shadow-[0_0_24px_-8px_var(--color-accent)]"
                  : "border-border-strong hover:border-accent/50"
              }`}
            >
              <div
                className="h-16"
                style={{
                  background:
                    opt.value === "dark"
                      ? "linear-gradient(180deg,#060918,#202c58 70%,#2b4a2a 70%)"
                      : "linear-gradient(180deg,#4a90e2,#b6deff 70%,#64a838 70%)",
                }}
              />
              <div className="px-3 py-2.5 flex items-center gap-2 bg-panel">
                <Icon name={opt.icon} className="w-4 h-4 text-accent" />
                <div>
                  <div className="text-sm font-semibold">{opt.label}</div>
                  <div className="text-[11px] text-text-faint">{opt.hint}</div>
                </div>
                {theme === opt.value && <Icon name="check" className="w-4 h-4 text-accent ml-auto" />}
              </div>
            </button>
          ))}
        </div>
        <div className="max-w-md flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="label mb-0">Couleur principale</span>
            {accent !== DEFAULT_ACCENT && (
              <button onClick={() => setAccent(DEFAULT_ACCENT)} className="text-[11px] text-text-faint hover:text-accent transition-colors">
                Réinitialiser (rouge)
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {ACCENT_PRESETS.map((p) => {
              const selected = p.color.toLowerCase() === accent.toLowerCase();
              return (
                <button
                  key={p.color}
                  onClick={() => setAccent(p.color)}
                  title={p.name}
                  aria-label={p.name}
                  aria-pressed={selected}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-transform hover:scale-110 ${
                    selected ? "ring-2 ring-offset-2 ring-offset-transparent ring-fg/80 scale-110" : ""
                  }`}
                  style={{
                    background: `linear-gradient(180deg, rgba(255,255,255,0.35), transparent 55%), ${p.color}`,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.5), 0 4px 14px -4px ${p.color}`,
                  }}
                >
                  {selected && <Icon name="check" className="w-4 h-4 text-white drop-shadow" />}
                </button>
              );
            })}
          </div>
          <div>
            <input
              type="range"
              min={0}
              max={359}
              value={Math.round(hexToHsl(accent).h)}
              onChange={(e) => setAccent(hslToHex({ h: Number(e.target.value), s: 88, l: 60 }))}
              className="hue-slider"
              aria-label="Teinte personnalisée"
            />
            <p className="text-[11px] text-text-faint mt-1.5">
              Glisse pour choisir une teinte personnalisée. Boutons, liens et lueurs suivent cette couleur.
            </p>
          </div>
        </div>

        <div className="max-w-md flex flex-col gap-2">
          <span className="label mb-0">Scène et sons</span>
          {[
            {
              label: "Suivre l'heure réelle",
              hint: "Lever de soleil le matin, plein jour, coucher de soleil, puis nuit, selon l'heure de ton ordinateur. Sinon : nuit en mode sombre, jour en mode clair.",
              checked: sceneMode === "realtime",
              onChange: (v: boolean) => setSceneMode(v ? "realtime" : "theme"),
            },
            {
              label: "Météo",
              hint: "De la pluie de temps en temps, et de la neige en hiver.",
              checked: weather,
              onChange: setWeather,
            },
            {
              label: "Son de confirmation",
              hint: "Un petit son quand une action réussit (enregistrement, installation, copie...).",
              checked: sounds,
              onChange: setSounds,
            },
            {
              label: "Statistiques anonymes",
              hint: "Signale une fois par jour que le launcher a été ouvert, avec sa version. Aucun pseudo ni donnée personnelle.",
              checked: stats,
              onChange: (v: boolean) => {
                setStatsEnabled(v);
                setStats(v);
              },
            },
            {
              label: "Animer la scène",
              hint: "Feu, fumée, chien, étoiles. Mise en pause automatiquement pendant une partie.",
              checked: animated,
              onChange: setAnimated,
            },
          ].map((opt) => (
            <div key={opt.label} className="row items-start">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{opt.label}</div>
                <div className="text-[11px] text-text-faint leading-relaxed mt-0.5">{opt.hint}</div>
              </div>
              <Toggle checked={opt.checked} onChange={opt.onChange} label={opt.label} />
            </div>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        icon="volume"
        title="Musique"
        description="Une musique d'ambiance dans le launcher. Elle se coupe toute seule quand tu passes sur une autre fenêtre (le jeu, par exemple) et reprend à ton retour."
      >
        <MusicSettings />
      </SettingsSection>

      <SettingsSection
        icon="download"
        title="Mises à jour"
        description="Le launcher vérifie à chaque démarrage si une nouvelle version est publiée."
      >
        <div className="row max-w-md">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Nexora Craft {appVersion ?? ""}</div>
            <div className="text-[11px] text-text-faint mt-0.5">
              {update.status === "checking"
                ? "Vérification en cours..."
                : update.status === "available"
                  ? `Version ${update.version} disponible`
                  : update.status === "downloading"
                    ? "Téléchargement de la mise à jour..."
                    : update.status === "uptodate"
                      ? "Tu as la dernière version."
                      : update.status === "error"
                        ? "Vérification impossible pour le moment."
                        : "Version installée"}
            </div>
          </div>
          {update.status === "available" ? (
            <button onClick={update.install} className="btn btn-primary btn-sm">
              <Icon name="download" className="w-3.5 h-3.5" /> Mettre à jour
            </button>
          ) : (
            <button
              onClick={() => update.checkForUpdate(true)}
              disabled={update.status === "checking" || update.status === "downloading"}
              className="btn btn-secondary btn-sm"
            >
              {update.status === "checking" ? <Spinner className="w-3.5 h-3.5" /> : <Icon name="refresh" className="w-3.5 h-3.5" />}
              Vérifier
            </button>
          )}
        </div>
        {update.status === "error" && update.error && <div className="alert-error max-w-md">{update.error}</div>}
      </SettingsSection>

      <SettingsSection
        icon="cpu"
        title="Mémoire par défaut"
        description="Appliquée aux nouvelles instances. Modifiable ensuite instance par instance."
      >
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <div>
            <label className="label">Minimum</label>
            <div className="relative">
              <input
                type="number"
                value={settings.default_min_ram_mb}
                onChange={(e) => setSettings({ ...settings, default_min_ram_mb: Number(e.target.value) })}
                className="input pr-12"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-text-faint">Mo</span>
            </div>
          </div>
          <div>
            <label className="label">Maximum</label>
            <div className="relative">
              <input
                type="number"
                value={settings.default_max_ram_mb}
                onChange={(e) => setSettings({ ...settings, default_max_ram_mb: Number(e.target.value) })}
                className="input pr-12"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-text-faint">Mo</span>
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        icon="image"
        title="Fond d'écran personnalisé"
        description="Remplace la scène Minecraft animée par ton image. Retire-la pour revenir à la scène."
      >
        <div className="relative w-full max-w-md aspect-[16/7] rounded-2xl overflow-hidden border border-border-strong bg-panel-2">
          {backgroundImage ? (
            <img src={backgroundImage} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-xs text-text-faint grid-pattern">
              <Icon name="image" className="w-6 h-6" />
              Aucune image
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={handlePickBackground} disabled={pickingImage} className="btn btn-secondary">
            {pickingImage ? <Spinner /> : <Icon name="upload" className="w-4 h-4" />}
            {pickingImage ? "Chargement" : "Choisir une image"}
          </button>
          {backgroundImage && (
            <button onClick={() => clearBackground()} className="btn btn-danger">
              <Icon name="trash" className="w-4 h-4" /> Retirer
            </button>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}
