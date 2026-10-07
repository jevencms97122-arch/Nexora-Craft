import { create } from "zustand";
import { api } from "../lib/api";
import type { Account, AccountsFile, RemoteSkin } from "../lib/types";

interface AccountState {
  accounts: Account[];
  activeUuid: string | null;
  loading: boolean;
  /// Vrai une fois la liste des comptes lue au moins une fois.
  loaded: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  login: () => Promise<void>;
  loginOffline: (username: string) => Promise<void>;
  setActive: (uuid: string) => Promise<void>;
  remove: (uuid: string) => Promise<void>;
  active: () => Account | null;
  /// Skins locaux (data URI) des comptes hors-ligne, par UUID; null = pas de skin perso.
  localSkins: Record<string, string | null>;
  loadLocalSkin: (uuid: string) => Promise<void>;
  /// Skin en ligne des comptes Microsoft, par UUID ; null = introuvable.
  remoteSkins: Record<string, RemoteSkin | null>;
  loadRemoteSkin: (account: Account) => Promise<void>;
  /// Affiche tout de suite un skin qu'on vient d'appliquer (Mojang met quelques minutes à le publier).
  setRemoteSkin: (uuid: string, skin: RemoteSkin) => void;
}

function apply(set: (partial: Partial<AccountState>) => void, data: AccountsFile) {
  set({ accounts: data.accounts, activeUuid: data.active_uuid });
}

export const useAccountStore = create<AccountState>((set, get) => ({
  accounts: [],
  activeUuid: null,
  loading: false,
  loaded: false,
  error: null,
  localSkins: {},
  remoteSkins: {},

  loadRemoteSkin: async (account: Account) => {
    // Une seule recherche par compte : le skin ne change que depuis ce launcher.
    if (get().remoteSkins[account.uuid] !== undefined) return;
    const skin = await api.lookupPlayerSkin(account.username).catch(() => null);
    set((state) => ({ remoteSkins: { ...state.remoteSkins, [account.uuid]: skin } }));
  },

  setRemoteSkin: (uuid, skin) => set((state) => ({ remoteSkins: { ...state.remoteSkins, [uuid]: skin } })),

  loadLocalSkin: async (uuid: string) => {
    const skin = await api.getLocalSkin(uuid).catch(() => null);
    set((state) => ({ localSkins: { ...state.localSkins, [uuid]: skin } }));
  },

  refresh: async () => {
    const data = await api.listAccounts();
    apply(set, data);
    set({ loaded: true });
  },

  login: async () => {
    set({ loading: true, error: null });
    try {
      await api.loginMicrosoft();
      await get().refresh();
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ loading: false });
    }
  },

  loginOffline: async (username: string) => {
    set({ loading: true, error: null });
    try {
      await api.createOfflineAccount(username);
      await get().refresh();
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ loading: false });
    }
  },

  setActive: async (uuid: string) => {
    const data = await api.setActiveAccount(uuid);
    apply(set, data);
  },

  remove: async (uuid: string) => {
    const data = await api.removeAccount(uuid);
    apply(set, data);
  },

  active: () => {
    const { accounts, activeUuid } = get();
    return accounts.find((a) => a.uuid === activeUuid) ?? null;
  },
}));
