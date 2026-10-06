use serde::{Deserialize, Serialize};
use std::fs;

use crate::content::ContentType;
use crate::error::AppResult;
use crate::paths;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Favorite {
    pub project_id: String,
    pub title: String,
    pub icon_url: Option<String>,
    pub content_type: ContentType,
}

fn file() -> std::path::PathBuf {
    paths::app_data_dir().join("favorites.json")
}

fn load() -> AppResult<Vec<Favorite>> {
    let path = file();
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = fs::read_to_string(path)?;
    if data.trim().is_empty() {
        return Ok(Vec::new());
    }
    Ok(serde_json::from_str(&data)?)
}

fn save(items: &[Favorite]) -> AppResult<()> {
    paths::ensure_dirs()?;
    fs::write(file(), serde_json::to_string_pretty(items)?)?;
    Ok(())
}

pub fn list() -> AppResult<Vec<Favorite>> {
    load()
}

pub fn add(favorite: Favorite) -> AppResult<Vec<Favorite>> {
    let mut items = load()?;
    if !items.iter().any(|f| f.project_id == favorite.project_id) {
        items.push(favorite);
    }
    save(&items)?;
    Ok(items)
}

pub fn remove(project_id: &str) -> AppResult<Vec<Favorite>> {
    let mut items = load()?;
    items.retain(|f| f.project_id != project_id);
    save(&items)?;
    Ok(items)
}
