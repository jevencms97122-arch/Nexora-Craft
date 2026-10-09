import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import { listen } from "@tauri-apps/api/event";
import { AUTH_CALLBACK_URL, sessionStore, skinUrl, supabase } from "../lib/supabase";
import { useAccountStore } from "./accountStore";
import { toast } from "./toastStore";

/// Compte Nexora : un pseudo réservé, rattaché à un e-mail.
export interface Profile {
  id: string;
  username: string;
  skin_updated_at: string | null;
}

export type FriendState = "friend" | "incoming" | "outgoing";

export interface Friend {
  friendshipId: number;
  userId: string;
  username: string;
  /// Skin en ligne du joueur, s'il en a publié un.
  skin: string | null;
  state: FriendState;
  online: boolean;
  status: "launcher" | "playing" | null;
  /// Serveur sur lequel il joue, quand le launcher le connaît.
  server: string | null;
}

export type NewsKind = "info" | "event" | "maintenance" | "update";

export interface NewsItem {
  id: number;
  title: string;
  body: string;
  kind: NewsKind;
  link: string | null;
  pinned: boolean;
  published_at: string;
}

/// Résultat d'une action : `null` si tout s'est bien passé, sinon le message à afficher.
type Failure = string | null;

interface CloudState {
  session: Session | null;
  profile: Profile | null;
  /// Vrai une fois la session enregistrée relue au démarrage.
  ready: boolean;
  friends: Friend[];
  news: NewsItem[];
  /// Renvoie "confirm" quand un e-mail de confirmation a été envoyé.
  signUp: (email: string, password: string, username: string) => Promise<{ error: Failure; confirm?: boolean }>;
  signIn: (email: string, password: string) => Promise<Failure>;
  /// Adresse en attente de confirmation après une inscription, sinon `null`.
  pendingEmail: string | null;
  resendConfirmation: () => Promise<Failure>;
  /// Abandonne l'attente pour revenir au formulaire (autre adresse, ou connexion).
  cancelPending: () => void;
  signOut: () => Promise<void>;
  refreshFriends: () => Promise<void>;
  addFriend: (username: string) => Promise<Failure>;
  acceptFriend: (friendshipId: number) => Promise<Failure>;
  removeFriend: (friendshipId: number) => Promise<Failure>;
  /// Signale aux amis que le joueur est en ligne (à appeler régulièrement).
  heartbeat: (status: "launcher" | "playing", server: string | null) => Promise<void>;
  /// Publie en ligne le skin du compte local qui porte le pseudo réservé.
  syncSkin: () => Promise<void>;
  loadNews: () => Promise<void>;
}

const SKIN_SYNC_KEY = "nexora.skinSynced";
/// Dernier profil connu, gardé avec la session : il sert quand le launcher démarre sans internet.
const PROFILE_KEY = "nexora.profile";
const PENDING_KEY = "nexora.pendingEmail";

