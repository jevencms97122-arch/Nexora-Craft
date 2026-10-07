use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::accounts::Account;
use crate::error::{AppError, AppResult};
use crate::instances::Instance;
use crate::paths;

use super::install::ResolvedLibraries;
use super::manifest::{ArgValue, ArgumentEntry, VersionDetail};
use super::rules::rules_allow;

#[derive(Debug, Clone, serde::Serialize)]
pub struct GameLogLine {
    pub instance_id: String,
    pub line: String,
    pub stream: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct GameExited {
    pub instance_id: String,
    pub code: Option<i32>,
}

fn extract_natives(natives_jars: &[PathBuf], target_dir: &Path) -> AppResult<()> {
    std::fs::create_dir_all(target_dir)?;
    for jar in natives_jars {
        let file = std::fs::File::open(jar)?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| AppError::Zip(e.to_string()))?;
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).map_err(|e| AppError::Zip(e.to_string()))?;
            let name = entry.name().to_string();
            if name.starts_with("META-INF/") || name.ends_with('/') {
                continue;
            }
            if !(name.ends_with(".dll") || name.ends_with(".so") || name.ends_with(".dylib")) {
                continue;
            }
            let out_path = target_dir.join(Path::new(&name).file_name().unwrap());
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf)?;
            std::fs::write(out_path, buf)?;
        }
    }
    Ok(())
}

fn resolve_arg_values(entries: &[ArgumentEntry], placeholders: &HashMap<&str, String>) -> Vec<String> {
    let mut out = Vec::new();
    for entry in entries {
        match entry {
            ArgumentEntry::Plain(s) => out.push(substitute(s, placeholders)),
            ArgumentEntry::Conditional { rules, value } => {
                if !rules_allow(&Some(rules.clone())) {
                    continue;
                }
                match value {
                    ArgValue::Single(s) => out.push(substitute(s, placeholders)),
                    ArgValue::Many(list) => out.extend(list.iter().map(|s| substitute(s, placeholders))),
                }
            }
        }
    }
    out
}

fn substitute(input: &str, placeholders: &HashMap<&str, String>) -> String {
    let mut result = input.to_string();
    for (key, value) in placeholders {
        result = result.replace(&format!("${{{key}}}"), value);
    }
    result
}

/// `--quickPlayMultiplayer` existe depuis Minecraft 1.20 ; avant, c'était `--server`/`--port`.
fn supports_quick_play(mc_version: &str) -> bool {
    let mut parts = mc_version.split('.');
    let major = parts.next().and_then(|p| p.parse::<u32>().ok());
    let minor = parts.next().and_then(|p| p.split('-').next()).and_then(|p| p.parse::<u32>().ok());
    match (major, minor) {
        (Some(1), Some(minor)) => minor >= 20,
        // Nouveau format de version (ex. « 26.2 »).
        (Some(major), _) => major > 1,
        // Snapshots « 23w14a » : l'année suffit.
        _ => mc_version.get(..2).and_then(|y| y.parse::<u32>().ok()).is_none_or(|year| year >= 23),
    }
}

