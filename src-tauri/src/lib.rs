mod accounts;
mod auth;
mod commands;
mod content;
mod download;
mod error;
mod favorites;
mod instances;
mod java;
mod minecraft;
mod modrinth;
mod paths;
mod settings;
mod skins;
mod state;
mod together;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    paths::ensure_dirs().expect("impossible de créer le dossier de données de l'application");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::list_instances,
            commands::create_instance,
            commands::update_instance,
            commands::delete_instance,
            commands::list_mc_versions,
            commands::list_accounts,
            commands::set_active_account,
            commands::remove_account,
            commands::login_microsoft,
            commands::create_offline_account,
            commands::set_skin,
            commands::clear_skin,
            commands::get_local_skin,
            commands::get_settings,
            commands::save_settings,
            commands::set_background_image,
            commands::clear_background_image,
            commands::launch_instance,
            commands::search_modrinth,
            commands::list_installed_content,
            commands::install_content,
            commands::remove_content,
            commands::list_content_versions,
            commands::install_modpack,
            commands::list_favorites,
            commands::add_favorite,
            commands::remove_favorite,
            commands::start_together,
            commands::stop_together,
            commands::is_together_running,
            commands::save_together_port,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
