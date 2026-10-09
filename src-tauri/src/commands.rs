use tauri::{AppHandle, State};

use crate::accounts::{self, Account, AccountsFile};
use crate::auth;
use crate::content::{self, ContentType, ContentUpdate, InstallResult, InstalledContent};
use crate::error::{AppError, AppResult};
use crate::favorites::{self, Favorite};
use crate::instances::{self, Instance, Loader, NewInstance};
use crate::minecraft::{self, loaders::LoaderKind};
use crate::modrinth::{ProjectVersion, SearchResponse};
use crate::screenshots::{self, Screenshot};
use crate::servers::{self, Server, ServerStatus};
use crate::settings::{self, Settings};
use crate::minecraft::forge::ForgeKind;
use crate::share::{self, ImportResult, SharedInstance};
use crate::skins::{self, WardrobeSkin};
use crate::state::AppState;

// ---------- Instances ----------

#[tauri::command]
pub fn list_instances() -> AppResult<Vec<Instance>> {
    instances::list()
}

#[tauri::command]
pub async fn create_instance(state: State<'_, AppState>, new_instance: NewInstance) -> AppResult<Instance> {
    let loader = new_instance.loader.clone();
    let mc_version = new_instance.mc_version.clone();

    // La version du loader est cherchée avant de créer l'instance : si le loader n'existe pas pour
    // cette version de Minecraft, rien n'est créé.
    let loader_version = if let Some(kind) = loader_kind_for(&loader) {
        Some(minecraft::loaders::resolve_recommended_version(&state.http, kind, &mc_version).await?)
    } else if let Some(kind) = forge_kind_for(&loader) {
        Some(minecraft::forge::resolve_recommended_version(&state.http, kind, &mc_version).await?)
    } else {
        None
    };

    let mut instance = instances::create(new_instance)?;
    if loader_version.is_some() {
        instance.loader_version = loader_version;
        instance = instances::update(instance)?;
    }
    Ok(instance)
}

fn forge_kind_for(loader: &Loader) -> Option<ForgeKind> {
    match loader {
        Loader::Forge => Some(ForgeKind::Forge),
        Loader::NeoForge => Some(ForgeKind::NeoForge),
        _ => None,
    }
}

fn loader_kind_for(loader: &Loader) -> Option<LoaderKind> {
    match loader {
        Loader::Fabric => Some(LoaderKind::Fabric),
        Loader::Quilt => Some(LoaderKind::Quilt),
        _ => None,
    }
}

#[tauri::command]
pub fn update_instance(instance: Instance) -> AppResult<Instance> {
    instances::update(instance)
}

#[tauri::command]
pub fn delete_instance(id: String) -> AppResult<()> {
    instances::delete(&id)
}

// ---------- Versions Minecraft ----------

#[tauri::command]
pub async fn list_mc_versions(state: State<'_, AppState>) -> AppResult<minecraft::manifest::VersionManifest> {
    minecraft::manifest::fetch_manifest(&state.http).await
}

// ---------- Comptes / Auth ----------

#[tauri::command]
pub fn list_accounts() -> AppResult<AccountsFile> {
    accounts::list()
}

#[tauri::command]
pub fn set_active_account(uuid: String) -> AppResult<AccountsFile> {
    accounts::set_active(&uuid)
}

#[tauri::command]
pub fn remove_account(uuid: String) -> AppResult<AccountsFile> {
    accounts::remove(&uuid)
}

#[tauri::command]
pub async fn login_microsoft(state: State<'_, AppState>) -> AppResult<Account> {
    let cfg = settings::load()?;
    let client_id = cfg.ms_client_id.unwrap_or_default();
    auth::login(&state.http, &client_id).await
}

#[tauri::command]
pub fn create_offline_account(username: String) -> AppResult<Account> {
    accounts::create_offline(&username)
}

// ---------- Skins ----------

async fn fresh_active_account(state: &AppState) -> AppResult<Account> {
    let account = accounts::active()?.ok_or(AppError::NoAccount)?;
    if account.is_offline {
        return Ok(account);
    }
    let cfg = settings::load()?;
    let client_id = cfg.ms_client_id.unwrap_or_default();
    auth::ensure_fresh(&state.http, &client_id, &account).await
}

