use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

use super::manifest::{DownloadArtifact, Library, LibraryDownloads, VersionDetail};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LoaderKind {
    Fabric,
    Quilt,
}

impl LoaderKind {
    fn meta_base(self) -> &'static str {
        match self {
            LoaderKind::Fabric => "https://meta.fabricmc.net/v2",
            LoaderKind::Quilt => "https://meta.quiltmc.org/v3",
        }
    }

}

#[derive(Debug, Deserialize)]
struct LoaderVersionEntry {
    loader: LoaderVersionInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoaderVersionInfo {
    pub version: String,
    #[serde(default)]
    pub stable: bool,
}

/// Liste les versions du loader disponibles pour une version de Minecraft donnée,
/// triées de la plus récente à la plus ancienne (ordre renvoyé par l'API).
pub async fn fetch_loader_versions(
    client: &reqwest::Client,
    kind: LoaderKind,
    mc_version: &str,
) -> AppResult<Vec<LoaderVersionInfo>> {
    let url = format!("{}/versions/loader/{mc_version}", kind.meta_base());
    let entries: Vec<LoaderVersionEntry> = client.get(url).send().await?.json().await?;
    Ok(entries.into_iter().map(|e| e.loader).collect())
}

/// Choisit la version recommandée: la première marquée stable, sinon la première tout court.
pub async fn resolve_recommended_version(
    client: &reqwest::Client,
    kind: LoaderKind,
    mc_version: &str,
) -> AppResult<String> {
    let versions = fetch_loader_versions(client, kind, mc_version).await?;
    versions
        .iter()
        .find(|v| v.stable)
        .or_else(|| versions.first())
        .map(|v| v.version.clone())
        .ok_or_else(|| AppError::Other(format!("aucune version {kind:?} disponible pour Minecraft {mc_version}")))
}

#[derive(Debug, Deserialize)]
struct ProfileLibrary {
    name: String,
    url: String,
}

#[derive(Debug, Deserialize)]
struct LoaderProfile {
    id: String,
    #[serde(rename = "mainClass")]
    main_class: String,
    libraries: Vec<ProfileLibrary>,
}

async fn fetch_profile(
    client: &reqwest::Client,
    kind: LoaderKind,
    mc_version: &str,
    loader_version: &str,
) -> AppResult<LoaderProfile> {
    let url = format!("{}/versions/loader/{mc_version}/{loader_version}/profile/json", kind.meta_base());
    Ok(client.get(url).send().await?.json().await?)
}

/// Convertit un identifiant maven ("groupe:artefact:version") en chemin relatif de dépôt Maven.
fn maven_path(name: &str) -> Option<String> {
    let parts: Vec<&str> = name.split(':').collect();
    let (group, artifact, version) = (parts.first()?, parts.get(1)?, parts.get(2)?);
    Some(format!(
        "{}/{artifact}/{version}/{artifact}-{version}.jar",
        group.replace('.', "/")
    ))
}

/// Télécharge le profil du loader et le fusionne dans le VersionDetail Vanilla:
/// classe principale remplacée par celle du loader, bibliothèques du loader ajoutées
/// au classpath. Le reste (assets, arguments de jeu, version Java) reste celui de Vanilla.
pub async fn apply_loader(
    client: &reqwest::Client,
    detail: &mut VersionDetail,
    kind: LoaderKind,
    mc_version: &str,
    loader_version: &str,
) -> AppResult<()> {
    let profile = fetch_profile(client, kind, mc_version, loader_version).await?;
    detail.id = profile.id;
    detail.main_class = profile.main_class;

    for lib in &profile.libraries {
        let Some(path) = maven_path(&lib.name) else { continue };
        let url = format!("{}/{path}", lib.url.trim_end_matches('/'));
        detail.libraries.push(Library {
            name: lib.name.clone(),
            downloads: Some(LibraryDownloads {
                artifact: Some(DownloadArtifact {
                    sha1: None,
                    size: 0,
                    url,
                    path: Some(path),
                }),
                classifiers: None,
            }),
            rules: None,
            natives: None,
        });
    }

    Ok(())
}
