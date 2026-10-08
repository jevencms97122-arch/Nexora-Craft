//! Loaders Forge et NeoForge.
//!
//! Contrairement à Fabric, ces loaders ne se résument pas à quelques bibliothèques : leur
//! installation applique des correctifs au jeu lui-même. Le launcher délègue donc ce travail à
//! l'installeur officiel, lancé sans fenêtre dans le dossier de données de l'application (dont
//! l'organisation `versions/` + `libraries/` est celle qu'il attend). Il lit ensuite le profil que
//! l'installeur a écrit et le fusionne avec celui de Minecraft.

use std::collections::HashSet;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Deserialize;
use tauri::{AppHandle, Emitter};

use crate::download::{self, DownloadProgress, DownloadTask};
use crate::error::{AppError, AppResult};
use crate::paths;

use super::manifest::{Arguments, DownloadArtifact, Library, LibraryDownloads, VersionDetail};

const INSTALL_TIMEOUT: Duration = Duration::from_secs(15 * 60);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ForgeKind {
    Forge,
    NeoForge,
}

impl ForgeKind {
    pub fn label(self) -> &'static str {
        match self {
            ForgeKind::Forge => "Forge",
            ForgeKind::NeoForge => "NeoForge",
        }
    }

    fn installer_url(self, mc_version: &str, loader_version: &str) -> String {
        match self {
            ForgeKind::Forge => format!(
                "https://maven.minecraftforge.net/net/minecraftforge/forge/{mc_version}-{loader_version}/forge-{mc_version}-{loader_version}-installer.jar"
            ),
            ForgeKind::NeoForge => format!(
                "https://maven.neoforged.net/releases/net/neoforged/neoforge/{loader_version}/neoforge-{loader_version}-installer.jar"
            ),
        }
    }

    /// Option de l'installeur pour une installation sans fenêtre dans un dossier donné.
    fn install_flag(self) -> &'static str {
        match self {
            ForgeKind::Forge => "--installClient",
            ForgeKind::NeoForge => "--install-client",
        }
    }
}

// ---------- Choix de la version ----------

#[derive(Debug, Deserialize)]
struct ForgePromotions {
    promos: std::collections::HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
struct NeoForgeVersions {
    versions: Vec<String>,
}

/// Début des numéros de version NeoForge pour une version de Minecraft :
/// « 1.21.1 » → « 21.1. », « 1.21 » → « 21.0. », « 26.3 » → « 26.3.0. », « 26.1.2 » → « 26.1.2. ».
fn neoforge_prefix(mc_version: &str) -> String {
    match mc_version.strip_prefix("1.") {
        Some(rest) if rest.contains('.') => format!("{rest}."),
        Some(rest) => format!("{rest}.0."),
        None if mc_version.matches('.').count() >= 2 => format!("{mc_version}."),
        None => format!("{mc_version}.0."),
    }
}

/// Dernière version stable de NeoForge pour ce Minecraft, sinon la dernière bêta.
fn pick_neoforge(versions: &[String], mc_version: &str) -> Option<String> {
    let prefix = neoforge_prefix(mc_version);
    let matching: Vec<&String> = versions.iter().filter(|v| v.starts_with(&prefix)).collect();
    matching
        .iter()
        .rev()
        .find(|v| !v.contains('-'))
        .or_else(|| matching.last())
        .map(|v| v.to_string())
}

/// Version conseillée du loader pour une version de Minecraft.
pub async fn resolve_recommended_version(
    client: &reqwest::Client,
    kind: ForgeKind,
    mc_version: &str,
) -> AppResult<String> {
    let missing = || AppError::Other(format!("{} n'existe pas pour Minecraft {mc_version}", kind.label()));
    match kind {
        ForgeKind::Forge => {
            let data: ForgePromotions = client
                .get("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json")
                .send()
                .await?
                .json()
                .await?;
            data.promos
                .get(&format!("{mc_version}-recommended"))
                .or_else(|| data.promos.get(&format!("{mc_version}-latest")))
                .cloned()
                .ok_or_else(missing)
        }
        ForgeKind::NeoForge => {
            let data: NeoForgeVersions = client
                .get("https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge")
                .send()
                .await?
                .json()
                .await?;
            pick_neoforge(&data.versions, mc_version).ok_or_else(missing)
        }
    }
}

// ---------- Installation ----------

/// Profil écrit par l'installeur (`versions/<id>/<id>.json`) : ce qui s'ajoute à Minecraft.
#[derive(Debug, Deserialize)]
pub struct ForgeProfile {
    pub id: String,
    #[serde(rename = "mainClass")]
    main_class: String,
    #[serde(default)]
    libraries: Vec<Library>,
    #[serde(default)]
    arguments: Option<Arguments>,
    #[serde(default, rename = "minecraftArguments")]
    minecraft_arguments: Option<String>,
}

/// Identifiant du profil que cet installeur va créer (lu dans son `version.json`).
fn profile_id(installer: &Path) -> AppResult<String> {
    #[derive(Deserialize)]
    struct Id {
        id: String,
    }
    let unsupported = || {
        AppError::Other("cette version du loader est trop ancienne pour être installée automatiquement".into())
    };
    let file = std::fs::File::open(installer)?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| AppError::Zip(e.to_string()))?;
    let mut entry = archive.by_name("version.json").map_err(|_| unsupported())?;
    let mut data = String::new();
    entry.read_to_string(&mut data)?;
    Ok(serde_json::from_str::<Id>(&data).map_err(|_| unsupported())?.id)
}

