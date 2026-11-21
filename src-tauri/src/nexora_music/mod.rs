//! Nexora Music : le catalogue de musiques du launcher.
//!
//! Le catalogue vit sur un serveur PocketBase (collection `songs`, lecture publique). Le launcher
//! en liste les morceaux, et en télécharge à la demande dans `%APPDATA%\NexoraCraft\music\<id>\`
//! (audio + pochette) pour les jouer sans connexion. Un fichier `index.json` garde ce qui est
//! téléchargé et ce que le joueur a choisi de laisser jouer.

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

use crate::error::{AppError, AppResult};
use crate::paths;

/// Adresse du serveur Nexora Music. Peut être remplacée à la compilation par la variable
/// d'environnement NEXORA_MUSIC_URL.
const DEFAULT_BASE_URL: &str = "http://92.49.99.59:8090";

const AUDIO_EXTENSIONS: [&str; 7] = ["mp3", "m4a", "opus", "ogg", "wav", "flac", "aac"];
const COVER_EXTENSIONS: [&str; 4] = ["jpg", "png", "webp", "gif"];
/// Champs demandés au serveur : sans l'empreinte sonore, très lourde, que chaque morceau contient.
const FIELDS: &str = "id,title,author,genre,cover,audio,file_hash";
const PAGE_SIZE: &str = "500";

fn base_url() -> &'static str {
    option_env!("NEXORA_MUSIC_URL").unwrap_or(DEFAULT_BASE_URL).trim_end_matches('/')
}

/// Les modifications de `index.json` se font l'une après l'autre : plusieurs téléchargements
/// peuvent se terminer en même temps.
static INDEX_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Deserialize)]
struct ListResponse {
    items: Vec<RemoteSong>,
    #[serde(rename = "totalPages", default)]
    total_pages: u32,
}

#[derive(Debug, Deserialize)]
struct RemoteSong {
    id: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    author: String,
    #[serde(default)]
    genre: String,
    #[serde(default)]
    cover: String,
    #[serde(default)]
    audio: String,
    #[serde(default)]
    file_hash: String,
}

/// Un morceau du catalogue, tel que l'interface l'affiche.
#[derive(Debug, Clone, Serialize)]
pub struct CatalogSong {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub genre: String,
    /// Miniature de la pochette (à afficher dans la liste), si le morceau en a une.
    pub cover_url: Option<String>,
}

/// Un morceau téléchargé, tel qu'il est gardé dans `index.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredSong {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub genre: String,
    /// Nom du fichier audio dans le dossier du morceau.
    pub audio_file: String,
    pub cover_file: Option<String>,
    pub size_bytes: u64,
    /// Le morceau peut être joué par le launcher.
    pub enabled: bool,
}

/// Un morceau téléchargé, avec les chemins complets des fichiers.
#[derive(Debug, Clone, Serialize)]
pub struct LocalSong {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub genre: String,
    pub audio_path: String,
    pub cover_path: Option<String>,
    pub size_bytes: u64,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub id: String,
    pub received: u64,
    pub total: u64,
}

fn song_dir(id: &str) -> PathBuf {
    paths::music_dir().join(id)
}

fn index_file() -> PathBuf {
    paths::music_dir().join("index.json")
}

/// Un identifiant de morceau ne contient que des lettres et des chiffres : il sert de nom de dossier.
fn checked_id(id: &str) -> AppResult<&str> {
    if id.is_empty() || id.len() > 40 || !id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(AppError::Other("identifiant de morceau invalide".into()));
    }
    Ok(id)
}

/// Extension d'un nom de fichier, en minuscules, si elle fait partie de `allowed`.
fn extension_of(file_name: &str, allowed: &[&str]) -> Option<String> {
    let ext = file_name.rsplit_once('.')?.1.to_lowercase();
    // Les .jfif sont des JPEG.
    let ext = if ext == "jfif" || ext == "jpeg" { "jpg".to_string() } else { ext };
    allowed.contains(&ext.as_str()).then_some(ext)
}

fn load_index() -> Vec<StoredSong> {
    fs::read_to_string(index_file())
        .ok()
        .and_then(|data| serde_json::from_str(&data).ok())
        .unwrap_or_default()
}

fn save_index(songs: &[StoredSong]) -> AppResult<()> {
    fs::create_dir_all(paths::music_dir())?;
    // Écriture en deux temps : une coupure au mauvais moment ne doit pas vider la liste.
    let tmp = index_file().with_extension("json.part");
    fs::write(&tmp, serde_json::to_string_pretty(songs)?)?;
    fs::rename(tmp, index_file())?;
    Ok(())
}

