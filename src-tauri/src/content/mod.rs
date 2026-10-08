pub mod modpack;

use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::fs;

use crate::error::{AppError, AppResult};
use crate::instances::{self, Instance, Loader};
use crate::modrinth;
use crate::paths;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ContentType {
    Mod,
    Shader,
    Resourcepack,
    Datapack,
    Modpack,
}

impl ContentType {
    fn folder(self) -> &'static str {
        match self {
            ContentType::Mod => "mods",
            ContentType::Shader => "shaderpacks",
            ContentType::Resourcepack => "resourcepacks",
            ContentType::Datapack => "datapacks",
            ContentType::Modpack => "modpacks",
        }
    }

    pub fn modrinth_slug(self) -> &'static str {
        match self {
            ContentType::Mod => "mod",
            ContentType::Shader => "shader",
            ContentType::Resourcepack => "resourcepack",
            ContentType::Datapack => "datapack",
            ContentType::Modpack => "modpack",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledContent {
    pub project_id: String,
    pub version_id: String,
    pub title: String,
    pub icon_url: Option<String>,
    pub content_type: ContentType,
    pub file_name: String,
    /// Désactivé : le fichier est renommé en `<nom>.disabled`, le jeu l'ignore.
    #[serde(default)]
    pub disabled: bool,
}

impl InstalledContent {
    fn path(&self, instance_id: &str) -> std::path::PathBuf {
        let name = if self.disabled { format!("{}.disabled", self.file_name) } else { self.file_name.clone() };
        paths::instance_dir(instance_id).join(self.content_type.folder()).join(name)
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct InstallResult {
    pub item: InstalledContent,
    /// Dépendances requises installées automatiquement en plus.
    pub dependencies: Vec<InstalledContent>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ContentUpdate {
    pub project_id: String,
    pub title: String,
    pub latest_version_id: String,
    pub latest_version_number: String,
}

/// Loaders acceptés par une instance pour un type de contenu. Seuls les mods en dépendent ;
/// Quilt sait aussi charger les mods Fabric.
fn loaders_for(instance: &Instance, content_type: ContentType) -> Option<Vec<&'static str>> {
    if content_type != ContentType::Mod {
        return None;
    }
    match instance.loader {
        Loader::Fabric => Some(vec!["fabric"]),
        Loader::Quilt => Some(vec!["quilt", "fabric"]),
        Loader::Forge => Some(vec!["forge"]),
        Loader::NeoForge => Some(vec!["neoforge"]),
        Loader::Vanilla => None,
    }
}

async fn latest_compatible(
    client: &reqwest::Client,
    project_id: &str,
    instance: &Instance,
    content_type: ContentType,
) -> AppResult<Option<modrinth::ProjectVersion>> {
    let loaders = loaders_for(instance, content_type);
    let versions =
        modrinth::get_versions_filtered(client, project_id, &instance.mc_version, loaders.as_deref()).await?;
    Ok(versions.into_iter().next())
}

fn manifest_path(instance_id: &str) -> std::path::PathBuf {
    paths::instance_dir(instance_id).join(".nexora-content.json")
}

fn load_manifest(instance_id: &str) -> AppResult<Vec<InstalledContent>> {
    let path = manifest_path(instance_id);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = fs::read_to_string(path)?;
    if data.trim().is_empty() {
        return Ok(Vec::new());
    }
    Ok(serde_json::from_str(&data)?)
}

fn save_manifest(instance_id: &str, items: &[InstalledContent]) -> AppResult<()> {
    fs::write(manifest_path(instance_id), serde_json::to_string_pretty(items)?)?;
    Ok(())
}

pub fn list_installed(instance_id: &str) -> AppResult<Vec<InstalledContent>> {
    load_manifest(instance_id)
}

/// Préfixe des contenus ajoutés depuis un fichier du disque : ils n'existent pas sur Modrinth.
const LOCAL_PREFIX: &str = "local:";

/// Ajoute à une instance un fichier déjà présent sur le disque (téléchargé à la main), et le fait
/// apparaître dans la liste de ses contenus.
pub fn add_local(
    instance_id: &str,
    source: &std::path::Path,
    content_type: ContentType,
    title: &str,
) -> AppResult<InstalledContent> {
    let file_name = source
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .ok_or_else(|| AppError::Other("nom de fichier invalide".into()))?;
    let entry = InstalledContent {
        project_id: format!("{LOCAL_PREFIX}{file_name}"),
        version_id: "local".to_string(),
        title: title.to_string(),
        icon_url: None,
        content_type,
        file_name,
        disabled: false,
    };
    let dest = entry.path(instance_id);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(source, &dest)?;

    let mut items = load_manifest(instance_id)?;
    // Même fichier réimporté : l'ancienne entrée est remplacée.
    items.retain(|i| i.project_id != entry.project_id);
    items.push(entry.clone());
    save_manifest(instance_id, &items)?;
    Ok(entry)
}

/// Recherche Modrinth pour un type de contenu. `mc_version`/`loader` sont optionnels
/// (recherche globale, non liée à une instance précise).
pub async fn search(
    client: &reqwest::Client,
    query: &str,
    content_type: ContentType,
    mc_version: Option<&str>,
    loader: Option<&str>,
    offset: u32,
) -> AppResult<modrinth::SearchResponse> {
    modrinth::search(client, query, content_type.modrinth_slug(), mc_version, loader, offset).await
}

/// Télécharge et installe une version précise d'un projet Modrinth (choisie par l'utilisateur)
/// dans le bon dossier de l'instance, puis enregistre l'entrée dans le manifeste local.
pub async fn install_version(
    client: &reqwest::Client,
    instance_id: &str,
    project_id: &str,
    version_id: &str,
    title: &str,
    icon_url: Option<String>,
    content_type: ContentType,
) -> AppResult<InstalledContent> {
    let version = modrinth::get_version(client, version_id).await?;
    install_resolved(client, instance_id, project_id, &version, title, icon_url, content_type).await
}

async fn install_resolved(
    client: &reqwest::Client,
    instance_id: &str,
    project_id: &str,
    version: &modrinth::ProjectVersion,
    title: &str,
    icon_url: Option<String>,
    content_type: ContentType,
) -> AppResult<InstalledContent> {
    let file = version
        .files
        .iter()
        .find(|f| f.primary)
        .or_else(|| version.files.first())
        .ok_or_else(|| AppError::Other(format!("aucun fichier disponible pour {title}")))?;

    let dest_dir = paths::instance_dir(instance_id).join(content_type.folder());
    fs::create_dir_all(&dest_dir)?;
    let dest = dest_dir.join(&file.filename);

    let bytes = client.get(&file.url).send().await?.bytes().await?;
    if let Some(expected) = &file.hashes.sha1 {
        let mut hasher = Sha1::new();
        hasher.update(&bytes);
        let actual = hex::encode(hasher.finalize());
        if &actual != expected {
            return Err(AppError::ChecksumMismatch(file.filename.clone()));
        }
    }

    let mut items = load_manifest(instance_id)?;
    // Mise à jour : l'ancien fichier (souvent nommé autrement) est retiré pour éviter un doublon.
    if let Some(old) = items.iter().find(|i| i.project_id == project_id) {
        let old_path = old.path(instance_id);
        if old_path.exists() {
            fs::remove_file(old_path)?;
        }
    }
    fs::write(&dest, &bytes)?;

    items.retain(|i| i.project_id != project_id);
    let entry = InstalledContent {
        project_id: project_id.to_string(),
        version_id: version.id.clone(),
        title: title.to_string(),
        icon_url,
        content_type,
        file_name: file.filename.clone(),
        disabled: false,
    };
    items.push(entry.clone());
    save_manifest(instance_id, &items)?;

    Ok(entry)
}

/// Installe un contenu puis, pour un mod, toutes ses dépendances requises pas encore présentes
/// (Fabric API, bibliothèques...), en cascade.
pub async fn install_with_dependencies(
    client: &reqwest::Client,
    instance_id: &str,
    project_id: &str,
    version_id: &str,
    title: &str,
    icon_url: Option<String>,
    content_type: ContentType,
) -> AppResult<InstallResult> {
    let instance = instances::get(instance_id)?;
    let version = modrinth::get_version(client, version_id).await?;
    let item = install_resolved(client, instance_id, project_id, &version, title, icon_url, content_type).await?;

    let mut dependencies = Vec::new();
    if content_type != ContentType::Mod {
        return Ok(InstallResult { item, dependencies });
    }

    let mut seen: std::collections::HashSet<String> =
        load_manifest(instance_id)?.into_iter().map(|i| i.project_id).collect();
    let mut queue: Vec<modrinth::VersionDependency> = version.dependencies.clone();

    while let Some(dep) = queue.pop() {
        if dependencies.len() >= 25 {
            break;
        }
        if dep.dependency_type != "required" {
            continue;
        }
        let Some(dep_project) = dep.project_id.clone() else { continue };
        if !seen.insert(dep_project.clone()) {
            continue;
        }
        // On préfère la dernière version compatible avec l'instance à la version figée par le mod.
        let dep_version = match latest_compatible(client, &dep_project, &instance, ContentType::Mod).await? {
            Some(v) => v,
            None => match &dep.version_id {
                Some(id) => modrinth::get_version(client, id).await?,
                None => continue,
            },
        };
        let info = modrinth::get_project(client, &dep_project).await?;
        let installed = install_resolved(
            client,
            instance_id,
            &dep_project,
            &dep_version,
            &info.title,
            info.icon_url,
            ContentType::Mod,
        )
        .await?;
        queue.extend(dep_version.dependencies.clone());
        dependencies.push(installed);
    }

    Ok(InstallResult { item, dependencies })
}

/// Compare chaque contenu installé à la dernière version compatible publiée sur Modrinth.
pub async fn check_updates(client: &reqwest::Client, instance_id: &str) -> AppResult<Vec<ContentUpdate>> {
    let instance = instances::get(instance_id)?;
    let items: Vec<InstalledContent> = load_manifest(instance_id)?
        .into_iter()
        .filter(|i| i.content_type != ContentType::Modpack && !i.project_id.starts_with(LOCAL_PREFIX))
        .collect();

    let checks = items.iter().map(|item| {
        let instance = &instance;
        async move {
            let latest = latest_compatible(client, &item.project_id, instance, item.content_type).await.ok()??;
            (latest.id != item.version_id).then(|| ContentUpdate {
                project_id: item.project_id.clone(),
                title: item.title.clone(),
                latest_version_id: latest.id,
                latest_version_number: latest.version_number,
            })
        }
    });
    Ok(futures_util::future::join_all(checks).await.into_iter().flatten().collect())
}

/// Met à jour un contenu (ou tous si `project_id` est absent) vers sa dernière version compatible.
/// Retourne le nombre de contenus mis à jour.
pub async fn update(client: &reqwest::Client, instance_id: &str, project_id: Option<&str>) -> AppResult<usize> {
    let updates = check_updates(client, instance_id).await?;
    let items = load_manifest(instance_id)?;
    let mut count = 0;
    for update in updates {
        if project_id.is_some_and(|id| id != update.project_id) {
            continue;
        }
        let Some(item) = items.iter().find(|i| i.project_id == update.project_id) else { continue };
        let was_disabled = item.disabled;
        install_version(
            client,
            instance_id,
            &item.project_id,
            &update.latest_version_id,
            &item.title,
            item.icon_url.clone(),
            item.content_type,
        )
        .await?;
        if was_disabled {
            set_enabled(instance_id, &item.project_id, false)?;
        }
        count += 1;
    }
    Ok(count)
}

/// Active ou désactive un contenu sans le supprimer (renommage en `.disabled`).
pub fn set_enabled(instance_id: &str, project_id: &str, enabled: bool) -> AppResult<Vec<InstalledContent>> {
    let mut items = load_manifest(instance_id)?;
    if let Some(item) = items.iter_mut().find(|i| i.project_id == project_id) {
        if item.disabled == enabled {
            let from = item.path(instance_id);
            item.disabled = !enabled;
            let to = item.path(instance_id);
            if from.exists() {
                fs::rename(from, to)?;
            }
        }
    }
    save_manifest(instance_id, &items)?;
    Ok(items)
}

pub async fn list_versions(client: &reqwest::Client, project_id: &str) -> AppResult<Vec<modrinth::ProjectVersion>> {
    modrinth::get_all_versions(client, project_id).await
}

pub fn remove(instance_id: &str, project_id: &str) -> AppResult<()> {
    let mut items = load_manifest(instance_id)?;
    if let Some(item) = items.iter().find(|i| i.project_id == project_id) {
        let file_path = item.path(instance_id);
        if file_path.exists() {
            fs::remove_file(file_path)?;
        }
    }
    items.retain(|i| i.project_id != project_id);
    save_manifest(instance_id, &items)?;
    Ok(())
}
