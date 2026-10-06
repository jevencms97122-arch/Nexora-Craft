use crate::error::{AppError, AppResult};
use std::collections::HashMap;

/// Démarre un petit serveur HTTP local, attend une seule requête de callback OAuth
/// et retourne les paramètres de sa query string (ex: "code", "error", ...).
pub fn wait_for_redirect(port: u16, timeout: std::time::Duration) -> AppResult<HashMap<String, String>> {
    let server = tiny_http::Server::http(format!("127.0.0.1:{port}"))
        .map_err(|e| AppError::Auth(format!("impossible de démarrer le serveur local: {e}")))?;

    let request = server
        .recv_timeout(timeout)
        .map_err(|e| AppError::Auth(format!("erreur serveur local: {e}")))?
        .ok_or_else(|| AppError::Auth("délai d'attente dépassé pour la connexion".into()))?;

    let url = request.url().to_string();
    let params = parse_query(&url);

    let body = "<html><body style=\"font-family:sans-serif;background:#111;color:#eee;display:flex;\
        align-items:center;justify-content:center;height:100vh;margin:0\">\
        <h2>Connexion réussie, vous pouvez fermer cet onglet.</h2></body></html>";
    let response = tiny_http::Response::from_string(body)
        .with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap());
    let _ = request.respond(response);

    Ok(params)
}

fn parse_query(url: &str) -> HashMap<String, String> {
    let query = match url.split_once('?') {
        Some((_, q)) => q,
        None => return HashMap::new(),
    };
    query
        .split('&')
        .filter_map(|pair| {
            let (k, v) = pair.split_once('=')?;
            Some((
                urlencoding::decode(k).ok()?.into_owned(),
                urlencoding::decode(v).ok()?.into_owned(),
            ))
        })
        .collect()
}
