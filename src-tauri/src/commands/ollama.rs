//! Control of a local / LAN Ollama server: loaded-model status, load/unload,
//! model downloads and — for this machine only — starting `ollama serve`.
//!
//! Lives in Rust (not the WebView) because shutdown must unload models and stop
//! the server this app spawned, and JS can't reliably do network I/O on exit.

use crate::state::{OllamaSession, OllamaState};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::Ordering;
use std::sync::OnceLock;
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime, State};

const LOCAL_URL: &str = "http://127.0.0.1:11434";
const START_TIMEOUT: Duration = Duration::from_secs(15);
const EXIT_UNLOAD_TIMEOUT: Duration = Duration::from_secs(2);

/// No global timeout: loading a large model or pulling one can take minutes.
/// Each request sets its own timeout where one makes sense.
fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            .build()
            .expect("failed to build HTTP client")
    })
}

fn api_url(base_url: &str, path: &str) -> String {
    format!("{}/api/{}", base_url.trim_end_matches('/'), path)
}

fn net_err(e: reqwest::Error) -> String {
    e.without_url().to_string()
}

/// Ollama reports failures as `{"error": "..."}` with a non-2xx status.
async fn check(res: reqwest::Response) -> Result<reqwest::Response, String> {
    if res.status().is_success() {
        return Ok(res);
    }
    let status = res.status();
    let body = res.text().await.unwrap_or_default();
    let message = serde_json::from_str::<serde_json::Value>(&body)
        .ok()
        .and_then(|v| v.get("error").and_then(|e| e.as_str()).map(String::from))
        .unwrap_or(body);
    Err(format!("Ollama responded {}: {}", status.as_u16(), message.trim()))
}

// ---------------------------------------------------------------------------
// Session tracking
// ---------------------------------------------------------------------------

fn with_session(state: &OllamaState, base_url: &str, f: impl FnOnce(&mut OllamaSession)) {
    if let Ok(mut guard) = state.session.lock() {
        let session = guard.get_or_insert_with(|| OllamaSession {
            base_url: base_url.to_string(),
            models: HashSet::new(),
            unload_on_exit: true,
        });
        if session.base_url != base_url {
            session.base_url = base_url.to_string();
            session.models.clear();
        }
        f(session);
    }
}

/// Called whenever the active Ollama server or the unload-on-exit preference
/// changes. Switching servers forgets models tracked on the previous one.
#[tauri::command]
pub fn ollama_set_session(state: State<'_, OllamaState>, base_url: String, unload_on_exit: bool) {
    with_session(&state, &base_url, |s| s.unload_on_exit = unload_on_exit);
}

/// Records a model used for generation (Ollama loads it implicitly).
#[tauri::command]
pub fn ollama_track_model(state: State<'_, OllamaState>, base_url: String, model: String) {
    with_session(&state, &base_url, |s| {
        s.models.insert(model);
    });
}

// ---------------------------------------------------------------------------
// Models: status, load, unload
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
pub struct LoadedModel {
    pub name: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub size_vram: u64,
    #[serde(default)]
    pub expires_at: Option<String>,
}

#[derive(Deserialize)]
struct PsResponse {
    #[serde(default)]
    models: Vec<LoadedModel>,
}

async fn fetch_loaded(base_url: &str) -> Result<Vec<LoadedModel>, String> {
    let res = client()
        .get(api_url(base_url, "ps"))
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .map_err(net_err)?;
    let body: PsResponse = check(res).await?.json().await.map_err(net_err)?;
    Ok(body.models)
}

#[tauri::command]
pub async fn ollama_ps(base_url: String) -> Result<Vec<LoadedModel>, String> {
    fetch_loaded(&base_url).await
}

async fn unload_request(base_url: &str, model: &str) -> Result<(), String> {
    let res = client()
        .post(api_url(base_url, "generate"))
        .json(&serde_json::json!({ "model": model, "keep_alive": 0, "stream": false }))
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(net_err)?;
    check(res).await.map(|_| ())
}

/// Loads a model into memory without generating anything. Uses Ollama's
/// default keep-alive, so the server unloads it after its idle timeout.
#[tauri::command]
pub async fn ollama_load(
    state: State<'_, OllamaState>,
    base_url: String,
    model: String,
) -> Result<(), String> {
    let res = client()
        .post(api_url(&base_url, "generate"))
        .json(&serde_json::json!({ "model": model, "stream": false }))
        .timeout(Duration::from_secs(600))
        .send()
        .await
        .map_err(net_err)?;
    check(res).await?;
    with_session(&state, &base_url, |s| {
        s.models.insert(model);
    });
    Ok(())
}

