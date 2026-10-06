pub struct AppState {
    pub http: reqwest::Client,
    pub together_child: std::sync::Mutex<Option<tokio::process::Child>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            http: reqwest::Client::builder()
                .user_agent("NexoraCraft/0.1.0")
                .build()
                .expect("impossible de construire le client HTTP"),
            together_child: std::sync::Mutex::new(None),
        }
    }
}
