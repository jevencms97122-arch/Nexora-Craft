//! Sauvegardes des mondes d'une instance.
//!
//! Chaque sauvegarde est une archive zip dans `%APPDATA%\NexoraCraft\backups\<instance>\`, nommée
//! `<monde>__<AAAAMMJJ-HHMMSS>.zip`. Une restauration commence par sauvegarder le monde actuel,
//! pour qu'on puisse toujours revenir en arrière.

use chrono::Local;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use zip::write::SimpleFileOptions;

use crate::error::{AppError, AppResult};
use crate::instances;
use crate::paths;

/// Nombre de sauvegardes gardées par monde : les plus anciennes sont supprimées au-delà.
const MAX_BACKUPS_PER_WORLD: usize = 10;
const SEPARATOR: &str = "__";

#[derive(Debug, Clone, Serialize)]
pub struct World {
    pub name: String,
    pub size_bytes: u64,
    pub modified_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Backup {
    pub file_name: String,
    pub world: String,
    pub created_ms: u64,
    pub size_bytes: u64,
}

fn zip_err(e: zip::result::ZipError) -> AppError {
    AppError::Zip(e.to_string())
}

fn saves_dir(instance_id: &str) -> PathBuf {
    paths::instance_dir(instance_id).join("saves")
}

fn backups_dir(instance_id: &str) -> PathBuf {
    paths::backups_dir().join(instance_id)
}

/// Un nom de monde ou de fichier ne doit jamais pouvoir sortir de son dossier.
fn safe_name(name: &str) -> AppResult<&str> {
    let bad = name.is_empty()
        || name == "."
        || name.contains("..")
        || name.contains(['/', '\\', ':', '\0']);
    if bad {
        return Err(AppError::Other("nom invalide".into()));
    }
    Ok(name)
}

fn modified_ms(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn dir_size(dir: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(dir) else { return 0 };
    entries
        .flatten()
        .map(|e| {
            let path = e.path();
            if path.is_dir() {
                dir_size(&path)
            } else {
                e.metadata().map(|m| m.len()).unwrap_or(0)
            }
        })
        .sum()
}

/// Les mondes d'une instance : les dossiers de `saves` qui contiennent un `level.dat`.
pub fn list_worlds(instance_id: &str) -> AppResult<Vec<World>> {
    instances::get(instance_id)?;
    let Ok(entries) = fs::read_dir(saves_dir(instance_id)) else { return Ok(Vec::new()) };
    let mut worlds: Vec<World> = entries
        .flatten()
        .filter(|e| e.path().join("level.dat").exists())
        .map(|e| World {
            name: e.file_name().to_string_lossy().to_string(),
            size_bytes: dir_size(&e.path()),
            modified_ms: modified_ms(&e.path().join("level.dat")),
        })
        .collect();
    worlds.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    Ok(worlds)
}

fn split_file_name(file_name: &str) -> Option<String> {
    let stem = file_name.strip_suffix(".zip")?;
    stem.rsplit_once(SEPARATOR).map(|(world, _)| world.to_string())
}

pub fn list_backups(instance_id: &str) -> AppResult<Vec<Backup>> {
    list_backups_in(&backups_dir(instance_id))
}

fn list_backups_in(dir: &Path) -> AppResult<Vec<Backup>> {
    let Ok(entries) = fs::read_dir(dir) else { return Ok(Vec::new()) };
    let mut backups: Vec<Backup> = entries
        .flatten()
        .filter_map(|e| {
            let file_name = e.file_name().to_string_lossy().to_string();
            let world = split_file_name(&file_name)?;
            Some(Backup {
                created_ms: modified_ms(&e.path()),
                size_bytes: e.metadata().map(|m| m.len()).unwrap_or(0),
                file_name,
                world,
            })
        })
        .collect();
    backups.sort_by(|a, b| b.created_ms.cmp(&a.created_ms));
    Ok(backups)
}

fn add_dir(zip: &mut zip::ZipWriter<fs::File>, dir: &Path, prefix: &str, options: SimpleFileOptions) -> AppResult<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let relative = format!("{prefix}/{name}");
        if path.is_dir() {
            zip.add_directory(format!("{relative}/"), options).map_err(zip_err)?;
            add_dir(zip, &path, &relative, options)?;
        } else {
            // Verrou du jeu : inutile à sauvegarder, et illisible tant que le jeu tourne.
            if name == "session.lock" {
                continue;
            }
            zip.start_file(relative, options).map_err(zip_err)?;
            let mut file = fs::File::open(&path)?;
            std::io::copy(&mut file, zip)?;
        }
    }
    Ok(())
}

