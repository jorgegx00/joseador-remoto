use std::collections::HashSet;
use std::process::Child;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;
use sqlx::SqlitePool;
use tauri_plugin_shell::process::CommandChild;

pub struct ScraperState {
    pub child: Mutex<Option<CommandChild>>,
}

impl Default for ScraperState {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
        }
    }
}

pub struct AppDatabase {
    pub pool: Mutex<Option<SqlitePool>>,
}

impl Default for AppDatabase {
    fn default() -> Self {
        Self {
            pool: Mutex::new(None),
        }
    }
}

/// Models this app loaded or used on an Ollama server during this session,
/// so shutdown unloads only those (never models other clients loaded).
#[derive(Clone)]
pub struct OllamaSession {
    pub base_url: String,
    pub models: HashSet<String>,
    pub unload_on_exit: bool,
}

#[derive(Default)]
pub struct OllamaState {
    /// `ollama serve` process — only set when this app spawned it.
    pub server: Mutex<Option<Child>>,
    pub session: Mutex<Option<OllamaSession>>,
    pub pull_active: AtomicBool,
    pub pull_cancel: AtomicBool,
}
