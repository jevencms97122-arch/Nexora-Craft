import { useEffect, useRef, useState, type ReactNode } from "react";
import { playbackPosition, useMusicStore } from "../store/musicStore";

/*
 * « Île dynamique » : une pastille en haut de la fenêtre qui montre la musique en cours et
 * s'étire pour offrir les commandes (précédent, pause, suivant, position, volume).
 *
 * Elle apparaît quand un morceau démarre, s'ouvre seule quelques secondes à chaque nouveau
 * morceau, s'ouvre au survol ou au clic, puis se referme. Toutes les transitions sont en CSS
 * (index.css, section « Île dynamique ») ; ici on ne gère que l'état.
 */

const COLLAPSED = { width: 232, height: 36, radius: 18 };
const EXPANDED = { width: 408, height: 142, radius: 30 };
/// Durée d'ouverture automatique à chaque nouveau morceau.
const PEEK_MS = 4_000;

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function Equalizer({ active, className = "" }: { active: boolean; className?: string }) {
  return (
    <span className={`island-eq ${active ? "island-eq-on" : ""} ${className}`} aria-hidden>
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

const iconClass = "w-[18px] h-[18px]";

function PrevIcon() {
  return (
    <svg viewBox="0 0 24 24" className={iconClass} fill="currentColor" aria-hidden>
      <rect x="5" y="5" width="2.4" height="14" rx="1.2" />
      <path d="M19 6.2v11.6a1 1 0 0 1-1.6.8L9.4 12.8a1 1 0 0 1 0-1.6l8-5.8a1 1 0 0 1 1.6.8z" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" className={iconClass} fill="currentColor" aria-hidden>
      <rect x="16.6" y="5" width="2.4" height="14" rx="1.2" />
      <path d="M5 6.2v11.6a1 1 0 0 0 1.6.8l8-5.8a1 1 0 0 0 0-1.6l-8-5.8A1 1 0 0 0 5 6.2z" />
    </svg>
  );
}

function PlayIcon({ className = iconClass }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.4-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z" />
    </svg>
  );
}

function PauseIcon({ className = iconClass }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <rect x="6" y="5" width="4.2" height="14" rx="1.4" />
      <rect x="13.8" y="5" width="4.2" height="14" rx="1.4" />
    </svg>
  );
}

function IslandButton({ label, onClick, children, big }: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  big?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`island-btn ${big ? "island-btn-big" : ""}`}
    >
      {children}
    </button>
  );
}

