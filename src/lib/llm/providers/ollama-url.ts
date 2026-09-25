import type { OllamaMode } from "@/types/settings";

export type { OllamaMode };

export const OLLAMA_DEFAULT_PORT = 11434;
export const OLLAMA_LOCAL_URL = `http://localhost:${OLLAMA_DEFAULT_PORT}`;
export const OLLAMA_CLOUD_URL = "https://ollama.com";
export const OLLAMA_DEFAULT_NUM_CTX = 16384;

/**
 * Normalizes a user-entered Ollama server address to `scheme://host[:port]`
 * (no trailing slash, no `/api` or `/v1` suffix).
 *   "192.168.1.50"              → "http://192.168.1.50:11434"
 *   "http://host:11434/api/"    → "http://host:11434"
 *   "https://ollama.com"        → "https://ollama.com"
 * Plain-http addresses without a port get Ollama's default port; https ones are
 * assumed to sit behind a reverse proxy on 443. Returns "" for blank input.
 */
export function normalizeOllamaBaseUrl(input: string): string {
  let url = input.trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  url = url.replace(/\/+$/, "").replace(/\/(api|v1)$/i, "").replace(/\/+$/, "");

  const match = /^(https?):\/\/([^/]+)(.*)$/i.exec(url);
  if (!match) return url;
  const [, scheme, authority, path] = match;
  const lowerScheme = scheme.toLowerCase();
  // IPv6 literals look like [::1] or [::1]:port — only a colon after "]" is a port.
  const hasPort = authority.startsWith("[")
    ? /\]:\d+$/.test(authority)
    : /:\d+$/.test(authority);
  const host = hasPort || lowerScheme === "https" ? authority : `${authority}:${OLLAMA_DEFAULT_PORT}`;
  return `${lowerScheme}://${host}${path}`;
}

/** Base URL actually used for a given mode; local mode ignores the stored URL. */
export function resolveOllamaBaseUrl(mode: OllamaMode, storedUrl: string): string {
  if (mode === "local") return OLLAMA_LOCAL_URL;
  const normalized = normalizeOllamaBaseUrl(storedUrl);
  if (normalized) return normalized;
  return mode === "remote" ? OLLAMA_CLOUD_URL : "";
}

/** ollama.com rejects unauthenticated requests, so a key is mandatory there. */
export function isOllamaCloudUrl(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === "ollama.com" || host.endsWith(".ollama.com");
  } catch {
    return false;
  }
}
