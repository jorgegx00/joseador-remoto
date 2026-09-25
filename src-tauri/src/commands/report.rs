use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Runtime};
use tauri_plugin_dialog::DialogExt;

/// Open a native "Save As" dialog filtered to `extensions` and write `bytes` to the chosen
/// path. Appends the first extension when the user typed a name without one.
/// Returns the saved path, or None when the user cancels the dialog.
fn save_bytes_with_dialog<R: Runtime>(
    app: &AppHandle<R>,
    default_name: &str,
    filter_name: &str,
    extensions: &[String],
    bytes: &[u8],
) -> Result<Option<String>, String> {
    if extensions.is_empty() {
        return Err("At least one file extension is required".into());
    }
    for ext in extensions {
        let valid = !ext.is_empty() && ext.len() <= 8 && ext.chars().all(|c| c.is_ascii_alphanumeric());
        if !valid {
            return Err(format!("Invalid file extension '{}'", ext));
        }
    }
    let ext_refs: Vec<&str> = extensions.iter().map(String::as_str).collect();

    let file_path = app
        .dialog()
        .file()
        .add_filter(filter_name, &ext_refs)
        .set_file_name(default_name)
        .blocking_save_file();

    match file_path {
        Some(path) => {
            let mut path_buf: PathBuf = path
                .into_path()
                .map_err(|e| format!("Failed to convert file path: {}", e))?;
            if path_buf.extension().is_none() {
                path_buf.set_extension(&extensions[0]);
            }
            fs::write(&path_buf, bytes)
                .map_err(|e| format!("Failed to write file '{}': {}", path_buf.display(), e))?;
            Ok(Some(path_buf.to_string_lossy().to_string()))
        }
        None => Ok(None),
    }
}

/// Open a save dialog and write `content` (UTF-8) to the chosen path.
/// Returns the saved path, or None when the user cancels the dialog.
/// Async so the blocking dialog never runs on the main thread.
#[tauri::command]
pub async fn save_text_file<R: Runtime>(
    app: AppHandle<R>,
    default_name: String,
    content: String,
) -> Result<Option<String>, String> {
    save_bytes_with_dialog(&app, &default_name, "Text", &["txt".to_string()], content.as_bytes())
}

/// Open a save dialog for arbitrary binary content (PDF, DOCX, Markdown…).
/// `extensions` are without dots, e.g. `["pdf"]`. Returns the saved path, or None on cancel.
#[tauri::command]
pub async fn save_binary_file<R: Runtime>(
    app: AppHandle<R>,
    default_name: String,
    filter_name: String,
    extensions: Vec<String>,
    contents: Vec<u8>,
) -> Result<Option<String>, String> {
    save_bytes_with_dialog(&app, &default_name, &filter_name, &extensions, &contents)
}