fn to_local(song: &StoredSong) -> Option<LocalSong> {
    let dir = song_dir(&song.id);
    let audio = dir.join(&song.audio_file);
    if !audio.is_file() {
        return None;
    }
    let cover = song.cover_file.as_ref().map(|f| dir.join(f)).filter(|p| p.is_file());
    Some(LocalSong {
        id: song.id.clone(),
        title: song.title.clone(),
        artist: song.artist.clone(),
        genre: song.genre.clone(),
        audio_path: audio.display().to_string(),
        cover_path: cover.map(|p| p.display().to_string()),
        size_bytes: song.size_bytes,
        enabled: song.enabled,
    })
}

/// Les morceaux téléchargés dont le fichier est toujours là, triés par artiste puis par titre.
pub fn list_local() -> Vec<LocalSong> {
    let _guard = INDEX_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut songs: Vec<LocalSong> = load_index().iter().filter_map(to_local).collect();
    songs.sort_by(|a, b| {
        a.artist.to_lowercase().cmp(&b.artist.to_lowercase()).then(a.title.to_lowercase().cmp(&b.title.to_lowercase()))
    });
    songs
}

fn file_url(song_id: &str, file: &str, query: &str) -> String {
    format!("{}/api/files/songs/{}/{}{}", base_url(), song_id, urlencoding::encode(file), query)
}

/// Le catalogue complet, trié par artiste puis par titre.
pub async fn catalog(client: &reqwest::Client) -> AppResult<Vec<CatalogSong>> {
    let mut songs = Vec::new();
    let mut page = 1u32;
    loop {
        let response = client
            .get(format!("{}/api/collections/songs/records", base_url()))
            .query(&[
                ("perPage", PAGE_SIZE),
                ("page", &page.to_string()),
                ("sort", "author,title"),
                ("fields", FIELDS),
                ("skipTotal", "false"),
            ])
            .timeout(Duration::from_secs(20))
            .send()
            .await
            .map_err(|e| AppError::Other(format!("Nexora Music est injoignable : {e}")))?;
        if !response.status().is_success() {
            return Err(AppError::Other(format!("Nexora Music a répondu {}", response.status())));
        }
        let body: ListResponse = response.json().await?;
        let last_page = body.total_pages.max(1);
        for song in body.items {
            // Sans fichier audio lisible, le morceau n'a rien à proposer.
            if checked_id(&song.id).is_err() || extension_of(&song.audio, &AUDIO_EXTENSIONS).is_none() {
                continue;
            }
            let cover_url = (!song.cover.is_empty()).then(|| file_url(&song.id, &song.cover, "?thumb=160x160"));
            songs.push(CatalogSong {
                id: song.id,
                title: if song.title.trim().is_empty() { "Sans titre".into() } else { song.title.trim().to_string() },
                artist: if song.author.trim().is_empty() { "Artiste inconnu".into() } else { song.author.trim().to_string() },
                genre: song.genre.trim().to_string(),
                cover_url,
            });
        }
        if page >= last_page {
            break;
        }
        page += 1;
    }
    Ok(songs)
}

async fn fetch_record(client: &reqwest::Client, id: &str) -> AppResult<RemoteSong> {
    let response = client
        .get(format!("{}/api/collections/songs/records/{id}", base_url()))
        .query(&[("fields", FIELDS)])
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| AppError::Other(format!("Nexora Music est injoignable : {e}")))?;
    if !response.status().is_success() {
        return Err(AppError::Other(format!("morceau introuvable sur Nexora Music ({})", response.status())));
    }
    Ok(response.json().await?)
}

/// Télécharge un morceau (audio, vérifié par son empreinte, puis pochette) et l'ajoute à la liste.
pub async fn download(app: &AppHandle, client: &reqwest::Client, id: &str) -> AppResult<LocalSong> {
    let id = checked_id(id)?;
    let remote = fetch_record(client, id).await?;
    let audio_ext = extension_of(&remote.audio, &AUDIO_EXTENSIONS)
        .ok_or_else(|| AppError::Other("format audio non pris en charge".into()))?;

    let dir = song_dir(id);
    fs::create_dir_all(&dir)?;
    let audio_name = format!("audio.{audio_ext}");
    let partial = dir.join(format!("{audio_name}.part"));

    let result = download_audio(app, client, id, &remote, &partial).await;
    let size = match result {
        Ok(size) => size,
        Err(e) => {
            let _ = fs::remove_file(&partial);
            // Un dossier vide ne doit pas traîner après un échec.
            let _ = fs::remove_dir(&dir);
            return Err(e);
        }
    };
    fs::rename(&partial, dir.join(&audio_name))?;

    // La pochette est un plus : un échec ne bloque pas le morceau.
    let cover_file = download_cover(client, id, &remote.cover, &dir).await;

    let stored = StoredSong {
        id: id.to_string(),
        title: if remote.title.trim().is_empty() { "Sans titre".into() } else { remote.title.trim().to_string() },
        artist: if remote.author.trim().is_empty() { "Artiste inconnu".into() } else { remote.author.trim().to_string() },
        genre: remote.genre.trim().to_string(),
        audio_file: audio_name,
        cover_file,
        size_bytes: size,
        enabled: true,
    };
    {
        let _guard = INDEX_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let mut songs = load_index();
        songs.retain(|s| s.id != stored.id);
        songs.push(stored.clone());
        save_index(&songs)?;
    }
    to_local(&stored).ok_or_else(|| AppError::Other("le fichier téléchargé est introuvable".into()))
}

