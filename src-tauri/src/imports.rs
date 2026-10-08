//! Import de fichiers téléchargés à la main (CurseForge, par exemple).
//!
//! Le launcher ne parle pas à CurseForge : le joueur télécharge depuis son navigateur, et le
//! launcher surveille son dossier Téléchargements pendant ce temps. Chaque nouveau fichier `.jar`
//! ou `.zip` est ouvert pour savoir ce que c'est (mod, pack de ressources, shader...), pour quel
//! loader et quelle version de Minecraft, puis comparé aux instances.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;

use crate::content::{self, ContentType, InstalledContent};
use crate::error::{AppError, AppResult};
use crate::instances::{self, Instance, Loader};

#[derive(Debug, Clone, Serialize)]
pub struct DownloadedFile {
    pub path: String,
    pub name: String,
    pub size: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FileKind {
    Mod,
    Resourcepack,
    Shader,
    Datapack,
    Modpack,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Verdict {
    /// Compatible.
    Ok,
    /// Incompatible : l'installation est refusée.
    No,
    /// Impossible à vérifier : l'installation reste permise.
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstanceCompat {
    pub instance_id: String,
    pub verdict: Verdict,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileInfo {
    pub path: String,
    pub file_name: String,
    pub kind: FileKind,
    pub title: String,
    /// Loaders annoncés par le fichier (mods seulement).
    pub loaders: Vec<String>,
    /// Versions de Minecraft annoncées, telles qu'écrites dans le fichier.
    pub minecraft: Option<String>,
    pub compat: Vec<InstanceCompat>,
}

// ---------- Surveillance du dossier Téléchargements ----------

fn downloads_dir() -> AppResult<PathBuf> {
    dirs::download_dir().ok_or_else(|| AppError::Other("dossier Téléchargements introuvable".into()))
}

fn is_candidate(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()).map(str::to_lowercase).as_deref(),
        Some("jar" | "zip")
    )
}

fn millis(time: std::io::Result<std::time::SystemTime>) -> u64 {
    time.ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Fichiers `.jar` et `.zip` apparus dans Téléchargements depuis `since_ms`. Les téléchargements
/// encore en cours (fichier vide, ou fichier temporaire du navigateur à côté) sont ignorés.
pub fn scan(since_ms: u64) -> AppResult<Vec<DownloadedFile>> {
    let dir = downloads_dir()?;
    let mut found = Vec::new();
    for entry in std::fs::read_dir(&dir)?.flatten() {
        let path = entry.path();
        let Ok(meta) = entry.metadata() else { continue };
        if !meta.is_file() || !is_candidate(&path) || meta.len() == 0 {
            continue;
        }
        if millis(meta.modified()).max(millis(meta.created())) < since_ms {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let in_progress = ["part", "crdownload", "tmp"].iter().any(|ext| dir.join(format!("{name}.{ext}")).exists());
        if in_progress {
            continue;
        }
        found.push(DownloadedFile { path: path.to_string_lossy().to_string(), name, size: meta.len() });
    }
    Ok(found)
}

/// N'accepte que les fichiers `.jar`/`.zip` situés directement dans Téléchargements : l'interface
/// ne peut pas faire lire ou copier un autre fichier du disque par ce biais.
fn checked_path(path: &str) -> AppResult<PathBuf> {
    let refused = || AppError::Other("ce fichier ne peut pas être importé".into());
    let file = Path::new(path).canonicalize().map_err(|_| refused())?;
    let dir = downloads_dir()?.canonicalize().map_err(|_| refused())?;
    if file.parent() != Some(dir.as_path()) || !is_candidate(&file) || !file.is_file() {
        return Err(refused());
    }
    Ok(file)
}

// ---------- Versions de Minecraft ----------

/// « 1.21.1 » → [1, 21, 1]. Un suffixe de préversion (« -pre1 », « -alpha... ») est ignoré.
fn parse_version(text: &str) -> Option<Vec<u32>> {
    let core = text.trim().split(['-', '+']).next()?;
    if core.is_empty() {
        return None;
    }
    core.split('.').map(|part| part.parse().ok()).collect()
}

fn compare(a: &[u32], b: &[u32]) -> std::cmp::Ordering {
    let len = a.len().max(b.len());
    let at = |v: &[u32], i: usize| v.get(i).copied().unwrap_or(0);
    (0..len).map(|i| at(a, i).cmp(&at(b, i))).find(|o| o.is_ne()).unwrap_or(std::cmp::Ordering::Equal)
}

/// Un terme d'une condition Fabric : « >=1.21 », « 1.20.x », « ~1.20.1 », « ^1.20 », « * »...
/// `None` si le terme n'est pas compris.
fn fabric_term(term: &str, mc: &[u32]) -> Option<bool> {
    use std::cmp::Ordering::*;
    let term = term.trim();
    if term == "*" || term.is_empty() {
        return Some(true);
    }
    for (op, accept) in [
        (">=", &[Greater, Equal][..]),
        ("<=", &[Less, Equal][..]),
        (">", &[Greater][..]),
        ("<", &[Less][..]),
        ("=", &[Equal][..]),
    ] {
        if let Some(rest) = term.strip_prefix(op) {
            let wanted = parse_version(rest)?;
            return Some(accept.contains(&compare(mc, &wanted)));
        }
    }
    if let Some(rest) = term.strip_prefix('~') {
        // Même version mineure : ~1.20.1 accepte 1.20.1 à 1.20.x.
        let wanted = parse_version(rest)?;
        let same_minor = mc.iter().take(2).eq(wanted.iter().take(2));
        return Some(same_minor && compare(mc, &wanted).is_ge());
    }
    if let Some(rest) = term.strip_prefix('^') {
        let wanted = parse_version(rest)?;
        return Some(mc.first() == wanted.first() && compare(mc, &wanted).is_ge());
    }
    // « 1.20.x » ou « 1.20.* » : tout ce qui commence par 1.20.
    if let Some(prefix) = term.strip_suffix(".x").or_else(|| term.strip_suffix(".*")) {
        let wanted = parse_version(prefix)?;
        return Some(mc.iter().take(wanted.len()).eq(wanted.iter()));
    }
    Some(compare(mc, &parse_version(term)?).is_eq())
}

/// Conditions Fabric : chaque chaîne est une suite de termes (tous requis), et plusieurs chaînes
/// sont des alternatives.
fn fabric_accepts(conditions: &[String], mc: &[u32]) -> Option<bool> {
    let mut any = false;
    for condition in conditions {
        let all = condition.split_whitespace().map(|term| fabric_term(term, mc)).collect::<Option<Vec<bool>>>()?;
        any |= all.into_iter().all(|ok| ok);
    }
    Some(any)
}

/// Intervalles à la Maven, utilisés par Forge : « [1.20,1.21) », « [1.20.1] », « [1.19,) »,
/// éventuellement plusieurs séparés par des virgules.
fn maven_accepts(range: &str, mc: &[u32]) -> Option<bool> {
    let range = range.trim();
    if range.is_empty() || range == "*" {
        return Some(true);
    }
    let mut rest = range;
    let mut any = false;
    let mut seen = false;
    while let Some(start) = rest.find(['[', '(']) {
        let end = start + rest[start..].find([']', ')'])?;
        let (open, close) = (rest.as_bytes()[start], rest.as_bytes()[end]);
        let inner = &rest[start + 1..end];
        let ok = match inner.split_once(',') {
            // Version exacte : « [1.20.1] ».
            None => compare(mc, &parse_version(inner)?).is_eq(),
            Some((low, high)) => {
                let above = match low.trim() {
                    "" => true,
                    low => {
                        let order = compare(mc, &parse_version(low)?);
                        order.is_gt() || (open == b'[' && order.is_eq())
                    }
                };
                let below = match high.trim() {
                    "" => true,
                    high => {
                        let order = compare(mc, &parse_version(high)?);
                        order.is_lt() || (close == b']' && order.is_eq())
                    }
                };
                above && below
            }
        };
        any |= ok;
        seen = true;
        rest = &rest[end + 1..];
    }
    // Sans crochets, Forge lit une version minimale conseillée : on ne tranche pas.
    seen.then_some(any)
}

// ---------- Lecture du fichier ----------

/// Condition sur la version de Minecraft trouvée dans le fichier.
enum McRule {
    Fabric(Vec<String>),
    Maven(String),
    Exact(String),
}

struct Parsed {
    kind: FileKind,
    title: Option<String>,
    loaders: Vec<String>,
    rule: Option<McRule>,
}

type Archive = zip::ZipArchive<std::fs::File>;

fn read_entry(archive: &mut Archive, name: &str) -> Option<String> {
    let mut entry = archive.by_name(name).ok()?;
    // Les fichiers de description font quelques kilo-octets : on borne la lecture.
    let mut text = String::new();
    entry.by_ref().take(512 * 1024).read_to_string(&mut text).ok()?;
    Some(text)
}

fn strings(value: &serde_json::Value) -> Vec<String> {
    match value {
        serde_json::Value::String(s) => vec![s.clone()],
        serde_json::Value::Array(items) => items.iter().filter_map(|v| v.as_str().map(String::from)).collect(),
        _ => Vec::new(),
    }
}

/// Valeur d'une ligne `clé = "valeur"` d'un fichier TOML (lecture minimale, sans bibliothèque).
fn toml_value<'a>(line: &'a str, key: &str) -> Option<&'a str> {
    let rest = line.trim().strip_prefix(key)?.trim_start().strip_prefix('=')?.trim();
    let rest = rest.strip_prefix('"')?;
    rest.find('"').map(|end| &rest[..end])
}

/// Nom du mod et intervalle de versions de Minecraft d'un `mods.toml`.
fn parse_mods_toml(text: &str) -> (Option<String>, Option<String>) {
    let mut title = None;
    let mut range = None;
    let mut in_minecraft_dependency = false;
    for line in text.lines() {
        if line.trim_start().starts_with("[[") {
            in_minecraft_dependency = false;
        }
        if title.is_none() {
            title = toml_value(line, "displayName").map(String::from);
        }
        if let Some(id) = toml_value(line, "modId") {
            in_minecraft_dependency = id == "minecraft";
        }
        if in_minecraft_dependency && range.is_none() {
            range = toml_value(line, "versionRange").map(String::from);
        }
    }
    (title, range)
}

fn parse_archive(archive: &mut Archive) -> Parsed {
    let mut loaders = Vec::new();
    let mut title = None;
    let mut rule = None;

    if let Some(json) = read_entry(archive, "fabric.mod.json").and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok()) {
        loaders.push("fabric".to_string());
        title = json["name"].as_str().map(String::from);
        let conditions = strings(&json["depends"]["minecraft"]);
        if !conditions.is_empty() {
            rule = Some(McRule::Fabric(conditions));
        }
    }
    if let Some(json) = read_entry(archive, "quilt.mod.json").and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok()) {
        loaders.push("quilt".to_string());
        let meta = &json["quilt_loader"];
        title = title.or_else(|| meta["metadata"]["name"].as_str().map(String::from));
        if rule.is_none() {
            let minecraft = meta["depends"].as_array().and_then(|deps| deps.iter().find(|d| d["id"] == "minecraft"));
            let conditions = minecraft.map(|d| strings(&d["versions"])).unwrap_or_default();
            if !conditions.is_empty() {
                rule = Some(McRule::Fabric(conditions));
            }
        }
    }
    for (file, loader) in [("META-INF/neoforge.mods.toml", "neoforge"), ("META-INF/mods.toml", "forge")] {
        if let Some(text) = read_entry(archive, file) {
            loaders.push(loader.to_string());
            let (name, range) = parse_mods_toml(&text);
            title = title.or(name);
            if rule.is_none() {
                rule = range.map(McRule::Maven);
            }
        }
    }
    // Anciens mods Forge (1.12.2 et avant).
    if loaders.is_empty() {
        if let Some(json) = read_entry(archive, "mcmod.info").and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok()) {
            let first = json.get(0).or_else(|| json["modList"].get(0)).cloned().unwrap_or_default();
            loaders.push("forge".to_string());
            title = first["name"].as_str().map(String::from);
            rule = first["mcversion"].as_str().filter(|v| !v.is_empty()).map(|v| McRule::Exact(v.to_string()));
        }
    }
    if !loaders.is_empty() {
        return Parsed { kind: FileKind::Mod, title, loaders, rule };
    }

    // Modpack CurseForge : une simple liste de numéros de fichiers à récupérer chez CurseForge.
    if let Some(json) = read_entry(archive, "manifest.json").and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok()) {
        if json["manifestType"] == "minecraftModpack" {
            let rule = json["minecraft"]["version"].as_str().map(|v| McRule::Exact(v.to_string()));
            return Parsed { kind: FileKind::Modpack, title: json["name"].as_str().map(String::from), loaders, rule };
        }
    }

    let names: Vec<String> = archive.file_names().map(String::from).collect();
    let has = |prefix: &str| names.iter().any(|n| n.starts_with(prefix));
    let kind = if has("shaders/") {
        FileKind::Shader
    } else if names.iter().any(|n| n == "pack.mcmeta") {
        if has("assets/") { FileKind::Resourcepack } else if has("data/") { FileKind::Datapack } else { FileKind::Resourcepack }
    } else {
        FileKind::Unknown
    };
    Parsed { kind, title: None, loaders, rule: None }
}

