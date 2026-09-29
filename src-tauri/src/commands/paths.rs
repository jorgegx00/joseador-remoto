use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Runtime};

/// Canonical app data directory (created if missing).
pub fn app_data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create app data dir: {}", e))?;
    dir.canonicalize()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))
}

/// Resolves `path` and rejects anything outside the app data directory, so a
/// compromised renderer can't use file commands to read arbitrary files.
pub fn ensure_in_app_data<R: Runtime>(app: &AppHandle<R>, path: &str) -> Result<PathBuf, String> {
    let root = app_data_dir(app)?;
    let resolved = Path::new(path)
        .canonicalize()
        .map_err(|_| "File does not exist".to_string())?;
    if resolved.starts_with(&root) && resolved.is_file() {
        Ok(resolved)
    } else {
        Err("Access denied: file is outside the app data directory".to_string())
    }
}

/// A bare file name (no directories, no traversal) with an allowed extension.
pub fn is_safe_file_name(name: &str, extensions: &[&str]) -> bool {
    let valid_chars = !name.is_empty()
        && name.len() <= 128
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
        && !name.starts_with('.')
        && !name.contains("..");
    let ext_ok = Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| extensions.iter().any(|x| x.eq_ignore_ascii_case(e)))
        .unwrap_or(false);
    valid_chars && ext_ok
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_file_names() {
        assert!(is_safe_file_name("01J9ABC.pdf", &["pdf", "docx"]));
        assert!(is_safe_file_name("cv_1.DOCX", &["pdf", "docx"]));
        assert!(!is_safe_file_name("../evil.pdf", &["pdf"]));
        assert!(!is_safe_file_name("a/b.pdf", &["pdf"]));
        assert!(!is_safe_file_name("a\\b.pdf", &["pdf"]));
        assert!(!is_safe_file_name(".hidden.pdf", &["pdf"]));
        assert!(!is_safe_file_name("cv.exe", &["pdf", "docx"]));
        assert!(!is_safe_file_name("", &["pdf"]));
    }
}