function readPending(): string | null {
  try {
    return localStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

function writePending(email: string | null) {
  try {
    if (email) localStorage.setItem(PENDING_KEY, email);
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // Stockage indisponible : l'attente ne survivra pas à un redémarrage.
  }
}

function authMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "E-mail ou mot de passe incorrect.";
  if (m.includes("email not confirmed")) return "Confirme ton e-mail (lien reçu par e-mail), puis reconnecte-toi.";
  if (m.includes("already registered")) return "Un compte existe déjà avec cet e-mail.";
  if (m.includes("password")) return "Mot de passe trop court ou trop simple (6 caractères minimum).";
  if (m.includes("rate limit") || m.includes("security purposes")) return "Trop de tentatives. Réessaie dans quelques minutes.";
  if (m.includes("database error")) return "Ce pseudo vient d'être réservé par quelqu'un d'autre.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Connexion impossible. Vérifie ta connexion internet.";
  if (m.includes("valid email") || m.includes("invalid format")) return "Adresse e-mail invalide.";
  return message;
}

/// Empreinte courte d'un texte, pour savoir si le skin a changé depuis le dernier envoi.
function fingerprint(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return `${text.length}:${h}`;
}

/// Active (ou crée) le compte local qui porte le pseudo réservé.
async function activateLocalAccount(username: string) {
  const accounts = useAccountStore.getState();
  if (!accounts.loaded) await accounts.refresh().catch(() => {});
  const { accounts: list, activeUuid, setActive, loginOffline } = useAccountStore.getState();
  const existing = list.find((a) => a.is_offline && a.username.toLowerCase() === username.toLowerCase());
  if (!existing) await loginOffline(username);
  else if (existing.uuid !== activeUuid) await setActive(existing.uuid);
}

/// Vrai si un compte Nexora est connecté sur ce launcher. Attend au besoin que la session
/// enregistrée ait été relue (au tout début du démarrage).
export async function isSignedIn(): Promise<boolean> {
  for (let i = 0; i < 30 && !useCloudStore.getState().ready; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return !!useCloudStore.getState().session;
}

export const useCloudStore = create<CloudState>((set, get) => {
  async function loadProfile(session: Session | null) {
    if (!session) {
      set({ session: null, profile: null, friends: [], ready: true });
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, skin_updated_at")
      .eq("id", session.user.id)
      .maybeSingle();

    let profile = (data as Profile | null) ?? null;
    if (profile) {
      sessionStore.setItem(PROFILE_KEY, JSON.stringify(profile));
    } else if (error) {
      // Pas de réponse du serveur (hors ligne, coupure) : le joueur reste connecté avec le profil
      // connu, au lieu d'apparaître déconnecté.
      try {
        const cached = JSON.parse((await sessionStore.getItem(PROFILE_KEY)) ?? "null") as Profile | null;
        if (cached?.id === session.user.id) profile = cached;
      } catch {
        // Copie illisible : on fera sans.
      }
    }

    writePending(null);
    set({ session, profile, ready: true, pendingEmail: null });
    if (data) {
      get().refreshFriends();
      get().syncSkin();
    }
  }

  // Les appels à la base sont décalés : ils ne doivent pas partir depuis ce rappel lui-même.
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "TOKEN_REFRESHED") {
      set({ session });
      return;
    }
    setTimeout(() => loadProfile(session), 0);
  });

  // Clic sur le lien de confirmation reçu par e-mail : on termine la connexion et on crée le
  // compte local qui porte le pseudo réservé.
  listen<{ code: string | null; error: string | null }>("auth-callback", async ({ payload }) => {
    if (get().session) return;
    if (payload.error || !payload.code) {
      toast.error("Ce lien de confirmation a expiré ou a déjà servi.");
      return;
    }
    const { data, error } = await supabase.auth.exchangeCodeForSession(payload.code);
    if (error || !data.user) {
      // Lien ouvert depuis un autre appareil ou une autre installation : l'e-mail est confirmé,
      // il reste à se connecter.
      toast.info("E-mail confirmé. Connecte-toi avec ton mot de passe.");
      get().cancelPending();
      return;
    }
    const username = data.user.user_metadata?.username as string | undefined;
    if (username) {
      await activateLocalAccount(username);
      get().syncSkin();
    }
    toast.success(username ? `E-mail confirmé : le pseudo ${username} est à toi` : "E-mail confirmé");
  }).catch(() => {});

  return {
    session: null,
    profile: null,
    ready: false,
    friends: [],
    news: [],

    signUp: async (email, password, username) => {
      const { data: free, error: checkError } = await supabase.rpc("username_available", { p_username: username });
      if (checkError) return { error: authMessage(checkError.message) };
      if (!free) return { error: "Ce pseudo est déjà réservé par un autre joueur." };

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { username }, emailRedirectTo: AUTH_CALLBACK_URL },
      });
      if (error) return { error: authMessage(error.message) };
      // Avec la confirmation par e-mail, un e-mail déjà utilisé renvoie un compte vide.
      if (data.user && data.user.identities?.length === 0) {
        return { error: "Un compte existe déjà avec cet e-mail." };
      }
      // Le compte local n'est créé qu'une fois le compte Nexora utilisable : tout de suite s'il
      // n'y a pas de confirmation par e-mail, sinon au retour du lien de confirmation.
      if (data.session) await activateLocalAccount(username);
      else {
        writePending(email.trim());
        set({ pendingEmail: email.trim() });
      }
      return { error: null, confirm: !data.session };
    },

    pendingEmail: readPending(),

    resendConfirmation: async () => {
      const email = get().pendingEmail;
      if (!email) return null;
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: AUTH_CALLBACK_URL },
      });
      return error ? authMessage(error.message) : null;
    },

    cancelPending: () => {
      writePending(null);
      set({ pendingEmail: null });
    },

    signIn: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) return authMessage(error.message);
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", data.user.id)
        .maybeSingle();
      if (profile?.username) {
        await activateLocalAccount(profile.username);
        get().syncSkin();
      }
      return null;
    },

    signOut: async () => {
      const profile = get().profile;
      if (profile) await supabase.from("presence").delete().eq("user_id", profile.id);
      await supabase.auth.signOut();
      await sessionStore.removeItem(PROFILE_KEY);
      // Le compte local qui portait le pseudo réservé part avec la déconnexion : sans compte
      // Nexora, ce pseudo ne doit plus être jouable depuis ce launcher.
      if (profile) {
        const { accounts, remove } = useAccountStore.getState();
        const local = accounts.find(
          (a) => a.is_offline && a.username.toLowerCase() === profile.username.toLowerCase(),
        );
        if (local) await remove(local.uuid).catch(() => {});
      }
    },

    refreshFriends: async () => {
      if (!get().profile) return;
      const { data, error } = await supabase.rpc("friends_overview");
      if (error || !data) return;
      const friends: Friend[] = (data as Record<string, unknown>[]).map((row) => ({
        friendshipId: row.friendship_id as number,
        userId: row.user_id as string,
        username: row.username as string,
        skin: skinUrl(row.user_id as string, row.skin_updated_at as string | null),
        state: row.state as FriendState,
        online: !!row.online,
        status: (row.status as Friend["status"]) ?? null,
        server: (row.server as string | null) ?? null,
      }));
      // En ligne d'abord, puis par pseudo.
      friends.sort((a, b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username));
      set({ friends });
    },

    addFriend: async (username) => {
      const me = get().profile;
      if (!me) return "Connecte-toi à ton compte Nexora.";
      if (username.toLowerCase() === me.username.toLowerCase()) return "C'est ton propre pseudo.";
      const { data: target, error: findError } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();
      if (findError) return authMessage(findError.message);
      if (!target) return `Aucun compte Nexora ne porte le pseudo ${username}.`;
      const { error } = await supabase.from("friendships").insert({ requester: me.id, addressee: target.id });
      if (error) {
        return error.code === "23505"
          ? "Vous êtes déjà amis, ou une demande est déjà en attente."
          : authMessage(error.message);
      }
      await get().refreshFriends();
      return null;
    },

    acceptFriend: async (friendshipId) => {
      const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("id", friendshipId);
      if (error) return authMessage(error.message);
      await get().refreshFriends();
      return null;
    },

    removeFriend: async (friendshipId) => {
      const { error } = await supabase.from("friendships").delete().eq("id", friendshipId);
      if (error) return authMessage(error.message);
      await get().refreshFriends();
      return null;
    },

    heartbeat: async (status, server) => {
      const id = get().profile?.id;
      if (!id) return;
      await supabase.from("presence").upsert({ user_id: id, status, server });
    },

    syncSkin: async () => {
      const profile = get().profile;
      if (!profile) return;
      const accounts = useAccountStore.getState();
      const account = accounts.accounts.find(
        (a) => a.is_offline && a.username.toLowerCase() === profile.username.toLowerCase(),
      );
      if (!account) return;
      await accounts.loadLocalSkin(account.uuid);
      const dataUri = useAccountStore.getState().localSkins[account.uuid] ?? null;

      const mark = `${profile.id}|${dataUri ? fingerprint(dataUri) : "none"}`;
      try {
        if (localStorage.getItem(SKIN_SYNC_KEY) === mark) return;
      } catch {
        // Stockage indisponible : on renvoie simplement le skin.
      }

      const file = `${profile.id}.png`;
      let updatedAt: string | null = null;
      if (dataUri) {
        const blob = await (await fetch(dataUri)).blob();
        const { error } = await supabase.storage.from("skins").upload(file, blob, { upsert: true, contentType: "image/png" });
        if (error) return;
        updatedAt = new Date().toISOString();
      } else if (profile.skin_updated_at) {
        await supabase.storage.from("skins").remove([file]);
      }
      if (updatedAt !== profile.skin_updated_at) {
        const { error } = await supabase.from("profiles").update({ skin_updated_at: updatedAt }).eq("id", profile.id);
        if (error) return;
        set({ profile: { ...profile, skin_updated_at: updatedAt } });
      }
      try {
        localStorage.setItem(SKIN_SYNC_KEY, mark);
      } catch {
        // Voir plus haut.
      }
    },

    loadNews: async () => {
      const { data } = await supabase
        .from("news")
        .select("id, title, body, kind, link, pinned, published_at")
        .order("pinned", { ascending: false })
        .order("published_at", { ascending: false })
        .limit(10);
      if (data) set({ news: data as NewsItem[] });
    },
  };
});
