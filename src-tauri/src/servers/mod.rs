use serde::{Deserialize, Serialize};
use std::fs;
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::instances::{self, Instance, NewInstance};
use crate::paths;

/// Même projet et même clé « publishable » que côté interface (voir src/lib/supabase.ts).
const SUPABASE_URL: &str = "https://vmaketngbwbuscynjkac.supabase.co";
const SUPABASE_KEY: &str = "sb_publishable_kKuXBqvQ6XwEejoOQYHF7Q_5tIvP_rw";
const DEFAULT_PORT: u16 = 25565;
const PING_TIMEOUT: Duration = Duration::from_secs(4);

/// Serveur officiel du launcher : toujours présent en tête de liste, impossible à retirer.
const OFFICIAL_ID: &str = "nexora-smp";
const OFFICIAL_NAME: &str = "Nexora-SMP";
const OFFICIAL_ADDRESS: &str = "nexora-smp.duckdns.org:25565";
/// Pack officiel du serveur, sous forme de code de partage (version, loader, mods et shaders).
/// L'instance « Nexora-SMP » est créée à partir de lui. Pour publier un nouveau pack : génère un
/// code depuis une instance (« Partager par code ») et remplace celui-ci ; les instances déjà
/// créées se mettent à niveau à la connexion suivante.
const OFFICIAL_PACK_CODE: &str = "NXC1-VEVTVCBGYWJyaWMKMS4yMS4xMXxmYWJyaWN8MC4xOS4zCm06VmE4UEpCRlg6ZTVaUEtmWTcKbTpBQU5vYmJNSTpSQjdDRGpUUwptOnVYWGl6RklzOklpMGdQM0Q4Cm06OXM2b3NtNWc6eHVYNDBUTjUKbToxZUFvbzJLUjpwSFdEdzNWYwptOlA3ZFI4bVNIOjZxQXVUdExSCnM6SFZubU14SDE6QnFlbjFtSlgKczpFcFFGanpyUTpLY2ZRYU41SgpzOml6c0lQSTdhOnBnYjBKam9OCnM6NnVKQ2ZpQ0g6cmNyOTBlUlAKczpMVHZmNVRqaTo2blpOejQ2aApzOlp2TXRRbGhvOmtDMlk4cTFQCm06NVp3ZGNSY2k6NEV3aHNUdTcKbTpndlFxQlVxWjpPdzd3QTBrRwpzOlI2TkV6QXdqOkIxa3lmb1VaCm06WUw1N3hxOVU6a2E5UERsc04";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Server {
    pub id: String,
    pub name: String,
    pub address: String,
    /// Instance utilisée par le bouton « Rejoindre » (sinon la dernière jouée).
    #[serde(default)]
    pub instance_id: Option<String>,
    /// Serveur officiel du launcher (non supprimable). Recalculé à chaque lecture.
    #[serde(default)]
    pub official: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct ServerStatus {
    pub online: bool,
    pub players_online: u32,
    pub players_max: u32,
    pub motd: String,
    pub version: String,
    pub latency_ms: u32,
    /// Icône du serveur (data URI PNG), si fournie.
    pub favicon: Option<String>,
}

fn file() -> std::path::PathBuf {
    paths::app_data_dir().join("servers.json")
}

fn read_file() -> AppResult<Vec<Server>> {
    let path = file();
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = fs::read_to_string(path)?;
    if data.trim().is_empty() {
        return Ok(Vec::new());
    }
    Ok(serde_json::from_str(&data)?)
}

/// Serveurs enregistrés, avec le serveur officiel toujours en premier. Son nom et son adresse
/// viennent du launcher (pas du fichier) ; seul le choix d'instance de l'utilisateur est conservé.
pub fn list() -> AppResult<Vec<Server>> {
    let mut servers = read_file()?;
    let saved = servers.iter().position(|s| s.id == OFFICIAL_ID).map(|i| servers.remove(i));
    for server in &mut servers {
        server.official = false;
    }
    servers.insert(
        0,
        Server {
            id: OFFICIAL_ID.to_string(),
            name: OFFICIAL_NAME.to_string(),
            address: OFFICIAL_ADDRESS.to_string(),
            instance_id: saved.and_then(|s| s.instance_id),
            official: true,
        },
    );
    Ok(servers)
}

fn save(servers: &[Server]) -> AppResult<()> {
    fs::write(file(), serde_json::to_string_pretty(servers)?)?;
    Ok(())
}

pub fn add(name: &str, address: &str) -> AppResult<Vec<Server>> {
    let address = address.trim();
    if address.is_empty() || address.contains(char::is_whitespace) {
        return Err(AppError::Other("adresse de serveur invalide".into()));
    }
    let mut servers = list()?;
    servers.push(Server {
        id: Uuid::new_v4().to_string(),
        name: if name.trim().is_empty() { address.to_string() } else { name.trim().to_string() },
        address: address.to_string(),
        instance_id: None,
        official: false,
    });
    save(&servers)?;
    Ok(servers)
}

pub fn set_instance(id: &str, instance_id: Option<String>) -> AppResult<Vec<Server>> {
    let mut servers = list()?;
    if let Some(server) = servers.iter_mut().find(|s| s.id == id) {
        server.instance_id = instance_id;
    }
    save(&servers)?;
    Ok(servers)
}

pub fn remove(id: &str) -> AppResult<Vec<Server>> {
    if id == OFFICIAL_ID {
        return Err(AppError::Other("le serveur officiel ne peut pas être retiré".into()));
    }
    let mut servers = list()?;
    servers.retain(|s| s.id != id);
    save(&servers)?;
    Ok(servers)
}

/// Sépare « hôte:port » ; le port par défaut de Minecraft est utilisé s'il est absent.
pub fn split_address(address: &str) -> (String, u16) {
    match address.rsplit_once(':') {
        Some((host, port)) => match port.parse() {
            Ok(port) => (host.to_string(), port),
            Err(_) => (address.to_string(), DEFAULT_PORT),
        },
        None => (address.to_string(), DEFAULT_PORT),
    }
}

fn write_varint(buf: &mut Vec<u8>, mut value: u32) {
    loop {
        let byte = (value & 0x7f) as u8;
        value >>= 7;
        if value == 0 {
            buf.push(byte);
            return;
        }
        buf.push(byte | 0x80);
    }
}

async fn read_varint(stream: &mut TcpStream) -> AppResult<u32> {
    let mut value = 0u32;
    for shift in (0..35).step_by(7) {
        let byte = stream.read_u8().await?;
        value |= ((byte & 0x7f) as u32) << shift;
        if byte & 0x80 == 0 {
            return Ok(value);
        }
    }
    Err(AppError::Other("réponse du serveur invalide".into()))
}

/// Aplatit un composant de texte Minecraft (chaîne ou objet avec `text`/`extra`) en texte brut.
fn flatten_text(value: &serde_json::Value, out: &mut String) {
    match value {
        serde_json::Value::String(s) => out.push_str(s),
        serde_json::Value::Array(items) => items.iter().for_each(|i| flatten_text(i, out)),
        serde_json::Value::Object(map) => {
            if let Some(text) = map.get("text") {
                flatten_text(text, out);
            }
            if let Some(extra) = map.get("extra") {
                flatten_text(extra, out);
            }
        }
        _ => {}
    }
}

/// Retire les codes de couleur « §x » des anciens formats de texte.
fn strip_formatting(text: &str) -> String {
    let mut out = String::new();
    let mut chars = text.chars();
    while let Some(c) = chars.next() {
        if c == '§' {
            chars.next();
        } else {
            out.push(c);
        }
    }
    out.split('\n').map(str::trim).collect::<Vec<_>>().join("\n").trim().to_string()
}

/// Interroge un serveur avec le protocole « Server List Ping » de Minecraft.
async fn query(address: &str) -> AppResult<ServerStatus> {
    let (host, port) = split_address(address);
    let started = Instant::now();
    let mut stream = TcpStream::connect((host.as_str(), port)).await?;

    // Poignée de main (état suivant : statut), puis requête de statut.
    let mut handshake = vec![0x00];
    write_varint(&mut handshake, u32::MAX); // version de protocole -1 : « je demande juste le statut »
    write_varint(&mut handshake, host.len() as u32);
    handshake.extend_from_slice(host.as_bytes());
    handshake.extend_from_slice(&port.to_be_bytes());
    write_varint(&mut handshake, 1);

    let mut packet = Vec::new();
    write_varint(&mut packet, handshake.len() as u32);
    packet.extend(handshake);
    packet.extend_from_slice(&[0x01, 0x00]);
    stream.write_all(&packet).await?;

    let _packet_len = read_varint(&mut stream).await?;
    let _packet_id = read_varint(&mut stream).await?;
    let json_len = read_varint(&mut stream).await? as usize;
    if json_len > 1024 * 1024 {
        return Err(AppError::Other("réponse du serveur trop volumineuse".into()));
    }
    let mut body = vec![0u8; json_len];
    stream.read_exact(&mut body).await?;
    let latency_ms = started.elapsed().as_millis() as u32;

    let json: serde_json::Value = serde_json::from_slice(&body)?;
    let mut motd = String::new();
    flatten_text(&json["description"], &mut motd);

    Ok(ServerStatus {
        online: true,
        players_online: json["players"]["online"].as_u64().unwrap_or(0) as u32,
        players_max: json["players"]["max"].as_u64().unwrap_or(0) as u32,
        motd: strip_formatting(&motd),
        version: strip_formatting(json["version"]["name"].as_str().unwrap_or("")),
        latency_ms,
        favicon: json["favicon"].as_str().map(String::from),
    })
}

/// Statut d'un serveur ; un serveur injoignable est simplement rapporté hors ligne.
pub async fn ping(address: &str) -> ServerStatus {
    match tokio::time::timeout(PING_TIMEOUT, query(address)).await {
        Ok(Ok(status)) => status,
        _ => ServerStatus::default(),
    }
}

// ---------- Instance dédiée au serveur officiel ----------

fn dedicated_file() -> std::path::PathBuf {
    paths::app_data_dir().join("official-instance.json")
}

/// Ce que le launcher retient de l'instance dédiée : laquelle, et quel pack y est installé.
#[derive(Debug, Default, Serialize, Deserialize)]
struct Dedicated {
    instance_id: String,
    /// Code du pack entièrement installé ; absent si une installation a été incomplète.
    #[serde(default)]
    pack_code: Option<String>,
}

fn load_dedicated() -> Option<Dedicated> {
    let data = fs::read_to_string(dedicated_file()).ok()?;
    // Ancien format : l'identifiant seul, du temps où l'instance était en vanilla.
    serde_json::from_str::<Dedicated>(&data).ok().or_else(|| {
        serde_json::from_str::<String>(&data).ok().map(|instance_id| Dedicated { instance_id, pack_code: None })
    })
}

/// Pack officiel publié dans la base en ligne (table `server_pack`), s'il est joignable.
async fn fetch_pack_code(client: &reqwest::Client) -> Option<String> {
    #[derive(Deserialize)]
    struct Row {
        code: String,
    }
    let res = client
        .get(format!("{SUPABASE_URL}/rest/v1/server_pack?id=eq.{OFFICIAL_ID}&select=code"))
        .header("apikey", SUPABASE_KEY)
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .ok()?;
    if !res.status().is_success() {
        return None;
    }
    let rows: Vec<Row> = res.json().await.ok()?;
    rows.into_iter().next().map(|r| r.code)
}

/// Retourne l'instance réservée au serveur officiel, en la créant au premier appel à partir du
/// pack officiel (version, loader, mods, shaders). Si le pack a changé depuis, ou si une
/// installation précédente était incomplète, l'instance existante est remise à niveau.
pub async fn ensure_official_instance(app: &tauri::AppHandle, client: &reqwest::Client) -> AppResult<Instance> {
    // Le pack vient de la base en ligne : le propriétaire du serveur y ajoute des mods sans
    // publier de nouvelle version du launcher. Hors ligne, le pack intégré sert de repli.
    let code = fetch_pack_code(client).await.unwrap_or_else(|| OFFICIAL_PACK_CODE.to_string());
    let pack = crate::share::decode(&code).or_else(|_| crate::share::decode(OFFICIAL_PACK_CODE))?;
    let code = if crate::share::decode(&code).is_ok() { code } else { OFFICIAL_PACK_CODE.to_string() };
    let saved = load_dedicated();
    let old_pack = saved.as_ref().and_then(|d| d.pack_code.as_deref()).and_then(|c| crate::share::decode(c).ok());

    let existing = saved.as_ref().and_then(|d| instances::get(&d.instance_id).ok());
    if let (Some(instance), Some(saved)) = (&existing, &saved) {
        if saved.pack_code.as_deref() == Some(code.as_str()) {
            return Ok(instance.clone());
        }
    }

    // Création, ou remise à niveau de l'instance existante (ses mondes et réglages sont conservés).
    let mut instance = match existing {
        Some(instance) => instance,
        None => instances::create(NewInstance {
            name: OFFICIAL_NAME.to_string(),
            mc_version: pack.mc_version.clone(),
            loader: pack.loader.clone(),
        })?,
    };
    instance.mc_version = pack.mc_version.clone();
    instance.loader = pack.loader.clone();
    instance.loader_version = pack.loader_version.clone();
    let instance = instances::update(instance)?;

    let mut record = Dedicated { instance_id: instance.id.clone(), pack_code: None };
    fs::write(dedicated_file(), serde_json::to_string(&record)?)?;

    let result = crate::share::sync_items(app, client, instance, old_pack.as_ref(), &pack).await?;
    // Le pack n'est noté comme installé que s'il l'est en entier : sinon on réessaiera.
    if result.failed.is_empty() {
        record.pack_code = Some(code);
        fs::write(dedicated_file(), serde_json::to_string(&record)?)?;
    }
    Ok(result.instance)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::instances::Loader;

    #[test]
    fn official_pack_code_is_valid() {
        let pack = crate::share::decode(OFFICIAL_PACK_CODE).expect("code du pack officiel invalide");
        assert_eq!(pack.mc_version, "1.21.11");
        assert_eq!(pack.loader, Loader::Fabric);
        assert!(pack.loader_version.is_some(), "un pack Fabric doit fixer la version du loader");
        assert_eq!(pack.items.len(), 16);
    }

    #[test]
    fn reads_both_dedicated_file_formats() {
        let old: Option<Dedicated> = serde_json::from_str::<Dedicated>("\"abc\"").ok();
        assert!(old.is_none(), "l'ancien format est une simple chaîne");
        let new: Dedicated = serde_json::from_str(r#"{"instance_id":"abc","pack_code":"X"}"#).unwrap();
        assert_eq!(new.pack_code.as_deref(), Some("X"));
    }

    #[test]
    fn splits_host_and_port() {
        assert_eq!(split_address("play.example.net"), ("play.example.net".to_string(), 25565));
        assert_eq!(split_address("fox.playit.gg:41234"), ("fox.playit.gg".to_string(), 41234));
    }

    #[test]
    fn official_server_cannot_be_removed() {
        assert!(remove(OFFICIAL_ID).is_err());
    }

    #[test]
    fn strips_legacy_color_codes() {
        assert_eq!(strip_formatting("§aHello §lWorld\n  §7line two "), "Hello World\nline two");
    }

    /// Test réseau, à lancer à la main : `cargo test pings_public_server -- --ignored`.
    #[tokio::test]
    #[ignore]
    async fn pings_public_server() {
        let status = ping("mc.hypixel.net").await;
        assert!(status.online, "serveur public injoignable");
        assert!(status.players_max > 0);
        println!("{} joueurs / {} - {} ms - {}", status.players_online, status.players_max, status.latency_ms, status.version);
    }
}

#[cfg(test)]
mod official_tests {
    use super::*;

    /// Test réseau, à lancer à la main : `cargo test pings_official_server -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore]
    async fn pings_official_server() {
        let status = ping(OFFICIAL_ADDRESS).await;
        println!(
            "en ligne: {} - {} / {} joueurs - {} ms - version: {} - motd: {:?}",
            status.online, status.players_online, status.players_max, status.latency_ms, status.version, status.motd
        );
    }
}