#[tauri::command]
pub async fn set_skin(state: State<'_, AppState>, path: String, variant: String) -> AppResult<()> {
    let account = fresh_active_account(&state).await?;
    skins::set_skin(&state.http, &account, std::path::Path::new(&path), &variant).await
}

#[tauri::command]
pub async fn clear_skin(state: State<'_, AppState>) -> AppResult<()> {
    let account = fresh_active_account(&state).await?;
    skins::clear_skin(&state.http, &account).await
}

#[tauri::command]
pub async fn browse_skins(state: State<'_, AppState>, after: Option<String>) -> AppResult<skins::SkinPage> {
    skins::browse_gallery(&state.http, after.as_deref()).await
}

#[tauri::command]
pub async fn lookup_player_skin(state: State<'_, AppState>, username: String) -> AppResult<skins::RemoteSkin> {
    skins::lookup_player(&state.http, &username).await
}

#[tauri::command]
pub async fn apply_remote_skin(state: State<'_, AppState>, url: String, variant: String) -> AppResult<()> {
    let account = fresh_active_account(&state).await?;
    skins::apply_remote_skin(&state.http, &account, &url, &variant).await
}

#[tauri::command]
pub fn get_local_skin(uuid: String) -> AppResult<Option<String>> {
    skins::local_skin_data_uri(&uuid)
}

// ---------- Paramètres ----------

#[tauri::command]
pub fn get_settings() -> AppResult<Settings> {
    settings::load()
}

#[tauri::command]
pub fn save_settings(settings: Settings) -> AppResult<()> {
    let old = settings::load().unwrap_or_default();
    settings::save(&settings)?;
    // La mémoire par défaut s'applique aussi aux instances qui n'ont pas été réglées à la main.
    instances::follow_default_memory(
        (old.default_min_ram_mb, old.default_max_ram_mb),
        (settings.default_min_ram_mb, settings.default_max_ram_mb),
    )?;
    Ok(())
}

#[tauri::command]
pub fn set_background_image(path: String) -> AppResult<String> {
    let bytes = std::fs::read(&path)?;
    let mime = match std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/jpeg",
    };
    let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
    let data_uri = format!("data:{mime};base64,{encoded}");

    let mut cfg = settings::load()?;
    cfg.background_image = Some(data_uri.clone());
    settings::save(&cfg)?;
    Ok(data_uri)
}

#[tauri::command]
pub fn clear_background_image() -> AppResult<()> {
    let mut cfg = settings::load()?;
    cfg.background_image = None;
    settings::save(&cfg)
}

// ---------- Lancement du jeu ----------

#[tauri::command]
pub async fn launch_instance(
    app: AppHandle,
    state: State<'_, AppState>,
    instance_id: String,
    server: Option<String>,
) -> AppResult<()> {
    let mut instance = instances::get(&instance_id)?;

    let mut account = accounts::active()?.ok_or(AppError::NoAccount)?;
    if !account.is_offline {
        let cfg = settings::load()?;
        let client_id = cfg.ms_client_id.unwrap_or_default();
        account = auth::ensure_fresh(&state.http, &client_id, &account).await?;
    }

    let entry = minecraft::find_version_entry(&state.http, &instance.mc_version).await?;
    let mut detail = minecraft::manifest::fetch_version_detail(&state.http, &entry).await?;

    if let Some(kind) = loader_kind_for(&instance.loader) {
        // Le loader est tenu à jour à chaque lancement : les mods récents refusent de démarrer
        // avec un loader trop ancien.
        let wanted = minecraft::loaders::up_to_date_version(
            &state.http,
            kind,
            &instance.mc_version,
            instance.loader_version.as_deref(),
        )
        .await;
        if wanted.is_some() && wanted != instance.loader_version {
            instance.loader_version = wanted;
            instance = instances::update(instance)?;
        }

        let loader_version = instance
            .loader_version
            .clone()
            .ok_or_else(|| AppError::Other("version de loader manquante pour cette instance".into()))?;
        minecraft::loaders::apply_loader(&state.http, &mut detail, kind, &instance.mc_version, &loader_version)
            .await?;
    }

    let java_path = crate::java::ensure_java(&state.http, detail.java_version.major_version).await?;

    if let Some(kind) = forge_kind_for(&instance.loader) {
        // Contrairement à Fabric, la version reste celle choisie à la création : les mods Forge
        // sont souvent liés à une version précise du loader.
        let loader_version = match instance.loader_version.clone() {
            Some(version) => version,
            None => {
                let version =
                    minecraft::forge::resolve_recommended_version(&state.http, kind, &instance.mc_version).await?;
                instance.loader_version = Some(version.clone());
                instance = instances::update(instance)?;
                version
            }
        };
        let profile = minecraft::forge::ensure_installed(
            Some(&app),
            &state.http,
            &instance.id,
            kind,
            &instance.mc_version,
            &loader_version,
            &java_path,
        )
        .await?;
        minecraft::forge::apply(&mut detail, profile);
    }

    let (client_jar, libs) =
        minecraft::install::install_version(&app, &state.http, &instance.id, &detail).await?;

    minecraft::launch::launch(
        &app,
        &java_path,
        &instance,
        &detail,
        &client_jar,
        &libs,
        &account,
        server.as_deref(),
    )
    .await?;

    instances::touch_last_played(&instance.id)?;
    Ok(())
}

