use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::error::{AppError, AppResult};

#[derive(Debug, Deserialize)]
struct XblResponse {
    #[serde(rename = "Token")]
    token: String,
    #[serde(rename = "DisplayClaims")]
    display_claims: XblDisplayClaims,
}

#[derive(Debug, Deserialize)]
struct XblDisplayClaims {
    xui: Vec<XblUserHash>,
}

#[derive(Debug, Deserialize)]
struct XblUserHash {
    uhs: String,
}

async fn xbox_live_auth(client: &reqwest::Client, ms_access_token: &str) -> AppResult<XblResponse> {
    let body = json!({
        "Properties": {
            "AuthMethod": "RPS",
            "SiteName": "user.auth.xboxlive.com",
            "RpsTicket": format!("d={ms_access_token}"),
        },
        "RelyingParty": "http://auth.xboxlive.com",
        "TokenType": "JWT",
    });
    let res = client
        .post("https://user.auth.xboxlive.com/user/authenticate")
        .json(&body)
        .send()
        .await?;
    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(AppError::Auth(format!("échec Xbox Live ({status}): {text}")));
    }
    Ok(res.json().await?)
}

async fn xsts_auth(client: &reqwest::Client, xbl_token: &str) -> AppResult<XblResponse> {
    let body = json!({
        "Properties": {
            "SandboxId": "RETAIL",
            "UserTokens": [xbl_token],
        },
        "RelyingParty": "rp://api.minecraftservices.com/",
        "TokenType": "JWT",
    });
    let res = client
        .post("https://xsts.auth.xboxlive.com/xsts/authorize")
        .header("x-xbl-contract-version", "1")
        .json(&body)
        .send()
        .await?;
    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        let text = res.text().await.unwrap_or_default();
        return Err(AppError::Auth(format!(
            "ce compte Microsoft n'a pas de compte Xbox associé, ou est soumis à une restriction régionale/d'âge ({text})"
        )));
    }
    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(AppError::Auth(format!("échec XSTS ({status}): {text}")));
    }
    Ok(res.json().await?)
}

#[derive(Debug, Deserialize)]
struct McLoginResponse {
    access_token: String,
    expires_in: u64,
}

async fn login_with_xbox(client: &reqwest::Client, uhs: &str, xsts_token: &str) -> AppResult<McLoginResponse> {
    let identity_token = format!("XBL3.0 x={uhs};{xsts_token}");
    let body = json!({ "identityToken": identity_token });
    let res = client
        .post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .header("Accept", "application/json")
        .json(&body)
        .send()
        .await?;
    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(AppError::Auth(format!("échec connexion Minecraft Services ({status}): {text}")));
    }
    Ok(res.json().await?)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MinecraftProfile {
    pub id: String,
    pub name: String,
}

async fn fetch_profile(client: &reqwest::Client, mc_access_token: &str) -> AppResult<MinecraftProfile> {
    let res = client
        .get("https://api.minecraftservices.com/minecraft/profile")
        .bearer_auth(mc_access_token)
        .send()
        .await?;
    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(AppError::Auth("ce compte Microsoft ne possède pas Minecraft".into()));
    }
    if !res.status().is_success() {
        return Err(AppError::Auth(format!("échec récupération du profil: {}", res.status())));
    }
    Ok(res.json().await?)
}

pub struct MinecraftAuthResult {
    pub profile: MinecraftProfile,
    pub access_token: String,
    pub expires_in: u64,
}

/// Chaîne complète: token Microsoft -> Xbox Live -> XSTS -> Minecraft Services -> profil.
pub async fn authenticate(client: &reqwest::Client, ms_access_token: &str) -> AppResult<MinecraftAuthResult> {
    let xbl = xbox_live_auth(client, ms_access_token).await?;
    let uhs = xbl
        .display_claims
        .xui
        .first()
        .map(|x| x.uhs.clone())
        .ok_or_else(|| AppError::Auth("réponse Xbox Live invalide".into()))?;

    let xsts = xsts_auth(client, &xbl.token).await?;
    let mc = login_with_xbox(client, &uhs, &xsts.token).await?;
    let profile = fetch_profile(client, &mc.access_token).await?;

    Ok(MinecraftAuthResult {
        profile,
        access_token: mc.access_token,
        expires_in: mc.expires_in,
    })
}
