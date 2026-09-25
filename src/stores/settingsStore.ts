import { create } from "zustand";
import { storageService } from "@/services/storage";
import { testLlmConnection, getConfig, resolveModelId, parseOllamaMode } from "@/services/llm";
import {
  OLLAMA_CLOUD_URL,
  OLLAMA_DEFAULT_NUM_CTX,
  resolveOllamaBaseUrl,
} from "@/lib/llm/providers/ollama-url";
import { setSession as setOllamaSession } from "@/services/ollama-control";
import type {
  AppSettings,
  LlmSettings,
  LlmProviderName,
  LlmProviderSettings,
  OllamaSettings,
} from "@/types";

interface SettingsState {
  app: AppSettings;
  llm: LlmSettings;
  isLoading: boolean;
  /**
   * True once `loadSettings` has successfully read persisted state from storage at
   * least once. Consumers should treat `!hydrated` as "I don't yet know whether the
   * user has a provider configured — wait" instead of "no provider configured".
   */
  hydrated: boolean;
  error: string | null;

  setAppSettings: (settings: Partial<AppSettings>) => void;
  setLlmSettings: (settings: Partial<LlmSettings>) => void;
  setLanguage: (language: "es" | "en") => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  setActiveProvider: (provider: LlmProviderName | null) => void;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  saveApiKey: (provider: LlmProviderName, key: string) => Promise<void>;
  getApiKey: (provider: LlmProviderName) => Promise<string | null>;
  setActiveProviderAndModel: (provider: LlmProviderName, model: string) => Promise<void>;
  setOllamaSettings: (partial: Partial<OllamaSettings>) => Promise<void>;
  testConnection: (provider: LlmProviderName) => Promise<boolean>;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

const defaultLlmProviderSettings: LlmProviderSettings = {
  enabled: false,
  api_key_set: false,
  model: "",
};

const ALL_PROVIDERS: LlmProviderName[] = ["openai", "anthropic", "google", "xai", "deepseek", "ollama"];

const defaultOllamaSettings: OllamaSettings = {
  mode: "local",
  base_url: "",
  num_ctx: OLLAMA_DEFAULT_NUM_CTX,
  auto_load: true,
  auto_start: false,
  unload_on_exit: true,
};

/** Keeps the Rust-side Ollama session (used for unload-on-exit) in sync with settings. */
function syncOllamaSession(ollama: OllamaSettings): void {
  if (ollama.mode === "remote") return;
  const baseUrl = resolveOllamaBaseUrl(ollama.mode, ollama.base_url);
  if (!baseUrl) return;
  setOllamaSession(baseUrl, ollama.unload_on_exit).catch(() => {});
}

function persistOllamaSettings(ollama: OllamaSettings): Promise<void[]> {
  return Promise.all([
    storageService.saveSetting("ollama_mode", ollama.mode),
    storageService.saveSetting("ollama_base_url", ollama.base_url),
    storageService.saveSetting("ollama_num_ctx", String(ollama.num_ctx)),
    storageService.saveSetting("ollama_auto_load", String(ollama.auto_load)),
    storageService.saveSetting("ollama_auto_start", String(ollama.auto_start)),
    storageService.saveSetting("ollama_unload_on_exit", String(ollama.unload_on_exit)),
  ]);
}

/** Boolean setting with a default for keys that were never saved. */
function flag(value: string | undefined, fallback: boolean): boolean {
  return value === undefined ? fallback : value === "true";
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  app: {
    language: "es",
    theme: "system",
    notifications_enabled: true,
  },
  llm: {
    active_provider: null,
    active_model: "",
    providers: {
      openai: { ...defaultLlmProviderSettings },
      anthropic: { ...defaultLlmProviderSettings },
      google: { ...defaultLlmProviderSettings },
      xai: { ...defaultLlmProviderSettings },
      deepseek: { ...defaultLlmProviderSettings },
      ollama: { ...defaultLlmProviderSettings },
    },
    ollama: { ...defaultOllamaSettings },
  },
  isLoading: false,
  hydrated: false,
  error: null,

  setAppSettings: (partial) =>
    set((state) => ({ app: { ...state.app, ...partial } })),
  setLlmSettings: (partial) =>
    set((state) => ({ llm: { ...state.llm, ...partial } })),

  setLanguage: async (language) => {
    set((state) => ({ app: { ...state.app, language } }));
    await storageService.saveSetting("app_language", language);
  },

  setTheme: async (theme) => {
    set((state) => ({ app: { ...state.app, theme } }));
    await storageService.saveSetting("app_theme", theme);
  },

  setActiveProvider: (provider) =>
    set((state) => ({
      llm: { ...state.llm, active_provider: provider },
    })),

  loadSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      const allSettings = await storageService.getAllSettings();

      // Load app settings
      const appSettings: Partial<AppSettings> = {};
      if (allSettings.app_language) {
        appSettings.language = allSettings.app_language as "es" | "en";
      }
      if (allSettings.app_theme) {
        appSettings.theme = allSettings.app_theme as "light" | "dark" | "system";
      }
      if (allSettings.app_notifications_enabled !== undefined) {
        appSettings.notifications_enabled = allSettings.app_notifications_enabled === "true";
      }

      // Load LLM settings. An unknown persisted provider degrades to
      // "no provider selected" so the UI prompts a re-pick.
      const persistedProvider = allSettings.llm_active_provider ?? null;
      const activeProvider = (
        persistedProvider && ALL_PROVIDERS.includes(persistedProvider as LlmProviderName)
          ? persistedProvider
          : null
      ) as LlmProviderName | null;
      const activeModel = activeProvider
        ? resolveModelId(activeProvider, allSettings.llm_active_model ?? "")
        : "";

      const providers: Record<LlmProviderName, LlmProviderSettings> = {
        openai: { ...defaultLlmProviderSettings },
        anthropic: { ...defaultLlmProviderSettings },
        google: { ...defaultLlmProviderSettings },
        xai: { ...defaultLlmProviderSettings },
        deepseek: { ...defaultLlmProviderSettings },
        ollama: { ...defaultLlmProviderSettings },
      };

      for (const p of ALL_PROVIDERS) {
        const enabledKey = `llm_provider_${p}_enabled`;
        const modelKey = `llm_model_${p}`;
        const apiKeyKey = `api_key_${p}`;

        providers[p] = {
          enabled: allSettings[enabledKey] === "true",
          api_key_set: apiKeyKey in allSettings,
          model: resolveModelId(p, allSettings[modelKey] ?? ""),
        };
      }

      const numCtx = Number(allSettings.ollama_num_ctx);
      const ollama: OllamaSettings = {
        mode: parseOllamaMode(allSettings.ollama_mode),
        base_url: allSettings.ollama_base_url ?? "",
        num_ctx: Number.isFinite(numCtx) && numCtx > 0 ? numCtx : OLLAMA_DEFAULT_NUM_CTX,
        auto_load: flag(allSettings.ollama_auto_load, defaultOllamaSettings.auto_load),
        auto_start: flag(allSettings.ollama_auto_start, defaultOllamaSettings.auto_start),
        unload_on_exit: flag(allSettings.ollama_unload_on_exit, defaultOllamaSettings.unload_on_exit),
      };
      if (activeProvider === "ollama") syncOllamaSession(ollama);

      set((state) => ({
        app: { ...state.app, ...appSettings },
        llm: {
          active_provider: activeProvider,
          active_model: activeModel,
          providers,
          ollama,
        },
        isLoading: false,
        hydrated: true,
      }));
      console.warn(
        `[settingsStore] hydrated: active_provider=${activeProvider ?? "(none)"}, model=${activeModel || "(none)"}, settings_keys=${Object.keys(allSettings).length}`,
      );
    } catch (err) {
      console.error("[settingsStore] loadSettings failed:", err);
      set({ isLoading: false, error: String(err) });
    }
  },

  saveSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      const { app, llm } = get();

      // Save app settings
      await storageService.saveSetting("app_language", app.language);
      await storageService.saveSetting("app_theme", app.theme);
      await storageService.saveSetting("app_notifications_enabled", String(app.notifications_enabled));

      // Save LLM settings
      if (llm.active_provider) {
        await storageService.saveSetting("llm_active_provider", llm.active_provider);
      }
      await storageService.saveSetting("llm_active_model", llm.active_model);

      for (const p of ALL_PROVIDERS) {
        const providerSettings = llm.providers[p];
        await storageService.saveSetting(`llm_provider_${p}_enabled`, String(providerSettings.enabled));
        if (providerSettings.model) {
          await storageService.saveSetting(`llm_model_${p}`, providerSettings.model);
        }
      }
      await persistOllamaSettings(llm.ollama);

      set({ isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: String(err) });
    }
  },

  saveApiKey: async (provider, key) => {
    try {
      await storageService.saveApiKey(provider, key);
      set((state) => ({
        llm: {
          ...state.llm,
          providers: {
            ...state.llm.providers,
            [provider]: {
              ...state.llm.providers[provider],
              api_key_set: true,
              enabled: true,
            },
          },
        },
      }));
      await storageService.saveSetting(`llm_provider_${provider}_enabled`, "true");
    } catch (err) {
      set({ error: String(err) });
    }
  },

  getApiKey: async (provider) => {
    try {
      return await storageService.getApiKey(provider);
    } catch {
      return null;
    }
  },

  setActiveProviderAndModel: async (provider, model) => {
    set((state) => ({
      llm: {
        ...state.llm,
        active_provider: provider,
        active_model: model,
        providers: {
          ...state.llm.providers,
          [provider]: {
            ...state.llm.providers[provider],
            model,
          },
        },
      },
    }));
    if (provider === "ollama") syncOllamaSession(get().llm.ollama);
    await storageService.saveSetting("llm_active_provider", provider);
    await storageService.saveSetting("llm_active_model", model);
    await storageService.saveSetting(`llm_model_${provider}`, model);
  },

  setOllamaSettings: async (partial) => {
    const current = get().llm.ollama;
    const next: OllamaSettings = { ...current, ...partial };
    // Switching to remote with no address yet: start from Ollama Cloud.
    if (partial.mode === "remote" && !next.base_url) next.base_url = OLLAMA_CLOUD_URL;
    set((state) => ({ llm: { ...state.llm, ollama: next } }));
    syncOllamaSession(next);
    await persistOllamaSettings(next);
  },

  testConnection: async (provider) => {
    set({ isLoading: true, error: null });
    try {
      const config = await getConfig(provider);
      const success = await testLlmConnection(config);
      set({ isLoading: false });
      return success;
    } catch (err) {
      set({ isLoading: false, error: String(err) });
      return false;
    }
  },

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
