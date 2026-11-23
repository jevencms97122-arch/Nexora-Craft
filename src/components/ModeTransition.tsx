import { useEffect, useRef } from "react";
import { LOW_END } from "../lib/perf";
import { Logo } from "./Logo";

/*
 * Transition entre Nexora SMP et le launcher classique.
 *
 * Des blocs recouvrent la fenêtre dans le sens du changement, le nom du mode apparaît, puis les
 * blocs s'effacent dans le même sens. La page et le décor sont échangés quand tout est couvert :
 * le recalcul de la scène reste invisible.
 */

export type LauncherMode = "smp" | "classic";

const COVER_MS = 420;
const HOLD_MS = 170;
const REVEAL_MS = 420;
/// Durée d'apparition ou de disparition d'un seul bloc.
const BLOCK_MS = 170;
const BLOCK_SIZE = LOW_END ? 72 : 48;
/// Le montage de la nouvelle page peut bloquer une image : ce temps-là n'est pas compté.
const STEP_AFTER_SWAP_MS = 16;

const LABELS: Record<LauncherMode, string> = {
  smp: "Nexora SMP",
  classic: "Launcher classique",
};

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function easeOut(v: number) {
  return 1 - (1 - v) ** 3;
}

interface Props {
  /// Change à chaque transition pour la relancer.
  id: number;
  to: LauncherMode;
  /// Fenêtre entièrement couverte : c'est le moment d'échanger la page.
  onCovered: () => void;
  onDone: () => void;
}

export function ModeTransition({ id, to, onCovered, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onCovered, onDone });
  callbacks.current = { onCovered, onDone };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const width = (canvas.width = window.innerWidth);
    const height = (canvas.height = window.innerHeight);
    const styles = getComputedStyle(document.documentElement);
    const bg = styles.getPropertyValue("--color-bg").trim() || "#07090f";
    const accent = styles.getPropertyValue("--color-accent").trim() || "#f43f4e";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const cols = Math.ceil(width / BLOCK_SIZE);
    const rows = Math.ceil(height / BLOCK_SIZE);
    // Vers Nexora SMP le balayage part de la gauche, vers le launcher classique de la droite.
    const blocks = Array.from({ length: cols * rows }, (_, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const along = (to === "smp" ? col : cols - 1 - col) / Math.max(1, cols - 1);
      const across = row / Math.max(1, rows - 1);
      return {
        x: col * BLOCK_SIZE,
        y: row * BLOCK_SIZE,
        order: (along * 0.78 + across * 0.22 + Math.random() * 0.12) / 1.12,
        shade: Math.random() < 0.3 ? 0.05 : Math.random() < 0.4 ? 0.025 : 0,
      };
    });

    const end = COVER_MS + HOLD_MS + REVEAL_MS;
    let clock = 0;
    let last = 0;
    let covered = false;
    let justSwapped = false;
    let raf = 0;

    const drawBlocks = () => {
      ctx.clearRect(0, 0, width, height);
      if (reduced) {
        const fade = clock < COVER_MS ? clock / COVER_MS : 1 - clamp01((clock - COVER_MS - HOLD_MS) / REVEAL_MS);
        ctx.globalAlpha = fade;
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1;
        return;
      }
      for (const b of blocks) {
        const inT = clamp01((clock - b.order * (COVER_MS - BLOCK_MS)) / BLOCK_MS);
        const outT = clamp01((clock - COVER_MS - HOLD_MS - b.order * (REVEAL_MS - BLOCK_MS)) / BLOCK_MS);
        const scale = easeOut(inT) * (1 - easeOut(outT));
        if (scale <= 0) continue;
        const size = scale >= 1 ? BLOCK_SIZE + 1 : BLOCK_SIZE * scale;
        const inset = scale >= 1 ? 0 : (BLOCK_SIZE - size) / 2;
        const x = b.x + inset;
        const y = b.y + inset;
        ctx.fillStyle = bg;
        ctx.fillRect(x, y, size, size);
        if (b.shade > 0) {
          ctx.fillStyle = `rgba(128,128,128,${b.shade})`;
          ctx.fillRect(x, y, size, size);
        }
        // Le front du balayage prend la couleur principale, puis s'éteint.
        const moving = inT < 1 ? 1 - inT : outT > 0 ? 1 - outT : 0;
        if (moving > 0) {
          ctx.globalAlpha = moving * 0.85;
          ctx.fillStyle = accent;
          ctx.fillRect(x, y, size, size);
          ctx.globalAlpha = 1;
        }
      }
    };

    const frame = (now: number) => {
      if (last) clock += justSwapped ? Math.min(now - last, STEP_AFTER_SWAP_MS) : now - last;
      justSwapped = false;
      last = now;
      drawBlocks();

      const label = labelRef.current;
      if (label) {
        const appear = clamp01((clock - COVER_MS * 0.7) / (COVER_MS * 0.3));
        const leave = clamp01((clock - COVER_MS - HOLD_MS) / (REVEAL_MS * 0.4));
        label.style.opacity = String(easeOut(appear) * (1 - leave));
        label.style.transform = `translateY(${(1 - easeOut(appear)) * 8 - leave * 8}px)`;
      }

      if (!covered && clock >= COVER_MS) {
        covered = true;
        justSwapped = true;
        // Pendant ce temps la fenêtre doit être pleine : un grand saut d'horloge a pu sauter l'image.
        clock = Math.min(clock, COVER_MS);
        drawBlocks();
        callbacks.current.onCovered();
      }
      if (clock >= end) {
        callbacks.current.onDone();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [id, to]);

  return (
    <div className="fixed inset-0 z-[9999]" role="status" aria-label={LABELS[to]}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden />
      <div
        ref={labelRef}
        className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none"
        style={{ opacity: 0 }}
      >
        <Logo size={52} />
        <span className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
          {LABELS[to]}
        </span>
      </div>
    </div>
  );
}
