use chrono::{DateTime, Utc};
use md5::{Digest, Md5};
use serde::{Deserialize, Serialize};
use std::fs;

use crate::error::AppResult;
use crate::paths;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub uuid: String,
    pub username: String,
    pub skin_url: Option<String>,
    /// Token Minecraft Services (Bearer), utilisé pour lancer le jeu.
    pub minecraft_access_token: String,
    pub minecraft_token_expires_at: DateTime<Utc>,
    /// Refresh token du compte Microsoft (offline_access), pour renouveler la session sans reconnexion.
    pub ms_refresh_token: String,
    /// Compte local de test (pas de vraie session Mojang, pas de multijoueur en ligne).
    #[serde(default)]
    pub is_offline: bool,
}

/// Reproduit l'algorithme officiel du mode hors-ligne de Minecraft:
/// UUID v3 dérivé de MD5("OfflinePlayer:<pseudo>").
fn offline_uuid(username: &str) -> String {
    let mut hasher = Md5::new();
    hasher.update(format!("OfflinePlayer:{username}").as_bytes());
    let mut bytes: [u8; 16] = hasher.finalize().into();
    bytes[6] = (bytes[6] & 0x0f) | 0x30;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3],
        bytes[4], bytes[5],
        bytes[6], bytes[7],
        bytes[8], bytes[9],
        bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
    )
}

pub fn create_offline(username: &str) -> AppResult<Account> {
    let account = Account {
        uuid: offline_uuid(username),
        username: username.to_string(),
        skin_url: None,
        minecraft_access_token: String::new(),
        minecraft_token_expires_at: Utc::now(),
        ms_refresh_token: String::new(),
        is_offline: true,
    };
    upsert(account.clone(), true)?;
    Ok(account)
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AccountsFile {
    pub active_uuid: Option<String>,
    pub accounts: Vec<Account>,
}

fn load() -> AppResult<AccountsFile> {
    let file = paths::accounts_file();
    if !file.exists() {
        return Ok(AccountsFile::default());
    }
    let data = fs::read_to_string(file)?;
    if data.trim().is_empty() {
        return Ok(AccountsFile::default());
    }
    Ok(serde_json::from_str(&data)?)
}

fn save(data: &AccountsFile) -> AppResult<()> {
    paths::ensure_dirs()?;
    fs::write(paths::accounts_file(), serde_json::to_string_pretty(data)?)?;
    Ok(())
}

pub fn list() -> AppResult<AccountsFile> {
    load()
}

pub fn upsert(account: Account, set_active: bool) -> AppResult<AccountsFile> {
    let mut data = load()?;
    if let Some(existing) = data.accounts.iter_mut().find(|a| a.uuid == account.uuid) {
        *existing = account.clone();
    } else {
        data.accounts.push(account.clone());
    }
    if set_active || data.active_uuid.is_none() {
        data.active_uuid = Some(account.uuid);
    }
    save(&data)?;
    Ok(data)
}

pub fn set_active(uuid: &str) -> AppResult<AccountsFile> {
    let mut data = load()?;
    data.active_uuid = Some(uuid.to_string());
    save(&data)?;
    Ok(data)
}

pub fn remove(uuid: &str) -> AppResult<AccountsFile> {
    let mut data = load()?;
    data.accounts.retain(|a| a.uuid != uuid);
    if data.active_uuid.as_deref() == Some(uuid) {
        data.active_uuid = data.accounts.first().map(|a| a.uuid.clone());
    }
    save(&data)?;
    Ok(data)
}

pub fn active() -> AppResult<Option<Account>> {
    let data = load()?;
    Ok(match data.active_uuid {
        Some(uuid) => data.accounts.into_iter().find(|a| a.uuid == uuid),
        None => None,
    })
}
