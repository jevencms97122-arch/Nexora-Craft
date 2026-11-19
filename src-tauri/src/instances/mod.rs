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
    // Les sauvegardes de l'instance n'ont plus de raison d'être : l'interface ne les montrerait plus.
    let backups = paths::backups_dir().join(id);
    if backups.exists() {
        let _ = fs::remove_dir_all(backups);
    }
    Ok(())
}

/// Copie un dossier. `skip` liste les noms ignorés à la racine de la copie.
fn copy_dir(from: &std::path::Path, to: &std::path::Path, skip: &[&str]) -> AppResult<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let name = entry.file_name();
        if skip.iter().any(|s| name == *s) {
            continue;
        }
        let path = entry.path();
        let dest = to.join(&name);
        if path.is_dir() {
            copy_dir(&path, &dest, &[])?;
        } else {
            fs::copy(&path, &dest)?;
        }
    }
    Ok(())
}

/// Chemin d'une image de l'instance recopiée : il doit désormais pointer dans le nouveau dossier.
fn moved_image(path: &Option<String>, from: &std::path::Path, to: &std::path::Path) -> Option<String> {
    let path = path.as_ref()?;
    match std::path::Path::new(path).strip_prefix(from) {
        Ok(relative) => Some(to.join(relative).display().to_string()),
        // Icône distante (modpack) : l'adresse reste valable telle quelle.
        Err(_) => Some(path.clone()),
    }
}

/// Crée une copie d'une instance : réglages, mods, configuration et, au choix, les mondes.
/// Les captures d'écran, les journaux et les rapports de plantage ne sont pas copiés.
pub fn duplicate(id: &str, name: &str, with_worlds: bool) -> AppResult<Instance> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::Other("le nom de l'instance ne peut pas être vide".into()));
    }
    let mut instances = load_all()?;
    let source = instances
        .iter()
        .find(|i| i.id == id)
        .cloned()
        .ok_or_else(|| AppError::InstanceNotFound(id.to_string()))?;

    let new_id = Uuid::new_v4().to_string();
    let from = paths::instance_dir(id);
    let to = paths::instance_dir(&new_id);

    let mut skip = vec!["screenshots", "logs", "crash-reports"];
    if !with_worlds {
        skip.push("saves");
    }
    if let Err(e) = copy_dir(&from, &to, &skip) {
        let _ = fs::remove_dir_all(&to);
        return Err(e);
    }
    fs::create_dir_all(to.join("saves"))?;

    let copy = Instance {
        id: new_id,
        name: name.to_string(),
        created_at: Utc::now(),
        last_played: None,
        playtime_seconds: 0,
        icon: moved_image(&source.icon, &from, &to),
        banner: moved_image(&source.banner, &from, &to),
        ..source
    };
    instances.push(copy.clone());
    save_all(&instances)?;
    Ok(copy)
}

/// Dossiers de l'instance que l'interface peut ouvrir dans l'explorateur.
const OPENABLE: [&str; 6] = ["mods", "saves", "config", "resourcepacks", "shaderpacks", "datapacks"];

/// Ouvre le dossier de l'instance (`sub` absent), l'un de ses sous-dossiers, ou le dossier de ses
/// sauvegardes (`backups`).
pub fn open_folder(id: &str, sub: Option<&str>) -> AppResult<()> {
    get(id)?;
    let dir = match sub {
        None => paths::instance_dir(id),
        Some("backups") => paths::backups_dir().join(id),
        Some(sub) if OPENABLE.contains(&sub) => paths::instance_dir(id).join(sub),
        Some(_) => return Err(AppError::Other("dossier non autorisé".into())),
    };
    fs::create_dir_all(&dir)?;
    open::that(dir).map_err(|e| AppError::Other(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copied_images_point_into_the_new_folder() {
        let from = std::path::Path::new("C:/data/instances/a");
        let to = std::path::Path::new("C:/data/instances/b");
        let local = Some("C:/data/instances/a/.nexora-icon-1.png".to_string());
        let moved = moved_image(&local, from, to).unwrap();
        assert!(moved.replace('\\', "/").ends_with("instances/b/.nexora-icon-1.png"));

        let remote = Some("https://cdn.modrinth.com/icon.png".to_string());
        assert_eq!(moved_image(&remote, from, to), remote);
        assert_eq!(moved_image(&None, from, to), None);
    }
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