async fn download_audio(
    app: &AppHandle,
    client: &reqwest::Client,
    id: &str,
    remote: &RemoteSong,
    partial: &Path,
) -> AppResult<u64> {
    let response = client
        .get(file_url(id, &remote.audio, ""))
        .send()
        .await
        .map_err(|e| AppError::Other(format!("téléchargement impossible : {e}")))?;
    if !response.status().is_success() {
        return Err(AppError::Other(format!("le serveur a répondu {}", response.status())));
    }
    let total = response.content_length().unwrap_or(0);

    let mut file = fs::File::create(partial)?;
    let mut hasher = Sha256::new();
    let mut received = 0u64;
    let mut last_emit = Instant::now() - Duration::from_secs(1);
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| AppError::Other(format!("téléchargement interrompu : {e}")))?;
        file.write_all(&chunk)?;
        hasher.update(&chunk);
        received += chunk.len() as u64;
        if last_emit.elapsed() >= Duration::from_millis(150) {
            last_emit = Instant::now();
            let _ = app.emit("music-download", DownloadProgress { id: id.to_string(), received, total });
        }
    }
    file.flush()?;
    let _ = app.emit("music-download", DownloadProgress { id: id.to_string(), received, total: total.max(received) });

    if !remote.file_hash.is_empty() && hex::encode(hasher.finalize()) != remote.file_hash.to_lowercase() {
        return Err(AppError::ChecksumMismatch(remote.title.clone()));
    }
    Ok(received)
}

async fn download_cover(client: &reqwest::Client, id: &str, cover: &str, dir: &Path) -> Option<String> {
    if cover.is_empty() {
        return None;
    }
    // Miniature de 480 px : assez pour l'affichage, bien plus légère que l'original.
    let response = client.get(file_url(id, cover, "?thumb=480x480")).timeout(Duration::from_secs(30)).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    let ext = extension_of(cover, &COVER_EXTENSIONS).unwrap_or_else(|| "jpg".into());
    let bytes = response.bytes().await.ok()?;
    let name = format!("cover.{ext}");
    fs::write(dir.join(&name), &bytes).ok()?;
    Some(name)
}

/// Supprime un morceau téléchargé (fichiers et entrée de la liste).
pub fn remove(id: &str) -> AppResult<()> {
    let id = checked_id(id)?;
    let _guard = INDEX_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut songs = load_index();
    songs.retain(|s| s.id != id);
    save_index(&songs)?;
    let dir = song_dir(id);
    if dir.exists() {
        fs::remove_dir_all(dir)?;
    }
    Ok(())
}

/// Autorise ou non le launcher à jouer ces morceaux.
pub fn set_enabled(ids: &[String], enabled: bool) -> AppResult<()> {
    let _guard = INDEX_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut songs = load_index();
    for song in songs.iter_mut().filter(|s| ids.contains(&s.id)) {
        song.enabled = enabled;
    }
    save_index(&songs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_become_folder_names_so_they_are_strict() {
        assert!(checked_id("3tc51fs3nueecp5").is_ok());
        assert!(checked_id("").is_err());
        assert!(checked_id("../x").is_err());
        assert!(checked_id("a b").is_err());
        assert!(checked_id(&"a".repeat(41)).is_err());
    }

    #[test]
    fn only_known_file_types_are_accepted() {
        assert_eq!(extension_of("titre_x1.MP3", &AUDIO_EXTENSIONS).as_deref(), Some("mp3"));
        assert_eq!(extension_of("a.opus", &AUDIO_EXTENSIONS).as_deref(), Some("opus"));
        assert_eq!(extension_of("virus.exe", &AUDIO_EXTENSIONS), None);
        assert_eq!(extension_of("sans_extension", &AUDIO_EXTENSIONS), None);
        assert_eq!(extension_of("cover.jfif", &COVER_EXTENSIONS).as_deref(), Some("jpg"));
    }

    #[test]
    fn file_urls_escape_the_file_name() {
        let url = file_url("abc", "mon titre é.mp3", "?thumb=160x160");
        assert!(url.contains("/api/files/songs/abc/mon%20titre%20%C3%A9.mp3?thumb=160x160"), "{url}");
    }
}
