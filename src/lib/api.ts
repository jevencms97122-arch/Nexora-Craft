import { invoke } from "@tauri-apps/api/core";
import type {
  Account,
  AccountsFile,
  ContentType,
  Favorite,
  Instance,
  InstalledContent,
  ModrinthSearchResponse,
  NewInstance,
  ProjectVersion,
  Settings,
  VersionManifest,
} from "./types";

export const api = {
  listInstances: () => invoke<Instance[]>("list_instances"),
  createInstance: (newInstance: NewInstance) =>
    invoke<Instance>("create_instance", { newInstance }),
  updateInstance: (instance: Instance) =>
    invoke<Instance>("update_instance", { instance }),
  deleteInstance: (id: string) => invoke<void>("delete_instance", { id }),

  listMcVersions: () => invoke<VersionManifest>("list_mc_versions"),

  listAccounts: () => invoke<AccountsFile>("list_accounts"),
  setActiveAccount: (uuid: string) =>
    invoke<AccountsFile>("set_active_account", { uuid }),
  removeAccount: (uuid: string) =>
    invoke<AccountsFile>("remove_account", { uuid }),
  loginMicrosoft: () => invoke<Account>("login_microsoft"),
  createOfflineAccount: (username: string) =>
    invoke<Account>("create_offline_account", { username }),

  setSkin: (path: string, variant: "classic" | "slim") =>
    invoke<void>("set_skin", { path, variant }),
  clearSkin: () => invoke<void>("clear_skin"),
  getLocalSkin: (uuid: string) => invoke<string | null>("get_local_skin", { uuid }),

  getSettings: () => invoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) =>
    invoke<void>("save_settings", { settings }),
  setBackgroundImage: (path: string) =>
    invoke<string>("set_background_image", { path }),
  clearBackgroundImage: () => invoke<void>("clear_background_image"),

  launchInstance: (instanceId: string) =>
    invoke<void>("launch_instance", { instanceId }),

  searchModrinth: (params: {
    query: string;
    contentType: ContentType;
    mcVersion?: string | null;
    loader?: string | null;
  }) =>
    invoke<ModrinthSearchResponse>("search_modrinth", {
      query: params.query,
      contentType: params.contentType,
      mcVersion: params.mcVersion ?? null,
      loader: params.loader ?? null,
    }),

  listContentVersions: (projectId: string) =>
    invoke<ProjectVersion[]>("list_content_versions", { projectId }),

  listInstalledContent: (instanceId: string) =>
    invoke<InstalledContent[]>("list_installed_content", { instanceId }),

  installContent: (params: {
    instanceId: string;
    projectId: string;
    versionId: string;
    title: string;
    iconUrl: string | null;
    contentType: ContentType;
  }) =>
    invoke<InstalledContent>("install_content", {
      instanceId: params.instanceId,
      projectId: params.projectId,
      versionId: params.versionId,
      title: params.title,
      iconUrl: params.iconUrl,
      contentType: params.contentType,
    }),

  removeContent: (instanceId: string, projectId: string) =>
    invoke<void>("remove_content", { instanceId, projectId }),

  installModpack: (params: { projectId: string; versionId: string; instanceName: string }) =>
    invoke<Instance>("install_modpack", {
      projectId: params.projectId,
      versionId: params.versionId,
      instanceName: params.instanceName,
    }),

  listFavorites: () => invoke<Favorite[]>("list_favorites"),
  addFavorite: (params: {
    projectId: string;
    title: string;
    iconUrl: string | null;
    contentType: ContentType;
  }) =>
    invoke<Favorite[]>("add_favorite", {
      projectId: params.projectId,
      title: params.title,
      iconUrl: params.iconUrl,
      contentType: params.contentType,
    }),
  removeFavorite: (projectId: string) => invoke<Favorite[]>("remove_favorite", { projectId }),

  startTogether: () => invoke<void>("start_together"),
  stopTogether: () => invoke<void>("stop_together"),
  isTogetherRunning: () => invoke<boolean>("is_together_running"),
  saveTogetherPort: (port: number) => invoke<void>("save_together_port", { port }),
};
