import { invoke } from "@tauri-apps/api/core";
import type {
  Account,
  AccountsFile,
  AiReport,
  ContentType,
  ContentUpdate,
  ImportResult,
  InstallResult,
  Screenshot,
  Server,
  ServerStatus,
  SharedInstance,
  WardrobeSkin,
  Favorite,
  Instance,
  InstalledContent,
  ModrinthSearchResponse,
  NewInstance,
  ProjectVersion,
  RemoteSkin,
  Settings,
  SkinPage,
  VersionManifest,
} from "./types";

export const api = {
  listInstances: () => invoke<Instance[]>("list_instances"),
  createInstance: (newInstance: NewInstance) =>
    invoke<Instance>("create_instance", { newInstance }),
  updateInstance: (instance: Instance) =>
    invoke<Instance>("update_instance", { instance }),
  deleteInstance: (id: string) => invoke<void>("delete_instance", { id }),
  /// Icône ou bannière personnalisée ; `path` nul retire l'image.
  setInstanceImage: (instanceId: string, kind: "icon" | "banner", path: string | null) =>
    invoke<Instance>("set_instance_image", { instanceId, kind, path }),

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
  browseSkins: (after: string | null) => invoke<SkinPage>("browse_skins", { after }),
  lookupPlayerSkin: (username: string) =>
    invoke<RemoteSkin>("lookup_player_skin", { username }),
  applyRemoteSkin: (url: string, variant: "classic" | "slim") =>
    invoke<void>("apply_remote_skin", { url, variant }),
  getLocalSkin: (uuid: string) => invoke<string | null>("get_local_skin", { uuid }),

  getSettings: () => invoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) =>
    invoke<void>("save_settings", { settings }),
  setBackgroundImage: (path: string) =>
    invoke<string>("set_background_image", { path }),
  clearBackgroundImage: () => invoke<void>("clear_background_image"),

  /// `server` : adresse à rejoindre automatiquement au démarrage du jeu.
  launchInstance: (instanceId: string, server?: string | null) =>
    invoke<void>("launch_instance", { instanceId, server: server ?? null }),

  searchModrinth: (params: {
    query: string;
    contentType: ContentType;
    mcVersion?: string | null;
    loader?: string | null;
    /// Nombre de résultats à sauter (pagination, 30 résultats par page).
    offset?: number;
  }) =>
    invoke<ModrinthSearchResponse>("search_modrinth", {
      query: params.query,
      contentType: params.contentType,
      mcVersion: params.mcVersion ?? null,
      loader: params.loader ?? null,
      offset: params.offset ?? 0,
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
    invoke<InstallResult>("install_content", {
      instanceId: params.instanceId,
      projectId: params.projectId,
      versionId: params.versionId,
      title: params.title,
      iconUrl: params.iconUrl,
      contentType: params.contentType,
    }),

  removeContent: (instanceId: string, projectId: string) =>
    invoke<void>("remove_content", { instanceId, projectId }),

  installModpack: (params: { projectId: string; versionId: string; instanceName: string; iconUrl?: string | null }) =>
    invoke<Instance>("install_modpack", {
      projectId: params.projectId,
      versionId: params.versionId,
      instanceName: params.instanceName,
      iconUrl: params.iconUrl ?? null,
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

  checkContentUpdates: (instanceId: string) =>
    invoke<ContentUpdate[]>("check_content_updates", { instanceId }),
  /// Met à jour un contenu, ou tous si `projectId` est omis. Retourne le nombre de mises à jour.
  updateContent: (instanceId: string, projectId?: string) =>
    invoke<number>("update_content", { instanceId, projectId: projectId ?? null }),
  setContentEnabled: (instanceId: string, projectId: string, enabled: boolean) =>
    invoke<InstalledContent[]>("set_content_enabled", { instanceId, projectId, enabled }),

  listServers: () => invoke<Server[]>("list_servers"),
  addServer: (name: string, address: string) => invoke<Server[]>("add_server", { name, address }),
  removeServer: (id: string) => invoke<Server[]>("remove_server", { id }),
  setServerInstance: (id: string, instanceId: string | null) =>
    invoke<Server[]>("set_server_instance", { id, instanceId }),
  /// Instance réservée au serveur officiel, créée à la bonne version au premier appel.
  ensureOfficialInstance: () => invoke<Instance>("ensure_official_instance"),
  pingServer: (address: string) => invoke<ServerStatus>("ping_server", { address }),

  listScreenshots: () => invoke<Screenshot[]>("list_screenshots"),
  deleteScreenshot: (path: string) => invoke<void>("delete_screenshot", { path }),
  openScreenshot: (path: string) => invoke<void>("open_screenshot", { path }),
  openScreenshotsFolder: (instanceId: string) =>
    invoke<void>("open_screenshots_folder", { instanceId }),

  exportInstanceCode: (instanceId: string) => invoke<string>("export_instance_code", { instanceId }),
  previewInstanceCode: (code: string) => invoke<SharedInstance>("preview_instance_code", { code }),
  importInstanceCode: (code: string, name: string) =>
    invoke<ImportResult>("import_instance_code", { code, name }),

  listWardrobe: () => invoke<WardrobeSkin[]>("list_wardrobe"),
  removeWardrobeSkin: (id: string) => invoke<void>("remove_wardrobe_skin", { id }),
  applyWardrobeSkin: (id: string) => invoke<void>("apply_wardrobe_skin", { id }),

  /// Analyse par IA via le relais. Les journaux sont anonymisés par le backend avant l'envoi.
  analyzeCrashWithAi: (instanceId: string | null, logs: string[]) =>
    invoke<AiReport>("analyze_crash_with_ai", { instanceId, logs }),

  startTogether: () => invoke<void>("start_together"),
  stopTogether: () => invoke<void>("stop_together"),
  isTogetherRunning: () => invoke<boolean>("is_together_running"),
  saveTogetherPort: (port: number) => invoke<void>("save_together_port", { port }),
};