// ---------- Contenu Modrinth ----------

/// Fiche complète d'un projet Modrinth (présentation, galerie, liens).
#[tauri::command]
pub async fn get_modrinth_project(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<crate::modrinth::ProjectDetails> {
    // L'identifiant vient de l'interface : seuls les caractères d'un identifiant Modrinth passent.
    if project_id.is_empty() || !project_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err(AppError::Other("identifiant de projet invalide".into()));
    }
    crate::modrinth::get_project_details(&state.http, &project_id).await
}

#[tauri::command]
pub async fn search_modrinth(
    state: State<'_, AppState>,
    query: String,
    content_type: ContentType,
    mc_version: Option<String>,
    loader: Option<String>,
    offset: Option<u32>,
) -> AppResult<SearchResponse> {
    content::search(
        &state.http,
        &query,
        content_type,
        mc_version.as_deref(),
        loader.as_deref(),
        offset.unwrap_or(0),
    )
    .await
}

#[tauri::command]
pub fn list_installed_content(instance_id: String) -> AppResult<Vec<InstalledContent>> {
    content::list_installed(&instance_id)
}

#[tauri::command]
pub async fn install_content(
    state: State<'_, AppState>,
    instance_id: String,
    project_id: String,
    version_id: String,
    title: String,
    icon_url: Option<String>,
    content_type: ContentType,
) -> AppResult<InstallResult> {
    content::install_with_dependencies(
        &state.http,
        &instance_id,
        &project_id,
        &version_id,
        &title,
        icon_url,
        content_type,
    )
    .await
}

#[tauri::command]
pub async fn list_content_versions(
    state: State<'_, AppState>,
    project_id: String,
) -> AppResult<Vec<ProjectVersion>> {
    content::list_versions(&state.http, &project_id).await
}

#[tauri::command]
pub async fn install_modpack(
    state: State<'_, AppState>,
    project_id: String,
    version_id: String,
    instance_name: String,
    icon_url: Option<String>,
) -> AppResult<Instance> {
    let instance = content::modpack::install(&state.http, &project_id, &version_id, &instance_name).await?;
    // L'instance reprend l'icône du modpack, pour se reconnaître d'un coup d'œil.
    match icon_url {
        Some(url) if url.starts_with("https://") => instances::set_icon_url(&instance.id, Some(url)),
        _ => Ok(instance),
    }
}

// ---------- Favoris ----------

#[tauri::command]
pub fn list_favorites() -> AppResult<Vec<Favorite>> {
    favorites::list()
}

#[tauri::command]
pub fn add_favorite(
    project_id: String,
    title: String,
    icon_url: Option<String>,
    content_type: ContentType,
) -> AppResult<Vec<Favorite>> {
    favorites::add(Favorite {
        project_id,
        title,
        icon_url,
        content_type,
    })
}

#[tauri::command]
pub fn remove_favorite(project_id: String) -> AppResult<Vec<Favorite>> {
    favorites::remove(&project_id)
}

// ---------- Jouer ensemble (tunnel playit.gg) ----------

#[tauri::command]
pub async fn start_together(app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    let cfg = settings::load()?;
    let secret_key = cfg
        .together_secret_key
        .ok_or_else(|| AppError::Other("aucune clé playit.gg configurée".into()))?;
    crate::together::start(&app, &state, &secret_key).await
}

