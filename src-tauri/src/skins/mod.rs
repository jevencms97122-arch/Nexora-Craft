use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
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
    set_skin_bytes(client, account, fs::read(source)?, variant).await
}

pub async fn set_skin_bytes(
    client: &reqwest::Client,
    account: &Account,
    bytes: Vec<u8>,
    variant: &str,
) -> AppResult<()> {
    validate_skin_png(&bytes)?;

    let variant = if variant == "slim" { "slim" } else { "classic" };
    // Tout skin appliqué est gardé dans la garde-robe pour y revenir en un clic.
    remember(&bytes, variant)?;

    if account.is_offline {
        fs::create_dir_all(skins_dir())?;
        fs::write(local_skin_path(&account.uuid), bytes)?;
        return Ok(());
    }

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

/// Télécharge un skin depuis les serveurs de textures Mojang puis l'applique au compte.
pub async fn apply_remote_skin(
    client: &reqwest::Client,
    account: &Account,
    url: &str,
    variant: &str,
) -> AppResult<()> {
    if !is_texture_url(url) {
        return Err(AppError::Other("URL de skin non autorisée".into()));
    }
    let res = client.get(url).send().await?;
    if !res.status().is_success() {
        return Err(AppError::Other(format!("téléchargement du skin impossible ({})", res.status())));
    }
    let bytes = res.bytes().await?.to_vec();
    set_skin_bytes(client, account, bytes, variant).await
}

/// Seules les textures hébergées par Mojang sont téléchargeables (évite les URL arbitraires).
fn is_texture_url(url: &str) -> bool {
    url.starts_with("https://textures.minecraft.net/texture/")
        || url.starts_with("http://textures.minecraft.net/texture/")
}

#[derive(Debug, Clone, Serialize)]
pub struct RemoteSkin {
    pub url: String,
    /// "classic" ou "slim"
    pub variant: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkinPage {
    pub skins: Vec<RemoteSkin>,
    pub next: Option<String>,
}

/// Skins récents de la galerie publique MineSkin (pas de recherche ni de noms).
pub async fn browse_gallery(client: &reqwest::Client, after: Option<&str>) -> AppResult<SkinPage> {
    let mut url = "https://api.mineskin.org/v2/skins?size=24".to_string();
    if let Some(after) = after {
        url.push_str(&format!("&after={}", urlencoding::encode(after)));
    }
    let res = client.get(&url).send().await?;
    if !res.status().is_success() {
        return Err(AppError::Other(format!("galerie MineSkin indisponible ({})", res.status())));
    }
    let data: serde_json::Value = res.json().await?;
    let skins = data["skins"]
        .as_array()
        .map(|list| {
            list.iter()
                .filter_map(|s| s["texture"].as_str())
                .map(|hash| RemoteSkin {
                    url: format!("https://textures.minecraft.net/texture/{hash}"),
                    variant: "classic".into(),
                })
                .collect()
        })
        .unwrap_or_default();
    let next = data["pagination"]["next"]["after"].as_str().map(String::from);
    Ok(SkinPage { skins, next })
}

/// Récupère le skin actuel d'un joueur via l'API publique Mojang.
pub async fn lookup_player(client: &reqwest::Client, username: &str) -> AppResult<RemoteSkin> {
    let username = username.trim();
    if username.is_empty() || !username.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err(AppError::Other("pseudo invalide".into()));
    }
    let res = client
        .get(format!("https://api.mojang.com/users/profiles/minecraft/{username}"))
        .send()
        .await?;
    if res.status() == reqwest::StatusCode::NOT_FOUND || res.status() == reqwest::StatusCode::NO_CONTENT {
        return Err(AppError::Other(format!("aucun joueur nommé « {username} »")));
    }
    if !res.status().is_success() {
        return Err(AppError::Other(format!("recherche du joueur impossible ({})", res.status())));
    }
    let id = res.json::<serde_json::Value>().await?["id"]
        .as_str()
        .ok_or_else(|| AppError::Other("réponse Mojang invalide".into()))?
        .to_string();

    let res = client
        .get(format!("https://sessionserver.mojang.com/session/minecraft/profile/{id}"))
        .send()
        .await?;
    if !res.status().is_success() {
        return Err(AppError::Other(format!(
            "profil indisponible ({}), réessaie dans une minute",
            res.status()
        )));
    }
    let profile: serde_json::Value = res.json().await?;
    let encoded = profile["properties"]
        .as_array()
        .and_then(|props| props.iter().find(|p| p["name"] == "textures"))
        .and_then(|p| p["value"].as_str())
        .ok_or_else(|| AppError::Other("ce joueur n'a pas de skin".into()))?;
    let decoded = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, encoded)
        .map_err(|e| AppError::Other(e.to_string()))?;
    let textures: serde_json::Value = serde_json::from_slice(&decoded)?;
    let skin = &textures["textures"]["SKIN"];
    let url = skin["url"]
        .as_str()
        .ok_or_else(|| AppError::Other("ce joueur utilise le skin par défaut".into()))?;
    let variant = if skin["metadata"]["model"] == "slim" { "slim" } else { "classic" };
    Ok(RemoteSkin { url: url.to_string(), variant: variant.into() })
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

// ---------- Garde-robe ----------

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WardrobeEntry {
    /// SHA-1 du fichier : sert d'identifiant et évite les doublons.
    id: String,
    variant: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct WardrobeSkin {
    pub id: String,
    pub variant: String,
    pub data_uri: String,
}

fn wardrobe_dir() -> PathBuf {
    skins_dir().join("wardrobe")
}

fn wardrobe_index() -> PathBuf {
    wardrobe_dir().join("index.json")
}

fn load_wardrobe() -> AppResult<Vec<WardrobeEntry>> {
    let path = wardrobe_index();
    if !path.exists() {
        return Ok(Vec::new());
    }
    Ok(serde_json::from_str(&fs::read_to_string(path)?).unwrap_or_default())
}

fn save_wardrobe(entries: &[WardrobeEntry]) -> AppResult<()> {
    fs::create_dir_all(wardrobe_dir())?;
    fs::write(wardrobe_index(), serde_json::to_string_pretty(entries)?)?;
    Ok(())
}

fn wardrobe_file(id: &str) -> AppResult<PathBuf> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(AppError::Other("identifiant de skin invalide".into()));
    }
    Ok(wardrobe_dir().join(format!("{id}.png")))
}

