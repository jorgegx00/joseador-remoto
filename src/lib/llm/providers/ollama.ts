import { createOllama } from "ollama-ai-provider-v2";
import { defaultSettingsMiddleware, wrapLanguageModel } from "ai";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { LlmProviderInfo } from "./base";
import { OLLAMA_DEFAULT_NUM_CTX } from "./ollama-url";

export * from "./ollama-url";

/**
 * Requests go through the Tauri HTTP plugin (Rust side) instead of the WebView's
 * fetch: Ollama only allows a fixed set of CORS origins by default, and the
 * Windows WebView origin (http://tauri.localhost) is not one of them.
 */
const ollamaFetch = tauriFetch as typeof globalThis.fetch;

function authHeaders(apiKey?: string): Record<string, string> | undefined {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined;
}

export interface OllamaModelOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
  numCtx?: number;
}

export function createOllamaModel({ baseUrl, model, apiKey, numCtx }: OllamaModelOptions) {
  const provider = createOllama({
    baseURL: `${baseUrl}/api`,
    headers: authHeaders(apiKey),
    fetch: ollamaFetch,
  });
  // Ollama's default context window is small and silently truncates long prompts
  // (a CV + job description easily exceeds it), so every call sets num_ctx.
  return wrapLanguageModel({
    model: provider(model),
    middleware: defaultSettingsMiddleware({
      settings: {
        providerOptions: {
          ollama: { options: { num_ctx: numCtx ?? OLLAMA_DEFAULT_NUM_CTX } },
        },
      },
    }),
  });
}

const LIST_TIMEOUT_MS = 5000;

/**
 * Lists the models available on an Ollama server (GET /api/tags). Doubles as the
 * connection test. Throws with a readable message when the server is unreachable
 * or rejects the request.
 */
export async function listOllamaModels(baseUrl: string, apiKey?: string): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIST_TIMEOUT_MS);
  try {
    const res = await ollamaFetch(`${baseUrl}/api/tags`, {
      headers: authHeaders(apiKey),
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Unauthorized (${res.status}): check the API key.`);
    }
    if (!res.ok) {
      throw new Error(`Ollama server responded ${res.status} ${res.statusText}`.trim());
    }
    const body = (await res.json()) as { models?: Array<{ name?: string; model?: string }> };
    return (body.models ?? [])
      .map((m) => m.name ?? m.model ?? "")
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`Ollama server at ${baseUrl} did not respond (timed out).`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const ollamaInfo: LlmProviderInfo = {
  name: "ollama",
  displayName: "Ollama",
  description:
    "Run open models on this machine, a server on your local network, or Ollama Cloud. Private, no per-token billing when self-hosted.",
  website: "https://ollama.com",
  pricingUrl: "https://ollama.com/pricing",
  requiresApiKey: false,
  // Suggestions only — the settings card lists the models actually installed on the server.
  defaultModels: [
    { id: "qwen3:8b", name: "Qwen 3 8B", description: "Strong reasoning and JSON output for its size" },
    { id: "llama3.1:8b", name: "Llama 3.1 8B", description: "Solid all-rounder for 8-16GB RAM" },
    { id: "gemma3:12b", name: "Gemma 3 12B", description: "Google's open model, good writing quality" },
    { id: "mistral-small", name: "Mistral Small", description: "Capable mid-size model (needs ~16GB+ VRAM)" },
  ],
};
