import { describe, it, expect } from "vitest";
import type { z } from "zod";
import { sampleParsedCv } from "../fixtures/sample-cv";
import { sampleJob } from "../fixtures/sample-job";
import { formatCvAsMarkdown } from "@/lib/cv/formatCvAsMarkdown";
import { parseCvSections } from "@/lib/cv/cv-sections";
import { streamSectionedTailoring, translateDateText } from "@/lib/llm/cv-tailor-sectioned";
import { StructuredOutputError } from "@/lib/llm/structured";
import type { GenerateStructured } from "@/lib/cv/llm-parse";
import type { CvOptimizationInput } from "@/lib/llm/cv-optimization-prompts";

type Handler = (prompt: string, attempt: number) => unknown;

/**
 * Fake model: answers by schemaName, runs the pipeline's own validation and retries
 * up to 3 times like generateValidated, then throws StructuredOutputError.
 */
function fakeGenerate(handlers: Record<string, Handler>, calls: string[] = []): GenerateStructured {
  return (async <S extends z.ZodType>(opts: {
    schema: S;
    schemaName: string;
    prompt: string;
    validate?: (value: z.infer<S>) => string[];
  }) => {
    let problems: string[] = [];
    let value: z.infer<S> | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      calls.push(opts.schemaName);
      const handler = handlers[opts.schemaName];
      if (!handler) throw new Error(`no handler for ${opts.schemaName}`);
      value = opts.schema.parse(handler(opts.prompt, attempt)) as z.infer<S>;
      problems = opts.validate?.(value) ?? [];
      if (problems.length === 0) return value;
    }
    throw new StructuredOutputError(problems, value);
  }) as GenerateStructured;
}

function sourceBullets(prompt: string): string[] {
  const block = /<bullets>\n([\s\S]*?)\n<\/bullets>/.exec(prompt)?.[1] ?? "";
  return block
    .split("\n")
    .map((l) => l.replace(/^\d+\.\s*/, ""))
    .filter((l) => l && l !== "(none)");
}

const baseInput: CvOptimizationInput = {
  candidateName: sampleParsedCv.full_name,
  sourceMarkdown: formatCvAsMarkdown(sampleParsedCv),
  job: sampleJob,
  analysis: null,
  outputLanguage: "en",
  sourceLanguage: "en",
  skillsToAdd: [{ skill: "Kubernetes", importance: "critical" }],
  skillsToAvoid: ["Terraform"],
  experienceYears: 5,
};

async function collect(input: CvOptimizationInput, generate: GenerateStructured): Promise<string> {
  let md = "";
  for await (const ev of streamSectionedTailoring({ ...input, sourceCv: sampleParsedCv }, { generate })) {
    if (ev.type === "text") md += ev.text;
  }
  return md;
}

const politeHandlers: Record<string, Handler> = {
  SkillPlacement: () => ({ placements: [{ skill: "Kubernetes", role: 1 }] }),
  CvSummary: () => ({ summary: "Software engineer with 5+ years building web platforms in TypeScript and React." }),
  CvBullets: (prompt) => ({ bullets: sourceBullets(prompt).map((b) => `Improved: ${b}`) }),
};

