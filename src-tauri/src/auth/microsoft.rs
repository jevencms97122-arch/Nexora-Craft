use serde::Deserialize;
use std::time::Duration;

use crate::error::{AppError, AppResult};

const AUTHORIZE_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
const TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const SCOPE: &str = "XboxLive.signin offline_access";
const REDIRECT_PORT: u16 = 43110;

#[derive(Debug, Deserialize)]
pub struct MsTokenResponse {
    pub access_token: String,
    pub refresh_token: String,
}

/// Ouvre le navigateur système pour la connexion Microsoft, attend le retour local (PKCE + loopback)
/// puis échange le code contre un access_token + refresh_token.
pub async fn login_interactive(client: &reqwest::Client, client_id: &str) -> AppResult<MsTokenResponse> {
    let pkce = super::pkce::generate();
    let redirect_uri = format!("http://localhost:{REDIRECT_PORT}");

    let auth_url = format!(
        "{AUTHORIZE_URL}?client_id={client_id}&response_type=code&redirect_uri={redirect}&\
         response_mode=query&scope={scope}&code_challenge={challenge}&code_challenge_method=S256&prompt=select_account",
        client_id = urlencoding::encode(client_id),
        redirect = urlencoding::encode(&redirect_uri),
        scope = urlencoding::encode(SCOPE),
        challenge = pkce.challenge,
    );

    open::that(&auth_url).map_err(|e| AppError::Auth(format!("impossible d'ouvrir le navigateur: {e}")))?;

    let port = REDIRECT_PORT;
    let verifier = pkce.verifier.clone();
    let params = tokio::task::spawn_blocking(move || {
        super::loopback::wait_for_redirect(port, Duration::from_secs(180))
    })
    .await
    .map_err(|e| AppError::Auth(e.to_string()))??;

    if let Some(err) = params.get("error") {
        let desc = params.get("error_description").cloned().unwrap_or_default();
        return Err(AppError::Auth(format!("{err}: {desc}")));
    }
    let code = params
        .get("code")
        .ok_or_else(|| AppError::Auth("code d'autorisation manquant".into()))?;

    exchange_code(client, client_id, code, &redirect_uri, &verifier).await
}

async fn exchange_code(
    client: &reqwest::Client,
    client_id: &str,
    code: &str,
    redirect_uri: &str,
    verifier: &str,
) -> AppResult<MsTokenResponse> {
    let params = [
        ("client_id", client_id),
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("code_verifier", verifier),
        ("scope", SCOPE),
    ];
    let res = client.post(TOKEN_URL).form(&params).send().await?;
    parse_token_response(res).await
}

pub async fn refresh(client: &reqwest::Client, client_id: &str, refresh_token: &str) -> AppResult<MsTokenResponse> {
    let params = [
        ("client_id", client_id),
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("scope", SCOPE),
    ];
    let res = client.post(TOKEN_URL).form(&params).send().await?;
    parse_token_response(res).await
}

async fn parse_token_response(res: reqwest::Response) -> AppResult<MsTokenResponse> {
    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(AppError::Auth(format!("échec de l'échange de jeton Microsoft ({status}): {text}")));
    }
    Ok(res.json::<MsTokenResponse>().await?)
}
