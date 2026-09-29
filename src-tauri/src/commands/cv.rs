use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_dialog::DialogExt;

use super::paths::{app_data_dir, ensure_in_app_data, is_safe_file_name};

const CV_EXTENSIONS: &[&str] = &["pdf", "docx"];

/// Files the user picked in the native dialog this session. Only these (or files
/// already in app data) may be imported, so the renderer can't copy — and then
/// read — arbitrary files.
#[derive(Default)]
pub struct PickedFiles(std::sync::Mutex<std::collections::HashSet<PathBuf>>);
/// Generous for a CV; stops the copy command from being used to hoard large files.
const MAX_CV_BYTES: u64 = 25 * 1024 * 1024;

/// Async so the blocking dialog never runs on the main thread (sync commands do, which deadlocks).
#[tauri::command]
pub async fn pick_cv_file<R: Runtime>(app: AppHandle<R>, picked: tauri::State<'_, PickedFiles>) -> Result<String, String> {
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
            if let (Ok(mut set), Ok(canonical)) = (picked.0.lock(), path_buf.canonicalize()) {
                set.insert(canonical);
            }
            Ok(path_buf.to_string_lossy().to_string())
        }
        None => Err("No file selected".to_string()),
    }
}

#[tauri::command]
pub async fn copy_file_to_app_data<R: Runtime>(
    app: AppHandle<R>,
    picked: tauri::State<'_, PickedFiles>,
    source: String,
    dest_name: String,
) -> Result<String, String> {
    let canonical = PathBuf::from(&source)
        .canonicalize()
        .map_err(|_| "Source file not found".to_string())?;
    let was_picked = picked.0.lock().map(|mut set| set.remove(&canonical)).unwrap_or(false);
    if !was_picked && ensure_in_app_data(&app, &source).is_err() {
        return Err("Only files chosen in the file dialog can be imported".to_string());
    }
    // dest_name is joined onto the app data dir: it must be a bare "<id>.pdf|docx"
    // name, never a path ("../../x").
    if !is_safe_file_name(&dest_name, CV_EXTENSIONS) {
        return Err("Invalid destination file name".to_string());
    }
    let source_path = PathBuf::from(&source);
    let source_ok = source_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| CV_EXTENSIONS.iter().any(|x| x.eq_ignore_ascii_case(e)))
        .unwrap_or(false);
    if !source_ok {
        return Err("Only PDF and DOCX files can be imported".to_string());
    }
    let meta = fs::metadata(&source_path).map_err(|e| format!("Cannot read source file: {}", e))?;
    if !meta.is_file() || meta.len() > MAX_CV_BYTES {
        return Err("Source must be a regular file of at most 25 MB".to_string());
    }

    let cvs_dir = app_data_dir(&app)?.join("cvs");

    fs::create_dir_all(&cvs_dir)
        .map_err(|e| format!("Failed to create cvs directory: {}", e))?;

    let dest_path = cvs_dir.join(&dest_name);

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

/// Reads a file the app stored itself (imported CVs). Paths outside the app data
/// directory are refused.
#[tauri::command]
pub async fn read_file_bytes<R: Runtime>(app: AppHandle<R>, path: String) -> Result<Vec<u8>, String> {
    let file_path = ensure_in_app_data(&app, &path)?;
    fs::read(&file_path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub fn get_app_data_dir<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    Ok(app_data_dir.to_string_lossy().to_string())
}
