use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::paths;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Loader {
    Vanilla,
    Fabric,
    Forge,
    Quilt,
    NeoForge,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Instance {
    pub id: String,
    pub name: String,
    pub mc_version: String,
    pub loader: Loader,
    pub loader_version: Option<String>,
    pub min_ram_mb: u32,
    pub max_ram_mb: u32,
    pub width: u32,
    pub height: u32,
    pub jvm_args: String,
    pub created_at: DateTime<Utc>,
    pub last_played: Option<DateTime<Utc>>,
    #[serde(default)]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewInstance {
    pub name: String,
    pub mc_version: String,
    #[serde(default = "default_loader")]
    pub loader: Loader,
}

fn default_loader() -> Loader {
    Loader::Vanilla
}

fn load_all() -> AppResult<Vec<Instance>> {
    let file = paths::instances_file();
    if !file.exists() {
        return Ok(Vec::new());
    }
    let data = fs::read_to_string(file)?;
    if data.trim().is_empty() {
        return Ok(Vec::new());
    }
    Ok(serde_json::from_str(&data)?)
}

fn save_all(instances: &[Instance]) -> AppResult<()> {
    paths::ensure_dirs()?;
    let data = serde_json::to_string_pretty(instances)?;
    fs::write(paths::instances_file(), data)?;
    Ok(())
}

pub fn list() -> AppResult<Vec<Instance>> {
    load_all()
}

pub fn get(id: &str) -> AppResult<Instance> {
    load_all()?
        .into_iter()
        .find(|i| i.id == id)
        .ok_or_else(|| AppError::InstanceNotFound(id.to_string()))
}

pub fn create(new: NewInstance) -> AppResult<Instance> {
    let mut instances = load_all()?;
    let id = Uuid::new_v4().to_string();
    let instance = Instance {
        id: id.clone(),
        name: new.name,
        mc_version: new.mc_version,
        loader: new.loader,
        loader_version: None,
        min_ram_mb: 1024,
        max_ram_mb: 4096,
        width: 854,
        height: 480,
        jvm_args: String::new(),
        created_at: Utc::now(),
        last_played: None,
        icon: None,
    };
    fs::create_dir_all(paths::instance_dir(&id))?;
    for sub in ["mods", "shaderpacks", "resourcepacks", "datapacks", "saves", "config"] {
        fs::create_dir_all(paths::instance_dir(&id).join(sub))?;
    }
    instances.push(instance.clone());
    save_all(&instances)?;
    Ok(instance)
}

pub fn update(instance: Instance) -> AppResult<Instance> {
    let mut instances = load_all()?;
    let idx = instances
        .iter()
        .position(|i| i.id == instance.id)
        .ok_or_else(|| AppError::InstanceNotFound(instance.id.clone()))?;
    instances[idx] = instance.clone();
    save_all(&instances)?;
    Ok(instance)
}

pub fn touch_last_played(id: &str) -> AppResult<()> {
    let mut instances = load_all()?;
    if let Some(i) = instances.iter_mut().find(|i| i.id == id) {
        i.last_played = Some(Utc::now());
    }
    save_all(&instances)?;
    Ok(())
}

pub fn delete(id: &str) -> AppResult<()> {
    let mut instances = load_all()?;
    instances.retain(|i| i.id != id);
    save_all(&instances)?;
    let dir = paths::instance_dir(id);
    if dir.exists() {
        fs::remove_dir_all(dir)?;
    }
    Ok(())
}
