//! API keys in the OS credential store (Windows Credential Manager, macOS
//! Keychain, Linux Secret Service) instead of the SQLite database.
//!
//! The renderer only ever passes a provider-style name; values never touch disk
//! in this app. Legacy AES values in the settings table are migrated by the
//! frontend (read with `decrypt_value`, written here, then replaced by a marker).

const SERVICE: &str = "com.joseador-remoto.app";

fn valid_name(name: &str) -> bool {
    !name.is_empty() && name.len() <= 64 && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn entry(name: &str) -> Result<keyring::Entry, String> {
    if !valid_name(name) {
        return Err("Invalid secret name".to_string());
    }
    keyring::Entry::new(SERVICE, name).map_err(|e| format!("Credential store unavailable: {}", e))
}

/// Credential-store calls can block (a locked keyring shows an unlock prompt), so
/// they run on a blocking worker: sync commands run on the main thread and would
/// freeze the window meanwhile.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("Credential store task failed: {}", e))?
}

#[tauri::command]
pub async fn secret_set(name: String, value: String) -> Result<(), String> {
    blocking(move || {
        entry(&name)?
            .set_password(&value)
            .map_err(|e| format!("Could not save to the credential store: {}", e))
    })
    .await
}

/// `None` when no credential exists under `name`.
#[tauri::command]
pub async fn secret_get(name: String) -> Result<Option<String>, String> {
    blocking(move || match entry(&name)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Could not read the credential store: {}", e)),
    })
    .await
}

#[tauri::command]
pub async fn secret_delete(name: String) -> Result<(), String> {
    blocking(move || match entry(&name)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Could not delete from the credential store: {}", e)),
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::valid_name;

    #[test]
    fn names() {
        assert!(valid_name("api_key_openai"));
        assert!(!valid_name(""));
        assert!(!valid_name("a/b"));
        assert!(!valid_name("key with space"));
    }
}