fn create_backup(instance_id: &str, world: &str, prune: bool) -> AppResult<Backup> {
    create_backup_in(&saves_dir(instance_id), &backups_dir(instance_id), world, prune)
}

fn create_backup_in(saves: &Path, dir: &Path, world: &str, prune: bool) -> AppResult<Backup> {
    let world = safe_name(world)?;
    let source = saves.join(world);
    if !source.is_dir() {
        return Err(AppError::Other(format!("le monde « {world} » est introuvable")));
    }
    fs::create_dir_all(dir)?;

    // Deux sauvegardes dans la même seconde (une restauration en crée une) ne doivent jamais
    // s'écraser : un numéro est ajouté au besoin.
    let stamp = Local::now().format("%Y%m%d-%H%M%S").to_string();
    let mut file_name = format!("{world}{SEPARATOR}{stamp}.zip");
    let mut attempt = 2;
    while dir.join(&file_name).exists() {
        file_name = format!("{world}{SEPARATOR}{stamp}-{attempt}.zip");
        attempt += 1;
    }
    let dest = dir.join(&file_name);
    let partial = dir.join(format!("{file_name}.part"));

    let result = (|| -> AppResult<()> {
        let mut zip = zip::ZipWriter::new(fs::File::create(&partial)?);
        let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        zip.add_directory(format!("{world}/"), options).map_err(zip_err)?;
        add_dir(&mut zip, &source, world, options)?;
        zip.finish().map_err(zip_err)?;
        fs::rename(&partial, &dest)?;
        Ok(())
    })();
    if let Err(e) = result {
        let _ = fs::remove_file(&partial);
        return Err(e);
    }

    if prune {
        prune_world(dir, world);
    }
    Ok(Backup {
        created_ms: modified_ms(&dest),
        size_bytes: fs::metadata(&dest).map(|m| m.len()).unwrap_or(0),
        file_name,
        world: world.to_string(),
    })
}

fn prune_world(dir: &Path, world: &str) {
    let Ok(backups) = list_backups_in(dir) else { return };
    for old in backups.into_iter().filter(|b| b.world == world).skip(MAX_BACKUPS_PER_WORLD) {
        let _ = fs::remove_file(dir.join(old.file_name));
    }
}

pub fn backup_world(instance_id: &str, world: &str) -> AppResult<Backup> {
    instances::get(instance_id)?;
    create_backup(instance_id, world, true)
}

/// Sauvegarde tous les mondes de l'instance (avant un changement de version, par exemple).
/// Retourne le nombre de mondes sauvegardés.
pub fn backup_all(instance_id: &str) -> AppResult<usize> {
    let worlds = list_worlds(instance_id)?;
    for world in &worlds {
        create_backup(instance_id, &world.name, true)?;
    }
    Ok(worlds.len())
}

pub fn restore(instance_id: &str, file_name: &str) -> AppResult<()> {
    instances::get(instance_id)?;
    restore_in(&saves_dir(instance_id), &backups_dir(instance_id), file_name)
}

fn restore_in(saves: &Path, dir: &Path, file_name: &str) -> AppResult<()> {
    let file_name = safe_name(file_name)?;
    let archive_path = dir.join(file_name);
    let world = split_file_name(file_name).ok_or_else(|| AppError::Other("nom de sauvegarde invalide".into()))?;
    let world = safe_name(&world)?.to_string();
    if !archive_path.is_file() {
        return Err(AppError::Other("sauvegarde introuvable".into()));
    }

    fs::create_dir_all(saves)?;
    let target = saves.join(&world);

    // Le monde actuel est mis de côté avant d'être remplacé.
    if target.is_dir() {
        create_backup_in(saves, dir, &world, false)?;
    }

    // L'archive est d'abord extraite à côté : une archive abîmée ne détruit pas le monde actuel.
    let staging = saves.join(format!("{world}.restauration"));
    if staging.exists() {
        fs::remove_dir_all(&staging)?;
    }
    let extracted = (|| -> AppResult<()> {
        let mut archive = zip::ZipArchive::new(fs::File::open(&archive_path)?).map_err(zip_err)?;
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).map_err(zip_err)?;
            // `enclosed_name` écarte les chemins qui sortiraient du dossier (`..`, chemins absolus).
            let Some(path) = entry.enclosed_name() else { continue };
            let relative: PathBuf = path.components().skip(1).collect();
            if relative.as_os_str().is_empty() {
                continue;
            }
            let dest = staging.join(relative);
            if entry.is_dir() {
                fs::create_dir_all(&dest)?;
            } else {
                if let Some(parent) = dest.parent() {
                    fs::create_dir_all(parent)?;
                }
                let mut out = fs::File::create(&dest)?;
                std::io::copy(&mut entry, &mut out)?;
            }
        }
        Ok(())
    })();
    if let Err(e) = extracted {
        let _ = fs::remove_dir_all(&staging);
        return Err(e);
    }

    if target.exists() {
        fs::remove_dir_all(&target)?;
    }
    fs::rename(&staging, &target)?;
    Ok(())
}

