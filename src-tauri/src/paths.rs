use std::path::PathBuf;

/// Racine des données de l'application: %APPDATA%\NexoraCraft
pub fn app_data_dir() -> PathBuf {
    let base = dirs::data_dir().expect("impossible de résoudre %APPDATA%");
    base.join("NexoraCraft")
}

pub fn instances_root_dir() -> PathBuf {
    app_data_dir().join("instances")
}

pub fn instance_dir(instance_id: &str) -> PathBuf {
    instances_root_dir().join(instance_id)
}

pub fn runtimes_dir() -> PathBuf {
    app_data_dir().join("runtimes")
}

pub fn libraries_cache_dir() -> PathBuf {
    app_data_dir().join("libraries")
}

pub fn assets_dir() -> PathBuf {
    app_data_dir().join("assets")
}

pub fn versions_cache_dir() -> PathBuf {
    app_data_dir().join("versions")
}

pub fn instances_file() -> PathBuf {
    app_data_dir().join("instances.json")
}

pub fn accounts_file() -> PathBuf {
    app_data_dir().join("accounts.json")
}

pub fn settings_file() -> PathBuf {
    app_data_dir().join("settings.json")
}

pub fn ensure_dirs() -> std::io::Result<()> {
    for dir in [
        app_data_dir(),
        instances_root_dir(),
        runtimes_dir(),
        libraries_cache_dir(),
        assets_dir(),
        versions_cache_dir(),
    ] {
        std::fs::create_dir_all(dir)?;
    }
    Ok(())
}
