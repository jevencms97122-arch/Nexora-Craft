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
export function isValidUsername(name: string) {
  return /^[A-Za-z0-9_]{3,16}$/.test(name);
}
