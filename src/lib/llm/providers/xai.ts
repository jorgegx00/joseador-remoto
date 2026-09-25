import { createXai } from "@ai-sdk/xai";
import type { LlmProviderInfo } from "./base";

export function createXaiModel(apiKey: string, model: string) {
  const provider = createXai({ apiKey });
  return provider(model);
}

export const xaiInfo: LlmProviderInfo = {
  name: "xai",
  displayName: "xAI",
  description: "Grok models from xAI. Good reasoning and real-time knowledge.",
  website: "https://x.ai",
  pricingUrl: "https://x.ai",
  requiresApiKey: true,
  defaultModels: [
    {
      id: "grok-4.3",
      name: "Grok 4.3",
      description: "Flagship model, recommended for most tasks",
    },
    {
      id: "grok-4.20-0309-reasoning",
      name: "Grok 4.20 Reasoning",
      description: "Advanced reasoning with 1M context",
    },
  ],
};