// ---------- Compatibilité ----------

fn loader_name(loader: &Loader) -> &'static str {
    match loader {
        Loader::Vanilla => "vanilla",
        Loader::Fabric => "fabric",
        Loader::Quilt => "quilt",
        Loader::Forge => "forge",
        Loader::NeoForge => "neoforge",
    }
}

fn label(loader: &str) -> &str {
    match loader {
        "fabric" => "Fabric",
        "quilt" => "Quilt",
        "forge" => "Forge",
        "neoforge" => "NeoForge",
        other => other,
    }
}

fn check_instance(parsed: &Parsed, instance: &Instance) -> (Verdict, String) {
    match parsed.kind {
        FileKind::Unknown => return (Verdict::No, "Type de fichier non reconnu".into()),
        FileKind::Modpack => return (Verdict::No, "Les modpacks CurseForge ne sont pas pris en charge".into()),
        FileKind::Datapack => return (Verdict::No, "Un datapack se place dans un monde, pas dans une instance".into()),
        FileKind::Resourcepack => return (Verdict::Ok, "Les packs de ressources vont sur toutes les instances".into()),
        FileKind::Shader => {
            return match instance.loader {
                Loader::Vanilla => (Verdict::Unknown, "Il faut un mod de shaders (Iris ou OptiFine)".into()),
                _ => (Verdict::Ok, "Nécessite un mod de shaders (Iris, Oculus...)".into()),
            };
        }
        FileKind::Mod => {}
    }

    let own = loader_name(&instance.loader);
    let wanted = parsed.loaders.iter().map(|l| label(l)).collect::<Vec<_>>().join(" ou ");
    let mut uncertain: Option<String> = None;
    let loader_ok = match instance.loader {
        Loader::Vanilla => return (Verdict::No, "Instance sans loader : aucun mod possible".into()),
        // Quilt sait charger les mods Fabric.
        Loader::Quilt => parsed.loaders.iter().any(|l| l == "quilt" || l == "fabric"),
        Loader::NeoForge if !parsed.loaders.iter().any(|l| l == "neoforge") && parsed.loaders.iter().any(|l| l == "forge") => {
            // NeoForge 1.20.2 à 1.20.4 utilisait encore le format de Forge.
            let early = parse_version(&instance.mc_version).is_some_and(|v| compare(&v, &[1, 20, 5]).is_lt());
            if early {
                uncertain = Some("Mod au format Forge : souvent accepté par NeoForge sur cette version".into());
            }
            early
        }
        _ => parsed.loaders.iter().any(|l| l == own),
    };
    if !loader_ok {
        return (Verdict::No, format!("Mod pour {wanted}, instance en {}", label(own)));
    }

    let Some(mc) = parse_version(&instance.mc_version) else {
        return (Verdict::Unknown, "Version de l'instance non vérifiable".into());
    };
    let accepted = match &parsed.rule {
        None => None,
        Some(McRule::Fabric(conditions)) => fabric_accepts(conditions, &mc),
        Some(McRule::Maven(range)) => maven_accepts(range, &mc),
        Some(McRule::Exact(version)) => parse_version(version).map(|v| compare(&v, &mc).is_eq()),
    };
    match accepted {
        Some(false) => (Verdict::No, format!("Prévu pour Minecraft {}", minecraft_text(parsed).unwrap_or_default())),
        Some(true) => match uncertain {
            Some(reason) => (Verdict::Unknown, reason),
            None => (Verdict::Ok, "Loader et version compatibles".into()),
        },
        None => (Verdict::Unknown, uncertain.unwrap_or_else(|| "Bon loader, version de Minecraft non indiquée".into())),
    }
}

