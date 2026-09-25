import { useEffect, useRef } from "react";
import { useSettingsStore } from "@/stores/settingsStore";

export interface LlmAvailability {
  /** True when settings have finished loading from storage. */
  hydrated: boolean;
  /** True when an LLM provider is configured AND we know it (i.e. settings hydrated). */
  hasProvider: boolean;
  /**
   * True only when we are SURE there is no provider (settings hydrated and active_provider null).
   * Use this to decide whether to render "configure your LLM" prompts — never show that prompt
   * before hydration, otherwise users with a configured provider see a false negative on app start.
   */
  showNoProviderPrompt: boolean;
}

let inflightLoad: Promise<void> | null = null;

/**
 * Force-load settings if the store hasn't been hydrated yet. Deduplicates concurrent
 * callers (multiple components mounting at once won't fire multiple SQL queries).
 */
function ensureLoaded(): void {
  if (useSettingsStore.getState().hydrated) return;
  if (inflightLoad) return;
  console.warn("[useLlmAvailability] store not hydrated; forcing loadSettings");
  inflightLoad = useSettingsStore
    .getState()
    .loadSettings()
    .finally(() => {
      inflightLoad = null;
    });
}

export function useLlmAvailability(): LlmAvailability {
  const hydrated = useSettingsStore((s) => s.hydrated);
  const activeProvider = useSettingsStore((s) => s.llm.active_provider);
  const triedRef = useRef(false);

  useEffect(() => {
    if (!hydrated && !triedRef.current) {
      triedRef.current = true;
      ensureLoaded();
    }
  }, [hydrated]);

  const hasProvider = hydrated && activeProvider !== null;
  return {
    hydrated,
    hasProvider,
    showNoProviderPrompt: hydrated && activeProvider === null,
  };
}
