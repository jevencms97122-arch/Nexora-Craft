//! Musiques d'ambiance du launcher, lues dans les fichiers du jeu.
//!
//! Le launcher n'embarque aucune musique : il joue celles que Minecraft a lui-même téléchargées
//! chez Mojang lors de l'installation d'une version (dossier `assets`). Elles ne sont donc
//! disponibles qu'après un premier lancement du jeu.

use std::collections::{BTreeMap, HashSet};
use std::fs;

use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::paths;

const MUSIC_PREFIX: &str = "minecraft/sounds/music/";

#[derive(Debug, Deserialize)]
struct AssetIndex {
    objects: BTreeMap<String, AssetObject>,
}

#[derive(Debug, Deserialize)]
struct AssetObject {
    hash: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GameTrack {
    /// Identifiant stable : l'empreinte du fichier.
    pub id: String,
    pub name: String,
    /// Chemin du fichier audio sur le disque.
    pub path: String,
}

/// « minecraft/sounds/music/game/creative/aria_math.ogg » → « Aria Math ».
fn display_name(key: &str) -> String {
    let file = key.rsplit('/').next().unwrap_or(key);
    let stem = file.rsplit_once('.').map(|(stem, _)| stem).unwrap_or(file);
    stem.split('_')
        .filter(|word| !word.is_empty())
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Liste les musiques présentes dans les fichiers du jeu déjà téléchargés, triées par nom.
pub fn list() -> AppResult<Vec<GameTrack>> {
    let indexes_dir = paths::assets_dir().join("indexes");
    let objects_dir = paths::assets_dir().join("objects");
    let mut seen = HashSet::new();
    let mut tracks = Vec::new();

    let Ok(entries) = fs::read_dir(indexes_dir) else {
        return Ok(tracks);
    };
    for entry in entries.flatten() {
        let Ok(data) = fs::read_to_string(entry.path()) else { continue };
        let Ok(index) = serde_json::from_str::<AssetIndex>(&data) else { continue };
        for (key, object) in index.objects {
            if !key.starts_with(MUSIC_PREFIX) || object.hash.len() < 2 || !seen.insert(object.hash.clone()) {
                continue;
            }
            let file = objects_dir.join(&object.hash[..2]).join(&object.hash);
            // Seuls les fichiers réellement téléchargés sont proposés.
            if file.is_file() {
                tracks.push(GameTrack {
                    id: object.hash,
                    name: display_name(&key),
                    path: file.to_string_lossy().to_string(),
                });
            }
        }
    }
    tracks.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.id.cmp(&b.id)));
    Ok(tracks)
}

#[cfg(test)]
mod tests {
    use super::display_name;

    #[test]
    fn turns_asset_keys_into_readable_names() {
        assert_eq!(display_name("minecraft/sounds/music/game/creative/aria_math.ogg"), "Aria Math");
        assert_eq!(display_name("minecraft/sounds/music/menu/menu1.ogg"), "Menu1");
    }
}
