import type { LlmProviderName } from "./llm";

export interface AppSettings {
  language: "es" | "en";
  theme: "light" | "dark" | "system";
  notifications_enabled: boolean;
}

export interface LlmSettings {
  active_provider: LlmProviderName | null;
  active_model: string;
  providers: Record<LlmProviderName, LlmProviderSettings>;
  ollama: OllamaSettings;
}

/** Where the Ollama server runs: this machine, another LAN host, or a remote/cloud URL. */
export type OllamaMode = "local" | "lan" | "remote";

export interface OllamaSettings {
  mode: OllamaMode;
  /** Server address for "lan" / "remote" modes (ignored in "local" mode). */
  base_url: string;
  num_ctx: number;
  /** Load the selected model into memory as soon as it's picked (local/LAN). */
  auto_load: boolean;
  /** Start `ollama serve` when the app opens (local mode, active provider). */
  auto_start: boolean;
  /** Unload models this app used when it closes. */
  unload_on_exit: boolean;
}

export interface LlmProviderSettings {
  enabled: boolean;
  api_key_set: boolean;
  model: string;
}
