/*
 * Sons d'interface, synthétisés à la volée (aucun fichier audio à embarquer).
 * Volontairement courts et discrets ; désactivables dans les réglages.
 */

export type Sound = "click" | "toggle" | "success" | "error" | "launch";

let context: AudioContext | null = null;
let enabled = true;

export function setSoundsEnabled(value: boolean) {
  enabled = value;
}

function audio(): AudioContext | null {
  try {
    context ??= new AudioContext();
    // Le navigateur suspend l'audio tant qu'il n'y a pas eu d'interaction.
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null;
  }
}

/// Une note : fréquence de départ et d'arrivée, durée, volume, forme d'onde, délai.
function tone(
  ctx: AudioContext,
  from: number,
  to: number,
  duration: number,
  volume: number,
  type: OscillatorType = "sine",
  delay = 0,
) {
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function play(sound: Sound) {
  if (!enabled) return;
  const ctx = audio();
  if (!ctx) return;

  switch (sound) {
    case "click":
      tone(ctx, 720, 520, 0.05, 0.035, "triangle");
      break;
    case "toggle":
      tone(ctx, 520, 780, 0.07, 0.04, "triangle");
      break;
    case "success":
      tone(ctx, 660, 660, 0.09, 0.05);
      tone(ctx, 990, 990, 0.14, 0.05, "sine", 0.08);
      break;
    case "error":
      tone(ctx, 240, 160, 0.18, 0.06, "sawtooth");
      break;
    case "launch":
      tone(ctx, 260, 780, 0.32, 0.05, "triangle");
      tone(ctx, 1040, 1040, 0.22, 0.04, "sine", 0.28);
      break;
  }
}
