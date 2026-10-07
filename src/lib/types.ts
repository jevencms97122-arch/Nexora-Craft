export type Loader = "vanilla" | "fabric" | "forge" | "quilt" | "neoforge";

export interface Instance {
  id: string;
  name: string;
  mc_version: string;
  loader: Loader;
  loader_version: string | null;
  min_ram_mb: number;
  max_ram_mb: number;
  width: number;
  height: number;
  jvm_args: string;
  created_at: string;
  last_played: string | null;
  icon: string | null;
  playtime_seconds: number;
  banner: string | null;
}

export interface NewInstance {
  name: string;
  mc_version: string;
  loader?: Loader;
}

export interface Account {
  uuid: string;
  username: string;
  skin_url: string | null;
  minecraft_access_token: string;
  minecraft_token_expires_at: string;
  ms_refresh_token: string;
  is_offline: boolean;
}

export interface AccountsFile {
  active_uuid: string | null;
  accounts: Account[];
}

export interface VersionEntry {
  id: string;
  type: "release" | "snapshot" | "old_beta" | "old_alpha";
  url: string;
  releaseTime: string;
}

export interface VersionManifest {
  latest: { release: string; snapshot: string };
  versions: VersionEntry[];
}

export interface Settings {
  ms_client_id: string | null;
  default_min_ram_mb: number;
  default_max_ram_mb: number;
  background_image: string | null;
  together_port: number;
  together_secret_key: string | null;
  together_address: string | null;
}

export interface DownloadProgress {
  instance_id: string;
  stage: string;
  completed: number;
  total: number;
}

export interface GameLogLine {
  instance_id: string;
  line: string;
  stream: "stdout" | "stderr";
}

export interface GameExited {
  instance_id: string;
  code: number | null;
}

export type ContentType = "mod" | "shader" | "resourcepack" | "datapack" | "modpack";

export interface ModrinthHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  icon_url: string | null;
  downloads: number;
  project_type: string;
  categories: string[];
}

export interface ModrinthSearchResponse {
  hits: ModrinthHit[];
  total_hits: number;
}

export interface InstalledContent {
  project_id: string;
  version_id: string;
  title: string;
  icon_url: string | null;
  content_type: ContentType;
  file_name: string;
  disabled: boolean;
}

export interface Favorite {
  project_id: string;
  title: string;
  icon_url: string | null;
  content_type: ContentType;
}

export interface ProjectVersion {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
}

export interface RemoteSkin {
  url: string;
  variant: "classic" | "slim";
}

export interface SkinPage {
  skins: RemoteSkin[];
  next: string | null;
}

export interface InstallResult {
  item: InstalledContent;
  dependencies: InstalledContent[];
}

export interface ContentUpdate {
  project_id: string;
  title: string;
  latest_version_id: string;
  latest_version_number: string;
}

export interface Server {
  id: string;
  name: string;
  address: string;
  instance_id: string | null;
  /// Serveur officiel du launcher : toujours présent, non supprimable.
  official: boolean;
}

export interface ServerStatus {
  online: boolean;
  players_online: number;
  players_max: number;
  motd: string;
  version: string;
  latency_ms: number;
  favicon: string | null;
}

export interface Screenshot {
  instance_id: string;
  instance_name: string;
  file_name: string;
  path: string;
  modified_ms: number;
}

export interface SharedInstance {
  name: string;
  mc_version: string;
  loader: Loader;
  loader_version: string | null;
  items: { project_id: string; version_id: string; content_type: ContentType }[];
}

export interface ImportResult {
  instance: Instance;
  failed: string[];
}

export interface ImportProgress {
  done: number;
  total: number;
  title: string;
}

export interface WardrobeSkin {
  id: string;
  variant: "classic" | "slim";
  data_uri: string;
}

/// Diagnostic rédigé par l'IA à partir des journaux et de la configuration de l'instance.
export interface AiReport {
  title: string;
  explanation: string;
  suggestions: string[];
}
