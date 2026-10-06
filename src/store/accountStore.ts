import { create } from "zustand";
import { api } from "../lib/api";
import type { Account, AccountsFile } from "../lib/types";

interface AccountState {
  accounts: Account[];
  activeUuid: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  login: () => Promise<void>;
  loginOffline: (username: string) => Promise<void>;
  setActive: (uuid: string) => Promise<void>;
  remove: (uuid: string) => Promise<void>;
  active: () => Account | null;
}

function apply(set: (partial: Partial<AccountState>) => void, data: AccountsFile) {
  set({ accounts: data.accounts, activeUuid: data.active_uuid });
}

export const useAccountStore = create<AccountState>((set, get) => ({
  accounts: [],
  activeUuid: null,
  loading: false,
  error: null,

  refresh: async () => {
    const data = await api.listAccounts();
    apply(set, data);
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
