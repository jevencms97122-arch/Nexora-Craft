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

export function isValidUsername(name: string) {
  return /^[A-Za-z0-9_]{3,16}$/.test(name);
}
