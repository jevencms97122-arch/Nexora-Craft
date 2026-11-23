import { useEffect, useRef } from "react";

/// Durée du fondu enchaîné entre la fin de la vidéo et son début.
const FADE_S = 1.2;

interface Props {
  src: string;
  /// Vidéo figée (partie en cours) : on met en pause pour laisser le GPU au jeu.
  paused?: boolean;
  className?: string;
  /// La vidéo n'a pas pu être lue : le launcher revient au décor 2D.
  onError: () => void;
}

const smooth = (v: number) => {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
};

/// Vidéo plein écran en boucle, sans son. Deux lecteurs se relaient : quand le premier approche
/// de la fin, le second démarre au début par-dessus et apparaît en fondu. Aucun noir entre les deux.
export function VideoBackground({ src, paused = false, className, onError }: Props) {
  const a = useRef<HTMLVideoElement>(null);
  const b = useRef<HTMLVideoElement>(null);
  const errorRef = useRef(onError);
  errorRef.current = onError;

  useEffect(() => {
    const players = [a.current, b.current];
    if (!players[0] || !players[1]) return;
    const [v0, v1] = players as [HTMLVideoElement, HTMLVideoElement];
    let active = v0;
    let incoming: HTMLVideoElement | null = null;
    let firstPass = true;
    let raf = 0;

    const style = (v: HTMLVideoElement, opacity: number, z: number) => {
      v.style.opacity = String(opacity);
      v.style.zIndex = String(z);
    };
    style(v0, 0, 1);
    style(v1, 0, 0);

    const sync = () => {
      const run = !paused && !document.hidden;
      for (const v of [active, incoming]) {
        if (!v) continue;
        if (run) v.play().catch(() => {});
        else v.pause();
      }
    };

    const tick = () => {
      const d = active.duration;
      if (d && isFinite(d)) {
        const t = active.currentTime;
        const start = d - FADE_S;
        if (!incoming && t >= start) {
          incoming = active === v0 ? v1 : v0;
          incoming.currentTime = 0;
          style(incoming, 0, 2);
          sync();
        }
        if (incoming) {
          const p = (t - start) / FADE_S;
          // Le nouveau plan monte par-dessus l'ancien, qui reste entier jusqu'à la fin du fondu.
          style(incoming, smooth(p), 2);
          if (p >= 1 || active.ended) {
            active.pause();
            active.currentTime = 0;
            style(active, 0, 0);
            active = incoming;
            incoming = null;
            style(active, 1, 1);
            firstPass = false;
          }
        } else if (firstPass) {
          style(active, smooth(t / (FADE_S * 0.6)), 1);
        } else {
          style(active, 1, 1);
        }
      }
      raf = requestAnimationFrame(tick);
    };

    sync();
    raf = requestAnimationFrame(tick);
    document.addEventListener("visibilitychange", sync);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [paused, src]);

  const props = {
    src,
    className: `${className ?? ""} object-cover`,
    muted: true,
    playsInline: true,
    preload: "auto" as const,
    disablePictureInPicture: true,
    onError: () => errorRef.current(),
    "aria-hidden": true,
  };
  return (
    <>
      <video ref={a} {...props} />
      <video ref={b} {...props} />
    </>
  );
}
