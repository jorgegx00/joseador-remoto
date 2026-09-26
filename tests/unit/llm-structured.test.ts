import { describe, it, expect } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import { z } from "zod";
import {
  generateValidated,
  parseWithRepair,
  repairJsonText,
  StructuredOutputError,
} from "@/lib/llm/structured";
import { computeNumCtx, looksTruncated, mapOllamaParams } from "@/lib/llm/providers/ollama-params";
import { taskCallSettings } from "@/lib/llm/task-profile";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};

function reply(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    finishReason: { unified: "stop" as const, raw: "stop" },
    usage,
    warnings: [],
  };
}

/** Mock that answers with `texts` in order (the array form of MockLanguageModelV3 is off by one). */
function mockModel(...texts: string[]) {
  let call = 0;
  return new MockLanguageModelV3({ doGenerate: async () => reply(texts[Math.min(call++, texts.length - 1)]) });
}

const schema = z.object({ name: z.string(), count: z.number() });

describe("repairJsonText / parseWithRepair", () => {
  it("strips think blocks, fences and trailing commas", () => {
    const raw = '<think>hmm</think>\nHere you go:\n```json\n{"name": "a", "count": 2,}\n```';
    expect(JSON.parse(repairJsonText(raw))).toEqual({ name: "a", count: 2 });
  });

  it("repairs truncated objects", () => {
    expect(JSON.parse(repairJsonText('{"name": "a", "count": 2'))).toEqual({ name: "a", count: 2 });
  });

  it("reports schema problems with their path", () => {
    const parsed = parseWithRepair(schema, '{"name": "a", "count": "two"}');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.problems[0]).toMatch(/^count:/);
  });
});

describe("generateValidated", () => {
  it("returns a repaired object without retrying", async () => {
    const model = mockModel('```json\n{"name":"a","count":1,}\n```');
    const value = await generateValidated({ model, schema, prompt: "x" });
    expect(value).toEqual({ name: "a", count: 1 });
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("retries with the schema problems and pins temperature to 0", async () => {
    const model = mockModel('{"name":"a","count":"many"}', '{"name":"a","count":3}');
    const value = await generateValidated({ model, schema, prompt: "x", settings: { temperature: 0.5 } });
    expect(value.count).toBe(3);
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(model.doGenerateCalls[0].temperature).toBe(0.5);
    expect(model.doGenerateCalls[1].temperature).toBe(0);
    const lastMessage = model.doGenerateCalls[1].prompt.at(-1);
    expect(JSON.stringify(lastMessage)).toContain("count:");
  });

  it("feeds semantic validation problems back and throws after the last attempt", async () => {
    const model = mockModel('{"name":"x","count":1}', '{"name":"x","count":1}');
    const run = generateValidated({
      model,
      schema,
      prompt: "x",
      maxRepairs: 1,
      validate: (v) => (v.name === "x" ? ["name must not be x"] : []),
    });
    await expect(run).rejects.toBeInstanceOf(StructuredOutputError);
    await run.catch((err: StructuredOutputError) => {
      expect(err.lastValue).toEqual({ name: "x", count: 1 });
      expect(err.problems).toEqual(["name must not be x"]);
    });
    expect(JSON.stringify(model.doGenerateCalls[1].prompt)).toContain("name must not be x");
  });

  it("prints the schema in the prompt when asked", async () => {
    const model = mockModel('{"name":"a","count":1}');
    await generateValidated({ model, schema, prompt: "x", schemaInPrompt: true });
    expect(JSON.stringify(model.doGenerateCalls[0].prompt)).toContain("<schema>");
  });
});

describe("Ollama params", () => {
  it("sizes num_ctx to the prompt within [8192, max]", () => {
    expect(computeNumCtx(1000, undefined, 32768)).toBe(8192);
    expect(computeNumCtx(40_000, 4096, 32768)).toBe(20480);
    expect(computeNumCtx(400_000, 4096, 32768)).toBe(32768);
  });

  it("moves sampling settings into options and sets think explicitly", () => {
    const { params, numCtx } = mapOllamaParams(
      {
        prompt: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
        temperature: 0,
        topK: 20,
        maxOutputTokens: 2000,
      },
      16384,
    );
    expect(params.temperature).toBeUndefined();
    expect(params.maxOutputTokens).toBeUndefined();
    expect(params.providerOptions?.ollama).toEqual({
      think: false,
      options: { num_ctx: numCtx, temperature: 0, top_k: 20, num_predict: 2000 },
    });
  });

  it("refuses prompts that cannot fit instead of letting Ollama truncate them", () => {
    const text = "x".repeat(200_000);
    expect(() =>
      mapOllamaParams({ prompt: [{ role: "user", content: [{ type: "text", text }] }] }, 16384),
    ).toThrow(/context window/);
  });

  it("flags responses whose prompt filled the window", () => {
    expect(looksTruncated(16380, 16384)).toBe(true);
    expect(looksTruncated(9000, 16384)).toBe(false);
    expect(looksTruncated(undefined, 16384)).toBe(false);
  });

  it("only gives sampling settings to Ollama", () => {
    expect(taskCallSettings("ollama", "extract").temperature).toBe(0);
    expect(taskCallSettings("anthropic", "extract")).toEqual({});
  });
});