#[tauri::command]
pub async fn ollama_unload(
    state: State<'_, OllamaState>,
    base_url: String,
    model: String,
) -> Result<(), String> {
    unload_request(&base_url, &model).await?;
    with_session(&state, &base_url, |s| {
        s.models.remove(&model);
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// Model download
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct PullProgress {
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub digest: Option<String>,
    #[serde(default)]
    pub total: Option<u64>,
    #[serde(default)]
    pub completed: Option<u64>,
    #[serde(default, skip_serializing)]
    pub error: Option<String>,
}

/// Splits complete NDJSON lines off the front of `buf`, leaving any trailing
/// partial line in place for the next chunk.
fn drain_lines(buf: &mut Vec<u8>) -> Vec<String> {
    let mut lines = Vec::new();
    while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
        let line: Vec<u8> = buf.drain(..=pos).collect();
        let text = String::from_utf8_lossy(&line).trim().to_string();
        if !text.is_empty() {
            lines.push(text);
        }
    }
    lines
}

fn handle_line(line: &str, on_progress: &Channel<PullProgress>) -> Result<(), String> {
    let Ok(progress) = serde_json::from_str::<PullProgress>(line) else {
        return Ok(());
    };
    if let Some(error) = progress.error {
        return Err(error);
    }
    let _ = on_progress.send(progress);
    Ok(())
}

struct PullGuard<'a>(&'a OllamaState);

impl Drop for PullGuard<'_> {
    fn drop(&mut self) {
        self.0.pull_active.store(false, Ordering::SeqCst);
    }
}

/// Downloads a model, streaming progress. Ollama keeps partial layers, so a
/// cancelled pull resumes where it left off next time.
#[tauri::command]
pub async fn ollama_pull(
    state: State<'_, OllamaState>,
    base_url: String,
    model: String,
    on_progress: Channel<PullProgress>,
) -> Result<(), String> {
    if state.pull_active.swap(true, Ordering::SeqCst) {
        return Err("Another model download is already in progress.".to_string());
    }
    let _guard = PullGuard(&state);
    state.pull_cancel.store(false, Ordering::SeqCst);

    let res = client()
        .post(api_url(&base_url, "pull"))
        .json(&serde_json::json!({ "model": model, "stream": true }))
        .send()
        .await
        .map_err(net_err)?;
    let mut res = check(res).await?;

    let mut buf = Vec::new();
    while let Some(chunk) = res.chunk().await.map_err(net_err)? {
        if state.pull_cancel.load(Ordering::SeqCst) {
            return Err("cancelled".to_string());
        }
        buf.extend_from_slice(&chunk);
        for line in drain_lines(&mut buf) {
            handle_line(&line, &on_progress)?;
        }
    }
    let tail = String::from_utf8_lossy(&buf).trim().to_string();
    if !tail.is_empty() {
        handle_line(&tail, &on_progress)?;
    }
    Ok(())
}

#[tauri::command]
pub fn ollama_pull_cancel(state: State<'_, OllamaState>) {
    state.pull_cancel.store(true, Ordering::SeqCst);
}

// ---------------------------------------------------------------------------
// Local server (this machine only)
// ---------------------------------------------------------------------------

fn binary_name() -> &'static str {
    if cfg!(windows) {
        "ollama.exe"
    } else {
        "ollama"
    }
}

/// PATH first, then default install locations — GUI apps (notably on macOS)
/// often don't inherit the shell's PATH.
fn candidate_paths(path_var: Option<std::ffi::OsString>) -> Vec<PathBuf> {
    let mut paths: Vec<PathBuf> = path_var
        .map(|p| std::env::split_paths(&p).map(|dir| dir.join(binary_name())).collect())
        .unwrap_or_default();
    if cfg!(windows) {
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            paths.push(PathBuf::from(local).join("Programs").join("Ollama").join("ollama.exe"));
        }
    } else if cfg!(target_os = "macos") {
        paths.push(PathBuf::from("/Applications/Ollama.app/Contents/Resources/ollama"));
        paths.push(PathBuf::from("/usr/local/bin/ollama"));
        paths.push(PathBuf::from("/opt/homebrew/bin/ollama"));
    } else {
        paths.push(PathBuf::from("/usr/local/bin/ollama"));
        paths.push(PathBuf::from("/usr/bin/ollama"));
        paths.push(PathBuf::from("/snap/bin/ollama"));
    }
    paths
}

fn find_binary() -> Option<PathBuf> {
    candidate_paths(std::env::var_os("PATH"))
        .into_iter()
        .find(|p| p.is_file())
}

