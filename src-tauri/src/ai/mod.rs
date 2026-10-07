use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::Duration;

use crate::accounts;
use crate::content;
use crate::error::{AppError, AppResult};
use crate::instances;

/*
 * Analyse d'un plantage par IA.
 *
 * Le launcher ne contient aucune clé d'API de modèle : il envoie les journaux (anonymisés ici) et
 * la configuration de l'instance à un relais, qui est le seul à connaître la clé et à interroger
 * le modèle. Le relais est une fonction Supabase (`supabase/functions/analyze-crash`) ; le dossier
 * `relay/` contient la même chose en serveur Node, utilisable à la place.
 */

/// Adresse du relais. Peut être remplacée à la compilation par la variable d'environnement
/// NEXORA_AI_RELAY_URL.
const DEFAULT_RELAY_URL: &str = "https://vmaketngbwbuscynjkac.supabase.co/functions/v1/analyze-crash";

/// Clé publique du projet Supabase (la même que celle de l'interface) : elle identifie le
/// launcher auprès de la fonction, elle ne donne accès à aucun secret.
const RELAY_PUBLIC_KEY: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtYWtldG5nYndidXNjeW5qa2FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzNDY5NjIsImV4cCI6MjEwNjkyMjk2Mn0.eaDQtvOl9xNibvvYvjM2JFiL8AD96OyNj4LIHP4hEyA";

const MAX_LINES: usize = 250;
const MAX_LINE_CHARS: usize = 400;
const MAX_TOTAL_CHARS: usize = 40_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiReport {
    pub title: String,
    pub explanation: String,
    #[serde(default)]
    pub suggestions: Vec<String>,
}

fn relay_url() -> &'static str {
    option_env!("NEXORA_AI_RELAY_URL").unwrap_or(DEFAULT_RELAY_URL)
}

/// Remplace les adresses IPv4 par « <ip> ».
fn mask_ips(line: &str) -> String {
    let is_ip = |token: &str| {
        let parts: Vec<&str> = token.split('.').collect();
        parts.len() == 4 && parts.iter().all(|p| !p.is_empty() && p.len() <= 3 && p.parse::<u8>().is_ok())
    };
    let mut out = String::with_capacity(line.len());
    let mut token = String::new();
    let flush = |token: &mut String, out: &mut String| {
        out.push_str(if is_ip(token) { "<ip>" } else { token.as_str() });
        token.clear();
    };
    for c in line.chars() {
        if c.is_ascii_digit() || c == '.' {
            token.push(c);
        } else {
            flush(&mut token, &mut out);
            out.push(c);
        }
    }
    flush(&mut token, &mut out);
    out
}

/// Retire des journaux ce qui identifie le joueur : nom de session Windows (présent dans tous les
/// chemins), pseudos des comptes et adresses IP.
fn sanitize(lines: &[String], secrets: &[String]) -> String {
    let start = lines.len().saturating_sub(MAX_LINES);
    let mut out = String::new();
    for line in &lines[start..] {
        let mut line: String = line.chars().take(MAX_LINE_CHARS).collect();
        for secret in secrets {
            line = line.replace(secret.as_str(), "<joueur>");
        }
        out.push_str(&mask_ips(&line));
        out.push('\n');
    }
    // On garde la fin : c'est là que se trouve la cause d'un plantage.
    let excess = out.chars().count().saturating_sub(MAX_TOTAL_CHARS);
    out.chars().skip(excess).collect()
}

/// Ce qui identifie le joueur et doit disparaître des journaux (les chaînes trop courtes sont
/// ignorées : les remplacer abîmerait des mots sans rien protéger).
fn secrets() -> Vec<String> {
    let mut found = Vec::new();
    if let Some(name) = dirs::home_dir().and_then(|h| h.file_name().map(|n| n.to_string_lossy().to_string())) {
        found.push(name);
    }
    if let Ok(file) = accounts::list() {
        found.extend(file.accounts.into_iter().map(|a| a.username));
    }
    found.retain(|s| s.chars().count() >= 3);
    found
}

