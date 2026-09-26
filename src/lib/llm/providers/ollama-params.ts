import type { LanguageModelMiddleware } from "ai";
import { LlmRequestError } from "../errors";
import { OLLAMA_DEFAULT_NUM_CTX } from "./ollama-url";

type CallOptions = Parameters<NonNullable<LanguageModelMiddleware["transformParams"]>>[0]["params"];

/** Rough chars-per-token for mixed English/Spanish prose; deliberately on the low side. */
const CHARS_PER_TOKEN = 3.5;
const CTX_STEP = 4096;
const MIN_NUM_CTX = 8192;
/** Output space reserved in the window when the call sets no smaller cap. */
const DEFAULT_OUTPUT_RESERVE = 4096;
const MAX_OUTPUT_RESERVE = 8192;
/** A prompt this close to the window was almost certainly truncated by Ollama. */
const TRUNCATION_MARGIN = 64;

export function estimateTokens(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/**
 * Context window for one request: prompt estimate + output reserve + 20%, rounded up
 * to a multiple of 4096 and clamped to [8192, maxNumCtx]. Sizing per request keeps
 * short calls fast (a smaller KV cache) while long CV prompts still fit.
 */
export function computeNumCtx(promptChars: number, maxOutputTokens: number | undefined, maxNumCtx: number): number {
  const reserve = Math.min(maxOutputTokens ?? DEFAULT_OUTPUT_RESERVE, MAX_OUTPUT_RESERVE);
  const needed = (estimateTokens(promptChars) + reserve) * 1.2;
  const rounded = Math.ceil(needed / CTX_STEP) * CTX_STEP;
  const ceiling = Math.max(maxNumCtx, MIN_NUM_CTX);
  return Math.min(Math.max(rounded, MIN_NUM_CTX), ceiling);
}

/** Total characters of text the model will read (system + messages). */
export function promptChars(prompt: CallOptions["prompt"]): number {
  let total = 0;
  for (const message of prompt) {
    if (typeof message.content === "string") {
      total += message.content.length;
      continue;
    }
    for (const part of message.content) {
      if (part.type === "text" || part.type === "reasoning") total += part.text.length;
      else total += JSON.stringify(part).length;
    }
  }
  return total;
}

function contextError(detail: string): LlmRequestError {
  return new LlmRequestError({
    code: "context_length",
    message: `The prompt does not fit the Ollama context window (${detail}). Increase the context size in Settings → Ollama, or use a model with a larger context.`,
    retryable: false,
  });
}

type OllamaOptions = Record<string, unknown>;

/**
 * Rewrites AI SDK call options for Ollama's native /api/chat.
 *
 * ollama-ai-provider-v2 sends temperature, top_p and max_output_tokens as top-level
 * fields, which /api/chat ignores; Ollama only reads sampling settings from
 * `options`. This moves them there (max tokens → num_predict), sizes num_ctx to the
 * prompt, and always sends `think` explicitly: thinking models otherwise pick their
 * own default and may put the whole answer in the thinking channel.
 */
export function mapOllamaParams(params: CallOptions, maxNumCtx: number): { params: CallOptions; numCtx: number } {
  const chars = promptChars(params.prompt);
  const numCtx = computeNumCtx(chars, params.maxOutputTokens, maxNumCtx);
  if (estimateTokens(chars) > numCtx * 0.95) {
    throw contextError(`~${estimateTokens(chars)} prompt tokens, num_ctx ${numCtx}`);
  }

  const ollama = (params.providerOptions?.ollama ?? {}) as { think?: boolean; options?: OllamaOptions };
  const options: OllamaOptions = { ...(ollama.options ?? {}), num_ctx: numCtx };
  if (params.temperature !== undefined) options.temperature = params.temperature;
  if (params.topP !== undefined) options.top_p = params.topP;
  if (params.topK !== undefined) options.top_k = params.topK;
  if (params.maxOutputTokens !== undefined) options.num_predict = params.maxOutputTokens;
  if (params.seed !== undefined) options.seed = params.seed;

  return {
    numCtx,
    params: {
      ...params,
      temperature: undefined,
      topP: undefined,
      topK: undefined,
      maxOutputTokens: undefined,
      seed: undefined,
      providerOptions: {
        ...params.providerOptions,
        ollama: { ...ollama, think: ollama.think ?? false, options } as never,
      },
    },
  };
}

function numCtxOf(params: CallOptions): number | undefined {
  const options = (params.providerOptions?.ollama as { options?: OllamaOptions } | undefined)?.options;
  return typeof options?.num_ctx === "number" ? options.num_ctx : undefined;
}

/** True when Ollama reports a prompt that filled the window (it truncates silently). */
export function looksTruncated(inputTokens: number | undefined, numCtx: number | undefined): boolean {
  return inputTokens !== undefined && numCtx !== undefined && inputTokens >= numCtx - TRUNCATION_MARGIN;
}

export function ollamaParamsMiddleware(maxNumCtx: number = OLLAMA_DEFAULT_NUM_CTX): LanguageModelMiddleware {
  return {
    specificationVersion: "v3",
    transformParams: async ({ params }) => mapOllamaParams(params, maxNumCtx).params,
    wrapGenerate: async ({ doGenerate, params }) => {
      const result = await doGenerate();
      const numCtx = numCtxOf(params);
      if (looksTruncated(result.usage.inputTokens.total, numCtx)) {
        throw contextError(`${result.usage.inputTokens.total} prompt tokens, num_ctx ${numCtx}`);
      }
      return result;
    },
    wrapStream: async ({ doStream, params }) => {
      const { stream, ...rest } = await doStream();
      const numCtx = numCtxOf(params);
      const checked = stream.pipeThrough(
        new TransformStream({
          transform(part, controller) {
            if (part.type === "finish" && looksTruncated(part.usage.inputTokens.total, numCtx)) {
              controller.enqueue({
                type: "error",
                error: contextError(`${part.usage.inputTokens.total} prompt tokens, num_ctx ${numCtx}`),
              });
            }
            controller.enqueue(part);
          },
        }),
      );
      return { stream: checked, ...rest };
    },
  };
}
