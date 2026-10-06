use std::path::PathBuf;
use tauri::AppHandle;

use crate::download::{self, DownloadTask};
use crate::error::AppResult;
use crate::paths;

use super::manifest::{self, VersionDetail};
use super::rules::rules_allow;

pub struct ResolvedLibraries {
    pub classpath: Vec<PathBuf>,
    pub natives_jars: Vec<PathBuf>,
}

fn arch_native_key() -> &'static str {
    "natives-windows"
}

/// Détermine, pour chaque bibliothèque de la version, si elle doit être téléchargée pour Windows,
/// et sépare les jars "classpath" classiques des jars "natives" (LWJGL etc.) à extraire.
pub fn resolve_libraries(detail: &VersionDetail) -> (Vec<DownloadTask>, ResolvedLibraries) {
    let mut tasks = Vec::new();
    let mut classpath = Vec::new();
    let mut natives_jars = Vec::new();
    let libs_dir = paths::libraries_cache_dir();

    for lib in &detail.libraries {
        if !rules_allow(&lib.rules) {
            continue;
        }
        let Some(downloads) = &lib.downloads else { continue };

        if let Some(artifact) = &downloads.artifact {
            let rel_path = artifact
                .path
                .clone()
                .unwrap_or_else(|| format!("{}.jar", lib.name.replace(':', "/")));
            let dest = libs_dir.join(&rel_path);
            tasks.push(DownloadTask {
                url: artifact.url.clone(),
                dest: dest.clone(),
                sha1: artifact.sha1.clone(),
            });
            classpath.push(dest);
        }

        if let Some(natives_map) = &lib.natives {
            if let Some(classifier) = natives_map.get("windows") {
                let classifier = classifier.replace("${arch}", "64");
                if let Some(classifiers) = &downloads.classifiers {
                    if let Some(artifact) = classifiers.get(&classifier) {
                        let rel_path = artifact
                            .path
                            .clone()
                            .unwrap_or_else(|| format!("{}-{}.jar", lib.name.replace(':', "/"), classifier));
                        let dest = libs_dir.join(&rel_path);
                        tasks.push(DownloadTask {
                            url: artifact.url.clone(),
                            dest: dest.clone(),
                            sha1: artifact.sha1.clone(),
                        });
                        natives_jars.push(dest);
                    }
                }
            }
        } else if lib.name.contains("natives-windows") || arch_native_key() == "natives-windows" {
            // Bibliothèques modernes: le classifier natif est parfois exposé comme lib séparée
            // avec son propre nom (ex: lwjgl-*:natives-windows). Rien à faire ici, déjà couvert
            // par `downloads.artifact` ci-dessus si présent.
        }
    }

    (tasks, ResolvedLibraries { classpath, natives_jars })
}

/// Télécharge le client.jar, les bibliothèques et les assets, avec vérification SHA1.
/// Retourne le chemin du client.jar et la liste du classpath (libs) ainsi que les jars natifs à extraire.
pub async fn install_version(
    app: &AppHandle,
    client: &reqwest::Client,
    instance_id: &str,
    detail: &VersionDetail,
) -> AppResult<(PathBuf, ResolvedLibraries)> {
    let versions_dir = paths::versions_cache_dir().join(&detail.id);
    std::fs::create_dir_all(&versions_dir)?;
    let client_jar = versions_dir.join("client.jar");

    let mut tasks = vec![DownloadTask {
        url: detail.downloads.client.url.clone(),
        dest: client_jar.clone(),
        sha1: detail.downloads.client.sha1.clone(),
    }];

    let (lib_tasks, resolved) = resolve_libraries(detail);
    tasks.extend(lib_tasks);

    download::download_all(app, client, instance_id, "Téléchargement des bibliothèques", tasks).await?;

    install_assets(app, client, instance_id, detail).await?;

    Ok((client_jar, resolved))
}

async fn install_assets(
    app: &AppHandle,
    client: &reqwest::Client,
    instance_id: &str,
    detail: &VersionDetail,
) -> AppResult<()> {
    let index = manifest::fetch_asset_index(client, &detail.asset_index).await?;
    let objects_dir = paths::assets_dir().join("objects");
    let indexes_dir = paths::assets_dir().join("indexes");
    std::fs::create_dir_all(&indexes_dir)?;

    let index_file = indexes_dir.join(format!("{}.json", detail.asset_index.id));
    if !index_file.exists() {
        let bytes = client.get(&detail.asset_index.url).send().await?.bytes().await?;
        std::fs::write(&index_file, &bytes)?;
    }

    let tasks: Vec<DownloadTask> = index
        .objects
        .values()
        .map(|obj| {
            let prefix = &obj.hash[0..2];
            let dest = objects_dir.join(prefix).join(&obj.hash);
            DownloadTask {
                url: format!("https://resources.download.minecraft.net/{prefix}/{}", obj.hash),
                dest,
                sha1: Some(obj.hash.clone()),
            }
        })
        .collect();

    download::download_all(app, client, instance_id, "Téléchargement des assets", tasks).await
}