export function MusicIsland() {
  const { enabled, current, playing: audioPlaying, manualPaused, otherMedia, volume, setVolume, togglePlay, skip, previous, seek } =
    useMusicStore();

  const visible = enabled && !!current;

  // « Joue » sans clignoter : entre deux morceaux, le lecteur passe un instant par « pause ». Une
  // vraie pause du joueur, elle, s'affiche tout de suite.
  const [steady, setSteady] = useState(audioPlaying);
  useEffect(() => {
    if (audioPlaying) {
      setSteady(true);
      return;
    }
    const timer = setTimeout(() => setSteady(false), 700);
    return () => clearTimeout(timer);
  }, [audioPlaying]);
  const playing = !manualPaused && steady;
  // Le composant reste monté le temps de l'animation de sortie.
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(false), 300);
    return () => clearTimeout(timer);
  }, [visible]);

  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [peek, setPeek] = useState(false);
  const [bump, setBump] = useState(false);
  /// L'animation d'apparition est finie : elle ne doit plus jamais se rejouer (sauf après une sortie).
  const [entered, setEntered] = useState(false);
  const enteredRef = useRef(false);
  enteredRef.current = entered;
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /// Jusqu'à cet instant, un changement de morceau vient du joueur : l'île ne s'ouvre pas d'elle-même.
  const quietUntil = useRef(0);
  const byUser = (action: () => void) => () => {
    quietUntil.current = Date.now() + 4_000;
    action();
  };

  // Nouveau morceau : l'île s'ouvre un instant et « rebondit ».
  const trackId = current?.id ?? null;
  useEffect(() => {
    if (!trackId) return;
    // L'île s'ouvre seule pour un morceau qui démarre tout seul, pas quand c'est le joueur qui vient
    // de passer au suivant (il sait déjà ce qui se passe, et son pointeur est peut-être parti).
    if (Date.now() > quietUntil.current) setPeek(true);
    // L'apparition a déjà son propre effet : le rebond ne sert que pour un changement de morceau.
    if (enteredRef.current) setBump(true);
    const closePeek = setTimeout(() => setPeek(false), PEEK_MS);
    const endBump = setTimeout(() => setBump(false), 450);
    return () => {
      clearTimeout(closePeek);
      clearTimeout(endBump);
    };
  }, [trackId]);

  useEffect(() => {
    if (!visible) {
      setEntered(false);
      setBump(false);
      setPinned(false);
      setHovered(false);
      setPeek(false);
    }
  }, [visible]);

  // Ouverte au clic, l'île se referme avec Échap ou d'un clic ailleurs.
  const islandRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPinned(false);
    const onPointer = (e: PointerEvent) => {
      if (!islandRef.current?.contains(e.target as Node)) setPinned(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [pinned]);

  const expanded = visible && (hovered || pinned || peek);

  // Position de lecture : relue à chaque image tant que l'île est ouverte et que le morceau joue.
  const [position, setPosition] = useState({ time: 0, duration: 0 });
  const [scrubbing, setScrubbing] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    // Quatre relevés par seconde suffisent pour une barre de position, et laissent le moteur
    // d'affichage tranquille pendant l'animation d'ouverture.
    let timer = 0;
    if (playing && !scrubbing) timer = window.setInterval(() => setPosition(playbackPosition()), 250);
    setPosition((p) => (scrubbing ? p : playbackPosition()));
    return () => clearInterval(timer);
  }, [expanded, playing, scrubbing, trackId]);

  if (!mounted) return null;

  const size = expanded ? EXPANDED : COLLAPSED;
  const fraction = position.duration > 0 ? Math.min(1, position.time / position.duration) : 0;
  const status = manualPaused
    ? "En pause"
    : playing
      ? "En lecture"
      : otherMedia
        ? "En retrait : un autre média joue"
        : "En pause";
  const name = current?.name ?? "";
  const artist = current?.artist ?? "";
  const cover = current?.cover ?? null;

  function enter() {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    setHovered(true);
  }
  function leave() {
    // Petit délai : un geste qui frôle le bord ne doit pas refermer l'île.
    leaveTimer.current = setTimeout(() => setHovered(false), 180);
  }

  return (
    <div className="absolute inset-x-0 top-1.5 z-30 flex justify-center pointer-events-none">
      <div
        ref={islandRef}
        role="group"
        aria-label="Musique en cours"
        tabIndex={0}
        onMouseEnter={enter}
        onMouseLeave={leave}
        // Le clavier ouvre l'île quand elle prend le focus ; un clic sur un de ses boutons ne doit
        // pas la garder ouverte, et passer d'un bouton à l'autre au clavier ne la referme pas.
        onFocus={(e) => e.target === e.currentTarget && e.target.matches(":focus-visible") && enter()}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) leave();
        }}
        onClick={() => setPinned((p) => !p)}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setPinned((p) => !p);
          }
        }}
        className={`island pointer-events-auto ${visible ? (entered ? "" : "island-enter") : "island-exit"} ${
          bump ? "island-bump" : ""
        } ${playing ? "island-live" : ""} ${expanded ? "island-open" : ""}`}
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget && e.animationName === "island-in") setEntered(true);
        }}
        style={{ width: size.width, height: size.height, borderRadius: size.radius }}
      >
        {/* Forme repliée : équaliseur, titre, état. */}
        <div className="island-layer island-compact" aria-hidden={expanded}>
          {cover ? (
            <img src={cover} alt="" className="island-mini-cover" draggable={false} />
          ) : (
            <Equalizer active={playing} />
          )}
          <span key={`c-${trackId}`} className="island-text flex-1 min-w-0 truncate text-[12px] font-semibold">
            {name}
          </span>
          <span className="island-state">{playing ? <PauseIcon className="w-3 h-3" /> : <PlayIcon className="w-3 h-3" />}</span>
        </div>

        {/* Forme ouverte : titre, position, commandes. */}
        <div className="island-layer island-full" aria-hidden={!expanded}>
          <div className="flex items-center gap-3 min-w-0">
            <div className={`island-cover ${cover ? "island-cover-art" : ""}`}>
              {cover ? (
                <>
                  <img src={cover} alt="" draggable={false} />
                  <Equalizer active={playing} className="island-eq-badge" />
                </>
              ) : (
                <Equalizer active={playing} className="island-eq-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div key={`t-${trackId}`} className="island-text truncate text-[14px] font-semibold leading-tight">
                {name}
              </div>
              <div className="text-[11px] text-text-muted truncate mt-0.5">
                {artist ? `${artist} · ${status}` : status}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 mt-2.5">
            <span className="text-[10px] tabular-nums text-text-faint w-8 text-right">{formatTime(position.time)}</span>
            <input
              type="range"
              min={0}
              max={1000}
              value={Math.round(fraction * 1000)}
              disabled={position.duration <= 0}
              aria-label="Position dans le morceau"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={() => setScrubbing(true)}
              onPointerUp={() => setScrubbing(false)}
              onPointerCancel={() => setScrubbing(false)}
              onChange={(e) => {
                const next = Number(e.target.value) / 1000;
                setPosition((p) => ({ ...p, time: next * p.duration }));
                seek(next);
              }}
              className="island-range flex-1 min-w-0"
              style={{ ["--fill" as string]: `${fraction * 100}%` }}
            />
            <span className="text-[10px] tabular-nums text-text-faint w-8">{formatTime(position.duration)}</span>
          </div>

          <div className="flex items-center justify-between mt-1.5">
            <div className="w-[104px]" />
            <div className="flex items-center gap-1.5">
              <IslandButton label="Morceau précédent" onClick={byUser(previous)}>
                <PrevIcon />
              </IslandButton>
              <IslandButton label={playing ? "Pause" : "Lecture"} onClick={togglePlay} big>
                {playing ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
              </IslandButton>
              <IslandButton label="Morceau suivant" onClick={byUser(skip)}>
                <NextIcon />
              </IslandButton>
            </div>
            <div className="w-[104px] flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-text-faint shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 10v4h3l5 4V6L7 10H4z" />
                <path d="M16 9a4 4 0 0 1 0 6" />
              </svg>
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                aria-label="Volume de la musique"
                onChange={(e) => setVolume(Number(e.target.value))}
                className="island-range w-16"
                style={{ ["--fill" as string]: `${volume}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
