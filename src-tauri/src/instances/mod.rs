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
    /// Temps de jeu cumulé, en secondes.
    #[serde(default)]
    pub playtime_seconds: u64,
    /// Image de bannière choisie par l'utilisateur (chemin local), sinon un dégradé est affiché.
    #[serde(default)]
    pub banner: Option<String>,
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

/// Mémoire d'une nouvelle instance : celle choisie dans les réglages du launcher.
fn default_memory() -> (u32, u32) {
    let settings = crate::settings::load().unwrap_or_default();
    let max = settings.default_max_ram_mb.max(512);
    (settings.default_min_ram_mb.clamp(256, max), max)
}

/// Quand la mémoire par défaut change, les instances qui utilisaient encore l'ancienne valeur
/// suivent la nouvelle. Celles réglées à la main ne sont pas touchées. Retourne le nombre
/// d'instances mises à jour.
pub fn follow_default_memory(old: (u32, u32), new: (u32, u32)) -> AppResult<usize> {
    if old == new {
        return Ok(0);
    }
    let mut instances = load_all()?;
    let mut changed = 0;
    for instance in instances.iter_mut().filter(|i| (i.min_ram_mb, i.max_ram_mb) == old) {
        instance.min_ram_mb = new.0.min(new.1);
        instance.max_ram_mb = new.1;
        changed += 1;
    }
    if changed > 0 {
        save_all(&instances)?;
    }
    Ok(changed)
}

pub fn create(new: NewInstance) -> AppResult<Instance> {
    let mut instances = load_all()?;
    let id = Uuid::new_v4().to_string();
    let (min_ram_mb, max_ram_mb) = default_memory();
    let instance = Instance {
        id: id.clone(),
        name: new.name,
        mc_version: new.mc_version,
        loader: new.loader,
        loader_version: None,
        min_ram_mb,
        max_ram_mb,
        width: 854,
        height: 480,
        jvm_args: String::new(),
        created_at: Utc::now(),
        last_played: None,
        icon: None,
        playtime_seconds: 0,
        banner: None,
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
    // Le temps de jeu et la date de dernière partie sont gérés par le launcher : un formulaire
    // resté ouvert pendant une partie ne doit pas les écraser avec d'anciennes valeurs.
    let mut instance = instance;
    instance.playtime_seconds = instances[idx].playtime_seconds;
    instance.last_played = instances[idx].last_played;
    // L'icône et la bannière ne changent que par `set_image` / `set_icon_url`.
    instance.icon = instances[idx].icon.clone();
    instance.banner = instances[idx].banner.clone();
    instances[idx] = instance.clone();
    save_all(&instances)?;
    Ok(instance)
}

pub fn add_playtime(id: &str, seconds: u64) -> AppResult<()> {
    let mut instances = load_all()?;
    if let Some(i) = instances.iter_mut().find(|i| i.id == id) {
        i.playtime_seconds += seconds;
    }
    save_all(&instances)?;
    Ok(())
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImageKind {
    Icon,
    Banner,
}

impl ImageKind {
    fn prefix(self) -> &'static str {
        match self {
            ImageKind::Icon => ".nexora-icon-",
            ImageKind::Banner => ".nexora-banner-",
        }
    }
}

/// Définit (ou retire, si `source` est absent) l'icône ou la bannière d'une instance. L'image est
/// copiée dans le dossier de l'instance : le fichier d'origine peut ensuite être déplacé.
pub fn set_image(id: &str, kind: ImageKind, source: Option<&str>) -> AppResult<Instance> {
    let mut instances = load_all()?;
    let idx = instances
        .iter()
        .position(|i| i.id == id)
        .ok_or_else(|| AppError::InstanceNotFound(id.to_string()))?;
    let dir = paths::instance_dir(id);
    fs::create_dir_all(&dir)?;

    // L'ancienne image est retirée dans tous les cas.
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            if entry.file_name().to_string_lossy().starts_with(kind.prefix()) {
                let _ = fs::remove_file(entry.path());
            }
        }
    }

    let stored = match source {
        Some(source) => {
            let source = std::path::Path::new(source);
            let ext = source
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase())
                .filter(|e| ["png", "jpg", "jpeg", "webp", "gif"].contains(&e.as_str()))
                .ok_or_else(|| AppError::Other("format d'image non pris en charge (png, jpg, webp, gif)".into()))?;
            // Le nom change à chaque fois pour que l'affichage ne garde pas l'ancienne image en cache.
            let dest = dir.join(format!("{}{}.{ext}", kind.prefix(), Utc::now().timestamp_millis()));
            fs::copy(source, &dest)?;
            Some(dest.display().to_string())
        }
        None => None,
    };

    match kind {
        ImageKind::Icon => instances[idx].icon = stored,
        ImageKind::Banner => instances[idx].banner = stored,
    }
    save_all(&instances)?;
    Ok(instances[idx].clone())
}

/// Icône distante (celle du modpack Modrinth dont l'instance est issue).
pub fn set_icon_url(id: &str, url: Option<String>) -> AppResult<Instance> {
    let mut instances = load_all()?;
    let instance = instances
        .iter_mut()
        .find(|i| i.id == id)
        .ok_or_else(|| AppError::InstanceNotFound(id.to_string()))?;
    instance.icon = url;
    let updated = instance.clone();
    save_all(&instances)?;
    Ok(updated)
}
