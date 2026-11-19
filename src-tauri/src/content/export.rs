//! Export d'une instance au format Modrinth (`.mrpack`), lisible par la plupart des launchers.
//!
//! Les contenus venus de Modrinth sont décrits par leur adresse de téléchargement et leurs
//! empreintes ; les fichiers ajoutés à la main, et le dossier `config`, sont embarqués dans
//! `overrides/`. Les contenus désactivés ne sont pas exportés.

use serde::Serialize;
use serde_json::json;
use std::fs;
use std::io::Write;
use std::path::Path;
use zip::write::SimpleFileOptions;

use super::{load_manifest, ContentType, InstalledContent, LOCAL_PREFIX};
use crate::error::{AppError, AppResult};
use crate::instances::{self, Instance, Loader};
use crate::modrinth;
use crate::paths;

#[derive(Debug, Clone, Serialize)]
pub struct ExportSummary {
    /// Contenus décrits par leur adresse de téléchargement.
    pub linked: usize,
    /// Fichiers embarqués dans l'archive (contenus ajoutés à la main, configuration).
    pub embedded: usize,
}

fn zip_err(e: zip::result::ZipError) -> AppError {
    AppError::Zip(e.to_string())
}

fn loader_dependency(instance: &Instance) -> Option<(&'static str, String)> {
    let key = match instance.loader {
        Loader::Fabric => "fabric-loader",
        Loader::Quilt => "quilt-loader",
        Loader::Forge => "forge",
        Loader::NeoForge => "neoforge",
        Loader::Vanilla => return None,
    };
    Some((key, instance.loader_version.clone()?))
}

/// Le fichier de l'instance qui correspond à un contenu (présent et activé).
fn local_file(instance_id: &str, item: &InstalledContent) -> Option<std::path::PathBuf> {
    let path = item.path(instance_id);
    path.is_file().then_some(path)
}

fn add_file(zip: &mut zip::ZipWriter<fs::File>, name: String, path: &Path, options: SimpleFileOptions) -> AppResult<()> {
    zip.start_file(name, options).map_err(zip_err)?;
    let mut file = fs::File::open(path)?;
    std::io::copy(&mut file, zip)?;
    Ok(())
}

fn add_config(
    zip: &mut zip::ZipWriter<fs::File>,
    dir: &Path,
    prefix: &str,
    options: SimpleFileOptions,
    count: &mut usize,
) -> AppResult<()> {
    let Ok(entries) = fs::read_dir(dir) else { return Ok(()) };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = format!("{prefix}/{}", entry.file_name().to_string_lossy());
        if path.is_dir() {
            add_config(zip, &path, &name, options, count)?;
        } else {
            add_file(zip, name, &path, options)?;
            *count += 1;
        }
    }
    Ok(())
}

pub async fn export_mrpack(client: &reqwest::Client, instance_id: &str, dest: &Path) -> AppResult<ExportSummary> {
    let instance = instances::get(instance_id)?;
    let items: Vec<InstalledContent> = load_manifest(instance_id)?
        .into_iter()
        .filter(|i| !i.disabled && i.content_type != ContentType::Modpack)
        .collect();

    // Les versions Modrinth sont demandées toutes ensemble.
    let lookups = items.iter().map(|item| async move {
        if item.project_id.starts_with(LOCAL_PREFIX) {
            return None;
        }
        modrinth::get_version(client, &item.version_id).await.ok()
    });
    let versions = futures_util::future::join_all(lookups).await;

    let mut index_files = Vec::new();
    let mut embedded: Vec<(String, std::path::PathBuf)> = Vec::new();

    for (item, version) in items.iter().zip(versions) {
        let path = format!("{}/{}", item.content_type.folder(), item.file_name);
        let described = version.as_ref().and_then(|v| {
            let file = v.files.iter().find(|f| f.filename == item.file_name)?;
            Some((file.url.clone(), file.hashes.sha1.clone()?, file.hashes.sha512.clone()?, file.size))
        });
        match described {
            Some((url, sha1, sha512, size)) => index_files.push(json!({
                "path": path,
                "hashes": { "sha1": sha1, "sha512": sha512 },
                "env": { "client": "required", "server": "required" },
                "downloads": [url],
                "fileSize": size,
            })),
            // Contenu ajouté à la main, ou retiré de Modrinth : le fichier voyage dans l'archive.
            None => {
                if let Some(file) = local_file(instance_id, item) {
                    embedded.push((format!("overrides/{path}"), file));
                }
            }
        }
    }

    let mut dependencies = serde_json::Map::new();
    dependencies.insert("minecraft".into(), json!(instance.mc_version));
    if let Some((key, version)) = loader_dependency(&instance) {
        dependencies.insert(key.into(), json!(version));
    }
    let index = json!({
        "formatVersion": 1,
        "game": "minecraft",
        "versionId": chrono::Local::now().format("%Y.%m.%d").to_string(),
        "name": instance.name,
        "files": index_files,
        "dependencies": dependencies,
    });

    let partial = dest.with_extension("mrpack.part");
    let linked = index_files.len();
    let result = (|| -> AppResult<usize> {
        let mut zip = zip::ZipWriter::new(fs::File::create(&partial)?);
        let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        zip.start_file("modrinth.index.json", options).map_err(zip_err)?;
        zip.write_all(serde_json::to_string_pretty(&index)?.as_bytes())?;

        let mut count = 0;
        for (name, path) in &embedded {
            add_file(&mut zip, name.clone(), path, options)?;
            count += 1;
        }
        add_config(&mut zip, &paths::instance_dir(instance_id).join("config"), "overrides/config", options, &mut count)?;
        zip.finish().map_err(zip_err)?;
        fs::rename(&partial, dest)?;
        Ok(count)
    })();

    match result {
        Ok(embedded) => Ok(ExportSummary { linked, embedded }),
        Err(e) => {
            let _ = fs::remove_file(&partial);
            Err(e)
        }
    }
}
