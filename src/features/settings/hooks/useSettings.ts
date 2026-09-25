import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settingsStore";

export function useSettings() {
  const {
    app,
    llm,
    isLoading,
    error,
    loadSettings,
    setAppSettings,
    setLlmSettings,
    setLanguage,
    setTheme,
    setActiveProvider,
    saveSettings,
    saveApiKey,
    getApiKey,
    setActiveProviderAndModel,
    testConnection,
  } = useSettingsStore();

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  return {
    app,
    llm,
    isLoading,
    error,
    setAppSettings,
    setLlmSettings,
    setLanguage,
    setTheme,
    setActiveProvider,
    saveSettings,
    saveApiKey,
    getApiKey,
    setActiveProviderAndModel,
    testConnection,
  };
}