/// Ajoute un skin à la garde-robe (ou le remonte en tête s'il y est déjà).
fn remember(bytes: &[u8], variant: &str) -> AppResult<()> {
    let mut hasher = Sha1::new();
    hasher.update(bytes);
    let id = hex::encode(hasher.finalize());

    fs::create_dir_all(wardrobe_dir())?;
    fs::write(wardrobe_file(&id)?, bytes)?;
    let mut entries = load_wardrobe()?;
    entries.retain(|e| e.id != id);
    entries.insert(0, WardrobeEntry { id, variant: variant.to_string() });
    save_wardrobe(&entries)
}

pub fn list_wardrobe() -> AppResult<Vec<WardrobeSkin>> {
    let mut out = Vec::new();
    for entry in load_wardrobe()? {
        let Ok(bytes) = fs::read(wardrobe_file(&entry.id)?) else { continue };
        let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes);
        out.push(WardrobeSkin {
            id: entry.id,
            variant: entry.variant,
            data_uri: format!("data:image/png;base64,{encoded}"),
        });
    }
    Ok(out)
}

pub fn remove_from_wardrobe(id: &str) -> AppResult<()> {
    let path = wardrobe_file(id)?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    let mut entries = load_wardrobe()?;
    entries.retain(|e| e.id != id);
    save_wardrobe(&entries)
}

pub async fn apply_wardrobe_skin(client: &reqwest::Client, account: &Account, id: &str) -> AppResult<()> {
    let variant = load_wardrobe()?
        .into_iter()
        .find(|e| e.id == id)
        .map(|e| e.variant)
        .ok_or_else(|| AppError::Other("skin introuvable dans la garde-robe".into()))?;
    let bytes = fs::read(wardrobe_file(id)?)?;
    set_skin_bytes(client, account, bytes, &variant).await
}
