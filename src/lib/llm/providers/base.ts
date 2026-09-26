import type { LanguageModel } from "ai";
import type { LlmProviderName } from "@/types";

export interface LlmProviderConfig {
  provider: LlmProviderName;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  /** Ollama only: upper bound for num_ctx; each request is sized to its prompt up to this. */
  numCtx?: number;
}

export interface LlmProviderModelEntry {
  id: string;
  name: string;
  description: string;
}

export interface LlmProviderInfo {
  name: LlmProviderName;
  displayName: string;
  description: string;
  website: string;
  pricingUrl: string;
  requiresApiKey: boolean;
  defaultModels: LlmProviderModelEntry[];
}

export interface CreateModelResult {
  model: LanguageModel;
  info: LlmProviderInfo;
}
