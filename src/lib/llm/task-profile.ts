import type { LlmProviderName } from "@/types";

/**
 * What a call is doing, which decides its sampling settings on local models.
 *  - extract: pull structured facts out of a document (deterministic, JSON)
 *  - rewrite: rephrase existing content (some variety, still grounded)
 *  - chat:    free-form assistant turns
 */
export type LlmTask = "extract" | "rewrite" | "chat";

export interface TaskCallSettings {
  temperature?: number;
  topP?: number;
  topK?: number;
}

/**
 * Per-task sampling for Ollama. Values follow the Ollama structured-output docs
 * (temperature 0 for JSON extraction) and the Qwen3 non-thinking recommendations
 * (T≈0.7, top_p 0.8, top_k 20) for generation. The Ollama middleware moves these
 * into `options`, where /api/chat actually reads them.
 */
const OLLAMA_PROFILES: Record<LlmTask, TaskCallSettings> = {
  extract: { temperature: 0, topK: 20 },
  rewrite: { temperature: 0.5, topP: 0.8, topK: 20 },
  chat: { temperature: 0.7, topP: 0.8, topK: 20 },
};

/**
 * Sampling settings for a call. Cloud providers get none: several of their models
 * are reasoning models that reject or ignore temperature, and their defaults are
 * already well tuned.
 */
export function taskCallSettings(provider: LlmProviderName, task: LlmTask): TaskCallSettings {
  return provider === "ollama" ? OLLAMA_PROFILES[task] : {};
}
