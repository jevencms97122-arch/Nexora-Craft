use futures_util::{stream, StreamExt};
use sha1::{Digest, Sha1};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

use crate::error::{AppError, AppResult};

const CONCURRENCY: usize = 12;

#[derive(Debug, Clone, serde::Serialize)]
pub struct DownloadProgress {
    pub instance_id: String,
    pub stage: String,
    pub completed: usize,
    pub total: usize,
}

#[derive(Debug, Clone)]
pub struct DownloadTask {
    pub url: String,
    pub dest: PathBuf,
    pub sha1: Option<String>,
}

fn sha1_of_file(path: &Path) -> AppResult<String> {
    let bytes = std::fs::read(path)?;
    let mut hasher = Sha1::new();
    hasher.update(&bytes);
    Ok(hex::encode(hasher.finalize()))
}

fn is_valid(task: &DownloadTask) -> bool {
    if !task.dest.exists() {
        return false;
    }
    match &task.sha1 {
        Some(expected) => sha1_of_file(&task.dest).map(|h| &h == expected).unwrap_or(false),
        None => true,
    }
}

async fn download_one(client: &reqwest::Client, task: &DownloadTask) -> AppResult<()> {
    if is_valid(task) {
        return Ok(());
    }
    // Fichier sans adresse : il est fabriqué sur place (installeur Forge), on ne peut pas le
    // retélécharger.
    if task.url.is_empty() {
        return Err(AppError::Other(format!(
            "fichier manquant : {} (relance le jeu pour réinstaller le loader)",
            task.dest.display()
        )));
    }
    if let Some(parent) = task.dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let res = client.get(&task.url).send().await?;
    if !res.status().is_success() {
        return Err(AppError::Other(format!(
            "téléchargement échoué ({}): {}",
            res.status(),
            task.url
        )));
    }
    let bytes = res.bytes().await?;

    if let Some(expected) = &task.sha1 {
        let mut hasher = Sha1::new();
        hasher.update(&bytes);
        let actual = hex::encode(hasher.finalize());
        if &actual != expected {
            return Err(AppError::ChecksumMismatch(task.dest.display().to_string()));
        }
    }

    let tmp = task.dest.with_extension("part");
    std::fs::write(&tmp, &bytes)?;
    std::fs::rename(&tmp, &task.dest)?;
    Ok(())
}

/// Télécharge quelques fichiers l'un après l'autre, sans événement de progression.
pub async fn download_quiet(client: &reqwest::Client, tasks: Vec<DownloadTask>) -> AppResult<()> {
    for task in &tasks {
        download_one(client, task).await?;
    }
    Ok(())
}

/// Télécharge une liste de fichiers en parallèle (avec vérification SHA1 quand fournie),
/// en ignorant les fichiers déjà présents et valides. Émet un événement de progression
/// `download-progress` à chaque fichier traité.
pub async fn download_all(
    app: &AppHandle,
    client: &reqwest::Client,
    instance_id: &str,
    stage: &str,
    tasks: Vec<DownloadTask>,
) -> AppResult<()> {
    let total = tasks.len();
    if total == 0 {
        return Ok(());
    }
    let completed = std::sync::atomic::AtomicUsize::new(0);

    let results: Vec<AppResult<()>> = stream::iter(tasks.into_iter().map(|task| {
        let client = client.clone();
        let app = app.clone();
        let completed = &completed;
        let instance_id = instance_id.to_string();
        let stage = stage.to_string();
        async move {
            let result = download_one(&client, &task).await;
            let done = completed.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
            let _ = app.emit(
                "download-progress",
                DownloadProgress {
                    instance_id,
                    stage,
                    completed: done,
                    total,
                },
            );
            result
        }
    }))
    .buffer_unordered(CONCURRENCY)
    .collect()
    .await;

    for r in results {
        r?;
    }
    Ok(())
}
