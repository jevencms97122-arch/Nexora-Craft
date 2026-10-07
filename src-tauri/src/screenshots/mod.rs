use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::error::{AppError, AppResult};
use crate::instances;
use crate::paths;

#[derive(Debug, Clone, Serialize)]
pub struct Screenshot {
    pub instance_id: String,
    pub instance_name: String,
    pub file_name: String,
    pub path: String,
    /// Date de modification (millisecondes depuis l'époque Unix), pour le tri.
    pub modified_ms: u64,
}

fn screenshots_dir(instance_id: &str) -> PathBuf {
    paths::instance_dir(instance_id).join("screenshots")
}

/// Toutes les captures de toutes les instances, de la plus récente à la plus ancienne.
pub fn list() -> AppResult<Vec<Screenshot>> {
    let mut out = Vec::new();
    for instance in instances::list()? {
        let dir = screenshots_dir(&instance.id);
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            let is_png = path.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("png"));
            if !is_png {
                continue;
            }
            let modified_ms = entry
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            out.push(Screenshot {
                instance_id: instance.id.clone(),
                instance_name: instance.name.clone(),
                file_name: entry.file_name().to_string_lossy().to_string(),
                path: path.display().to_string(),
                modified_ms,
            });
        }
    }
    out.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    Ok(out)
}

/// Refuse tout chemin qui ne pointe pas vers une capture d'une instance du launcher.
fn checked(path: &str) -> AppResult<PathBuf> {
    let path = Path::new(path).canonicalize()?;
    let root = paths::instances_root_dir().canonicalize()?;
    let in_screenshots = path.parent().and_then(|p| p.file_name()).is_some_and(|n| n == "screenshots");
    if !path.starts_with(&root) || !in_screenshots {
        return Err(AppError::Other("chemin de capture non autorisé".into()));
    }
    Ok(path)
}

pub fn delete(path: &str) -> AppResult<()> {
    fs::remove_file(checked(path)?)?;
    Ok(())
}

pub fn open(path: &str) -> AppResult<()> {
    open::that(checked(path)?).map_err(|e| AppError::Other(e.to_string()))
}

pub fn open_folder(instance_id: &str) -> AppResult<()> {
    instances::get(instance_id)?;
    let dir = screenshots_dir(instance_id);
    fs::create_dir_all(&dir)?;
    open::that(dir).map_err(|e| AppError::Other(e.to_string()))
}
