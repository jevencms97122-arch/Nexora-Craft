pub mod install;
pub mod launch;
pub mod loaders;
pub mod manifest;
pub mod rules;

use crate::error::{AppError, AppResult};

pub async fn find_version_entry(
    client: &reqwest::Client,
    version_id: &str,
) -> AppResult<manifest::VersionEntry> {
    let manifest = manifest::fetch_manifest(client).await?;
    manifest
        .versions
        .into_iter()
        .find(|v| v.id == version_id)
        .ok_or_else(|| AppError::Other(format!("version Minecraft introuvable: {version_id}")))
}
