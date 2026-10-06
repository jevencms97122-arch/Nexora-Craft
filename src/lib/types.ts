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
