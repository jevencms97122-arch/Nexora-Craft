use serde::Deserialize;
use sha1::{Digest, Sha1};
use std::collections::HashMap;
use std::io::Read;

use crate::error::{AppError, AppResult};
use crate::instances::{self, Instance, Loader, NewInstance};
use crate::modrinth;
use crate::paths;

#[derive(Debug, Deserialize)]
struct MrpackIndex {
    files: Vec<MrpackFile>,
    dependencies: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
struct MrpackFile {
    path: String,
    hashes: MrpackHashes,
    downloads: Vec<String>,
    #[serde(default)]
    env: Option<MrpackEnv>,
}

#[derive(Debug, Deserialize)]
struct MrpackHashes {
    sha1: String,
}

#[derive(Debug, Deserialize)]
struct MrpackEnv {
    #[serde(default)]
    client: Option<String>,
}

fn resolve_loader(deps: &HashMap<String, String>) -> (Loader, Option<String>) {
    if let Some(v) = deps.get("fabric-loader") {
        (Loader::Fabric, Some(v.clone()))
    } else if let Some(v) = deps.get("quilt-loader") {
        (Loader::Quilt, Some(v.clone()))
    } else if let Some(v) = deps.get("forge") {
        (Loader::Forge, Some(v.clone()))
    } else if let Some(v) = deps.get("neoforge") {
        (Loader::NeoForge, Some(v.clone()))
    } else {
        (Loader::Vanilla, None)
    }
}

/// Télécharge un modpack Modrinth (.mrpack), crée une nouvelle instance avec la version
/// Minecraft/loader qu'il exige, télécharge tous ses fichiers et applique ses "overrides".
pub async fn install(
    client: &reqwest::Client,
    _project_id: &str,
    version_id: &str,
    instance_name: &str,
) -> AppResult<Instance> {
    let version = modrinth::get_version(client, version_id).await?;
    let file = version
        .files
        .iter()
        .find(|f| f.primary)
        .or_else(|| version.files.first())
        .ok_or_else(|| AppError::Other("aucun fichier de modpack disponible".into()))?;

    let bytes = client.get(&file.url).send().await?.bytes().await?;
    let cursor = std::io::Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| AppError::Zip(e.to_string()))?;

    let index: MrpackIndex = {
        let mut entry = archive
            .by_name("modrinth.index.json")
            .map_err(|e| AppError::Zip(e.to_string()))?;
        let mut s = String::new();
        entry.read_to_string(&mut s)?;
        serde_json::from_str(&s)?
    };

    let mc_version = index
        .dependencies
        .get("minecraft")
        .cloned()
        .ok_or_else(|| AppError::Other("ce modpack ne précise pas de version Minecraft".into()))?;
    let (loader, loader_version) = resolve_loader(&index.dependencies);

    let mut instance = instances::create(NewInstance {
        name: instance_name.to_string(),
        mc_version,
        loader,
    })?;
    instance.loader_version = loader_version;
    instance = instances::update(instance)?;

    let instance_dir = paths::instance_dir(&instance.id);

    for f in &index.files {
        if let Some(env) = &f.env {
            if env.client.as_deref() == Some("unsupported") {
                continue;
            }
        }
        let Some(url) = f.downloads.first() else { continue };
        let dest = instance_dir.join(&f.path);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let bytes = client.get(url).send().await?.bytes().await?;
        let mut hasher = Sha1::new();
        hasher.update(&bytes);
        let actual = hex::encode(hasher.finalize());
        if actual != f.hashes.sha1 {
            return Err(AppError::ChecksumMismatch(f.path.clone()));
        }
        std::fs::write(dest, &bytes)?;
    }

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| AppError::Zip(e.to_string()))?;
        let name = entry.name().to_string();
        let rel = name
            .strip_prefix("overrides/")
            .or_else(|| name.strip_prefix("client-overrides/"));
        let Some(rel) = rel else { continue };
        if rel.is_empty() || name.ends_with('/') {
            continue;
        }
        let dest = instance_dir.join(rel);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut buf = Vec::new();
        entry.read_to_end(&mut buf)?;
        std::fs::write(dest, buf)?;
    }

    Ok(instance)
}
