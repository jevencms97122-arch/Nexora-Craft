//! Session du compte Nexora, gardée dans un fichier du dossier de données du launcher.
//!
//! L'interface la stockait dans la mémoire du navigateur intégré, qui n'est pas la même entre la
//! version installée et la version de développement, et qui peut être vidée. Un fichier à côté des
//! comptes et des instances suit le launcher partout : le joueur reste connecté.

use std::collections::BTreeMap;
use std::path::PathBuf;

use crate::error::AppResult;
use crate::paths;

fn file() -> PathBuf {
    paths::app_data_dir().join("session.json")
}

fn load() -> BTreeMap<String, String> {
    std::fs::read_to_string(file())
        .ok()
        .and_then(|data| serde_json::from_str(&data).ok())
        .unwrap_or_default()
}

fn save(values: &BTreeMap<String, String>) -> AppResult<()> {
    // Écriture en deux temps : une coupure au mauvais moment ne doit pas vider la session.
    let tmp = file().with_extension("json.part");
    std::fs::write(&tmp, serde_json::to_string(values)?)?;
    std::fs::rename(tmp, file())?;
    Ok(())
}

pub fn get(key: &str) -> Option<String> {
    load().get(key).cloned()
}

pub fn set(key: &str, value: &str) -> AppResult<()> {
    let mut values = load();
    values.insert(key.to_string(), value.to_string());
    save(&values)
}

pub fn remove(key: &str) -> AppResult<()> {
    let mut values = load();
    if values.remove(key).is_some() {
        save(&values)?;
    }
    Ok(())
}
