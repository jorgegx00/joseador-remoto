import { Channel, invoke } from "@tauri-apps/api/core";

/**
 * Typed wrappers over the Rust `ollama_*` commands (src-tauri/src/commands/ollama.rs).
 * Model controls work on local and LAN servers; server start/stop is this machine only.
 */

export interface LoadedOllamaModel {
  name: string;
  size: number;
  size_vram: number;
  expires_at: string | null;
}

export interface OllamaPullProgress {
  status: string;
  digest: string | null;
  total: number | null;
  completed: number | null;
}

export interface OllamaServerInfo {
  /** This app started the server and it is still running. */
  owned_running: boolean;
  /** Path of the ollama executable, or null when not installed. */
  binary: string | null;
}

export function getLoadedModels(baseUrl: string): Promise<LoadedOllamaModel[]> {
  return invoke("ollama_ps", { baseUrl });
}

export function loadModel(baseUrl: string, model: string): Promise<void> {
  return invoke("ollama_load", { baseUrl, model });
}

export function unloadModel(baseUrl: string, model: string): Promise<void> {
  return invoke("ollama_unload", { baseUrl, model });
}

export function pullModel(
  baseUrl: string,
  model: string,
  onProgress: (progress: OllamaPullProgress) => void,
): Promise<void> {
  const channel = new Channel<OllamaPullProgress>();
  channel.onmessage = onProgress;
  return invoke("ollama_pull", { baseUrl, model, onProgress: channel });
}

export function cancelPull(): Promise<void> {
  return invoke("ollama_pull_cancel");
}

export function getServerInfo(): Promise<OllamaServerInfo> {
  return invoke("ollama_server_info");
}

export function startServer(): Promise<"started" | "already_running"> {
  return invoke("ollama_start_server");
}

export function stopServer(): Promise<"stopped" | "not_owned"> {
  return invoke("ollama_stop_server");
}

export function setSession(baseUrl: string, unloadOnExit: boolean): Promise<void> {
  return invoke("ollama_set_session", { baseUrl, unloadOnExit });
}

/** Fire-and-forget: remembers a model used for generation so exit can unload it. */
export function trackModel(baseUrl: string, model: string): void {
  try {
    invoke("ollama_track_model", { baseUrl, model }).catch(() => {});
  } catch {
    // Not running inside Tauri (e.g. unit tests).
  }
}
