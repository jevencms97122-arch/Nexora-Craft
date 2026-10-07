import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useGameStore } from "../store/gameStore";
import { useInstanceStore } from "../store/instanceStore";
import { THEME_PRESETS, useThemeStore } from "../store/themeStore";
import { useUiStore } from "../store/uiStore";
import { Icon, InstanceIcon, type IconName } from "./ui";

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  /// Mots supplémentaires qui font remonter la commande dans la recherche.
  keywords?: string;
  icon: ReactNode;
  run: () => void;
}

/// Minuscules sans accents, pour une recherche tolérante (« reglages » trouve « Réglages »).
function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function tile(icon: IconName) {
  return (
    <span className="w-9 h-9 rounded-xl bg-panel-3 flex items-center justify-center text-text-muted shrink-0">
      <Icon name={icon} className="w-[18px] h-[18px]" />
    </span>
  );
}

const PAGES: { to: string; label: string; icon: IconName; keywords?: string }[] = [
  { to: "/", label: "Jouer", icon: "play", keywords: "accueil lancer" },
  { to: "/instances", label: "Instances", icon: "grid", keywords: "bibliotheque" },
  { to: "/content", label: "Explorer", icon: "compass", keywords: "mods shaders modrinth modpack textures" },
  { to: "/together", label: "Multi", icon: "users", keywords: "serveurs heberger tunnel jouer ensemble" },
  { to: "/gallery", label: "Galerie", icon: "camera", keywords: "captures screenshots" },
  { to: "/account", label: "Compte", icon: "user", keywords: "skin pseudo garde-robe" },
  { to: "/settings", label: "Réglages", icon: "settings", keywords: "parametres theme couleur memoire" },
];

/// Palette de commandes : Ctrl+K pour ouvrir, puis taper pour lancer une instance, changer de
/// page ou de thème, sans toucher la souris.
export function CommandPalette() {
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  const navigate = useNavigate();
  const instances = useInstanceStore((s) => s.instances);
  const refreshInstances = useInstanceStore((s) => s.refresh);
  const { launch, joinOfficial, runningId, launchingId } = useGameStore();
  const { theme, toggleTheme, applyPreset } = useThemeStore();
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Raccourci global.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useUiStore.getState().paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHighlight(0);
    refreshInstances();
  }, [open, refreshInstances]);

  const commands = useMemo<Command[]>(() => {
    const busy = runningId !== null || launchingId !== null;
    const list: Command[] = [];

    if (!busy) {
      for (const i of instances) {
        list.push({
          id: `launch-${i.id}`,
          label: `Lancer ${i.name}`,
          hint: i.mc_version,
          group: "Jouer",
          keywords: `jouer play ${i.loader}`,
          icon: <InstanceIcon name={i.name} icon={i.icon} className="w-9 h-9 text-sm" />,
          run: () => {
            navigate("/");
            launch(i.id);
          },
        });
      }
      list.push({
        id: "join-official",
        label: "Rejoindre Nexora-SMP",
        hint: "Serveur officiel",
        group: "Jouer",
        keywords: "serveur multijoueur smp",
        icon: tile("globe"),
        run: () => {
          navigate("/");
          api
            .listServers()
            .then((servers) => servers.find((s) => s.official))
            .then((server) => server && joinOfficial(server.address));
        },
      });
    }

    for (const p of PAGES) {
      list.push({
        id: `go-${p.to}`,
        label: p.label,
        hint: "Aller à la page",
        group: "Navigation",
        keywords: p.keywords,
        icon: tile(p.icon),
        run: () => navigate(p.to),
      });
    }

    for (const i of instances) {
      list.push({
        id: `open-${i.id}`,
        label: `Gérer ${i.name}`,
        hint: "Mods et paramètres",
        group: "Instances",
        keywords: "ouvrir instance mods parametres",
        icon: <InstanceIcon name={i.name} icon={i.icon} className="w-9 h-9 text-sm" />,
        run: () => navigate(`/instances/${i.id}`),
      });
    }

    list.push({
      id: "toggle-theme",
      label: theme === "dark" ? "Passer en mode jour" : "Passer en mode nuit",
      group: "Apparence",
      keywords: "theme clair sombre dark light",
      icon: tile(theme === "dark" ? "sun" : "moon"),
      run: toggleTheme,
    });
    for (const preset of THEME_PRESETS) {
      list.push({
        id: `preset-${preset.id}`,
        label: `Thème ${preset.name}`,
        hint: preset.hint,
        group: "Apparence",
        keywords: "theme couleur apparence",
        icon: (
          <span
            className="w-9 h-9 rounded-xl shrink-0 border border-fg/10"
            style={{ background: `linear-gradient(135deg, ${preset.accent}, ${preset.theme === "dark" ? "#0b0d12" : "#e8eff6"})` }}
          />
        ),
        run: () => applyPreset(preset),
      });
    }
    return list;
  }, [instances, runningId, launchingId, theme, navigate, launch, joinOfficial, toggleTheme, applyPreset]);

  const visible = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    if (words.length === 0) return commands;
    return commands.filter((c) => {
      const haystack = normalize(`${c.label} ${c.hint ?? ""} ${c.group} ${c.keywords ?? ""}`);
      return words.every((w) => haystack.includes(w));
    });
  }, [commands, query]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${highlight}"]`)?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  if (!open) return null;

  function run(command: Command | undefined) {
    if (!command) return;
    setOpen(false);
    command.run();
  }

  return (
    <div className="modal-backdrop !items-start pt-[14vh]" onClick={() => setOpen(false)}>
      <div
        className="modal !p-0 overflow-hidden flex flex-col"
        style={{ width: 600, maxHeight: "62vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 border-b border-border">
          <Icon name="search" className="w-[18px] h-[18px] text-text-faint shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setHighlight((h) => Math.min(visible.length - 1, h + 1));
              else if (e.key === "ArrowUp") setHighlight((h) => Math.max(0, h - 1));
              else if (e.key === "Enter") run(visible[highlight]);
              else if (e.key === "Escape") setOpen(false);
              else return;
              e.preventDefault();
            }}
            placeholder="Lancer une instance, ouvrir une page, changer de thème..."
            className="flex-1 h-14 bg-transparent text-[15px] placeholder:text-text-faint"
            style={{ outline: "none" }}
            aria-label="Rechercher une commande"
          />
          <span className="kbd text-[11px] text-text-muted">Échap</span>
        </div>

        <div ref={listRef} className="overflow-y-auto p-2 flex flex-col gap-0.5" role="listbox">
          {visible.length === 0 && (
            <div className="text-sm text-text-muted text-center py-10">Aucune commande pour « {query} ».</div>
          )}
          {visible.map((c, i) => {
            const firstOfGroup = i === 0 || visible[i - 1].group !== c.group;
            return (
              <div key={c.id}>
                {firstOfGroup && (
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-faint px-3 pt-3 pb-1.5">
                    {c.group}
                  </div>
                )}
                <button
                  data-index={i}
                  role="option"
                  aria-selected={i === highlight}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => run(c)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${
                    i === highlight ? "bg-fg/8" : ""
                  }`}
                >
                  {c.icon}
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate">{c.label}</span>
                    {c.hint && <span className="block text-xs text-text-muted truncate">{c.hint}</span>}
                  </span>
                  {i === highlight && <span className="kbd text-[11px] text-text-muted">Entrée</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
