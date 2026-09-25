import { describe, it, expect } from "vitest";
import { APICallError, RetryError } from "ai";
import {
  describeLlmError,
  isCancelledError,
  CancelledError,
  LlmRequestError,
} from "@/lib/llm/errors";

function apiError(statusCode: number, message: string, responseBody = ""): APICallError {
  return new APICallError({
    message,
    url: "https://api.example.com",
    requestBodyValues: {},
    statusCode,
    responseBody,
  });
}

describe("describeLlmError", () => {
  it("classifies HTTP status codes", () => {
    expect(describeLlmError(apiError(401, "Unauthorized")).code).toBe("auth");
    expect(describeLlmError(apiError(429, "Too Many Requests")).code).toBe("rate_limit");
    expect(describeLlmError(apiError(404, "model gpt-9 not found")).code).toBe("model_not_found");
  });

  it("detects context-length errors from the response body", () => {
    const err = apiError(400, "Bad Request", '{"error":"This model\'s maximum context length is 8192 tokens"}');
    expect(describeLlmError(err).code).toBe("context_length");
  });

  it("unwraps RetryError", () => {
    const inner = apiError(429, "rate limited");
    const err = new RetryError({ message: "failed after 3 attempts", reason: "maxRetriesExceeded", errors: [inner] });
    const d = describeLlmError(err);
    expect(d.code).toBe("rate_limit");
    expect(d.retryable).toBe(true);
  });

  it("classifies plain errors by message", () => {
    expect(describeLlmError(new TypeError("Failed to fetch")).code).toBe("network");
    expect(describeLlmError(new Error("Invalid API key provided")).code).toBe("auth");
    expect(describeLlmError("weird").code).toBe("unknown");
  });

  it("classifies Ollama failures", () => {
    expect(
      describeLlmError(apiError(404, "Not Found", '{"error":"model \\"qwen3:8b\\" not found, try pulling it first"}')).code,
    ).toBe("model_not_found");
    expect(describeLlmError(new Error('model "llama3.1" not found, try pulling it first')).code).toBe(
      "model_not_found",
    );
    // Tauri HTTP plugin rejects with reqwest error strings.
    expect(
      describeLlmError("error sending request for url (http://192.168.1.50:11434/api/chat)").code,
    ).toBe("network");
    expect(describeLlmError("Connection refused (os error 111)").code).toBe("network");
  });

  it("passes LlmRequestError through", () => {
    const e = new LlmRequestError({ code: "auth", message: "x", retryable: false });
    expect(describeLlmError(e)).toEqual({ code: "auth", message: "x", retryable: false });
  });
});

describe("isCancelledError", () => {
  it("recognizes cancellation", () => {
    expect(isCancelledError(new CancelledError())).toBe(true);
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(isCancelledError(abort)).toBe(true);
    expect(isCancelledError(new Error("boom"))).toBe(false);
  });
});
