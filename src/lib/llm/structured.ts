import { generateObject, NoObjectGeneratedError } from "ai";
import type { LanguageModel, ModelMessage } from "ai";
import { jsonrepair } from "jsonrepair";
import { z } from "zod";
import { CancelledError } from "./errors";
import type { TaskCallSettings } from "./task-profile";

/**
 * Structured output that survives small local models.
 *
 * `generateObject` alone fails the whole feature on one malformed answer. Local models
 * (and Ollama's grammar, which some thinking models silently bypass) regularly emit
 * code fences, `<think>` blocks, trailing commas, truncated objects or a value that is
 * valid JSON but breaks the schema. This helper:
 *   1. repairs the raw text (strip think/fences, jsonrepair) before giving up,
 *   2. runs an optional semantic `validate` hook (line ranges, verbatim checks…),
 *   3. re-asks with the exact problems listed, at temperature 0, up to `maxRepairs`
 *      times, and only then throws StructuredOutputError (carrying the last object,
 *      so callers can fall back field by field).
 */

export interface GenerateValidatedOptions<S extends z.ZodType> {
  model: LanguageModel;
  schema: S;
  schemaName?: string;
  schemaDescription?: string;
  system?: string;
  prompt: string;
  /** Sampling for the first attempt (see task-profile.ts). */
  settings?: TaskCallSettings;
  maxOutputTokens?: number;
  abortSignal?: AbortSignal;
  /** Semantic checks beyond the schema. Return human-readable problems; [] means OK. */
  validate?: (value: z.infer<S>) => string[];
  /** Extra attempts after the first one. */
  maxRepairs?: number;
  /**
   * Also print the JSON schema in the prompt. Ollama recommends this: its grammar
   * constrains the tokens, but the model writes better values when it can read the
   * field descriptions.
   */
  schemaInPrompt?: boolean;
}

export class StructuredOutputError extends Error {
  readonly problems: string[];
  readonly lastValue: unknown;
  constructor(problems: string[], lastValue: unknown) {
    super(`The model returned invalid structured output: ${problems.slice(0, 5).join("; ")}`);
    this.name = "StructuredOutputError";
    this.problems = problems;
    this.lastValue = lastValue;
  }
}

/** Removes `<think>` blocks and markdown fences, then repairs the JSON syntax. */
export function repairJsonText(text: string): string {
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<think>[\s\S]*$/i, "");
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(cleaned);
  if (fenced) cleaned = fenced[1];
  const start = cleaned.search(/[{[]/);
  if (start > 0) cleaned = cleaned.slice(start);
  return jsonrepair(cleaned.trim());
}

/** Zod issues as short "path: message" lines a model can act on. */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 12).map((issue) => {
    const path = issue.path.length ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
}

type Parsed<T> = { ok: true; value: T } | { ok: false; problems: string[]; raw: string };

export function parseWithRepair<S extends z.ZodType>(schema: S, text: string): Parsed<z.infer<S>> {
  let json: unknown;
  try {
    json = JSON.parse(repairJsonText(text));
  } catch {
    return { ok: false, problems: ["The answer was not valid JSON."], raw: text };
  }
  const result = schema.safeParse(json);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, problems: formatIssues(result.error), raw: JSON.stringify(json) };
}

export function renderSchemaForPrompt(schema: z.ZodType): string {
  return JSON.stringify(z.toJSONSchema(schema, { unrepresentable: "any" }));
}

function feedbackMessage(problems: string[]): string {
  return [
    "Your previous answer has these problems:",
    ...problems.map((p) => `- ${p}`),
    "",
    "Return the complete corrected JSON object only. Keep every correct value unchanged.",
  ].join("\n");
}

export async function generateValidated<S extends z.ZodType>(
  opts: GenerateValidatedOptions<S>,
): Promise<z.infer<S>> {
  const maxRepairs = opts.maxRepairs ?? 2;
  const prompt = opts.schemaInPrompt
    ? `${opts.prompt}\n\nAnswer with one JSON object that follows this JSON schema:\n<schema>\n${renderSchemaForPrompt(opts.schema)}\n</schema>`
    : opts.prompt;
  const messages: ModelMessage[] = [{ role: "user", content: prompt }];
  let problems: string[] = [];
  let lastValue: unknown;

  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    if (opts.abortSignal?.aborted) throw new CancelledError();
    // Retries are corrections, not creative work: pin temperature where we control it.
    const settings =
      attempt === 0 || opts.settings?.temperature === undefined
        ? opts.settings
        : { ...opts.settings, temperature: 0 };

    let rawText: string;
    let candidate: Parsed<z.infer<S>>;
    try {
      const result = await generateObject({
        model: opts.model,
        schema: opts.schema,
        schemaName: opts.schemaName,
        schemaDescription: opts.schemaDescription,
        system: opts.system,
        messages,
        maxOutputTokens: opts.maxOutputTokens,
        abortSignal: opts.abortSignal,
        ...settings,
        experimental_repairText: async ({ text }) => {
          try {
            return repairJsonText(text);
          } catch {
            return null;
          }
        },
      });
      candidate = { ok: true, value: result.object as z.infer<S> };
      rawText = JSON.stringify(result.object);
    } catch (err) {
      if (opts.abortSignal?.aborted) throw new CancelledError();
      if (!NoObjectGeneratedError.isInstance(err)) throw err;
      rawText = err.text ?? "";
      candidate = parseWithRepair(opts.schema, rawText);
    }

    if (candidate.ok) {
      lastValue = candidate.value;
      problems = opts.validate?.(candidate.value) ?? [];
      if (problems.length === 0) return candidate.value;
    } else {
      problems = candidate.problems;
    }

    console.warn(`[structured:${opts.schemaName ?? "object"}] attempt ${attempt + 1} rejected:`, problems);
    messages.push(
      { role: "assistant", content: rawText || "(empty answer)" },
      { role: "user", content: feedbackMessage(problems) },
    );
  }

  throw new StructuredOutputError(problems, lastValue);
}
