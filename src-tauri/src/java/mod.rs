use serde::Deserialize;
use std::path::PathBuf;

use crate::error::{AppError, AppResult};
use crate::paths;

/// Retourne le chemin vers un java.exe compatible avec la version majeure demandée,
/// en le téléchargeant (Eclipse Adoptium Temurin JRE) si nécessaire.
pub async fn ensure_java(client: &reqwest::Client, major_version: u32) -> AppResult<PathBuf> {
    let install_dir = paths::runtimes_dir().join(major_version.to_string());
    if let Some(existing) = find_java_exe(&install_dir) {
        return Ok(existing);
    }

    std::fs::create_dir_all(&install_dir)?;
    let archive_url = resolve_adoptium_url(client, major_version).await?;

    let bytes = client.get(&archive_url).send().await?.bytes().await?;
    let tmp_zip = install_dir.join("runtime.zip");
    std::fs::write(&tmp_zip, &bytes)?;

    let file = std::fs::File::open(&tmp_zip)?;
    zip_extract::extract(file, &install_dir, true).map_err(|e| AppError::Zip(e.to_string()))?;
    let _ = std::fs::remove_file(&tmp_zip);

    find_java_exe(&install_dir)
        .ok_or_else(|| AppError::Other("java.exe introuvable après extraction du runtime".into()))
}

fn find_java_exe(dir: &std::path::Path) -> Option<PathBuf> {
    let direct = dir.join("bin").join("java.exe");
    if direct.exists() {
        return Some(direct);
    }
    // L'archive Adoptium contient un dossier racine (ex: jdk-21.0.3+9-jre), on le cherche.
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let candidate = entry.path().join("bin").join("java.exe");
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

#[derive(Debug, Deserialize)]
struct AdoptiumAsset {
    binary: AdoptiumBinary,
}

#[derive(Debug, Deserialize)]
struct AdoptiumBinary {
    package: AdoptiumPackage,
}

#[derive(Debug, Deserialize)]
struct AdoptiumPackage {
    link: String,
}

async fn resolve_adoptium_url(client: &reqwest::Client, major_version: u32) -> AppResult<String> {
    let url = format!(
        "https://api.adoptium.net/v3/assets/latest/{major_version}/hotspot?os=windows&architecture=x64&image_type=jre&vendor=eclipse"
    );
    let assets = client.get(&url).send().await?.json::<Vec<AdoptiumAsset>>().await?;
    assets
        .into_iter()
        .next()
        .map(|a| a.binary.package.link)
        .ok_or_else(|| AppError::Other(format!("aucun runtime Java {major_version} disponible pour Windows x64")))
}
