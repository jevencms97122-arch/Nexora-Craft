use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::accounts::Account;
use crate::error::{AppError, AppResult};
use crate::paths;

const PACK_NAME: &str = "NexoraSkin.zip";
const PACK_ENTRY: &str = "file/NexoraSkin.zip";

/// Skins par défaut du jeu (1.19.3+): le client en choisit un selon l'UUID du compte hors-ligne.
const DEFAULT_SKINS: [&str; 9] = [
    "alex", "ari", "efe", "kai", "makena", "noor", "steve", "sunny", "zuri",
];

fn skins_dir() -> PathBuf {
    paths::app_data_dir().join("skins")
}

fn local_skin_path(uuid: &str) -> PathBuf {
    skins_dir().join(format!("{uuid}.png"))
}

/// Vérifie que le fichier est un PNG 64x64 ou 64x32 (formats de skin acceptés par Minecraft).
fn validate_skin_png(bytes: &[u8]) -> AppResult<()> {
    const SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
    if bytes.len() < 24 || bytes[..8] != SIGNATURE {
        return Err(AppError::Other("le fichier n'est pas une image PNG valide".into()));
    }
    let width = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
    let height = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);
    if width != 64 || (height != 64 && height != 32) {
        return Err(AppError::Other(format!(
            "dimensions de skin invalides ({width}x{height}): 64x64 ou 64x32 requis"
        )));
    }
    Ok(())
}

/// Retourne le skin local d'un compte hors-ligne sous forme de data URI, s'il existe.
pub fn local_skin_data_uri(uuid: &str) -> AppResult<Option<String>> {
    let path = local_skin_path(uuid);
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(path)?;
    let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes);
    Ok(Some(format!("data:image/png;base64,{encoded}")))
}

pub async fn set_skin(
    client: &reqwest::Client,
    account: &Account,
    source: &Path,
    variant: &str,
) -> AppResult<()> {
    let bytes = fs::read(source)?;
    validate_skin_png(&bytes)?;

    if account.is_offline {
        fs::create_dir_all(skins_dir())?;
        fs::write(local_skin_path(&account.uuid), bytes)?;
        return Ok(());
    }

    let variant = if variant == "slim" { "slim" } else { "classic" };
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name("skin.png")
        .mime_str("image/png")?;
    let form = reqwest::multipart::Form::new()
        .text("variant", variant)
        .part("file", part);
    let res = client
        .post("https://api.minecraftservices.com/minecraft/profile/skins")
        .bearer_auth(&account.minecraft_access_token)
        .multipart(form)
        .send()
        .await?;
    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(AppError::Auth(format!("échec de l'envoi du skin ({status}): {text}")));
    }
    Ok(())
}

pub async fn clear_skin(client: &reqwest::Client, account: &Account) -> AppResult<()> {
    if account.is_offline {
        let path = local_skin_path(&account.uuid);
        if path.exists() {
            fs::remove_file(path)?;
        }
        return Ok(());
    }

    let res = client
        .delete("https://api.minecraftservices.com/minecraft/profile/skins/active")
        .bearer_auth(&account.minecraft_access_token)
        .send()
        .await?;
    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(AppError::Auth(format!("échec de la réinitialisation du skin ({status}): {text}")));
    }
    Ok(())
}

/// Écrit (ou supprime) un resource pack qui remplace les skins par défaut par le skin local du
/// compte hors-ligne, et l'active dans options.txt. Sans session Mojang, c'est le seul moyen
/// d'afficher un skin perso en vanilla.
pub fn sync_offline_pack(instance_dir: &Path, account: &Account) -> AppResult<()> {
    let pack_path = instance_dir.join("resourcepacks").join(PACK_NAME);
    let skin = if account.is_offline {
        let path = local_skin_path(&account.uuid);
        if path.exists() { Some(fs::read(path)?) } else { None }
    } else {
        None
    };

    match skin {
        Some(bytes) => {
            fs::create_dir_all(instance_dir.join("resourcepacks"))?;
            write_pack(&pack_path, &bytes)?;
            update_options(instance_dir, true)
        }
        None => {
            if pack_path.exists() {
                fs::remove_file(&pack_path)?;
                update_options(instance_dir, false)?;
            }
            Ok(())
        }
    }
}

fn write_pack(path: &Path, skin: &[u8]) -> AppResult<()> {
    let zip_err = |e: zip::result::ZipError| AppError::Zip(e.to_string());
    let file = fs::File::create(path)?;
    let mut zip = zip::ZipWriter::new(file);
    let opts = zip::write::SimpleFileOptions::default();

    zip.start_file("pack.mcmeta", opts).map_err(zip_err)?;
    zip.write_all(
        br#"{"pack":{"pack_format":34,"description":"Skin Nexora Craft","supported_formats":{"min_inclusive":1,"max_inclusive":999},"min_format":1,"max_format":999}}"#,
    )?;

    let mut targets: Vec<String> = vec![
        "assets/minecraft/textures/entity/steve.png".into(),
        "assets/minecraft/textures/entity/alex.png".into(),
    ];
    for name in DEFAULT_SKINS {
        targets.push(format!("assets/minecraft/textures/entity/player/wide/{name}.png"));
        targets.push(format!("assets/minecraft/textures/entity/player/slim/{name}.png"));
    }
    for target in targets {
        zip.start_file(target, opts).map_err(zip_err)?;
        zip.write_all(skin)?;
    }
    zip.finish().map_err(zip_err)?;
    Ok(())
}

/// Ajoute ou retire le pack dans la ligne `resourcePacks:[...]` d'options.txt.
fn update_options(instance_dir: &Path, enabled: bool) -> AppResult<()> {
    let options_path = instance_dir.join("options.txt");
    let existing = if options_path.exists() { fs::read_to_string(&options_path)? } else { String::new() };

    let mut found = false;
    let mut lines: Vec<String> = Vec::new();
    for line in existing.lines() {
        if let Some(raw) = line.strip_prefix("resourcePacks:") {
            found = true;
            let mut packs: Vec<String> = serde_json::from_str(raw).unwrap_or_else(|_| vec!["vanilla".into()]);
            packs.retain(|p| p != PACK_ENTRY);
            if enabled {
                packs.push(PACK_ENTRY.into());
            }
            lines.push(format!("resourcePacks:{}", serde_json::to_string(&packs)?));
        } else {
            lines.push(line.to_string());
        }
    }
    if !found && enabled {
        lines.push(format!("resourcePacks:{}", serde_json::to_string(&["vanilla", PACK_ENTRY])?));
    }
    if !found && !enabled {
        return Ok(());
    }

    fs::write(options_path, lines.join("\n") + "\n")?;
    Ok(())
}
