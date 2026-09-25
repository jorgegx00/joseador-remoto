import { storageService } from "./storage";
import {
  listOllamaModels,
  resolveOllamaBaseUrl,
  OLLAMA_DEFAULT_NUM_CTX,
} from "@/lib/llm/providers/ollama";
import type { LlmConfig, LlmProviderName, LlmProviderInfo, OllamaMode } from "@/types";

// --------------------------------------------------------------------------
// Provider information map — BYOT cloud providers + Ollama (local/LAN/remote)
// --------------------------------------------------------------------------

export const LLM_PROVIDERS: Record<LlmProviderName, LlmProviderInfo> = {
  openai: {
    name: "openai",
    displayName: "OpenAI",
    icon: "openai",
    website: "https://openai.com",
    pricingUrl: "https://openai.com/pricing",
    description: "GPT-5.5 and other models from OpenAI",
    defaultModels: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"],
    requiresApiKey: true,
  },
  anthropic: {
    name: "anthropic",
    displayName: "Anthropic",
    icon: "anthropic",
    website: "https://anthropic.com",
    pricingUrl: "https://anthropic.com/pricing",
    description: "Claude models from Anthropic",
    defaultModels: ["claude-sonnet-4-6", "claude-haiku-4-5-20251001", "claude-opus-4-8"],
    requiresApiKey: true,
  },
  google: {
    name: "google",
    displayName: "Google AI",
    icon: "google",
    website: "https://ai.google.dev",
    pricingUrl: "https://ai.google.dev/pricing",
    description: "Gemini models from Google",
    defaultModels: ["gemini-3.5-flash", "gemini-2.5-pro", "gemini-3.1-flash-lite"],
    requiresApiKey: true,
  },
  xai: {
    name: "xai",
    displayName: "xAI",
    icon: "xai",
    website: "https://x.ai",
    pricingUrl: "https://x.ai",
    description: "Grok models from xAI",
    defaultModels: ["grok-4.3", "grok-4.20-0309-reasoning"],
    requiresApiKey: true,
  },
  deepseek: {
    name: "deepseek",
    displayName: "DeepSeek",
    icon: "deepseek",
    website: "https://deepseek.com",
    pricingUrl: "https://platform.deepseek.com/pricing",
    description: "DeepSeek models - affordable and capable",
    defaultModels: ["deepseek-v4-flash", "deepseek-v4-pro"],
    requiresApiKey: true,
  },
  ollama: {
    name: "ollama",
    displayName: "Ollama",
    icon: "ollama",
    website: "https://ollama.com",
    pricingUrl: "https://ollama.com/pricing",
    description: "Open models on this machine, your local network, or Ollama Cloud",
    defaultModels: ["qwen3:8b", "llama3.1:8b", "gemma3:12b", "mistral-small"],
    requiresApiKey: false,
  },
};

// --------------------------------------------------------------------------
// Legacy model migration — stored model IDs that providers have retired are
// transparently remapped to their current replacement at read time.
// --------------------------------------------------------------------------

const LEGACY_MODEL_MAP: Record<LlmProviderName, Record<string, string>> = {
  openai: {
    "gpt-4o": "gpt-5.4",
    "gpt-4o-mini": "gpt-5.4-mini",
    "gpt-4-turbo": "gpt-5.4",
  },
  anthropic: {
    "claude-sonnet-4-20250514": "claude-sonnet-4-6",
    "claude-3-5-haiku-20241022": "claude-haiku-4-5-20251001",
  },
  google: {
    "gemini-2.0-flash": "gemini-3.5-flash",
    "gemini-2.0-flash-lite": "gemini-3.1-flash-lite",
    "gemini-1.5-flash": "gemini-3.5-flash",
    "gemini-1.5-pro": "gemini-2.5-pro",
  },
  xai: {
    "grok-2": "grok-4.3",
    "grok-2-mini": "grok-4.3",
  },
  deepseek: {
    // Per DeepSeek docs, both legacy names are modes of v4-flash
    "deepseek-chat": "deepseek-v4-flash",
    "deepseek-reasoner": "deepseek-v4-flash",
    "deepseek-coder": "deepseek-v4-flash",
  },
  // Local model tags are user-managed; never remap them.
  ollama: {},
};

export function resolveModelId(provider: LlmProviderName, model: string): string {
  return LEGACY_MODEL_MAP[provider][model] ?? model;
}

// --------------------------------------------------------------------------
// LLM service functions
// --------------------------------------------------------------------------

export async function getConfig(provider: LlmProviderName): Promise<LlmConfig> {
  const providerInfo = LLM_PROVIDERS[provider];
  const apiKey = (await storageService.getApiKey(provider)) ?? undefined;

  const model = resolveModelId(
    provider,
    (await storageService.getSetting(`llm_model_${provider}`)) ??
      providerInfo.defaultModels[0] ??
      "",
  );

  if (provider === "ollama") {
    const mode = parseOllamaMode(await storageService.getSetting("ollama_mode"));
    const numCtx = Number(await storageService.getSetting("ollama_num_ctx"));
    return {
      provider,
      model,
      baseUrl: resolveOllamaBaseUrl(mode, (await storageService.getSetting("ollama_base_url")) ?? ""),
      // Local/LAN servers don't authenticate; only send the key to remote servers.
      apiKey: mode === "remote" ? apiKey : undefined,
      numCtx: Number.isFinite(numCtx) && numCtx > 0 ? numCtx : OLLAMA_DEFAULT_NUM_CTX,
    };
  }

  return {
    provider,
    model,
    apiKey,
  };
}

export function parseOllamaMode(value: string | null | undefined): OllamaMode {
  return value === "lan" || value === "remote" ? value : "local";
}

export async function testLlmConnection(config: LlmConfig): Promise<boolean> {
  // Ollama: the server must answer /api/tags (throws with the reason otherwise).
  if (config.provider === "ollama") {
    if (!config.baseUrl) throw new Error("No Ollama server address configured.");
    await listOllamaModels(config.baseUrl, config.apiKey);
    return true;
  }
  // BYOT cloud providers: verify an API key is set.
  // The actual connection test happens through the AI SDK at call time.
  return Boolean(config.apiKey);
}