#[tauri::command]
pub fn stop_together(state: State<'_, AppState>) -> AppResult<()> {
    crate::together::stop(&state)
}

#[tauri::command]
pub fn is_together_running(state: State<'_, AppState>) -> bool {
    crate::together::is_running(&state)
}

#[tauri::command]
pub fn save_together_port(port: u16) -> AppResult<()> {
    let mut cfg = settings::load()?;
    cfg.together_port = port;
    settings::save(&cfg)
}

#[tauri::command]
pub fn remove_content(instance_id: String, project_id: String) -> AppResult<()> {
    content::remove(&instance_id, &project_id)
}


#[tauri::command]
pub async fn check_content_updates(state: State<'_, AppState>, instance_id: String) -> AppResult<Vec<ContentUpdate>> {
    content::check_updates(&state.http, &instance_id).await
}

/// Met à jour un contenu, ou tous si `project_id` est absent. Retourne le nombre de mises à jour.
#[tauri::command]
pub async fn update_content(
    state: State<'_, AppState>,
    instance_id: String,
    project_id: Option<String>,
) -> AppResult<usize> {
    content::update(&state.http, &instance_id, project_id.as_deref()).await
}

#[tauri::command]
pub fn set_content_enabled(instance_id: String, project_id: String, enabled: bool) -> AppResult<Vec<InstalledContent>> {
    content::set_enabled(&instance_id, &project_id, enabled)
}

// ---------- Serveurs ----------

#[tauri::command]
pub fn list_servers() -> AppResult<Vec<Server>> {
    servers::list()
}

#[tauri::command]
pub fn add_server(name: String, address: String) -> AppResult<Vec<Server>> {
    servers::add(&name, &address)
}

#[tauri::command]
pub fn remove_server(id: String) -> AppResult<Vec<Server>> {
    servers::remove(&id)
}

#[tauri::command]
pub fn set_server_instance(id: String, instance_id: Option<String>) -> AppResult<Vec<Server>> {
    servers::set_instance(&id, instance_id)
}

#[tauri::command]
pub async fn ping_server(address: String) -> AppResult<ServerStatus> {
    Ok(servers::ping(&address).await)
}

// ---------- Captures d'écran ----------

#[tauri::command]
pub fn list_screenshots() -> AppResult<Vec<Screenshot>> {
    screenshots::list()
}

#[tauri::command]
pub fn delete_screenshot(path: String) -> AppResult<()> {
    screenshots::delete(&path)
}

#[tauri::command]
pub fn open_screenshot(path: String) -> AppResult<()> {
    screenshots::open(&path)
}

#[tauri::command]
pub fn open_screenshots_folder(instance_id: String) -> AppResult<()> {
    screenshots::open_folder(&instance_id)
}

// ---------- Partage d'instance par code ----------

#[tauri::command]
pub fn export_instance_code(instance_id: String) -> AppResult<String> {
    share::export(&instance_id)
}

#[tauri::command]
pub fn preview_instance_code(code: String) -> AppResult<SharedInstance> {
    share::decode(&code)
}

#[tauri::command]
pub async fn import_instance_code(
    app: AppHandle,
    state: State<'_, AppState>,
    code: String,
    name: String,
) -> AppResult<ImportResult> {
    let shared = share::decode(&code)?;
    let mut instance = instances::create(share::new_instance(&shared, &name))?;

    // On reprend la version de loader du code ; à défaut, la version recommandée.
    instance.loader_version = match (&shared.loader_version, loader_kind_for(&shared.loader)) {
        (Some(version), _) => Some(version.clone()),
        (None, Some(kind)) => {
            Some(minecraft::loaders::resolve_recommended_version(&state.http, kind, &shared.mc_version).await?)
        }
        (None, None) => None,
    };
    let instance = instances::update(instance)?;

    share::install_items(&app, &state.http, instance, &shared).await
}

// ---------- Garde-robe ----------

// ---------- Import de fichiers téléchargés (CurseForge) ----------

/// Vrai si une autre application (musique, vidéo YouTube...) joue du son sur le PC.
#[tauri::command]
pub async fn other_media_playing() -> bool {
    tokio::task::spawn_blocking(crate::media::other_media_playing).await.unwrap_or(false)
}

// ---------- Session du compte Nexora ----------

#[tauri::command]
pub fn session_get(key: String) -> Option<String> {
    crate::session::get(&key)
}