fn instance_summary(instance_id: &str) -> Option<serde_json::Value> {
    let instance = instances::get(instance_id).ok()?;
    let contents: Vec<serde_json::Value> = content::list_installed(instance_id)
        .unwrap_or_default()
        .into_iter()
        .map(|c| {
            json!({
                "nom": c.title,
                "type": c.content_type.modrinth_slug(),
                "fichier": c.file_name,
                "desactive": c.disabled,
            })
        })
        .collect();
    Some(json!({
        "minecraft": instance.mc_version,
        "loader": format!("{:?}", instance.loader).to_lowercase(),
        "version_loader": instance.loader_version,
        "ram_min_mo": instance.min_ram_mb,
        "ram_max_mo": instance.max_ram_mb,
        "arguments_jvm": instance.jvm_args,
        "contenus": contents,
    }))
}

pub async fn analyze(client: &reqwest::Client, instance_id: Option<&str>, logs: &[String]) -> AppResult<AiReport> {
    let body = json!({
        "logs": sanitize(logs, &secrets()),
        "instance": instance_id.and_then(instance_summary),
    });

    let res = client
        .post(format!("{}/analyze", relay_url().trim_end_matches('/')))
        .timeout(Duration::from_secs(75))
        .bearer_auth(RELAY_PUBLIC_KEY)
        .header("apikey", RELAY_PUBLIC_KEY)
        .json(&body)
        .send()
        .await
        .map_err(|_| AppError::Other("le service d'analyse est injoignable pour le moment".into()))?;

    if !res.status().is_success() {
        // Le relais renvoie un message déjà rédigé pour le joueur.
        let message = res
            .json::<serde_json::Value>()
            .await
            .ok()
            .and_then(|v| v["error"].as_str().map(String::from))
            .unwrap_or_else(|| "l'analyse n'a pas pu aboutir".into());
        return Err(AppError::Other(message));
    }
    Ok(res.json::<AiReport>().await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masks_what_identifies_the_player() {
        let lines = vec![
            "Loading C:/Users/jeven/AppData/Roaming/NexoraCraft/libraries/asm-9.6.jar".to_string(),
            "Connecting to 92.49.99.59, 25565 as Jux".to_string(),
            "Minecraft 1.21.8 with Fabric 0.16.9".to_string(),
        ];
        let out = sanitize(&lines, &["jeven".to_string(), "Jux".to_string()]);
        assert!(!out.contains("jeven") && !out.contains("Jux") && !out.contains("92.49.99.59"));
        assert!(out.contains("C:/Users/<joueur>/AppData"));
        assert!(out.contains("<ip>, 25565 as <joueur>"));
        // Les numéros de version ne sont pas des adresses IP.
        assert!(out.contains("Minecraft 1.21.8 with Fabric 0.16.9"));
        assert!(out.contains("asm-9.6.jar"));
    }

    #[test]
    fn keeps_only_the_end_of_long_logs() {
        let lines: Vec<String> = (0..1000).map(|i| format!("ligne {i}")).collect();
        let out = sanitize(&lines, &[]);
        assert!(out.contains("ligne 999") && !out.contains("ligne 100\n"));
        assert_eq!(out.lines().count(), MAX_LINES);
    }
}

#[cfg(test)]
mod relay_tests {
    use super::*;

    /// Test de bout en bout, à lancer à la main avec un relais démarré :
    /// `NEXORA_AI_RELAY_URL=http://localhost:8787 cargo test asks_the_relay -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore]
    async fn asks_the_relay() {
        let logs = vec![
            "[main/INFO]: Loading Minecraft 1.21.11 with Fabric Loader 0.16.9".to_string(),
            "Caused by: java.lang.IllegalStateException: duplicate ASM classes found on classpath: jar:file:/C:/Users/jeven/AppData/Roaming/NexoraCraft/libraries/org/ow2/asm/asm/9.6/asm-9.6.jar!/org/objectweb/asm/ClassReader.class, jar:file:/C:/Users/jeven/AppData/Roaming/NexoraCraft/libraries/org/ow2/asm/asm/9.9/asm-9.9.jar".to_string(),
        ];
        let report = analyze(&reqwest::Client::new(), None, &logs).await.expect("relais injoignable");
        println!("TITRE: {}\nEXPLICATION: {}\nCONSEILS: {:?}", report.title, report.explanation, report.suggestions);
        assert!(!report.title.is_empty());
    }
}
