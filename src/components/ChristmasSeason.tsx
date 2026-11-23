import { useEffect, useState } from "react";

/// Début de la saison 2 (spéciale Noël) : le 1er décembre 2026 à minuit, heure de l'ordinateur.
export const SEASON_2_START = new Date(2026, 11, 1, 0, 0, 0).getTime();
/// Début de la barre de progression du décompte.
const COUNTDOWN_FROM = new Date(2026, 10, 1, 0, 0, 0).getTime();

const CSS = `@keyframes nx-tick { 0% { transform: translateY(-30%); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }`;

function split(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-start">
      <span
        key={value}
        className="text-[34px] leading-none font-bold tabular-nums"
        style={{ fontFamily: "var(--font-display)", animation: "nx-tick .3s ease-out" }}
      >
        {String(value).padStart(2, "0")}
      </span>
      <span className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-text-muted">{label}</span>
    </div>
  );
}

/// Carte sobre du décompte : saison, date, quatre chiffres, fine barre de progression.
export function ChristmasCountdown() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remaining = SEASON_2_START - now;
  const live = remaining <= 0;
  const { days, hours, minutes, seconds } = split(remaining);
  const progress = live ? 1 : Math.min(1, Math.max(0, (now - COUNTDOWN_FROM) / (SEASON_2_START - COUNTDOWN_FROM)));

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 backdrop-blur-md overflow-hidden">
      <style>{CSS}</style>
      <div className="px-5 pt-4 pb-4">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.2em]">
          <span className="text-[#ff7a85]">Saison 2 · Noël</span>
          <span className="text-text-muted">{live ? "Disponible" : "1er décembre"}</span>
        </div>

        {live ? (
          <div className="mt-3 text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            La saison 2 est lancée.
          </div>
        ) : (
          <div className="mt-3 flex items-start gap-5">
            <Unit value={days} label="jours" />
            <div className="w-px self-stretch bg-white/10" />
            <Unit value={hours} label="heures" />
            <div className="w-px self-stretch bg-white/10" />
            <Unit value={minutes} label="minutes" />
            <div className="w-px self-stretch bg-white/10" />
            <Unit value={seconds} label="secondes" />
          </div>
        )}
      </div>
      <div className="h-[3px] bg-white/10">
        <div
          className="h-full bg-gradient-to-r from-[#ff4d5a] to-[#ffd27a] transition-[width] duration-1000"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}
