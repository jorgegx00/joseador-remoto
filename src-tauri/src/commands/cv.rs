use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_dialog::DialogExt;

/// Async so the blocking dialog never runs on the main thread (sync commands do, which deadlocks).
#[tauri::command]
pub async fn pick_cv_file<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    let file_path = app
        .dialog()
        .file()
        .add_filter("CV Files", &["pdf", "docx"])
        .add_filter("PDF", &["pdf"])
        .add_filter("Word Document", &["docx"])
        .blocking_pick_file();

    match file_path {
        Some(path) => {
            let path_buf: PathBuf = path
                .into_path()
                .map_err(|e| format!("Failed to convert file path: {}", e))?;
            Ok(path_buf.to_string_lossy().to_string())
        }
        None => Err("No file selected".to_string()),
    }
}

#[tauri::command]
pub async fn copy_file_to_app_data<R: Runtime>(
    app: AppHandle<R>,
    source: String,
    dest_name: String,
) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let cvs_dir = app_data_dir.join("cvs");

    fs::create_dir_all(&cvs_dir)
        .map_err(|e| format!("Failed to create cvs directory: {}", e))?;

    let dest_path = cvs_dir.join(&dest_name);
    let source_path = PathBuf::from(&source);

    fs::copy(&source_path, &dest_path).map_err(|e| {
        format!(
            "Failed to copy file from '{}' to '{}': {}",
            source,
            dest_path.display(),
            e
        )
    })?;

    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    let file_path = PathBuf::from(&path);

    if !file_path.exists() {
        return Err(format!("File does not exist: {}", path));
    }

    fs::read(&file_path).map_err(|e| format!("Failed to read file '{}': {}", path, e))
}

#[tauri::command]
pub fn get_app_data_dir<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    Ok(app_data_dir.to_string_lossy().to_string())
}
