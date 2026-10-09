import { useEffect, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-dialog";
import { Dropdown, Icon, PageHeader, Spinner, Toggle, type IconName } from "../components/ui";
import { BIOMES } from "../components/MinecraftScene";
import { formatRam, normalizeRam } from "../lib/format";
import { setStatsEnabled, statsEnabled } from "../lib/telemetry";
import { api } from "../lib/api";
import type { Settings } from "../lib/types";
import { useBackgroundStore } from "../store/backgroundStore";
import { toast } from "../store/toastStore";
import { RANDOM, useMusicStore, type Repeat } from "../store/musicStore";
import { useUpdateStore } from "../store/updateStore";
import { ACCENT_PRESETS, DEFAULT_ACCENT, THEME_PRESETS, hexToHsl, hslToHex, useThemeStore } from "../store/themeStore";

const MEMORY_FIELDS: {
  key: "default_max_ram_mb" | "default_min_ram_mb";
  title: string;
  hint: string;
  presets: number[];
}[] = [
  {
    key: "default_max_ram_mb",
    title: "Mémoire maximale",
    hint: "Le plafond que le jeu peut utiliser. 4 à 8 Go conviennent à la plupart des packs de mods.",
    presets: [2, 4, 6, 8, 12, 16],
  },
  {
    key: "default_min_ram_mb",
    title: "Mémoire minimale",
    hint: "Réservée dès le démarrage du jeu. 1 Go suffit presque toujours.",
    presets: [1, 2, 4],
  },
];

/// Catégories de la page, dans l'ordre d'affichage : elles alimentent la barre d'accès rapide.
const SECTIONS: { id: string; title: string; icon: IconName }[] = [
  { id: "apparence", title: "Apparence", icon: "palette" },
  { id: "musique", title: "Musique", icon: "volume" },
  { id: "mises-a-jour", title: "Mises à jour", icon: "download" },
  { id: "memoire", title: "Mémoire", icon: "cpu" },
  { id: "fond", title: "Fond d'écran", icon: "image" },
];

function SettingsSection({ id, icon, title, description, children, below, aside, align = "center" }: {
  id: string;
  icon: IconName;
  title: string;
  description?: ReactNode;
  /// Ce qui tient à côté du titre.
  children: ReactNode;
  /// La suite : elle passe sous le titre et occupe toute la largeur de la carte, au lieu de
  /// laisser un grand vide dans la colonne de gauche.
  below?: ReactNode;
  /// Réglage placé dans la colonne de gauche, sous le descriptif.
  aside?: ReactNode;
  /// Position du contenu face au titre : en haut, au milieu ou en bas.
  align?: "start" | "center" | "end";
}) {
  return (
    <section id={id} className="scroll-mt-20 card p-6 grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)] gap-6">
      <div>
        <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-3">
          <Icon name={icon} className="w-5 h-5" />
        </div>
        <h2 className="section-title">{title}</h2>
        {description && <p className="text-xs text-text-muted mt-1.5 leading-relaxed">{description}</p>}
        {aside && <div className="mt-4 empty:hidden">{aside}</div>}
      </div>
      {/* Centré en hauteur face au titre : un contenu plus court que lui ne reste pas collé en haut. */}
      <div className={`flex flex-col gap-3 min-w-0 ${align === "end" ? "justify-end" : align === "start" ? "justify-start" : "justify-center"}`}>{children}</div>
      {below !== undefined && <div className="col-span-full flex flex-col gap-5 min-w-0 empty:hidden">{below}</div>}
    </section>
  );
}

const REPEAT_OPTIONS: { value: Repeat; label: string; hint: string }[] = [
  { value: "once", label: "Une seule fois", hint: "Un morceau à l'ouverture du launcher, puis le silence." },
  { value: "loop", label: "En boucle", hint: "Les morceaux s'enchaînent sans interruption." },
  { value: "pause", label: "Avec une pause", hint: "Un silence entre deux morceaux, comme dans Minecraft." },
];

function MusicSettings({ part }: { part: "bar" | "track" | "repeat" }) {
  const music = useMusicStore();
  const TRACKS = music.tracks;

  if (TRACKS.length === 0) {
    if (part !== "bar") return null;
    return (
      <div className="row items-start !cursor-default">
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

  const repeat = REPEAT_OPTIONS.find((opt) => opt.value === music.repeat) ?? REPEAT_OPTIONS[0];
  const status = !music.enabled
    ? "Désactivée"
    : music.otherMedia
      ? "En retrait : un autre média joue sur ton PC"
      : music.current
      ? `${music.playing ? "En lecture" : "En pause"} : ${music.current.name}`
      : "Joue tant que la fenêtre du launcher est au premier plan.";

  const bar = (
    <>
      {/* Bandeau : état, volume et interrupteur sur une seule ligne. */}
      <div className="row items-center gap-x-6 gap-y-3 flex-wrap !cursor-default">
        <div className="flex items-center gap-3 flex-1 min-w-[220px]">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              music.enabled ? "bg-accent/15 text-accent" : "bg-fg/5 text-text-faint"
            }`}
          >
            <Icon name="volume" className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium">Musique d'ambiance</div>
            <div className="text-[11px] text-text-faint truncate">{status}</div>
          </div>
        </div>

        {music.enabled && (
          <div className="flex items-center gap-3 w-full sm:w-auto sm:flex-1 sm:max-w-sm">
            <span className="text-[11px] text-text-faint shrink-0">Volume</span>
            <input
              type="range"
              min={0}
              max={100}
              value={music.volume}
              onChange={(e) => music.setVolume(Number(e.target.value))}
              className="flex-1 min-w-0 accent-[var(--color-accent)]"
              aria-label="Volume de la musique"
            />
            <span className="text-xs text-text-muted tabular-nums w-10 text-right shrink-0">{music.volume} %</span>
          </div>
        )}

        <Toggle checked={music.enabled} onChange={music.setEnabled} label="Musique d'ambiance" />
      </div>
    </>
  );
  // Choix du morceau : sous le titre et la répétition, sur toute la largeur de la carte.
  const track = music.enabled ? (
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
            <p className="text-[11px] text-text-faint mt-1.5">
              {music.track === RANDOM ? "Jamais deux fois de suite le même morceau." : "Ce morceau est le seul joué."}
            </p>
          </div>
  ) : null;

  // Répétition : juste sous le bandeau, dans la colonne de droite.
  const repeatBlock = music.enabled ? (
          <div>
            <label className="label">Répétition</label>
            {/* Trois choix côte à côte, avec l'explication du choix actif en dessous. */}
            <div className="grid grid-cols-3 rounded-xl bg-panel-2 border border-border-strong p-1 gap-1">
              {REPEAT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => music.setRepeat(opt.value)}
                  className={`h-9 px-2 rounded-lg text-xs font-semibold transition-colors truncate ${
                    music.repeat === opt.value ? "bg-accent text-accent-ink" : "text-text-muted hover:text-text"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1.5 min-h-9">
              <p className="text-[11px] text-text-faint">{repeat.hint}</p>
              {music.repeat === "pause" && (
                <span className="flex items-center gap-2 text-[11px] text-text-muted ml-auto">
                  Pause de
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={music.pauseMinutes}
                    onChange={(e) => music.setPauseMinutes(Number(e.target.value))}
                    className="input w-16 h-9 px-2 text-center"
                    aria-label="Minutes de pause entre deux morceaux"
                  />
                  minutes
                </span>
              )}
            </div>
          </div>
  ) : null;
  return part === "bar" ? bar : part === "track" ? track : repeatBlock;
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
    biomeChoice,
    setBiomeChoice,
  } = useThemeStore();

  const update = useUpdateStore();
  const [stats, setStats] = useState(statsEnabled);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    api.getSettings().then(setSettings);
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  // Catégorie actuellement à l'écran, pour la barre d'accès rapide.
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);
  const ready = settings !== null;
  useEffect(() => {
    if (!ready) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length > 0) setActiveSection(visible[0].target.id);
      },
      // Une bande en haut de la page : la catégorie qui la traverse est la catégorie active.
      { rootMargin: "-15% 0px -70% 0px" },
    );
    for (const section of SECTIONS) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [ready]);

  function goTo(id: string) {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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
      // « 8 » tapé pour 8 Go : la mémoire est toujours enregistrée en Mo.
      const max = normalizeRam(settings.default_max_ram_mb);
      const cleaned = {
        ...settings,
        default_max_ram_mb: max,
        default_min_ram_mb: Math.min(normalizeRam(settings.default_min_ram_mb), max),
      };
      setSettings(cleaned);
      await api.saveSettings(cleaned);
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
    <div className="page !max-w-none">
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

      {/* Accès rapide : reste visible en haut pendant le défilement et indique la catégorie affichée. */}
      {/* Fond presque opaque : la page qui défile dessous ne doit pas se lire à travers les boutons. */}
      <nav
        className="sticky top-2 z-20 rounded-2xl p-1.5 flex gap-1 flex-wrap border border-border-strong shadow-[0_12px_32px_-16px_var(--glass-shadow)]"
        style={{
          background: "color-mix(in srgb, var(--color-bg) 90%, transparent)",
          backdropFilter: "blur(24px)",
        }}
        aria-label="Catégories des réglages"
      >
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            onClick={() => goTo(section.id)}
            className={`h-9 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors ${
              activeSection === section.id ? "bg-accent text-accent-ink" : "text-text-muted hover:text-text hover:bg-fg/5"
            }`}
          >
            <Icon name={section.icon} className="w-3.5 h-3.5" />
            {section.title}
          </button>
        ))}
      </nav>

      <SettingsSection
        id="apparence"
        icon={theme === "dark" ? "moon" : "sun"}
        title="Apparence"
        description="Choisis un thème tout fait, ou règle chaque détail en dessous."
        below={
          <>
            {/* Mode et couleur côte à côte ; le décor et les interrupteurs sur toute la largeur. */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-8 gap-y-5 items-start">
              <div className="flex flex-col gap-2">
              <span className="label mb-0">Mode</span>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
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
              </div>
        <div className="flex flex-col gap-3">
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

            </div>
        <div>
          <span className="label">Décor de la scène</span>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
            {[...BIOMES, { id: "random" as const, name: "Aléatoire", hint: "Un décor différent à chaque ouverture" }].map((b) => (
              <button
                key={b.id}
                onClick={() => setBiomeChoice(b.id)}
                className={`row flex-col items-start !gap-0.5 text-left ${biomeChoice === b.id ? "!border-accent/50 !bg-accent/5" : ""}`}
              >
                <span className={`text-sm font-medium ${biomeChoice === b.id ? "text-accent" : ""}`}>{b.name}</span>
                <span className="text-[11px] text-text-faint leading-snug">{b.hint}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-text-faint mt-1.5">
            La maison, le chien et le feu de camp restent les mêmes ; seul le paysage change. Visible quand aucune
            image de fond n'est choisie.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 min-[1900px]:grid-cols-4 gap-2 items-stretch">
          <span className="label mb-0 col-span-full">Scène et sons</span>
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
          </>
        }
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

      </SettingsSection>

      <SettingsSection
        id="musique"
        icon="volume"
        title="Musique"
        description="Une musique d'ambiance dans le launcher. Elle se coupe toute seule quand tu passes sur une autre fenêtre (le jeu, par exemple) et reprend à ton retour. Elle reste aussi silencieuse tant qu'un autre média (musique, vidéo YouTube...) joue sur ton PC."
        below={<MusicSettings part="track" />}
        align="start"
      >
        <MusicSettings part="bar" />
        <MusicSettings part="repeat" />
      </SettingsSection>

      <SettingsSection
        id="mises-a-jour"
        icon="download"
        title="Mises à jour"
        description="Le launcher vérifie à chaque démarrage si une nouvelle version est publiée."
      >
        {/* Un seul bloc compact, centré sur toute la carte (et non sur la seule colonne de droite) :
            la marge de droite compense la colonne du titre, et le bloc est aussi centré en hauteur. */}
        <div className="flex-1 flex items-center justify-center lg:pr-[284px] 2xl:pr-[344px]">
        <div className="w-full max-w-[560px] flex flex-col gap-3">
          <div className="row items-center gap-3 !cursor-default">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                update.status === "error" ? "bg-danger/15 text-danger" : "bg-accent/15 text-accent"
              }`}
            >
              {update.status === "checking" || update.status === "downloading" ? (
                <Spinner className="w-5 h-5" />
              ) : (
                <Icon
                  name={update.status === "error" ? "alert" : update.status === "available" ? "download" : "check"}
                  className="w-5 h-5"
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Nexora Craft {appVersion ?? ""}</div>
              <div className="text-[11px] text-text-faint mt-0.5">
                {update.status === "checking"
                  ? "Vérification en cours..."
                  : update.status === "available"
                    ? `Version ${update.version} disponible`
                    : update.status === "downloading"
                      ? update.progress !== null
                        ? `Téléchargement de la mise à jour : ${Math.round(update.progress * 100)} %`
                        : "Téléchargement de la mise à jour..."
                      : update.status === "uptodate"
                        ? "Tu as la dernière version."
                        : update.status === "error"
                          ? "Vérification impossible pour le moment."
                          : "Version installée"}
              </div>
            </div>
            {update.status === "available" ? (
              <button onClick={update.install} className="btn btn-primary btn-sm shrink-0">
                <Icon name="download" className="w-3.5 h-3.5" /> Mettre à jour
              </button>
            ) : (
              <button
                onClick={() => update.checkForUpdate(true)}
                disabled={update.status === "checking" || update.status === "downloading"}
                className="btn btn-secondary btn-sm shrink-0"
              >
                <Icon name="refresh" className="w-3.5 h-3.5" /> Vérifier
              </button>
            )}
          </div>

          {update.status === "available" && update.notes && (
            <div className="row items-start !cursor-default">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">Nouveautés de la version {update.version}</div>
                <div className="text-[11px] text-text-faint leading-relaxed mt-0.5 whitespace-pre-line line-clamp-4">
                  {update.notes}
                </div>
              </div>
            </div>
          )}
          {update.status === "error" && update.error && <div className="alert-error">{update.error}</div>}
        </div>
        </div>
      </SettingsSection>

      <SettingsSection
        id="memoire"
        icon="cpu"
        title="Mémoire par défaut"
        description="Appliquée aux nouvelles instances et à celles que tu n'as pas réglées à la main. Modifiable ensuite instance par instance. 8 Go = 8192 Mo."
      >
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {MEMORY_FIELDS.map((field) => (
            <div key={field.key} className="row flex-col items-stretch !gap-3 !cursor-default">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{field.title}</div>
                  <div className="text-[11px] text-text-faint leading-relaxed mt-0.5">{field.hint}</div>
                </div>
                <div
                  className="text-2xl font-semibold text-accent tabular-nums whitespace-nowrap"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {formatRam(settings[field.key])}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {field.presets.map((gb) => (
                  <button
                    key={gb}
                    onClick={() => setSettings({ ...settings, [field.key]: gb * 1024 })}
                    className={`chip !h-8 ${settings[field.key] === gb * 1024 ? "chip-active" : ""}`}
                  >
                    {gb} Go
                  </button>
                ))}
                <div className="relative ml-auto w-32">
                  <input
                    type="number"
                    value={settings[field.key]}
                    onChange={(e) => setSettings({ ...settings, [field.key]: Number(e.target.value) })}
                    className="input h-8 pr-10 text-sm"
                    aria-label={`${field.title}, en Mo`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-text-faint">Mo</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-text-faint">
          Clique sur « Enregistrer » en haut de la page pour appliquer : tes instances non réglées à la main suivront.
        </p>
      </SettingsSection>

      <SettingsSection
        id="fond"
        icon="image"
        title="Fond d'écran personnalisé"
        description="Remplace la scène Minecraft animée par ton image. Retire-la pour revenir à la scène."
      >
        <div className="relative w-full max-w-3xl aspect-[16/7] rounded-2xl overflow-hidden border border-border-strong bg-panel-2">
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