pub async fn launch(
    app: &AppHandle,
    java_path: &Path,
    instance: &Instance,
    detail: &VersionDetail,
    client_jar: &Path,
    libs: &ResolvedLibraries,
    account: &Account,
    server: Option<&str>,
) -> AppResult<()> {
    let instance_dir = paths::instance_dir(&instance.id);
    let natives_dir = paths::app_data_dir()
        .join("natives")
        .join(&instance.id);
    extract_natives(&libs.natives_jars, &natives_dir)?;

    let mut classpath: Vec<String> = libs
        .classpath
        .iter()
        .map(|p| p.display().to_string())
        .collect();
    classpath.push(client_jar.display().to_string());
    let classpath_str = classpath.join(";");

    let assets_dir = paths::assets_dir();

    let mut placeholders: HashMap<&str, String> = HashMap::new();
    placeholders.insert("auth_player_name", account.username.clone());
    placeholders.insert("version_name", detail.id.clone());
    placeholders.insert("game_directory", instance_dir.display().to_string());
    placeholders.insert("assets_root", assets_dir.display().to_string());
    placeholders.insert("assets_index_name", detail.assets.clone());
    placeholders.insert("auth_uuid", account.uuid.clone());
    placeholders.insert("auth_access_token", account.minecraft_access_token.clone());
    placeholders.insert("auth_xuid", account.uuid.clone());
    placeholders.insert("clientid", "NexoraCraft".to_string());
    placeholders.insert(
        "user_type",
        (if account.is_offline { "legacy" } else { "msa" }).to_string(),
    );
    placeholders.insert("version_type", "release".to_string());
    placeholders.insert("resolution_width", instance.width.to_string());
    placeholders.insert("resolution_height", instance.height.to_string());
    placeholders.insert("natives_directory", natives_dir.display().to_string());
    placeholders.insert("launcher_name", "NexoraCraft".to_string());
    placeholders.insert("launcher_version", "0.1.0".to_string());
    placeholders.insert("classpath", classpath_str.clone());

    let mut jvm_args = vec![
        format!("-Xms{}M", instance.min_ram_mb),
        format!("-Xmx{}M", instance.max_ram_mb),
        format!("-Djava.library.path={}", natives_dir.display()),
        // Évite les échecs de connexion ("Connection reset") sur les serveurs/tunnels dont la
        // résolution IPv6 est cassée ou non routée : force Java à utiliser IPv4 exclusivement.
        "-Djava.net.preferIPv4Stack=true".to_string(),
    ];
    if !instance.jvm_args.trim().is_empty() {
        jvm_args.extend(instance.jvm_args.split_whitespace().map(|s| s.to_string()));
    }

    let mut game_args: Vec<String> = Vec::new();

    if let Some(arguments) = &detail.arguments {
        jvm_args.extend(resolve_arg_values(&arguments.jvm, &placeholders));
        game_args.extend(resolve_arg_values(&arguments.game, &placeholders));
    } else if let Some(legacy) = &detail.minecraft_arguments {
        game_args.extend(
            legacy
                .split_whitespace()
                .map(|s| substitute(s, &placeholders)),
        );
    }

    // Connexion directe à un serveur au démarrage.
    if let Some(address) = server {
        let (host, port) = crate::servers::split_address(address);
        if supports_quick_play(&instance.mc_version) {
            game_args.push("--quickPlayMultiplayer".to_string());
            game_args.push(format!("{host}:{port}"));
        } else {
            game_args.extend(["--server".to_string(), host, "--port".to_string(), port.to_string()]);
        }
    }

    jvm_args.push("-cp".to_string());
    jvm_args.push(classpath_str);

    let mut full_args = jvm_args;
    full_args.push(detail.main_class.clone());
    full_args.extend(game_args);

    std::fs::create_dir_all(&instance_dir)?;
    crate::skins::sync_offline_pack(&instance_dir, account)?;

    let mut child = Command::new(java_path)
        .args(&full_args)
        .current_dir(&instance_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()?;

    let stdout = child.stdout.take().expect("stdout piped");
    let stderr = child.stderr.take().expect("stderr piped");

    let app_stdout = app.clone();
    let instance_id_stdout = instance.id.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_stdout.emit(
                "game-log",
                GameLogLine {
                    instance_id: instance_id_stdout.clone(),
                    line,
                    stream: "stdout".to_string(),
                },
            );
        }
    });

    let app_stderr = app.clone();
    let instance_id_stderr = instance.id.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_stderr.emit(
                "game-log",
                GameLogLine {
                    instance_id: instance_id_stderr.clone(),
                    line,
                    stream: "stderr".to_string(),
                },
            );
        }
    });

    let app_exit = app.clone();
    let instance_id_exit = instance.id.clone();
    let started = std::time::Instant::now();
    tokio::spawn(async move {
        let status = child.wait().await.ok();
        let _ = crate::instances::add_playtime(&instance_id_exit, started.elapsed().as_secs());
        let _ = app_exit.emit(
            "game-exited",
            GameExited {
                instance_id: instance_id_exit,
                code: status.and_then(|s| s.code()),
            },
        );
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::supports_quick_play;

    #[test]
    fn picks_join_arguments_by_version() {
        assert!(supports_quick_play("1.21.11"));
        assert!(supports_quick_play("1.20"));
        assert!(supports_quick_play("26.2"));
        assert!(supports_quick_play("24w10a"));
        assert!(!supports_quick_play("1.19.4"));
        assert!(!supports_quick_play("1.8.9"));
        assert!(!supports_quick_play("22w03a"));
    }
}
