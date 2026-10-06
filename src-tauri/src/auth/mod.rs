mod loopback;
mod microsoft;
mod minecraft;
mod pkce;

use chrono::{Duration as ChronoDuration, Utc};

use crate::accounts::{self, Account};
use crate::error::{AppError, AppResult};

/// Déroule le flow complet de connexion (Microsoft -> Xbox -> Minecraft), stocke le compte
/// résultant comme compte actif et le retourne.
pub async fn login(client: &reqwest::Client, client_id: &str) -> AppResult<Account> {
    if client_id.trim().is_empty() {
        return Err(AppError::Auth(
            "aucun Client ID Microsoft configuré. Renseigne-le dans Paramètres > Compte (voir la documentation \
             pour créer une application Azure AD gratuite)."
                .into(),
        ));
    }

    let ms_token = microsoft::login_interactive(client, client_id).await?;
    let mc = minecraft::authenticate(client, &ms_token.access_token).await?;

    let account = Account {
        uuid: mc.profile.id,
        username: mc.profile.name,
        skin_url: None,
        minecraft_access_token: mc.access_token,
        minecraft_token_expires_at: Utc::now() + ChronoDuration::seconds(mc.expires_in as i64),
        ms_refresh_token: ms_token.refresh_token,
        is_offline: false,
    };

    accounts::upsert(account.clone(), true)?;
    Ok(account)
}

/// Renouvelle le token Minecraft d'un compte si nécessaire (expiré ou proche de l'expiration),
/// via le refresh token Microsoft stocké. Retourne le compte à jour.
pub async fn ensure_fresh(client: &reqwest::Client, client_id: &str, account: &Account) -> AppResult<Account> {
    let expires_soon = account.minecraft_token_expires_at - ChronoDuration::minutes(2) < Utc::now();
    if !expires_soon {
        return Ok(account.clone());
    }

    let ms_token = microsoft::refresh(client, client_id, &account.ms_refresh_token).await?;
    let mc = minecraft::authenticate(client, &ms_token.access_token).await?;

    let updated = Account {
        uuid: mc.profile.id,
        username: mc.profile.name,
        skin_url: account.skin_url.clone(),
        minecraft_access_token: mc.access_token,
        minecraft_token_expires_at: Utc::now() + ChronoDuration::seconds(mc.expires_in as i64),
        ms_refresh_token: ms_token.refresh_token,
        is_offline: false,
    };
    accounts::upsert(updated.clone(), false)?;
    Ok(updated)
}
