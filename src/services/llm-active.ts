import { useSettingsStore } from "@/stores/settingsStore";
import { getConfig } from "./llm";
import type { LlmConfig } from "@/types";

/**
 * Config of the provider selected in Settings, or null when none is configured.
 * Lives outside services/llm.ts because settingsStore imports that module.
 */
export async function getActiveLlmConfig(): Promise<LlmConfig | null> {
  const { llm } = useSettingsStore.getState();
  if (!llm.active_provider) return null;
  return getConfig(llm.active_provider);
}
