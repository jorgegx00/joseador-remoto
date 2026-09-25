import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LlmProviderInfo } from "./base";

export function createGoogleModel(apiKey: string, model: string) {
  const provider = createGoogleGenerativeAI({ apiKey });
  return provider(model);
}

export const googleInfo: LlmProviderInfo = {
  name: "google",
  displayName: "Google AI",
  description:
    "Gemini models from Google. Fast, multimodal, and generous free tier.",
  website: "https://ai.google.dev",
  pricingUrl: "https://ai.google.dev/pricing",
  requiresApiKey: true,
  defaultModels: [
    {
      id: "gemini-3.5-flash",
      name: "Gemini 3.5 Flash",
      description: "Fast and capable, great for most tasks",
    },
    {
      id: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      description: "Deep reasoning for complex tasks",
    },
    {
      id: "gemini-3.1-flash-lite",
      name: "Gemini 3.1 Flash Lite",
      description: "Ultra-fast and cheapest option",
    },
  ],
};
