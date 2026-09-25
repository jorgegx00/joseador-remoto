import { createAnthropic } from "@ai-sdk/anthropic";
import type { LlmProviderInfo } from "./base";

export function createAnthropicModel(apiKey: string, model: string) {
  const provider = createAnthropic({ apiKey });
  return provider(model);
}

export const anthropicInfo: LlmProviderInfo = {
  name: "anthropic",
  displayName: "Anthropic",
  description:
    "Claude models from Anthropic. Excellent at reasoning and structured output.",
  website: "https://anthropic.com",
  pricingUrl: "https://anthropic.com/pricing",
  requiresApiKey: true,
  defaultModels: [
    {
      id: "claude-sonnet-4-6",
      name: "Claude Sonnet 4.6",
      description: "Best balance of speed and intelligence",
    },
    {
      id: "claude-haiku-4-5-20251001",
      name: "Claude Haiku 4.5",
      description: "Fastest and most affordable Claude model",
    },
    {
      id: "claude-opus-4-8",
      name: "Claude Opus 4.8",
      description: "Most capable, for complex reasoning",
    },
  ],
};
