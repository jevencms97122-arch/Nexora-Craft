/// « 12 h 05 », « 45 min », ou « Jamais joué » pour zéro.
export function formatPlaytime(seconds: number, empty = "Jamais joué") {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return empty;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`;
}

export function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/// Pseudo Minecraft valide : 3 à 16 caractères, lettres, chiffres et « _ ».
/// Mémoire saisie par le joueur, en Mo. Une petite valeur (« 8 ») est comprise comme des Go, et
/// le résultat ne descend jamais sous 512 Mo : en dessous, le jeu ne démarre pas.
export function normalizeRam(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1024;
  const megabytes = value <= 64 ? value * 1024 : value;
  return Math.max(512, Math.round(megabytes));
}

/// « 8192 » → « 8 Go », « 6500 » → « 6,3 Go ».
export function formatRam(megabytes: number): string {
  const gigabytes = normalizeRam(megabytes) / 1024;
  return `${Number.isInteger(gigabytes) ? gigabytes : gigabytes.toFixed(1).replace(".", ",")} Go`;
}

/// « 1 536 000 » → « 1,5 Mo ».
export function formatBytes(bytes: number) {
  const units = ["o", "Ko", "Mo", "Go"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const text = unit === 0 || value >= 10 ? Math.round(value).toString() : value.toFixed(1).replace(".", ",");
  return `${text} ${units[unit]}`;
}

export interface RamAdvice {
  /// Mémoire conseillée, en Mo.
  suggestedMb: number;
  level: "warn" | "danger";
  message: string;
}

/// Conseil de mémoire pour une instance, ou null si le réglage est raisonnable.
/// `totalMb` : mémoire du PC (nul si inconnue) ; `modCount` : nombre de mods actifs.
export function ramAdvice(totalMb: number | null, maxMb: number, minMb: number, modCount: number): RamAdvice | null {
  const wantGb = modCount === 0 ? 3 : modCount < 40 ? 4 : modCount < 100 ? 6 : 8;
  // Le jeu ne doit jamais prendre plus de la moitié de la mémoire du PC.
  const capGb = totalMb ? Math.max(2, Math.floor(totalMb / 2 / 1024)) : wantGb;
  const suggestedGb = Math.min(wantGb, capGb);
  const suggestedMb = suggestedGb * 1024;

  if (minMb > maxMb) {
    return { suggestedMb, level: "danger", message: "La mémoire minimale dépasse la mémoire maximale : le jeu ne démarrera pas." };
  }
  if (totalMb && maxMb > totalMb * 0.8) {
    return {
      suggestedMb,
      level: "danger",
      message: `${formatRam(maxMb)} sur un PC de ${formatRam(totalMb)} : Windows et le jeu vont se disputer la mémoire. ${suggestedGb} Go suffisent.`,
    };
  }
  if (totalMb && maxMb > totalMb * 0.6) {
    return {
      suggestedMb,
      level: "warn",
      message: `Ça laisse peu de mémoire à Windows et à tes autres applications (PC de ${formatRam(totalMb)}). ${suggestedGb} Go suffisent.`,
    };
  }
  if (modCount >= 40 && maxMb < wantGb * 1024 * 0.75) {
    return {
      suggestedMb,
      level: "warn",
      message: `Avec ${modCount} mods, ${suggestedGb} Go sont conseillés : le jeu risque de saccader ou de planter.`,
    };
  }
  return null;
}

export function isValidUsername(name: string) {
  return /^[A-Za-z0-9_]{3,16}$/.test(name);
}
