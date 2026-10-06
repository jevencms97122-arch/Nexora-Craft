pub mod modpack;

use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::fs;

use crate::error::{AppError, AppResult};
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

/// Recherche Modrinth pour un type de contenu. `mc_version`/`loader` sont optionnels
/// (recherche globale, non liée à une instance précise).
pub async fn search(
    client: &reqwest::Client,
    query: &str,
    content_type: ContentType,
    mc_version: Option<&str>,
    loader: Option<&str>,
) -> AppResult<modrinth::SearchResponse> {
    modrinth::search(client, query, content_type.modrinth_slug(), mc_version, loader).await
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
    fs::write(&dest, &bytes)?;

    let mut items = load_manifest(instance_id)?;
    items.retain(|i| i.project_id != project_id);
    let entry = InstalledContent {
        project_id: project_id.to_string(),
        version_id: version.id,
        title: title.to_string(),
        icon_url,
        content_type,
        file_name: file.filename.clone(),
    };
    items.push(entry.clone());
    save_manifest(instance_id, &items)?;

    Ok(entry)
}

pub async fn list_versions(client: &reqwest::Client, project_id: &str) -> AppResult<Vec<modrinth::ProjectVersion>> {
    modrinth::get_all_versions(client, project_id).await
}

pub fn remove(instance_id: &str, project_id: &str) -> AppResult<()> {
    let mut items = load_manifest(instance_id)?;
    if let Some(item) = items.iter().find(|i| i.project_id == project_id) {
        let file_path = paths::instance_dir(instance_id)
            .join(item.content_type.folder())
            .join(&item.file_name);
        if file_path.exists() {
            fs::remove_file(file_path)?;
        }
    }
    items.retain(|i| i.project_id != project_id);
    save_manifest(instance_id, &items)?;
    Ok(())
}
