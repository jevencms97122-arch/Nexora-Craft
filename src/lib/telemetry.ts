import { getVersion } from "@tauri-apps/api/app";
import { supabase } from "./supabase";

/*
 * Statistiques anonymes : un identifiant aléatoire propre à cette installation et la version du
 * launcher, envoyés une fois par jour. Aucun pseudo, e-mail ni contenu du jeu. Désactivable dans
 * les réglages.
 */

const INSTALL_KEY = "nexora.installId";
const ENABLED_KEY = "nexora.stats";
const LAST_SENT_KEY = "nexora.statsDay";

export function statsEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== "0";
  } catch {
    return false;
  }
}

export function setStatsEnabled(enabled: boolean) {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    // Stockage indisponible : la préférence ne sera pas mémorisée.
  }
}

/// À appeler au démarrage : signale que le launcher a été ouvert aujourd'hui.
export async function trackLaunch() {
  try {
    if (!statsEnabled()) return;
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(LAST_SENT_KEY) === today) return;

    let installId = localStorage.getItem(INSTALL_KEY);
    if (!installId) {
      installId = crypto.randomUUID();
      localStorage.setItem(INSTALL_KEY, installId);
    }
    const version = await getVersion();
    const { error } = await supabase.rpc("track_launch", { p_install: installId, p_version: version });
    if (!error) localStorage.setItem(LAST_SENT_KEY, today);
  } catch {
    // Hors ligne ou stockage indisponible : on réessaiera au prochain démarrage.
  }
}
