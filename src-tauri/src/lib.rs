mod commands;
mod state;

use state::{AppDatabase, OllamaState, ScraperState};
use std::fs;
use tauri::{Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::new()
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .manage(ScraperState::default())
        .manage(AppDatabase::default())
        .manage(OllamaState::default())
        .manage(commands::cv::PickedFiles::default())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let app_config_dir = app_handle
                .path()
                .app_config_dir()
                .expect("Failed to get app config directory");

            fs::create_dir_all(&app_config_dir)
                .expect("Failed to create app config directory");

            let db_path = app_config_dir.join("joseador.db");
            let db_url = format!("sqlite:{}?mode=rwc", db_path.to_string_lossy());

            let db_state = app_handle.state::<AppDatabase>();
            let pool = tauri::async_runtime::block_on(async {
                sqlx::SqlitePool::connect(&db_url)
                    .await
                    .expect("Failed to connect to database")
            });

            {
                let mut guard = db_state.pool.lock().expect("Failed to lock database state");
                *guard = Some(pool);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::database::execute_sql,
            commands::database::execute_batch,
            commands::scraper::start_sidecar,
            commands::scraper::stop_sidecar,
            commands::scraper::send_sidecar_command,
            commands::scraper::get_sidecar_status,
            commands::cv::pick_cv_file,
            commands::cv::copy_file_to_app_data,
            commands::cv::read_file_bytes,
            commands::cv::get_app_data_dir,
            commands::crypto::encrypt_value,
            commands::crypto::decrypt_value,
            commands::secrets::secret_set,
            commands::secrets::secret_get,
            commands::secrets::secret_delete,
            commands::http::http_fetch,
            commands::page_fetch::fetch_public_page,
            commands::report::save_text_file,
            commands::report::save_binary_file,
            commands::system::get_system_info,
            commands::ollama::ollama_set_session,
            commands::ollama::ollama_track_model,
            commands::ollama::ollama_ps,
            commands::ollama::ollama_load,
            commands::ollama::ollama_unload,
            commands::ollama::ollama_pull,
            commands::ollama::ollama_pull_cancel,
            commands::ollama::ollama_server_info,
            commands::ollama::ollama_start_server,
            commands::ollama::ollama_stop_server,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                commands::ollama::shutdown(app);
            }
        });
}
