use serde::{Deserialize, Serialize};

use crate::error::AppResult;

const API_BASE: &str = "https://api.modrinth.com/v2";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchHit {
    pub project_id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    pub project_type: String,
    #[serde(default)]
    pub categories: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResponse {
    pub hits: Vec<SearchHit>,
    pub total_hits: u64,
}

/// project_type: "mod" | "shader" | "resourcepack" | "datapack"
/// mc_version: filtre optionnel (aucun = recherche toutes versions confondues).
/// loader: requis pour "mod"/"shader" (ex: "fabric"), ignoré sinon.
pub async fn search(
    client: &reqwest::Client,
    query: &str,
    project_type: &str,
    mc_version: Option<&str>,
    loader: Option<&str>,
) -> AppResult<SearchResponse> {
    let mut facets = vec![format!("[\"project_type:{project_type}\"]")];
    if let Some(v) = mc_version {
        facets.push(format!("[\"versions:{v}\"]"));
    }
    if let Some(l) = loader {
        if project_type == "mod" || project_type == "shader" {
            facets.push(format!("[\"categories:{l}\"]"));
        }
    }
    let facets_json = format!("[{}]", facets.join(","));

    let res = client
        .get(format!("{API_BASE}/search"))
        .query(&[
            ("query", query),
            ("facets", facets_json.as_str()),
            ("limit", "30"),
            ("index", "relevance"),
        ])
        .send()
        .await?;
    Ok(res.json::<SearchResponse>().await?)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionFile {
    pub url: String,
    pub filename: String,
    #[serde(default)]
    pub primary: bool,
    pub hashes: VersionFileHashes,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionFileHashes {
    pub sha1: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectVersion {
    pub id: String,
    pub name: String,
    pub version_number: String,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    pub files: Vec<VersionFile>,
}

/// Toutes les versions publiées d'un projet, triées de la plus récente à la plus ancienne.
pub async fn get_all_versions(client: &reqwest::Client, project_id: &str) -> AppResult<Vec<ProjectVersion>> {
    let res = client
        .get(format!("{API_BASE}/project/{project_id}/version"))
        .send()
        .await?;
    Ok(res.json::<Vec<ProjectVersion>>().await?)
}

pub async fn get_version(client: &reqwest::Client, version_id: &str) -> AppResult<ProjectVersion> {
    let res = client.get(format!("{API_BASE}/version/{version_id}")).send().await?;
    Ok(res.json::<ProjectVersion>().await?)
}