async fn local_server_up() -> bool {
    client()
        .get(api_url(LOCAL_URL, "version"))
        .timeout(Duration::from_secs(2))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

/// True while the server this app spawned is still alive (clears it if it exited).
fn owned_server_running(state: &OllamaState) -> bool {
    let Ok(mut guard) = state.server.lock() else {
        return false;
    };
    match guard.as_mut().map(|c| c.try_wait()) {
        Some(Ok(None)) => true,
        Some(_) => {
            *guard = None;
            false
        }
        None => false,
    }
}

#[derive(Serialize)]
pub struct ServerInfo {
    /// This app started the server and it is still running.
    pub owned_running: bool,
    /// Path to the `ollama` executable, if installed.
    pub binary: Option<String>,
}

#[tauri::command]
pub fn ollama_server_info(state: State<'_, OllamaState>) -> ServerInfo {
    ServerInfo {
        owned_running: owned_server_running(&state),
        binary: find_binary().map(|p| p.to_string_lossy().to_string()),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StartResult {
    Started,
    AlreadyRunning,
}

#[tauri::command]
pub async fn ollama_start_server(state: State<'_, OllamaState>) -> Result<StartResult, String> {
    if local_server_up().await {
        return Ok(StartResult::AlreadyRunning);
    }

    if !owned_server_running(&state) {
        let binary = find_binary()
            .ok_or_else(|| "Ollama is not installed (the ollama executable was not found).".to_string())?;
        let mut command = Command::new(binary);
        command
            .arg("serve")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }
        let child = command
            .spawn()
            .map_err(|e| format!("Failed to start Ollama: {}", e))?;
        if let Ok(mut guard) = state.server.lock() {
            *guard = Some(child);
        }
    }

    let deadline = std::time::Instant::now() + START_TIMEOUT;
    while std::time::Instant::now() < deadline {
        if local_server_up().await {
            return Ok(StartResult::Started);
        }
        if !owned_server_running(&state) {
            return Err("Ollama exited right after starting (is port 11434 in use?).".to_string());
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    Err("Ollama did not become ready within 15 seconds.".to_string())
}

/// Asks the owned server to shut down gracefully (so it also stops its model
/// runner processes), falling back to a hard kill.
async fn stop_owned_server(state: &OllamaState) -> bool {
    let child = state.server.lock().ok().and_then(|mut g| g.take());
    let Some(mut child) = child else {
        return false;
    };

    #[cfg(unix)]
    {
        let _ = Command::new("kill")
            .args(["-TERM", &child.id().to_string()])
            .status();
        for _ in 0..20 {
            if matches!(child.try_wait(), Ok(Some(_))) {
                return true;
            }
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
    }

    let _ = child.kill();
    let _ = child.wait();
    true
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StopResult {
    Stopped,
    NotOwned,
}

/// Stops the server only if this app started it — never one run by a system
/// service, the Ollama tray app, or another user.
#[tauri::command]
pub async fn ollama_stop_server(state: State<'_, OllamaState>) -> Result<StopResult, String> {
    if !owned_server_running(&state) {
        return Ok(StopResult::NotOwned);
    }
    // Free memory first; a graceful stop does this too, but not a hard kill.
    if let Ok(models) = fetch_loaded(LOCAL_URL).await {
        for m in models {
            let _ = unload_request(LOCAL_URL, &m.name).await;
        }
    }
    stop_owned_server(&state).await;
    Ok(StopResult::Stopped)
}

// ---------------------------------------------------------------------------
// App exit
// ---------------------------------------------------------------------------

/// Called from the app's `RunEvent::Exit`: unloads models this session used
/// (when enabled) and stops the server this app started.
pub fn shutdown<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<OllamaState>();
    let session = state.session.lock().ok().and_then(|g| g.clone());
    tauri::async_runtime::block_on(async {
        if let Some(session) = session.filter(|s| s.unload_on_exit) {
            for model in &session.models {
                let _ = tokio::time::timeout(
                    EXIT_UNLOAD_TIMEOUT,
                    unload_request(&session.base_url, model),
                )
                .await;
            }
        }
        stop_owned_server(&state).await;
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drain_lines_keeps_partial_tail() {
        let mut buf = b"{\"status\":\"a\"}\n{\"status\":\"b\"}\n{\"sta".to_vec();
        let lines = drain_lines(&mut buf);
        assert_eq!(lines, vec!["{\"status\":\"a\"}", "{\"status\":\"b\"}"]);
        assert_eq!(buf, b"{\"sta".to_vec());

        buf.extend_from_slice(b"tus\":\"c\"}\n\n");
        assert_eq!(drain_lines(&mut buf), vec!["{\"status\":\"c\"}"]);
        assert!(buf.is_empty());
    }

    #[test]
    fn pull_progress_parses_download_and_error_lines() {
        let p: PullProgress = serde_json::from_str(
            r#"{"status":"pulling abc","digest":"sha256:abc","total":100,"completed":40}"#,
        )
        .unwrap();
        assert_eq!(p.total, Some(100));
        assert_eq!(p.completed, Some(40));
        assert!(p.error.is_none());

        let e: PullProgress = serde_json::from_str(r#"{"error":"pull model manifest: file does not exist"}"#).unwrap();
        assert_eq!(e.error.as_deref(), Some("pull model manifest: file does not exist"));
    }

    #[test]
    fn candidate_paths_search_path_before_fallbacks() {
        let dir = if cfg!(windows) { "C:\\tools" } else { "/opt/tools" };
        let paths = candidate_paths(Some(std::ffi::OsString::from(dir)));
        assert_eq!(paths[0], PathBuf::from(dir).join(binary_name()));
        assert!(paths.len() > 1, "platform fallbacks are appended");
    }
}