fn profile_file(id: &str) -> PathBuf {
    paths::versions_cache_dir().join(id).join(format!("{id}.json"))
}

fn read_profile(id: &str) -> AppResult<ForgeProfile> {
    Ok(serde_json::from_str(&std::fs::read_to_string(profile_file(id))?)?)
}

/// Dernières lignes utiles de la sortie de l'installeur, pour expliquer un échec.
fn tail(output: &[u8]) -> String {
    let text = String::from_utf8_lossy(output);
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    lines[lines.len().saturating_sub(3)..].join(" | ")
}

/// Installe le loader s'il ne l'est pas déjà, puis retourne son profil. `app` sert seulement à
/// afficher l'étape en cours dans l'interface.
pub async fn ensure_installed(
    app: Option<&AppHandle>,
    client: &reqwest::Client,
    instance_id: &str,
    kind: ForgeKind,
    mc_version: &str,
    loader_version: &str,
    java_path: &Path,
) -> AppResult<ForgeProfile> {
    let label = kind.label();
    let installers_dir = paths::app_data_dir().join("installers");
    let installer = installers_dir.join(format!("{}-{mc_version}-{loader_version}.jar", label.to_lowercase()));

    download::download_quiet(
        client,
        vec![DownloadTask { url: kind.installer_url(mc_version, loader_version), dest: installer.clone(), sha1: None }],
    )
    .await
    .map_err(|_| {
        AppError::Other(format!(
            "impossible de télécharger {label} {loader_version} pour Minecraft {mc_version} (version introuvable ou connexion coupée)"
        ))
    })?;

    let id = profile_id(&installer)?;
    if profile_file(&id).is_file() {
        return read_profile(&id);
    }

    if let Some(app) = app {
        let _ = app.emit(
            "download-progress",
            DownloadProgress {
                instance_id: instance_id.to_string(),
                stage: format!("Installation de {label} (une à deux minutes)"),
                completed: 0,
                total: 0,
            },
        );
    }

    // L'installeur refuse de travailler dans un dossier qui ne ressemble pas à celui d'un launcher.
    let root = paths::app_data_dir();
    let profiles = root.join("launcher_profiles.json");
    if !profiles.exists() {
        std::fs::write(&profiles, r#"{"profiles":{}}"#)?;
    }

    let mut command = tokio::process::Command::new(java_path);
    command
        .arg("-jar")
        .arg(&installer)
        .arg(kind.install_flag())
        .arg(&root)
        // L'installeur écrit son journal dans le dossier courant.
        .current_dir(&installers_dir)
        .stdin(std::process::Stdio::null())
        .kill_on_drop(true);
    // Pas de fenêtre de console pendant l'installation.
    #[cfg(windows)]
    command.creation_flags(0x0800_0000);

    let output = tokio::time::timeout(INSTALL_TIMEOUT, command.output())
        .await
        .map_err(|_| AppError::Other(format!("l'installation de {label} a pris trop de temps et a été arrêtée")))??;

    if !output.status.success() || !profile_file(&id).is_file() {
        let detail = tail(if output.stdout.is_empty() { &output.stderr } else { &output.stdout });
        return Err(AppError::Other(format!("l'installation de {label} a échoué : {detail}")));
    }
    read_profile(&id)
}

// ---------- Fusion avec Minecraft ----------

/// « groupe:artefact[:classifieur] », sans la version : deux entrées de même clé désignent la même
/// bibliothèque.
fn library_key(name: &str) -> String {
    let name = name.split('@').next().unwrap_or(name);
    let parts: Vec<&str> = name.split(':').collect();
    match parts.as_slice() {
        [group, artifact, _, classifier, ..] => format!("{group}:{artifact}:{classifier}"),
        [group, artifact, ..] => format!("{group}:{artifact}"),
        _ => name.to_string(),
    }
}

/// Chemin dans le dépôt Maven de « groupe:artefact:version[:classifieur][@extension] ».
fn maven_path(name: &str) -> Option<String> {
    let (coords, extension) = name.split_once('@').unwrap_or((name, "jar"));
    let parts: Vec<&str> = coords.split(':').collect();
    let (group, artifact, version) = (parts.first()?, parts.get(1)?, parts.get(2)?);
    let classifier = parts.get(3).map(|c| format!("-{c}")).unwrap_or_default();
    Some(format!(
        "{}/{artifact}/{version}/{artifact}-{version}{classifier}.{extension}",
        group.replace('.', "/")
    ))
}

/// Rend une bibliothèque du profil utilisable par le téléchargeur : chemin toujours renseigné, et
/// empreinte vide ignorée (fichiers fabriqués sur place par l'installeur).
fn normalize(mut lib: Library) -> Library {
    let fallback = maven_path(&lib.name);
    let downloads = lib.downloads.get_or_insert(LibraryDownloads { artifact: None, classifiers: None });
    match &mut downloads.artifact {
        Some(artifact) => {
            if artifact.path.is_none() {
                artifact.path = fallback;
            }
            if artifact.sha1.as_deref().is_some_and(str::is_empty) {
                artifact.sha1 = None;
            }
        }
        // Ancien format sans section de téléchargement : le fichier a été posé par l'installeur.
        None if lib.natives.is_none() => {
            downloads.artifact = Some(DownloadArtifact { sha1: None, size: 0, url: String::new(), path: fallback });
        }
        None => {}
    }
    lib
}

/// Fusionne le profil du loader dans celui de Minecraft : classe principale et bibliothèques du
/// loader (qui remplacent celles de Minecraft en cas de doublon), arguments ajoutés à la suite.
pub fn apply(detail: &mut VersionDetail, profile: ForgeProfile) {
    let libraries: Vec<Library> = profile.libraries.into_iter().map(normalize).collect();
    let provided: HashSet<String> = libraries.iter().map(|lib| library_key(&lib.name)).collect();

    let mut merged = libraries;
    merged.extend(
        std::mem::take(&mut detail.libraries)
            .into_iter()
            .filter(|lib| lib.natives.is_some() || !provided.contains(&library_key(&lib.name))),
    );
    detail.libraries = merged;

    if let Some(extra) = profile.arguments {
        let arguments = detail.arguments.get_or_insert_with(Arguments::default);
        arguments.jvm.extend(extra.jvm);
        arguments.game.extend(extra.game);
    }
    // Anciennes versions : une seule ligne d'arguments, qui remplace celle de Minecraft.
    if profile.minecraft_arguments.is_some() {
        detail.minecraft_arguments = profile.minecraft_arguments;
    }

    detail.main_class = profile.main_class;
    // Le loader écarte le jeu d'origine du chargement en le reconnaissant à son nom de fichier,
    // « <identifiant>.jar » : le jar du client doit donc porter ce nom.
    detail.client_jar_name = Some(format!("{}.jar", profile.id));
    detail.id = profile.id;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_minecraft_versions_to_neoforge_versions() {
        let versions: Vec<String> = ["20.2.93", "21.0.167", "21.1.255", "21.1.256", "21.10.5-beta", "21.11.3-beta", "21.11.4", "26.3.0.56-beta", "26.3.0.57-beta", "26.1.2.4"]
            .iter()
            .map(|v| v.to_string())
            .collect();
        assert_eq!(pick_neoforge(&versions, "1.21.1").as_deref(), Some("21.1.256"));
        assert_eq!(pick_neoforge(&versions, "1.21").as_deref(), Some("21.0.167"));
        // « 21.1. » ne doit pas attraper les versions de Minecraft 1.21.10 et 1.21.11.
        assert_eq!(pick_neoforge(&versions, "1.21.11").as_deref(), Some("21.11.4"));
        assert_eq!(pick_neoforge(&versions, "1.21.10").as_deref(), Some("21.10.5-beta"));
        assert_eq!(pick_neoforge(&versions, "26.3").as_deref(), Some("26.3.0.57-beta"));
        assert_eq!(pick_neoforge(&versions, "26.1.2").as_deref(), Some("26.1.2.4"));
        assert_eq!(pick_neoforge(&versions, "1.20.1"), None);
    }

    #[test]
    fn builds_maven_paths_with_classifier_and_extension() {
        assert_eq!(
            maven_path("net.minecraftforge:forge:1.20.1-47.4.10:client").as_deref(),
            Some("net/minecraftforge/forge/1.20.1-47.4.10/forge-1.20.1-47.4.10-client.jar")
        );
        assert_eq!(
            maven_path("de.oceanlabs.mcp:mcp_config:1.20.1-20230612.114412@zip").as_deref(),
            Some("de/oceanlabs/mcp/mcp_config/1.20.1-20230612.114412/mcp_config-1.20.1-20230612.114412.zip")
        );
        assert_eq!(library_key("org.ow2.asm:asm:9.8"), "org.ow2.asm:asm");
        assert_eq!(library_key("net.minecraftforge:forge:1.20.1-47.4.10:client"), "net.minecraftforge:forge:client");
    }
}

/// Essais de bout en bout, à lancer à la main (réseau, installation réelle, démarrage du jeu) :
/// `cargo test boots_ -- --ignored --nocapture --test-threads=1`.
#[cfg(test)]
mod boot_tests {
    use super::*;
    use crate::minecraft::{self, install, launch, manifest};
    use tokio::io::{AsyncBufReadExt, BufReader};

    pub(super) async fn boot(kind: ForgeKind, mc_version: &str) {
        let client = reqwest::Client::new();
        let entry = minecraft::find_version_entry(&client, mc_version).await.expect("version Minecraft");
        let mut detail = manifest::fetch_version_detail(&client, &entry).await.expect("profil Minecraft");
        let java = crate::java::ensure_java(&client, detail.java_version.major_version).await.expect("java");

        let loader_version = resolve_recommended_version(&client, kind, mc_version).await.expect("version du loader");
        println!("{} {loader_version} pour Minecraft {mc_version}", kind.label());
        let profile = ensure_installed(None, &client, "test", kind, mc_version, &loader_version, &java)
            .await
            .expect("installation");
        apply(&mut detail, profile);

        let client_jar = paths::versions_cache_dir().join(&detail.id).join(detail.client_jar_name.clone().unwrap());
        let (mut tasks, libs) = install::resolve_libraries(&detail);
        tasks.push(DownloadTask {
            url: detail.downloads.client.url.clone(),
            dest: client_jar.clone(),
            sha1: detail.downloads.client.sha1.clone(),
        });
        println!("{} fichiers à vérifier", tasks.len());
        download::download_quiet(&client, tasks).await.expect("bibliothèques");

        let work = std::env::temp_dir().join(format!("nexora-boot-{}", detail.id));
        let natives = work.join("natives");
        std::fs::create_dir_all(&work).unwrap();
        launch::extract_natives(&libs.natives_jars, &natives).expect("natives");

        let instance: crate::instances::Instance = serde_json::from_value(serde_json::json!({
            "id": "boot-test", "name": "Essai", "mc_version": mc_version, "loader": "vanilla",
            "loader_version": loader_version, "min_ram_mb": 1024, "max_ram_mb": 3072, "width": 854,
            "height": 480, "jvm_args": "", "created_at": "2026-01-01T00:00:00Z", "last_played": null,
            "icon": null, "playtime_seconds": 0, "banner": null
        }))
        .expect("instance d'essai");
        let account: crate::accounts::Account = serde_json::from_value(serde_json::json!({
            "uuid": "00000000000040008000000000000001", "username": "Essai", "skin_url": null,
            "minecraft_access_token": "0", "minecraft_token_expires_at": "2030-01-01T00:00:00Z",
            "ms_refresh_token": "", "is_offline": true
        }))
        .expect("compte d'essai");

        let args = launch::build_args(&instance, &detail, &client_jar, &libs, &account, None, &work, &natives);
        let mut child = tokio::process::Command::new(&java)
            .args(&args)
            .current_dir(&work)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .expect("démarrage de Java");

        // Le jeu a démarré pour de bon quand Minecraft lui-même annonce le joueur : le loader a
        // alors chargé ses modules et le jeu corrigé.
        let mut lines = BufReader::new(child.stdout.take().unwrap()).lines();
        let mut seen: Vec<String> = Vec::new();
        let started = tokio::time::timeout(Duration::from_secs(120), async {
            while let Ok(Some(line)) = lines.next_line().await {
                let reached = line.contains("Setting user:");
                seen.push(line);
                if reached {
                    return true;
                }
            }
            false
        })
        .await
        .unwrap_or(false);
        let _ = child.kill().await;

        let mut errors = String::new();
        if let Some(mut stderr) = child.stderr.take() {
            use tokio::io::AsyncReadExt;
            let _ = tokio::time::timeout(Duration::from_secs(2), stderr.read_to_string(&mut errors)).await;
        }
        let tail_out = seen[seen.len().saturating_sub(12)..].join("\n");
        println!("--- sortie ---\n{tail_out}\n--- erreurs ---\n{}", errors.lines().take(25).collect::<Vec<_>>().join("\n"));
        assert!(started, "le jeu n'a pas atteint son démarrage");
    }

    #[tokio::test]
    #[ignore]
    async fn boots_neoforge() {
        boot(ForgeKind::NeoForge, "1.21.1").await;
    }

    #[tokio::test]
    #[ignore]
    async fn boots_forge() {
        boot(ForgeKind::Forge, "1.20.1").await;
    }
}

#[cfg(test)]
mod legacy_boot_tests {
    #[tokio::test]
    #[ignore]
    async fn boots_forge_1_16() {
        super::boot_tests::boot(super::ForgeKind::Forge, "1.16.5").await;
    }

    #[tokio::test]
    #[ignore]
    async fn boots_forge_1_12() {
        super::boot_tests::boot(super::ForgeKind::Forge, "1.12.2").await;
    }
}
