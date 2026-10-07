/*
 * Son de confirmation, synthétisé à la volée (aucun fichier audio à embarquer).
 * C'est le seul son de l'interface : il se joue quand une action réussit (enregistrement,
 * installation, copie...). Désactivable dans les réglages.
 */

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

/// Une note : fréquence, durée, volume, délai avant le départ.
function tone(ctx: AudioContext, frequency: number, duration: number, volume: number, delay = 0) {
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/// Deux notes montantes, courtes et discrètes.
export function play() {
  if (!enabled) return;
  const ctx = audio();
  if (!ctx) return;
  tone(ctx, 660, 0.09, 0.05);
  tone(ctx, 990, 0.14, 0.05, 0.08);
}
