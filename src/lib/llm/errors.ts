import { APICallError, LoadAPIKeyError, NoSuchModelError, RetryError } from "ai";

/** Thrown when the user cancels an in-flight LLM request. Callers should treat it as a no-op. */
export class CancelledError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "CancelledError";
  }
}

export function isCancelledError(err: unknown): boolean {
  return (
    err instanceof CancelledError ||
    (err instanceof Error && err.name === "AbortError") ||
    (typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "AbortError")
  );
}

export type LlmErrorCode =
  | "auth"
  | "rate_limit"
  | "context_length"
  | "network"
  | "model_not_found"
  | "unknown";

export interface DescribedLlmError {
  code: LlmErrorCode;
  /** Provider/raw message, for details and logs. */
  message: string;
  /** Whether retrying the same request may succeed. */
  retryable: boolean;
}

/** Error carrying a classified LLM failure, thrown by the streaming service. */
export class LlmRequestError extends Error {
  readonly code: LlmErrorCode;
  readonly retryable: boolean;
  constructor(described: DescribedLlmError, cause?: unknown) {
    super(described.message);
    this.name = "LlmRequestError";
    this.code = described.code;
    this.retryable = described.retryable;
    this.cause = cause;
  }
}

const CONTEXT_LENGTH =
  /context.?length|context.?window|maximum context|too many tokens|prompt is too long|token limit|max_tokens.*exceed|input.*too long/i;
const RATE_LIMIT = /rate.?limit|quota|too many requests|resource.?exhausted|overloaded/i;
const AUTH = /api.?key|unauthori[sz]ed|authentication|permission|forbidden|invalid.*key/i;
const MODEL = /model.*(not found|does not exist|not available|unknown)|no such model/i;
// The Tauri HTTP plugin (used for Ollama) rejects with reqwest error strings
// such as "error sending request" / "Connection refused (os error 111)".
const NETWORK =
  /fetch failed|network|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timed? ?out|socket|Failed to fetch|error sending request|connection refused|dns error|did not respond/i;

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/** Classifies any error thrown by the AI SDK / providers into a user-actionable code. */
export function describeLlmError(err: unknown): DescribedLlmError {
  if (err instanceof LlmRequestError) {
    return { code: err.code, message: err.message, retryable: err.retryable };
  }
  // streamText/generateText retry transient failures and wrap the last one.
  if (RetryError.isInstance(err)) {
    const inner = describeLlmError(err.lastError);
    return { ...inner, retryable: true };
  }
  if (LoadAPIKeyError.isInstance(err)) {
    return { code: "auth", message: messageOf(err), retryable: false };
  }
  if (NoSuchModelError.isInstance(err)) {
    return { code: "model_not_found", message: messageOf(err), retryable: false };
  }

  const message = messageOf(err);
  if (APICallError.isInstance(err)) {
    const body = `${message} ${err.responseBody ?? ""}`;
    const status = err.statusCode;
    if (CONTEXT_LENGTH.test(body)) return { code: "context_length", message, retryable: false };
    if (status === 401 || status === 403) return { code: "auth", message, retryable: false };
    if (status === 429 || RATE_LIMIT.test(body)) return { code: "rate_limit", message, retryable: true };
    if (status === 404 || MODEL.test(body)) return { code: "model_not_found", message, retryable: false };
    if (status === 400 && AUTH.test(body)) return { code: "auth", message, retryable: false };
    if (status !== undefined && status >= 500) return { code: "unknown", message, retryable: true };
    return { code: "unknown", message, retryable: err.isRetryable };
  }

  if (CONTEXT_LENGTH.test(message)) return { code: "context_length", message, retryable: false };
  if (RATE_LIMIT.test(message)) return { code: "rate_limit", message, retryable: true };
  if (AUTH.test(message)) return { code: "auth", message, retryable: false };
  if (MODEL.test(message)) return { code: "model_not_found", message, retryable: false };
  if (NETWORK.test(message)) return { code: "network", message, retryable: true };
  return { code: "unknown", message, retryable: true };
}