fn minecraft_text(parsed: &Parsed) -> Option<String> {
    match parsed.rule.as_ref()? {
        McRule::Fabric(conditions) => Some(conditions.join(" ou ")),
        McRule::Maven(range) => Some(range.clone()),
        McRule::Exact(version) => Some(version.clone()),
    }
}

fn open(path: &Path) -> AppResult<Archive> {
    let file = std::fs::File::open(path)?;
    zip::ZipArchive::new(file).map_err(|_| AppError::Other("fichier illisible ou incomplet".into()))
}

/// Analyse un fichier téléchargé et le compare à toutes les instances.
pub fn inspect(path: &str) -> AppResult<FileInfo> {
    let file = checked_path(path)?;
    let parsed = parse_archive(&mut open(&file)?);
    let file_name = file.file_name().unwrap_or_default().to_string_lossy().to_string();
    let stem = file.file_stem().unwrap_or_default().to_string_lossy().to_string();

    let compat = instances::list()?
        .iter()
        .map(|instance| {
            let (verdict, reason) = check_instance(&parsed, instance);
            InstanceCompat { instance_id: instance.id.clone(), verdict, reason }
        })
        .collect();

    Ok(FileInfo {
        path: file.to_string_lossy().to_string(),
        file_name,
        kind: parsed.kind,
        title: parsed.title.clone().filter(|t| !t.trim().is_empty() && !t.contains("${")).unwrap_or(stem),
        loaders: parsed.loaders.clone(),
        minecraft: minecraft_text(&parsed),
        compat,
    })
}

