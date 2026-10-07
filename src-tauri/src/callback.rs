//! Retour du lien de confirmation d'e-mail vers le launcher.
//!
//! Le lien reçu par e-mail ouvre `http://localhost:4720/auth/callback?code=...` dans le
//! navigateur. Ce petit serveur local reçoit la requête, transmet le code à l'interface (qui
//! termine la connexion), ramène la fenêtre au premier plan et affiche une page de confirmation.
//! Il n'écoute que sur la machine elle-même, jamais sur le réseau.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

pub const PORT: u16 = 4720;
const PATH: &str = "/auth/callback";

#[derive(Clone, Serialize)]
struct AuthCallback {
    code: Option<String>,
    error: Option<String>,
}

/// Démarre l'écoute en arrière-plan. Si le port est déjà pris, le launcher fonctionne quand
/// même : le joueur se connectera simplement à la main après avoir confirmé son e-mail.
pub fn start(app: AppHandle) {
    // « localhost » peut désigner l'adresse IPv4 ou IPv6 selon le navigateur : on écoute les deux.
    for host in ["127.0.0.1", "[::1]"] {
        let app = app.clone();
        std::thread::spawn(move || {
            let listener = match TcpListener::bind(format!("{host}:{PORT}")) {
                Ok(listener) => listener,
                Err(e) => {
                    eprintln!("retour de confirmation indisponible sur {host}:{PORT} : {e}");
                    return;
                }
            };
            for stream in listener.incoming().flatten() {
                handle(&app, stream);
            }
        });
    }
}

fn handle(app: &AppHandle, mut stream: TcpStream) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let mut buffer = [0u8; 8192];
    let read = stream.read(&mut buffer).unwrap_or(0);
    let request = String::from_utf8_lossy(&buffer[..read]);

    // Première ligne : « GET /auth/callback?code=... HTTP/1.1 ».
    let mut parts = request.lines().next().unwrap_or("").split_whitespace();
    let (method, target) = (parts.next().unwrap_or(""), parts.next().unwrap_or(""));
    let (path, query) = target.split_once('?').unwrap_or((target, ""));

    if method != "GET" || path != PATH {
        respond(&mut stream, "404 Not Found", &page("Page introuvable", "Cette adresse ne mène nulle part.", false));
        return;
    }

    let callback = AuthCallback {
        code: param(query, "code"),
        error: param(query, "error_description").or_else(|| param(query, "error")),
    };
    let ok = callback.code.is_some() && callback.error.is_none();

    let _ = app.emit("auth-callback", callback);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }

    let body = if ok {
        page(
            "E-mail confirmé",
            "Ton compte Nexora est prêt. Tu peux fermer cet onglet et retourner sur le launcher.",
            true,
        )
    } else {
        page(
            "Lien expiré",
            "Ce lien a expiré ou a déjà servi. Retourne sur le launcher pour te connecter ou recréer ton compte.",
            false,
        )
    };
    respond(&mut stream, "200 OK", &body);
}

fn param(query: &str, name: &str) -> Option<String> {
    query
        .split('&')
        .filter_map(|pair| pair.split_once('='))
        .find(|(key, _)| *key == name)
        .and_then(|(_, value)| {
            let spaced = value.replace('+', " ");
            urlencoding::decode(&spaced).ok().map(|decoded| decoded.into_owned())
        })
        .filter(|value| !value.is_empty())
}

fn respond(stream: &mut TcpStream, status: &str, body: &str) {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

fn page(title: &str, text: &str, ok: bool) -> String {
    let (mark, color) = if ok { ("✓", "#34e089") } else { ("!", "#f43f4e") };
    format!(
        r#"<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · Nexora Craft</title>
<style>
  body {{ margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         background: radial-gradient(circle at 50% 0%, #2a1016 0%, #0b0b10 60%); color: #f4f4f7;
         font-family: "Segoe UI", system-ui, sans-serif; }}
  main {{ width: min(420px, calc(100vw - 48px)); padding: 40px 32px; text-align: center; border-radius: 24px;
         background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); }}
  .mark {{ width: 64px; height: 64px; margin: 0 auto 20px; border-radius: 20px; display: flex;
          align-items: center; justify-content: center; font-size: 30px; font-weight: 700;
          color: {color}; background: {color}22; border: 1px solid {color}66; }}
  .brand {{ font-size: 11px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #f43f4e; }}
  h1 {{ margin: 8px 0 12px; font-size: 26px; }}
  p {{ margin: 0; line-height: 1.6; color: #a9a9b8; }}
</style>
</head>
<body>
<main>
  <div class="mark">{mark}</div>
  <div class="brand">Nexora Craft</div>
  <h1>{title}</h1>
  <p>{text}</p>
</main>
</body>
</html>"#
    )
}

#[cfg(test)]
mod tests {
    use super::param;

    #[test]
    fn reads_and_decodes_query_parameters() {
        let query = "code=abc-123&error_description=Email+link+is+invalid%20or+expired&empty=";
        assert_eq!(param(query, "code").as_deref(), Some("abc-123"));
        assert_eq!(param(query, "error_description").as_deref(), Some("Email link is invalid or expired"));
        assert_eq!(param(query, "empty"), None);
        assert_eq!(param(query, "missing"), None);
    }
}
