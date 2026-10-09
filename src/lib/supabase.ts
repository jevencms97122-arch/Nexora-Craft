import { createClient } from "@supabase/supabase-js";
import { invoke } from "@tauri-apps/api/core";

/*
 * Services en ligne du launcher (comptes, amis, actualités, skins, statistiques).
 * La clé ci-dessous est la clé « publishable » : elle est faite pour être embarquée dans une
 * application. Ce sont les règles de la base (RLS) qui décident de ce que chacun peut lire ou
 * écrire. La clé secrète du projet, elle, ne doit jamais apparaître ici.
 */
export const SUPABASE_URL = "https://vmaketngbwbuscynjkac.supabase.co";
const SUPABASE_KEY = "sb_publishable_kKuXBqvQ6XwEejoOQYHF7Q_5tIvP_rw";

/*
 * Où la session est gardée : dans un fichier du dossier de données du launcher (voir session.rs),
 * et non dans la mémoire du navigateur intégré. Le joueur reste ainsi connecté d'une version du
 * launcher à l'autre. La mémoire du navigateur sert de copie de secours, et de point de départ
 * pour les sessions ouvertes avant ce changement.
 */
export const sessionStore = {
  async getItem(key: string): Promise<string | null> {
    try {
      const value = await invoke<string | null>("session_get", { key });
      if (value !== null) return value;
    } catch {
      // Fichier inaccessible : on se rabat sur la copie de secours.
    }
    try {
      const old = localStorage.getItem(key);
      if (old !== null) invoke("session_set", { key, value: old }).catch(() => {});
      return old;
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    await invoke("session_set", { key, value }).catch(() => {});
    try {
      localStorage.setItem(key, value);
    } catch {
      // Copie de secours indisponible : le fichier suffit.
    }
  },
  async removeItem(key: string): Promise<void> {
    await invoke("session_remove", { key }).catch(() => {});
    try {
      localStorage.removeItem(key);
    } catch {
      // Voir plus haut.
    }
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: sessionStore,
    persistSession: true,
    autoRefreshToken: true,
    // Application de bureau : aucune redirection de connexion à lire dans l'adresse.
    detectSessionInUrl: false,
    // Le lien de confirmation revient vers le launcher avec un code à usage unique, que seul
    // l'appareil qui a créé le compte peut échanger contre une session.
    flowType: "pkce",
    storageKey: "nexora.session",
  },
});

/// Adresse ouverte par le lien de confirmation d'e-mail : le launcher y écoute (voir callback.rs).
export const AUTH_CALLBACK_URL = "http://localhost:4720/auth/callback";

/// Adresse publique du skin d'un joueur. `updatedAt` évite de réafficher une ancienne version.
export function skinUrl(userId: string, updatedAt: string | null): string | null {
  if (!updatedAt) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/skins/${userId}.png?v=${new Date(updatedAt).getTime()}`;
}