/// Copie le fichier dans l'instance. Refusé si l'analyse le déclare incompatible.
pub fn install(path: &str, instance_id: &str) -> AppResult<InstalledContent> {
    let file = checked_path(path)?;
    let parsed = parse_archive(&mut open(&file)?);
    let instance = instances::get(instance_id)?;
    let (verdict, reason) = check_instance(&parsed, &instance);
    if verdict == Verdict::No {
        return Err(AppError::Other(reason));
    }
    let content_type = match parsed.kind {
        FileKind::Mod => ContentType::Mod,
        FileKind::Resourcepack => ContentType::Resourcepack,
        FileKind::Shader => ContentType::Shader,
        _ => return Err(AppError::Other("ce type de fichier ne peut pas être installé".into())),
    };
    let stem = file.file_stem().unwrap_or_default().to_string_lossy().to_string();
    let title = parsed.title.filter(|t| !t.trim().is_empty() && !t.contains("${")).unwrap_or(stem);
    content::add_local(instance_id, &file, content_type, &title)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mc(text: &str) -> Vec<u32> {
        parse_version(text).unwrap()
    }

    #[test]
    fn reads_fabric_version_conditions() {
        let one = |c: &str| vec![c.to_string()];
        assert_eq!(fabric_accepts(&one(">=1.21"), &mc("1.21.1")), Some(true));
        assert_eq!(fabric_accepts(&one(">=1.21"), &mc("1.20.6")), Some(false));
        assert_eq!(fabric_accepts(&one(">=1.20 <1.21"), &mc("1.20.4")), Some(true));
        assert_eq!(fabric_accepts(&one(">=1.20 <1.21"), &mc("1.21")), Some(false));
        assert_eq!(fabric_accepts(&one("1.20.x"), &mc("1.20.1")), Some(true));
        assert_eq!(fabric_accepts(&one("1.20.x"), &mc("1.21")), Some(false));
        assert_eq!(fabric_accepts(&one("~1.21.1"), &mc("1.21.4")), Some(true));
        assert_eq!(fabric_accepts(&one("~1.21.1"), &mc("1.21")), Some(false));
        assert_eq!(fabric_accepts(&one("1.21"), &mc("1.21.0")), Some(true));
        assert_eq!(fabric_accepts(&one(">=1.21-"), &mc("1.21")), Some(true));
        assert_eq!(fabric_accepts(&["1.20.1".to_string(), "1.21.1".to_string()], &mc("1.21.1")), Some(true));
        assert_eq!(fabric_accepts(&one("*"), &mc("1.8.9")), Some(true));
        // Condition incomprise : on ne tranche pas.
        assert_eq!(fabric_accepts(&one(">=bidule"), &mc("1.21")), None);
    }

    #[test]
    fn reads_forge_version_ranges() {
        assert_eq!(maven_accepts("[1.20,1.21)", &mc("1.20.1")), Some(true));
        assert_eq!(maven_accepts("[1.20,1.21)", &mc("1.21")), Some(false));
        assert_eq!(maven_accepts("[1.20.1]", &mc("1.20.1")), Some(true));
        assert_eq!(maven_accepts("[1.20.1]", &mc("1.20.2")), Some(false));
        assert_eq!(maven_accepts("[1.21,)", &mc("1.21.11")), Some(true));
        assert_eq!(maven_accepts("(,1.19.2]", &mc("1.19.2")), Some(true));
        assert_eq!(maven_accepts("[1.19,1.19.2],[1.20.1,)", &mc("1.20")), Some(false));
        assert_eq!(maven_accepts("[1.19,1.19.2],[1.20.1,)", &mc("1.20.4")), Some(true));
        assert_eq!(maven_accepts("1.20.1", &mc("1.20.1")), None);
    }

    #[test]
    fn reads_the_minecraft_range_of_a_mods_toml() {
        let text = r#"
modLoader = "javafml"
[[mods]]
modId = "create"
version = "0.5.1"
displayName = "Create"
[[dependencies.create]]
    modId = "forge"
    versionRange = "[47.1.3,)"
[[dependencies.create]]
    modId = "minecraft"
    mandatory = true
    versionRange = "[1.20.1,1.20.2)"
"#;
        let (title, range) = parse_mods_toml(text);
        assert_eq!(title.as_deref(), Some("Create"));
        assert_eq!(range.as_deref(), Some("[1.20.1,1.20.2)"));
    }
}

