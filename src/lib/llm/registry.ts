import type { LanguageModel } from "ai";
import { generateText } from "ai";
import type { LlmProviderName } from "@/types";
import type { LlmProviderConfig, LlmProviderInfo } from "./providers/base";

import { createOpenAIModel, openaiInfo } from "./providers/openai";
import { createAnthropicModel, anthropicInfo } from "./providers/anthropic";
import { createGoogleModel, googleInfo } from "./providers/google";
import { createXaiModel, xaiInfo } from "./providers/xai";
import { createDeepSeekModel, deepseekInfo } from "./providers/deepseek";
import { createOllamaModel, isOllamaCloudUrl, ollamaInfo } from "./providers/ollama";
import { trackModel } from "@/services/ollama-control";

const PROVIDER_INFO_MAP: Record<LlmProviderName, LlmProviderInfo> = {
  openai: openaiInfo,
  anthropic: anthropicInfo,
  google: googleInfo,
  xai: xaiInfo,
  deepseek: deepseekInfo,
  ollama: ollamaInfo,
};

export class LlmRegistry {
  /**
   * Create a LanguageModel instance from provider configuration.
   * Throws if the provider requires an API key and none is provided.
   */
  createModel(config: LlmProviderConfig): LanguageModel {
    switch (config.provider) {
      case "openai": {
        if (!config.apiKey) {
          throw new Error("OpenAI requires an API key.");
        }
        return createOpenAIModel(config.apiKey, config.model);
      }

      case "anthropic": {
        if (!config.apiKey) {
          throw new Error("Anthropic requires an API key.");
        }
        return createAnthropicModel(config.apiKey, config.model);
      }

      case "google": {
        if (!config.apiKey) {
          throw new Error("Google AI requires an API key.");
        }
        return createGoogleModel(config.apiKey, config.model);
      }

      case "xai": {
        if (!config.apiKey) {
          throw new Error("xAI requires an API key.");
        }
        return createXaiModel(config.apiKey, config.model);
      }

      case "deepseek": {
        if (!config.apiKey) {
          throw new Error("DeepSeek requires an API key.");
        }
        return createDeepSeekModel(config.apiKey, config.model);
      }

      case "ollama": {
        if (!config.baseUrl) {
          throw new Error("Ollama requires a server address.");
        }
        if (!config.apiKey && isOllamaCloudUrl(config.baseUrl)) {
          throw new Error("Ollama Cloud requires an API key.");
        }
        // Generation loads the model implicitly; remember it so app exit can unload it.
        trackModel(config.baseUrl, config.model);
        return createOllamaModel({
          baseUrl: config.baseUrl,
          model: config.model,
          apiKey: config.apiKey,
          numCtx: config.numCtx,
        });
      }

      default: {
        const _exhaustive: never = config.provider;
        throw new Error(`Unknown provider: ${_exhaustive}`);
      }
    }
  }

  /**
   * Get metadata/info for a specific provider.
   */
  getProviderInfo(provider: LlmProviderName): LlmProviderInfo {
    return PROVIDER_INFO_MAP[provider];
  }

  /**
   * Get metadata/info for all available providers.
   */
  getAllProviders(): LlmProviderInfo[] {
    return Object.values(PROVIDER_INFO_MAP);
  }

  /**
   * Test a provider connection by sending a trivial prompt and measuring latency.
   * Returns success/failure, latency in ms, and any error message.
   */
  async testConnection(config: LlmProviderConfig): Promise<{
    success: boolean;
    latencyMs: number;
    error?: string;
    modelUsed: string;
  }> {
    const start = Date.now();
    try {
      const model = this.createModel(config);
      await generateText({
        model,
        prompt: "Say 'hello' in one word.",
        maxOutputTokens: 10,
      });
      return {
        success: true,
        latencyMs: Date.now() - start,
        modelUsed: config.model,
      };
    } catch (err) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
        modelUsed: config.model,
      };
    }
  }
}

export const llmRegistry = new LlmRegistry();