#[tauri::command]
pub fn session_set(key: String, value: String) -> AppResult<()> {
    crate::session::set(&key, &value)
}

#[tauri::command]
pub fn session_remove(key: String) -> AppResult<()> {
    crate::session::remove(&key)
}

const CURSEFORGE_WINDOW: &str = "curseforge";
const CURSEFORGE_URL: &str = "https://www.curseforge.com/minecraft";

/// Ouvre CurseForge dans une fenêtre du launcher (ou la ramène devant si elle existe déjà).
///
/// Cette fenêtre affiche un site extérieur : elle n'a accès à aucune commande du launcher (les
/// permissions ne sont accordées qu'à la fenêtre principale). Ses téléchargements vont dans le
/// dossier Téléchargements, et chaque fichier terminé est signalé à l'interface.
#[tauri::command]
pub async fn open_curseforge(app: AppHandle) -> AppResult<()> {
    use tauri::webview::DownloadEvent;
    use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

    if let Some(window) = app.get_webview_window(CURSEFORGE_WINDOW) {
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(());
    }

    let url = CURSEFORGE_URL.parse().map_err(|_| AppError::Other("adresse CurseForge invalide".into()))?;
    let events = app.clone();
    WebviewWindowBuilder::new(&app, CURSEFORGE_WINDOW, WebviewUrl::External(url))
        .title("CurseForge · Nexora Craft")
        .inner_size(1180.0, 800.0)
        .min_inner_size(800.0, 560.0)
        .on_download(move |_webview, event| {
            if let DownloadEvent::Finished { path: Some(path), success: true, .. } = event {
                let _ = events.emit("curseforge-download", path.to_string_lossy().to_string());
            }
            // Dans tous les cas, le téléchargement suit son cours normal.
            true
        })
        .build()
        .map_err(|e| AppError::Other(format!("impossible d'ouvrir la fenêtre CurseForge : {e}")))?;
    Ok(())
}

#[tauri::command]
pub fn scan_downloads(since_ms: u64) -> AppResult<Vec<crate::imports::DownloadedFile>> {
    crate::imports::scan(since_ms)
}

/// Analyse un fichier téléchargé, et ramène le launcher au premier plan pour poser la question.
#[tauri::command]
pub fn inspect_download(app: AppHandle, path: String) -> AppResult<crate::imports::FileInfo> {
    use tauri::Manager;
    let info = crate::imports::inspect(&path)?;
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(info)
}

#[tauri::command]
pub fn install_download(path: String, instance_id: String) -> AppResult<InstalledContent> {
    crate::imports::install(&path, &instance_id)
}

#[tauri::command]
pub fn list_game_music() -> AppResult<Vec<crate::music::GameTrack>> {
    crate::music::list()
}

#[tauri::command]
pub fn list_wardrobe() -> AppResult<Vec<WardrobeSkin>> {
    skins::list_wardrobe()
}

#[tauri::command]
pub fn remove_wardrobe_skin(id: String) -> AppResult<()> {
    skins::remove_from_wardrobe(&id)
}

#[tauri::command]
pub async fn apply_wardrobe_skin(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let account = fresh_active_account(&state).await?;
    skins::apply_wardrobe_skin(&state.http, &account, &id).await
}

/// Instance réservée au serveur officiel, créée ou remise à niveau à partir du pack officiel.
/// L'avancement de l'installation est diffusé par l'événement « share-progress ».
#[tauri::command]
pub async fn ensure_official_instance(app: AppHandle, state: State<'_, AppState>) -> AppResult<Instance> {
    servers::ensure_official_instance(&app, &state.http).await
}

/// Analyse des journaux par IA, via le relais (le launcher n'embarque aucune clé d'API).
#[tauri::command]
pub async fn analyze_crash_with_ai(
    state: State<'_, AppState>,
    instance_id: Option<String>,
    logs: Vec<String>,
) -> AppResult<crate::ai::AiReport> {
    crate::ai::analyze(&state.http, instance_id.as_deref(), &logs).await
}

/// Icône ou bannière personnalisée d'une instance ; `path` absent retire l'image.
#[tauri::command]
pub fn set_instance_image(
    instance_id: String,
    kind: instances::ImageKind,
    path: Option<String>,
) -> AppResult<Instance> {
    instances::set_image(&instance_id, kind, path.as_deref())
}
