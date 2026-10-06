use serde::{Deserialize, Serialize};
use std::fs;

use crate::error::AppResult;
use crate::paths;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    /// Client ID de l'application Azure AD (public client) utilisé pour la connexion Microsoft.
    /// L'utilisateur doit enregistrer sa propre application sur https://portal.azure.com
    /// (type "Comptes Microsoft personnels", plateforme "Mobile et applications de bureau",
    /// URI de redirection http://localhost, aucun secret client requis).
    pub ms_client_id: Option<String>,
    pub default_min_ram_mb: u32,
    pub default_max_ram_mb: u32,
    /// Image de fond de la page Jouer, encodée en data URI (data:image/...;base64,...).
    #[serde(default)]
    pub background_image: Option<String>,
    /// Port local du monde Minecraft (LAN) à exposer via le tunnel pour "Jouer ensemble".
    #[serde(default = "default_together_port")]
    pub together_port: u16,
    /// Clé secrète playit.gg (générée sur playit.gg/account/setup/wizard/new-account/docker/docker-name)
    /// utilisée pour "Jouer ensemble".
    #[serde(default)]
    pub together_secret_key: Option<String>,
    /// Adresse publique du tunnel playit.gg configuré par l'utilisateur (ex: xxxx.playit.gg), à partager
    /// avec ses amis pour rejoindre la partie.
    #[serde(default)]
    pub together_address: Option<String>,
}

fn default_together_port() -> u16 {
    25565
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            ms_client_id: Some("f5cd8ea2-3305-479b-820f-443ce35e5c52".to_string()),
            default_min_ram_mb: 1024,
            default_max_ram_mb: 4096,
            background_image: None,
            together_port: default_together_port(),
            together_secret_key: None,
            together_address: None,
        }
    }
}

pub fn load() -> AppResult<Settings> {
    let file = paths::settings_file();
    if !file.exists() {
        return Ok(Settings::default());
    }
    let data = fs::read_to_string(file)?;
    if data.trim().is_empty() {
        return Ok(Settings::default());
    }
    Ok(serde_json::from_str(&data)?)
}

pub fn save(settings: &Settings) -> AppResult<()> {
    paths::ensure_dirs()?;
    fs::write(paths::settings_file(), serde_json::to_string_pretty(settings)?)?;
    Ok(())
}
