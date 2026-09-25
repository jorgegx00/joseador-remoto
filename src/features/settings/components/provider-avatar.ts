import type { LlmProviderName } from "@/types";

// Maps provider names to a representative initial letter/icon for the avatar
export const PROVIDER_INITIALS: Record<LlmProviderName, string> = {
  openai: "AI",
  anthropic: "CL",
  google: "GE",
  xai: "GK",
  deepseek: "DS",
  ollama: "OL",
};

// Maps provider names to their brand color class
export const PROVIDER_COLORS: Record<LlmProviderName, string> = {
  openai: "bg-emerald-600",
  anthropic: "bg-orange-500",
  google: "bg-blue-500",
  xai: "bg-gray-800",
  deepseek: "bg-indigo-600",
  ollama: "bg-slate-700",
};
