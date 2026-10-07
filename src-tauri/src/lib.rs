mod accounts;
mod ai;
mod auth;
mod callback;
mod commands;
mod content;
mod download;
mod error;
mod favorites;
mod instances;
mod java;
mod minecraft;
mod modrinth;
mod music;
mod paths;
mod screenshots;
mod servers;
mod settings;
mod share;
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState::default())
        .setup(|app| {
            callback::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_instances,
            commands::create_instance,
            commands::update_instance,
            commands::delete_instance,
            commands::set_instance_image,
            commands::list_mc_versions,
            commands::list_accounts,
            commands::set_active_account,
            commands::remove_account,
            commands::login_microsoft,
            commands::create_offline_account,
            commands::set_skin,
            commands::clear_skin,
            commands::get_local_skin,
            commands::browse_skins,
            commands::lookup_player_skin,
            commands::apply_remote_skin,
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
            commands::check_content_updates,
            commands::update_content,
            commands::set_content_enabled,
            commands::list_servers,
            commands::add_server,
            commands::remove_server,
            commands::set_server_instance,
            commands::ping_server,
            commands::ensure_official_instance,
            commands::analyze_crash_with_ai,
            commands::list_screenshots,
            commands::delete_screenshot,
            commands::open_screenshot,
            commands::open_screenshots_folder,
            commands::export_instance_code,
            commands::preview_instance_code,
            commands::import_instance_code,
            commands::list_wardrobe,
            commands::list_game_music,
            commands::remove_wardrobe_skin,
            commands::apply_wardrobe_skin,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
