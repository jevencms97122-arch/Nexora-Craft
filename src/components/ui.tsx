import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

// ---------- Icônes (trait 1.8, 24x24) ----------

const ICONS = {
  play: "M7 4.5v15l12-7.5-12-7.5z",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  compass: "M12 21a9 9 0 100-18 9 9 0 000 18zM15.5 8.5l-2 5-5 2 2-5 5-2z",
  users:
    "M16 20v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 18.5V20M10 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM20 20v-1.5a3.5 3.5 0 00-2.5-3.35M15.5 4.15a3.5 3.5 0 010 6.7",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20a7.5 7.5 0 0115 0",
  settings:
    "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1 1.56V21a2 2 0 11-4 0v-.09a1.7 1.7 0 00-1-1.56 1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.7 1.7 0 00.34-1.87 1.7 1.7 0 00-1.56-1H3a2 2 0 110-4h.09a1.7 1.7 0 001.56-1 1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06a1.7 1.7 0 001.87.34H9a1.7 1.7 0 001-1.56V3a2 2 0 114 0v.09a1.7 1.7 0 001 1.56 1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06a1.7 1.7 0 00-.34 1.87V9a1.7 1.7 0 001.56 1H21a2 2 0 110 4h-.09a1.7 1.7 0 00-1.56 1z",
  plus: "M12 5v14M5 12h14",
  search: "M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4",
  star: "M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5z",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  back: "M15 18l-6-6 6-6",
  check: "M5 12.5l4.5 4.5L19 7.5",
  copy: "M9 9h10v10H9zM5 15V5h10",
  terminal: "M4 5h16v14H4zM8 10l3 2-3 2M13 14h3",
  upload: "M12 20V9M7 14l5-5 5 5M5 4h14",
  refresh: "M20 11a8 8 0 10-2.3 5.7M20 5v6h-6",
  globe:
    "M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9.5a1 1 0 100-2 1 1 0 000 2z",
  cpu: "M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4",
  key: "M15 9a3 3 0 11-6 0 3 3 0 016 0zM14 11.5l6.5 6.5M18 16l2-2M16 18l1.5-1.5",
  link: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
  microsoft: "M4 4h7.5v7.5H4zM12.5 4H20v7.5h-7.5zM4 12.5h7.5V20H4zM12.5 12.5H20V20h-7.5z",
  box: "M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9",
  chevronDown: "M6 9l6 6 6-6",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  loaderVanilla: "M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9",
  loaderFabric: "M4 9c4-4 12 4 16 0M4 15c4-4 12 4 16 0M9 5v14M15 5v14",
  loaderQuilt: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM17 13.5l3.5 3.5-3.5 3.5-3.5-3.5z",
  loaderForge: "M4 8h13a3 3 0 003-3M7 8v3h8V8M9 11v3l-3 4h12l-3-4v-3",
  loaderNeoforge: "M4 9h11a3 3 0 003-3M7 9v3h7V9M8.5 12v3L6 19h9l-2.5-4v-3M19.5 12l.6 1.6 1.6.4-1.6.4-.6 1.6-.6-1.6-1.6-.4 1.6-.4z",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.5M4 12h.5M4 18h.5",
  command: "M9 6a3 3 0 10-3 3h12a3 3 0 10-3-3v12a3 3 0 103-3H6a3 3 0 103 3V6z",
  volume: "M5 10v4h3l4 4V6l-4 4H5zM16 9a4 4 0 010 6M18.5 6.5a7.5 7.5 0 010 11",
  palette: "M12 3a9 9 0 100 18c1.5 0 2-1 2-2 0-1.5 1-2 2.5-2H18a3 3 0 003-3c0-6-4-11-9-11zM7.5 12h.5M9.5 8h.5M14.5 8h.5",
  sparkles: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z",
  alert: "M12 4l9 16H3l9-16zM12 10v4M12 17v.5",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  share: "M8.6 13.5l6.8 4M15.4 6.5l-6.8 4M18 8a3 3 0 100-6 3 3 0 000 6zM6 15a3 3 0 100-6 3 3 0 000 6zM18 22a3 3 0 100-6 3 3 0 000 6z",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z",
  folder: "M3 6h6l2 3h10v10H3z",
  signal: "M5 19v-3M10 19v-7M15 19v-11M20 19V4",
  arrowUp: "M12 20V5M6 11l6-6 6 6",
  sun: "M12 16a4 4 0 100-8 4 4 0 000 8zM12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4",
  moon: "M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "w-[18px] h-[18px]", filled }: {
  name: IconName;
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

// ---------- Texte animé ----------

/// Découpe un texte en mots qui apparaissent l'un après l'autre (voir `.word` dans index.css).
export function AnimatedText({ text, delay = 0, step = 0.08, className }: {
  text: string;
  delay?: number;
  step?: number;
  className?: string;
}) {
  return (
    <>
      {text.split(" ").map((word, i, words) => (
        <span key={i}>
          <span className={`word ${className ?? ""}`} style={{ animationDelay: `${delay + i * step}s` }}>
            {word}
          </span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

// ---------- Mise en page ----------

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-6 flex-wrap">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="page-title">
          {typeof title === "string" ? <AnimatedText text={title} delay={0.08} /> : title}
        </h1>
        {subtitle && <p className="text-text-muted mt-2 max-w-2xl leading-relaxed">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Modal({ onClose, children, width }: {
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={width ? { width } : undefined} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ---------- Menu déroulant (remplace <select>, dont la liste native ne se stylise pas) ----------

export interface DropdownOption {
  value: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
}

export function Dropdown({
  value,
  options,
  onChange,
  trigger,
  placement = "down",
  ariaLabel,
  className = "",
}: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  /// Contenu personnalisé du bouton ; par défaut, un champ avec le libellé choisi.
  trigger?: ReactNode;
  placement?: "down" | "up";
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    setHighlight(selectedIndex);
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.children[highlight]?.scrollIntoView({ block: "nearest" });
  }, [open, highlight]);

  function choose(index: number) {
    const opt = options[index];
    if (opt) onChange(opt.value);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") setHighlight((h) => Math.min(options.length - 1, h + 1));
    else if (e.key === "ArrowUp") setHighlight((h) => Math.max(0, h - 1));
    else if (e.key === "Enter" || e.key === " ") choose(highlight);
    else return;
    e.preventDefault();
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={trigger ? "w-full text-left rounded-2xl" : "input flex items-center gap-2 text-left cursor-pointer"}
      >
        {trigger ?? (
          <>
            <span className="flex-1 truncate">{selected?.label}</span>
            <Icon
              name="chevronDown"
              className={`w-4 h-4 text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
            />
          </>
        )}
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          className={`liquid liquid-strong absolute left-0 right-0 z-50 p-1.5 rounded-2xl max-h-72 overflow-y-auto flex flex-col gap-0.5 ${
            placement === "up" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
          style={{ animation: "pop-in 0.14s ease-out" }}
        >
          {options.map((opt, i) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(i)}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${
                  i === highlight ? "bg-fg/8" : ""
                }`}
              >
                {opt.icon}
                <div className="flex-1 min-w-0">
                  <div className={`truncate font-medium ${isSelected ? "text-accent" : ""}`}>{opt.label}</div>
                  {opt.hint && <div className="text-xs text-text-muted truncate">{opt.hint}</div>}
                </div>
                {isSelected && <Icon name="check" className="w-4 h-4 text-accent shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-[22px] rounded-full transition-colors shrink-0 disabled:opacity-50 ${
        checked ? "bg-accent" : "bg-fg/15"
      }`}
    >
      <span
        className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-all ${
          checked ? "left-[20px]" : "left-[2px]"
        }`}
      />
    </button>
  );
}

export function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} animate-spin`} fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function ProgressBar({ value }: { value: number | null }) {
  return (
    <div className="progress-track">
      {value === null ? (
        <div className="progress-bar progress-indeterminate" />
      ) : (
        <div className="progress-bar" style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
      )}
    </div>
  );
}

// ---------- Visuels d'instance ----------

const LOADER_LABELS: Record<string, string> = {
  vanilla: "Vanilla",
  fabric: "Fabric",
  quilt: "Quilt",
  forge: "Forge",
  neoforge: "NeoForge",
};

export function loaderLabel(loader: string) {
  return LOADER_LABELS[loader] ?? loader;
}

function hashHue(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h % 360;
}

/// Bannière dégradée stable dérivée du nom de l'instance.
export function instanceGradient(name: string) {
  const hue = hashHue(name);
  return `radial-gradient(120% 120% at 0% 0%, hsl(${hue} 70% 45% / 0.9), transparent 55%),
    radial-gradient(120% 120% at 100% 100%, hsl(${(hue + 60) % 360} 80% 40% / 0.7), transparent 55%),
    linear-gradient(135deg, hsl(${hue} 40% var(--banner-l1)), hsl(${(hue + 40) % 360} 45% var(--banner-l2)))`;
}

/// Adresse affichable d'une image d'instance : URL distante telle quelle, fichier local converti.
export function imageSrc(ref: string | null | undefined): string | null {
  if (!ref) return null;
  return /^(https?:|data:)/.test(ref) ? ref : convertFileSrc(ref);
}

/// Fond de bannière d'une instance : son image si elle en a une, sinon son dégradé.
export function instanceBanner(instance: { name: string; banner?: string | null }): CSSProperties {
  const src = imageSrc(instance.banner);
  return src
    ? { backgroundImage: `url("${src}")`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: instanceGradient(instance.name) };
}

const LOADER_ICONS: Record<string, IconName> = {
  vanilla: "loaderVanilla",
  fabric: "loaderFabric",
  quilt: "loaderQuilt",
  forge: "loaderForge",
  neoforge: "loaderNeoforge",
};

/// Pastille « pictogramme + nom » du loader d'une instance.
export function LoaderBadge({ loader, className = "" }: { loader: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <Icon name={LOADER_ICONS[loader] ?? "loaderVanilla"} className="w-3 h-3" />
      {loaderLabel(loader)}
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function InstanceIcon({ name, icon, className = "w-11 h-11 text-lg" }: {
  name: string;
  /// Icône de l'instance (modpack ou image choisie) ; sinon l'initiale sur son dégradé.
  icon?: string | null;
  className?: string;
}) {
  const src = imageSrc(icon);
  if (src) {
    return <img src={src} alt="" className={`${className} rounded-xl shrink-0 object-cover border border-fg/10 bg-panel-3`} />;
  }
  return (
    <div
      className={`${className} rounded-xl shrink-0 flex items-center justify-center font-bold text-white/90 border border-fg/10`}
      // Tuile toujours sombre, quel que soit le thème, pour que l'initiale blanche reste lisible.
      style={
        {
          "--banner-l1": "14%",
          "--banner-l2": "9%",
          background: instanceGradient(name),
          fontFamily: "var(--font-display)",
        } as CSSProperties
      }
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export function progressPercent(p: { completed: number; total: number } | null): number | null {
  if (!p || p.total <= 0) return null;
  return Math.round((p.completed / p.total) * 100);
}