/// Essai sur de vrais fichiers, à lancer à la main :
/// `NEXORA_IMPORT_SAMPLES=<dossier> cargo test analyses_real_files -- --ignored --nocapture`.
#[cfg(test)]
mod sample_tests {
    use super::*;

    fn instance(loader: &str, mc: &str) -> Instance {
        serde_json::from_value(serde_json::json!({
            "id": format!("{loader}-{mc}"), "name": "Essai", "mc_version": mc, "loader": loader,
            "loader_version": null, "min_ram_mb": 1024, "max_ram_mb": 4096, "width": 854, "height": 480,
            "jvm_args": "", "created_at": "2026-01-01T00:00:00Z", "last_played": null
        }))
        .unwrap()
    }

    #[test]
    #[ignore]
    fn analyses_real_files() {
        let dir = std::env::var("NEXORA_IMPORT_SAMPLES").expect("NEXORA_IMPORT_SAMPLES");
        let instances = [
            instance("fabric", "1.21.1"),
            instance("fabric", "1.20.1"),
            instance("quilt", "1.21.1"),
            instance("forge", "1.20.1"),
            instance("neoforge", "1.21.1"),
            instance("vanilla", "1.21.1"),
        ];
        let mut files: Vec<_> = std::fs::read_dir(dir).unwrap().flatten().map(|e| e.path()).collect();
        files.sort();
        for file in files {
            let parsed = parse_archive(&mut open(&file).unwrap());
            println!(
                "\n{} -> {:?} « {} » loaders={:?} minecraft={:?}",
                file.file_name().unwrap().to_string_lossy(),
                parsed.kind,
                parsed.title.clone().unwrap_or_default(),
                parsed.loaders,
                minecraft_text(&parsed)
            );
            for i in &instances {
                let (verdict, reason) = check_instance(&parsed, i);
                println!("   {:<16} {:?} : {reason}", i.id, verdict);
            }
        }
    }
}
