import { createClient } from "@supabase/supabase-js";

/*
 * Services en ligne du launcher (comptes, amis, actualités, skins, statistiques).
 * La clé ci-dessous est la clé « publishable » : elle est faite pour être embarquée dans une
 * application. Ce sont les règles de la base (RLS) qui décident de ce que chacun peut lire ou
 * écrire. La clé secrète du projet, elle, ne doit jamais apparaître ici.
 */
export const SUPABASE_URL = "https://vmaketngbwbuscynjkac.supabase.co";
const SUPABASE_KEY = "sb_publishable_kKuXBqvQ6XwEejoOQYHF7Q_5tIvP_rw";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
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
