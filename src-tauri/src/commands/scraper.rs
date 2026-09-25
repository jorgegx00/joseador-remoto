use crate::state::ScraperState;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

fn resolve_sidecar_path<R: Runtime>(app: &AppHandle<R>) -> Result<(PathBuf, PathBuf), String> {
    // Production: check resource directory first
    if let Ok(resource_dir) = app.path().resource_dir() {
        let prod_script = resource_dir.join("sidecar").join("dist").join("index.cjs");
        let prod_root = resource_dir.join("sidecar");
        if prod_script.exists() {
            return Ok((prod_script, prod_root));
        }
    }

    // Development: resolve from compile-time project root
    let project_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or_else(|| "Cannot find project root".to_string())?
        .to_path_buf();

    let dev_script = project_root.join("sidecar").join("dist").join("index.cjs");
    let dev_root = project_root.join("sidecar");

    if dev_script.exists() {
        Ok((dev_script, dev_root))
    } else {
        Err(format!(
            "Sidecar script not found at: {}",
            dev_script.display()
        ))
    }
}

#[tauri::command]
pub async fn start_sidecar<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let scraper_state = app.state::<ScraperState>();

    // Check if already running
    {
        let guard = scraper_state
            .child
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        if guard.is_some() {
            return Err("Sidecar is already running".to_string());
        }
    }

    let (sidecar_script, sidecar_root) = resolve_sidecar_path(&app)?;

    let sidecar_command = app
        .shell()
        .command("node")
        .args([sidecar_script.to_string_lossy().to_string()])
        .current_dir(sidecar_root);

    let (mut rx, child) = sidecar_command
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

    // Store child process in state
    {
        let mut guard = scraper_state
            .child
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        *guard = Some(child);
    }

    // Spawn a task to read stdout and emit events
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes).to_string();
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(trimmed) {
                        let event_type = json
                            .get("type")
                            .and_then(|t| t.as_str())
                            .unwrap_or("unknown");

                        let data = json.get("data").cloned().unwrap_or(json.clone());

                        // The sidecar only parses CVs now — the scrape event
                        // variants were removed along with the on-device scrapers.
                        match event_type {
                            "cv_parsed" => {
                                let _ = app_handle.emit("scraper:cv-parsed", &data);
                            }
                            "error" => {
                                let _ = app_handle.emit("scraper:error", &data);
                            }
                            "log" => {
                                let _ = app_handle.emit("scraper:log", &data);
                            }
                            _ => {
                                let _ = app_handle.emit("scraper:unknown", &json);
                            }
                        }
                    }
                }
                CommandEvent::Stderr(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes).to_string();
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        let _ = app_handle.emit(
                            "scraper:log",
                            &serde_json::json!({ "message": trimmed }),
                        );
                    }
                }
                CommandEvent::Terminated(payload) => {
                    let _ = app_handle.emit(
                        "scraper:done",
                        &serde_json::json!({
                            "terminated": true,
                            "code": payload.code,
                            "signal": payload.signal
                        }),
                    );
                    // Clear the child from state when the process exits
                    let state = app_handle.state::<ScraperState>();
                    if let Ok(mut guard) = state.child.lock() {
                        *guard = None;
                    }
                    break;
                }
                CommandEvent::Error(err) => {
                    let _ = app_handle.emit(
                        "scraper:error",
                        &serde_json::json!({ "message": err }),
                    );
                }
                _ => {}
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn stop_sidecar(state: State<'_, ScraperState>) -> Result<(), String> {
    let mut guard = state
        .child
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    match guard.take() {
        Some(child) => {
            child.kill().map_err(|e| format!("Failed to kill sidecar: {}", e))?;
            Ok(())
        }
        None => Err("Sidecar is not running".to_string()),
    }
}

#[tauri::command]
pub fn send_sidecar_command(
    state: State<'_, ScraperState>,
    command: String,
) -> Result<(), String> {
    let mut guard = state
        .child
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    match guard.as_mut() {
        Some(child) => {
            let line = if command.ends_with('\n') {
                command
            } else {
                format!("{}\n", command)
            };
            child
                .write(line.as_bytes())
                .map_err(|e| format!("Failed to write to sidecar stdin: {}", e))?;
            Ok(())
        }
        None => Err("Sidecar is not running".to_string()),
    }
}

#[tauri::command]
pub fn get_sidecar_status(state: State<'_, ScraperState>) -> Result<String, String> {
    let guard = state
        .child
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    if guard.is_some() {
        Ok("running".to_string())
    } else {
        Ok("stopped".to_string())
    }
}
