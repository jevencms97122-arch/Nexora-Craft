use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("erreur réseau: {0}")]
    Network(#[from] reqwest::Error),
    #[error("erreur d'entrée/sortie: {0}")]
    Io(#[from] std::io::Error),
    #[error("erreur JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("erreur d'archive: {0}")]
    Zip(String),
    #[error("instance introuvable: {0}")]
    InstanceNotFound(String),
    #[error("compte introuvable")]
    NoAccount,
    #[error("échec de l'authentification: {0}")]
    Auth(String),
    #[error("vérification d'intégrité échouée pour {0}")]
    ChecksumMismatch(String),
    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self {
        AppError::Other(e.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
