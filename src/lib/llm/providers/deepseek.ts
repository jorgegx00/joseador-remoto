import { createOpenAI } from "@ai-sdk/openai";
import type { LlmProviderInfo } from "./base";

export function createDeepSeekModel(apiKey: string, model: string) {
  const provider = createOpenAI({
    baseURL: "https://api.deepseek.com",
    apiKey,
  });
  return provider(model);
}

export const deepseekInfo: LlmProviderInfo = {
  name: "deepseek",
  displayName: "DeepSeek",
  description:
    "DeepSeek models. Affordable and capable, excellent value for money.",
  website: "https://deepseek.com",
  pricingUrl: "https://platform.deepseek.com/pricing",
  requiresApiKey: true,
  defaultModels: [
    {
      id: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      description: "General-purpose model, fast and affordable",
    },
    {
      id: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      description: "Advanced model for complex tasks",
    },
  ],
};
