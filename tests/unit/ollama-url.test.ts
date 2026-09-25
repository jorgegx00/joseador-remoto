import { describe, it, expect } from "vitest";
import {
  normalizeOllamaBaseUrl,
  resolveOllamaBaseUrl,
  isOllamaCloudUrl,
  OLLAMA_LOCAL_URL,
  OLLAMA_CLOUD_URL,
} from "@/lib/llm/providers/ollama-url";

describe("normalizeOllamaBaseUrl", () => {
  it("adds scheme and default port to bare hosts", () => {
    expect(normalizeOllamaBaseUrl("localhost")).toBe("http://localhost:11434");
    expect(normalizeOllamaBaseUrl(" 192.168.1.50 ")).toBe("http://192.168.1.50:11434");
    expect(normalizeOllamaBaseUrl("gpu-box.lan")).toBe("http://gpu-box.lan:11434");
  });

  it("keeps explicit ports", () => {
    expect(normalizeOllamaBaseUrl("192.168.1.50:8080")).toBe("http://192.168.1.50:8080");
    expect(normalizeOllamaBaseUrl("http://[::1]:11434")).toBe("http://[::1]:11434");
  });

  it("strips trailing slashes and /api or /v1 suffixes", () => {
    expect(normalizeOllamaBaseUrl("http://host:11434/api/")).toBe("http://host:11434");
    expect(normalizeOllamaBaseUrl("http://host:11434/v1")).toBe("http://host:11434");
    expect(normalizeOllamaBaseUrl("https://proxy.example.com/ollama/")).toBe(
      "https://proxy.example.com/ollama",
    );
  });

  it("does not add a port to https URLs", () => {
    expect(normalizeOllamaBaseUrl("https://ollama.com")).toBe("https://ollama.com");
    expect(normalizeOllamaBaseUrl("HTTPS://ollama.com/api")).toBe("https://ollama.com");
  });

  it("adds the default port to IPv6 literals without one", () => {
    expect(normalizeOllamaBaseUrl("http://[::1]")).toBe("http://[::1]:11434");
  });

  it("returns empty for blank input", () => {
    expect(normalizeOllamaBaseUrl("   ")).toBe("");
  });
});

describe("resolveOllamaBaseUrl", () => {
  it("always uses localhost in local mode", () => {
    expect(resolveOllamaBaseUrl("local", "http://10.0.0.5:11434")).toBe(OLLAMA_LOCAL_URL);
  });

  it("normalizes the stored address for lan and remote", () => {
    expect(resolveOllamaBaseUrl("lan", "10.0.0.5")).toBe("http://10.0.0.5:11434");
    expect(resolveOllamaBaseUrl("remote", "https://ollama.com/")).toBe(OLLAMA_CLOUD_URL);
  });

  it("falls back to Ollama Cloud for remote and nothing for lan", () => {
    expect(resolveOllamaBaseUrl("remote", "")).toBe(OLLAMA_CLOUD_URL);
    expect(resolveOllamaBaseUrl("lan", "")).toBe("");
  });
});

describe("isOllamaCloudUrl", () => {
  it("matches ollama.com only", () => {
    expect(isOllamaCloudUrl("https://ollama.com")).toBe(true);
    expect(isOllamaCloudUrl("https://api.ollama.com")).toBe(true);
    expect(isOllamaCloudUrl("http://192.168.1.50:11434")).toBe(false);
    expect(isOllamaCloudUrl("https://notollama.com")).toBe(false);
    expect(isOllamaCloudUrl("not a url")).toBe(false);
  });
});
