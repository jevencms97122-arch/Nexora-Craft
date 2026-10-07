use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::Serialize;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};

use crate::content::{self, ContentType};
use crate::error::{AppError, AppResult};
use crate::instances::{self, Instance, Loader, NewInstance};
use crate::modrinth;

/*
 * Partage d'instance par code.
 *
 * Le code contient tout ce qu'il faut pour recréer l'instance (aucun serveur n'est nécessaire) :
 * nom, version de Minecraft, loader et la liste des contenus Modrinth avec leur version exacte.
 * Format, avant encodage base64 :
 *   ligne 1 : nom
 *   ligne 2 : version|loader|version_du_loader
 *   suivantes : <type>:<projet>:<version>   (type : m, s, r ou d)
 */

const PREFIX: &str = "NXC1-";

#[derive(Debug, Clone, Serialize)]
pub struct SharedItem {
    pub project_id: String,
    pub version_id: String,
    pub content_type: ContentType,
}

#[derive(Debug, Clone, Serialize)]
pub struct SharedInstance {
    pub name: String,
    pub mc_version: String,
    pub loader: Loader,
    pub loader_version: Option<String>,
    pub items: Vec<SharedItem>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportResult {
    pub instance: Instance,
    /// Contenus qui n'ont pas pu être installés (retirés de Modrinth, erreur réseau...).
    pub failed: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportProgress {
    pub done: usize,
    pub total: usize,
    pub title: String,
}

fn type_char(content_type: ContentType) -> Option<char> {
    match content_type {
        ContentType::Mod => Some('m'),
        ContentType::Shader => Some('s'),
        ContentType::Resourcepack => Some('r'),
        ContentType::Datapack => Some('d'),
        ContentType::Modpack => None,
    }
}

fn type_from_char(c: &str) -> Option<ContentType> {
    match c {
        "m" => Some(ContentType::Mod),
        "s" => Some(ContentType::Shader),
        "r" => Some(ContentType::Resourcepack),
        "d" => Some(ContentType::Datapack),
        _ => None,
    }
}

fn loader_name(loader: &Loader) -> &'static str {
    match loader {
        Loader::Vanilla => "vanilla",
        Loader::Fabric => "fabric",
        Loader::Forge => "forge",
        Loader::Quilt => "quilt",
        Loader::NeoForge => "neoforge",
    }
}

fn loader_from_name(name: &str) -> Option<Loader> {
    match name {
        "vanilla" => Some(Loader::Vanilla),
        "fabric" => Some(Loader::Fabric),
        "forge" => Some(Loader::Forge),
        "quilt" => Some(Loader::Quilt),
        "neoforge" => Some(Loader::NeoForge),
        _ => None,
    }
}

pub fn export(instance_id: &str) -> AppResult<String> {
    let instance = instances::get(instance_id)?;
    let mut text = format!(
        "{}\n{}|{}|{}",
        instance.name.replace('\n', " "),
        instance.mc_version,
        loader_name(&instance.loader),
        instance.loader_version.as_deref().unwrap_or(""),
    );
    for item in content::list_installed(instance_id)? {
        let Some(kind) = type_char(item.content_type) else { continue };
        text.push_str(&format!("\n{kind}:{}:{}", item.project_id, item.version_id));
    }
    Ok(format!("{PREFIX}{}", URL_SAFE_NO_PAD.encode(text)))
}

pub fn decode(code: &str) -> AppResult<SharedInstance> {
    let invalid = || AppError::Other("code de partage invalide".into());
    let compact: String = code.chars().filter(|c| !c.is_whitespace()).collect();
    let payload = compact.strip_prefix(PREFIX).ok_or_else(invalid)?;
    let bytes = URL_SAFE_NO_PAD.decode(payload).map_err(|_| invalid())?;
    let text = String::from_utf8(bytes).map_err(|_| invalid())?;

    let mut lines = text.lines();
    let name = lines.next().ok_or_else(invalid)?.to_string();
    let mut header = lines.next().ok_or_else(invalid)?.split('|');
    let mc_version = header.next().filter(|v| !v.is_empty()).ok_or_else(invalid)?.to_string();
    let loader = header.next().and_then(loader_from_name).ok_or_else(invalid)?;
    let loader_version = header.next().filter(|v| !v.is_empty()).map(String::from);

    let mut items = Vec::new();
    for line in lines {
        let mut parts = line.split(':');
        let (Some(kind), Some(project), Some(version)) = (parts.next(), parts.next(), parts.next()) else {
            return Err(invalid());
        };
        items.push(SharedItem {
            project_id: project.to_string(),
            version_id: version.to_string(),
            content_type: type_from_char(kind).ok_or_else(invalid)?,
        });
    }

    Ok(SharedInstance { name, mc_version, loader, loader_version, items })
}

/// Crée une instance à partir d'un code et y installe les mêmes contenus, version pour version.
/// `instance` est l'instance déjà créée (avec son loader résolu) par la commande appelante.
pub async fn install_items(
    app: &AppHandle,
    client: &reqwest::Client,
    instance: Instance,
    shared: &SharedInstance,
) -> AppResult<ImportResult> {
    let ids: Vec<String> = shared.items.iter().map(|i| i.project_id.clone()).collect();
    let infos: HashMap<String, modrinth::ProjectInfo> = modrinth::get_projects(client, &ids)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|p| (p.id.clone(), p))
        .collect();

    let total = shared.items.len();
    let mut failed = Vec::new();
    for (index, item) in shared.items.iter().enumerate() {
        let info = infos.get(&item.project_id);
        let title = info.map(|i| i.title.clone()).unwrap_or_else(|| item.project_id.clone());
        let _ = app.emit("share-progress", ImportProgress { done: index, total, title: title.clone() });
        let result = content::install_version(
            client,
            &instance.id,
            &item.project_id,
            &item.version_id,
            &title,
            info.and_then(|i| i.icon_url.clone()),
            item.content_type,
        )
        .await;
        if result.is_err() {
            failed.push(title);
        }
    }
    let _ = app.emit("share-progress", ImportProgress { done: total, total, title: String::new() });

    Ok(ImportResult { instance, failed })
}

pub fn new_instance(shared: &SharedInstance, name: &str) -> NewInstance {
    NewInstance {
        name: if name.trim().is_empty() { shared.name.clone() } else { name.trim().to_string() },
        mc_version: shared.mc_version.clone(),
        loader: shared.loader.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_what_it_encodes() {
        let text = "Ma survie\n1.21.11|fabric|0.16.9\nm:P7dR8mSH:abcd1234\nr:AAAAaaaa:BBBBbbbb";
        let code = format!("{PREFIX}{}", URL_SAFE_NO_PAD.encode(text));
        // Un code collé depuis un chat peut contenir des retours à la ligne.
        let pasted = format!("{}\n{}", &code[..20], &code[20..]);
        let shared = decode(&pasted).unwrap();
        assert_eq!(shared.name, "Ma survie");
        assert_eq!(shared.mc_version, "1.21.11");
        assert_eq!(shared.loader, Loader::Fabric);
        assert_eq!(shared.loader_version.as_deref(), Some("0.16.9"));
        assert_eq!(shared.items.len(), 2);
        assert_eq!(shared.items[1].content_type, ContentType::Resourcepack);
    }

    #[test]
    fn rejects_garbage() {
        assert!(decode("bonjour").is_err());
        assert!(decode("NXC1-!!!").is_err());
    }
}
