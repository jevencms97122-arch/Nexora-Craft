import { create } from "zustand";
import { api } from "../lib/api";
import type { Instance, NewInstance } from "../lib/types";

/// Instance réservée au serveur officiel : elle est lancée par la page Nexora SMP et n'apparaît nulle part ailleurs.
const OFFICIAL_INSTANCE_NAME = "Nexora-SMP";

interface InstanceState {
  instances: Instance[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (newInstance: NewInstance) => Promise<Instance>;
  update: (instance: Instance) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useInstanceStore = create<InstanceState>((set, get) => ({
  instances: [],
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const instances = (await api.listInstances()).filter((i) => i.name !== OFFICIAL_INSTANCE_NAME);
      set({ instances });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ loading: false });
    }
  },

  create: async (newInstance) => {
    const instance = await api.createInstance(newInstance);
    await get().refresh();
    return instance;
  },

  update: async (instance) => {
    await api.updateInstance(instance);
    await get().refresh();
  },

  remove: async (id) => {
    await api.deleteInstance(id);
    await get().refresh();
  },
}));