pub fn delete(instance_id: &str, file_name: &str) -> AppResult<()> {
    let file_name = safe_name(file_name)?;
    if split_file_name(file_name).is_none() {
        return Err(AppError::Other("nom de sauvegarde invalide".into()));
    }
    fs::remove_file(backups_dir(instance_id).join(file_name))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_name_refuses_path_tricks() {
        assert!(safe_name("Mon monde").is_ok());
        assert!(safe_name("..").is_err());
        assert!(safe_name("a/b").is_err());
        assert!(safe_name("a\\b").is_err());
        assert!(safe_name("C:evil").is_err());
        assert!(safe_name("").is_err());
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nexora-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn backup_then_restore_brings_the_world_back() {
        let root = temp_dir("restore");
        let (saves, backups) = (root.join("saves"), root.join("backups"));
        let world = saves.join("Survie");
        fs::create_dir_all(world.join("region")).unwrap();
        fs::write(world.join("level.dat"), b"niveau").unwrap();
        fs::write(world.join("region").join("r.0.0.mca"), b"chunks").unwrap();
        fs::write(world.join("session.lock"), b"lock").unwrap();

        let backup = create_backup_in(&saves, &backups, "Survie", true).unwrap();
        assert_eq!(backup.world, "Survie");
        assert!(backup.size_bytes > 0);

        // Le monde est abîmé, puis restauré.
        fs::write(world.join("level.dat"), b"abime").unwrap();
        fs::remove_file(world.join("region").join("r.0.0.mca")).unwrap();
        restore_in(&saves, &backups, &backup.file_name).unwrap();

        assert_eq!(fs::read(world.join("level.dat")).unwrap(), b"niveau");
        assert_eq!(fs::read(world.join("region").join("r.0.0.mca")).unwrap(), b"chunks");
        assert!(!world.join("session.lock").exists(), "le verrou du jeu n'est pas sauvegardé");
        assert!(!saves.join("Survie.restauration").exists());
        // Restaurer a mis de côté la version abîmée : il y a maintenant deux sauvegardes.
        let found = list_backups_in(&backups).unwrap();
        assert_eq!(found.len(), 2);
        assert!(found.iter().all(|b| b.world == "Survie"));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn restore_refuses_names_that_leave_the_folder() {
        let root = temp_dir("evil");
        let (saves, backups) = (root.join("saves"), root.join("backups"));
        fs::create_dir_all(&backups).unwrap();
        assert!(restore_in(&saves, &backups, r"..\evil__20260101-000000.zip").is_err());
        assert!(restore_in(&saves, &backups, "absent__20260101-000000.zip").is_err());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn only_the_latest_backups_are_kept() {
        let root = temp_dir("prune");
        let (saves, backups) = (root.join("saves"), root.join("backups"));
        fs::create_dir_all(saves.join("M")).unwrap();
        fs::write(saves.join("M").join("level.dat"), b"x").unwrap();
        fs::create_dir_all(&backups).unwrap();
        for i in 0..(MAX_BACKUPS_PER_WORLD + 3) {
            fs::write(backups.join(format!("M__20260101-0000{i:02}.zip")), b"z").unwrap();
        }
        create_backup_in(&saves, &backups, "M", true).unwrap();
        assert_eq!(list_backups_in(&backups).unwrap().len(), MAX_BACKUPS_PER_WORLD);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn backup_file_name_gives_back_the_world() {
        assert_eq!(split_file_name("Survie__20261119-101500.zip").as_deref(), Some("Survie"));
        assert_eq!(split_file_name("a__b__20261119-101500.zip").as_deref(), Some("a__b"));
        assert_eq!(split_file_name("notes.txt"), None);
    }
}