describe("streamSectionedTailoring", () => {
  it("keeps the header, every role, heading and date line", async () => {
    const md = await collect(baseInput, fakeGenerate(politeHandlers));
    const original = parseCvSections(baseInput.sourceMarkdown, "o");
    const proposed = parseCvSections(md, "p");
    const roles = (doc: typeof original) => doc.nodes.filter((n) => n.kind === "subsection" && n.sectionType === "experience");
    expect(roles(proposed).map((n) => n.headingLine)).toEqual(roles(original).map((n) => n.headingLine));
    const header = baseInput.sourceMarkdown.slice(0, baseInput.sourceMarkdown.indexOf("## ")).trim();
    expect(header).toContain(sampleParsedCv.email);
    expect(md.startsWith(header)).toBe(true);
    expect(md).toContain("*January 2021 - Present* | Santo Domingo, DR");
    expect(md).toContain("- Improved: Reduced API response time by 40% through caching optimization");
    expect(md).toContain("## Professional Summary\n\nSoftware engineer with 5+ years");
  });

  it("adds chosen skills to the Skills section and the placed role's Technologies line", async () => {
    const md = await collect(baseInput, fakeGenerate(politeHandlers));
    expect(md).toMatch(/\*\*Technical Skills:\*\* .*Kubernetes/);
    const firstRole = md.split("### ")[1];
    expect(firstRole).toMatch(/\*\*Technologies:\*\* .*Kubernetes/);
    const secondRole = md.split("### ")[2];
    expect(secondRole).not.toContain("Kubernetes");
  });

  it("reverts a role to its source bullets when the model keeps inventing numbers", async () => {
    const calls: string[] = [];
    const md = await collect(
      baseInput,
      fakeGenerate(
        {
          ...politeHandlers,
          CvBullets: (prompt) => ({ bullets: sourceBullets(prompt).map((b) => `${b}, saving 95% of costs`) }),
        },
        calls,
      ),
    );
    expect(md).not.toContain("95%");
    expect(md).toContain("- Reduced API response time by 40% through caching optimization");
    expect(calls.filter((c) => c === "CvBullets").length).toBeGreaterThanOrEqual(3);
  });

  it("rejects avoided skills and unknown tools, and accepts a corrected retry", async () => {
    const md = await collect(
      baseInput,
      fakeGenerate({
        ...politeHandlers,
        CvBullets: (prompt, attempt) => ({
          bullets: sourceBullets(prompt).map((b) => (attempt === 0 ? `${b} with Terraform` : `Refined: ${b}`)),
        }),
      }),
    );
    expect(md).not.toContain("Terraform");
    expect(md).toContain("- Refined: Built real-time dashboard reducing manual reporting by 80%");
  });

  it("doesn't let a tool from one role move into another", async () => {
    const md = await collect(
      baseInput,
      fakeGenerate({
        ...politeHandlers,
        // Redis is in the first role only; the model keeps adding it everywhere.
        CvBullets: (prompt) => ({ bullets: sourceBullets(prompt).map((b) => `${b} backed by Redis`) }),
      }),
    );
    const secondRole = md.split("### ")[2];
    expect(secondRole).not.toContain("Redis");
    expect(secondRole).toContain("- Built real-time dashboard reducing manual reporting by 80%");
    expect(md.split("### ")[1]).toContain("backed by Redis");
  });

  it("doesn't attach job-post keywords to roles that never mention them", async () => {
    const md = await collect(
      baseInput,
      fakeGenerate({
        ...politeHandlers,
        CvBullets: (prompt) => ({ bullets: sourceBullets(prompt).map((b) => `${b} on AWS`) }),
      }),
    );
    // AWS is in the first role's technologies, not in the second role.
    expect(md.split("### ")[1]).toContain("on AWS");
    expect(md.split("### ")[2]).not.toContain("on AWS");
  });

  it("keeps the source summary when the model's summary can't be fixed", async () => {
    const md = await collect(
      baseInput,
      fakeGenerate({ ...politeHandlers, CvSummary: () => ({ summary: "Engineer who cut costs by 70%." }) }),
    );
    expect(md).toContain(sampleParsedCv.summary);
  });

  it("uses Spanish headings and dates when translating", async () => {
    const md = await collect(
      { ...baseInput, outputLanguage: "es" },
      fakeGenerate({
        ...politeHandlers,
        CvBullets: (prompt) => ({
          title: /<title>(.*)<\/title>/.exec(prompt)?.[1] === "Senior Software Engineer" ? "Ingeniero de Software Senior" : "Ingeniero de Software",
          description: "",
          bullets: sourceBullets(prompt),
        }),
        CvTranslation: (prompt) => ({ text: /<text>\n([\s\S]*)\n<\/text>/.exec(prompt)?.[1] ?? "" }),
      }),
    );
    expect(md).toContain("## Experiencia");
    expect(md).toContain("### Ingeniero de Software Senior en ABC Tech");
    expect(md).toContain("*Enero 2021 - Actualidad* | Santo Domingo, DR");
  });
});

describe("translateDateText", () => {
  it("translates month names and Present, never digits", () => {
    expect(translateDateText("January 2021 - Present", "es")).toBe("Enero 2021 - Actualidad");
    expect(translateDateText("Ene 2019 - Dic 2020", "en")).toBe("Jan 2019 - Dec 2020");
    expect(translateDateText("08/2024 - Present", "es")).toBe("08/2024 - Actualidad");
  });
});
