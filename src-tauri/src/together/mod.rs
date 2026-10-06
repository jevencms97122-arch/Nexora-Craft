use serde::Deserialize;
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, BufReader};

use crate::error::{AppError, AppResult};
use crate::paths;
use crate::state::AppState;

const REPO_API: &str = "https://api.github.com/repos/playit-cloud/playit-agent/releases/latest";
const ASSET_NAME: &str = "playit-windows-x86_64-signed.exe";

#[derive(Debug, Clone, serde::Serialize)]
pub struct TogetherLogLine {
    pub line: String,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

fn agent_path() -> std::path::PathBuf {
    paths::app_data_dir().join("tools").join("playit-agent.exe")
}

async fn ensure_agent(client: &reqwest::Client) -> AppResult<std::path::PathBuf> {
    let path = agent_path();
    if path.exists() {
        return Ok(path);
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let release = client
        .get(REPO_API)
        .send()
        .await?
        .json::<GithubRelease>()
        .await?;
    let asset = release
        .assets
        .into_iter()
        .find(|a| a.name == ASSET_NAME)
        .ok_or_else(|| AppError::Other("binaire playit.gg introuvable pour Windows".into()))?;

    let bytes = client.get(&asset.browser_download_url).send().await?.bytes().await?;
    std::fs::write(&path, &bytes)?;
    Ok(path)
}

/// Démarre l'agent playit.gg avec la clé secrète fournie, en streamant ses logs via l'événement
/// `together-log`. Tue automatiquement toute instance déjà en cours.
pub async fn start(app: &AppHandle, state: &State<'_, AppState>, secret_key: &str) -> AppResult<()> {
    stop(state)?;

    let path = ensure_agent(&state.http).await?;

    let mut child = tokio::process::Command::new(path)
        .arg("--secret")
        .arg(secret_key)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    if let Some(stdout) = stdout {
        let app = app.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app.emit("together-log", TogetherLogLine { line });
            }
        });
    }
    if let Some(stderr) = stderr {
        let app = app.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app.emit("together-log", TogetherLogLine { line });
            }
        });
    }

    *state.together_child.lock().unwrap() = Some(child);
    Ok(())
}

pub fn stop(state: &State<'_, AppState>) -> AppResult<()> {
    if let Some(mut child) = state.together_child.lock().unwrap().take() {
        let _ = child.start_kill();
    }
    Ok(())
}

pub fn is_running(state: &State<'_, AppState>) -> bool {
    state.together_child.lock().unwrap().is_some()
}
