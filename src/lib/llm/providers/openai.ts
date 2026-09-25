import { createOpenAI } from "@ai-sdk/openai";
import type { LlmProviderInfo } from "./base";

export function createOpenAIModel(apiKey: string, model: string) {
  const provider = createOpenAI({ apiKey });
  return provider(model);
}

export const openaiInfo: LlmProviderInfo = {
  name: "openai",
  displayName: "OpenAI",
  description: "GPT-5.5 and the GPT-5.4 family. Industry-leading models.",
  website: "https://openai.com",
  pricingUrl: "https://openai.com/pricing",
  requiresApiKey: true,
  defaultModels: [
    {
      id: "gpt-5.5",
      name: "GPT-5.5",
      description: "Most capable, best quality",
    },
    {
      id: "gpt-5.4",
      name: "GPT-5.4",
      description: "Affordable all-rounder for professional work",
    },
    {
      id: "gpt-5.4-mini",
      name: "GPT-5.4 Mini",
      description: "Fast and affordable",
    },
    {
      id: "gpt-5.4-nano",
      name: "GPT-5.4 Nano",
      description: "Lowest latency and cost",
    },
  ],
};
