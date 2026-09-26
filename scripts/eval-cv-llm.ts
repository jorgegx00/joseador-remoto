/**
 * Opt-in live eval of the LLM CV parser against a local Ollama server.
 *
 *   npx tsx --tsconfig tsconfig.app.json scripts/eval-cv-llm.ts --model qwen3.5:9b
 *
 * Options:
 *   --model <name>        Ollama model (required)
 *   --base <url>          Ollama server (default http://localhost:11434)
 *   --fixture <path>      Layout lines JSON (default tests/fixtures/cv-layout/sample-resume.lines.json)
 *   --expected <path>     Expected fields JSON (default: fixture path with .expected.json)
 *   --no-heuristic        Don't give the model the rule-based parse (tests the model alone)
 *   --num-ctx <n>         Upper bound for num_ctx (default 16384)
 *   --debug               Print every model answer
 *   --tailor              Also tailor the parsed CV to a sample backend job, section by
 *                         section, and check structure and invented figures
 *
 * Not part of `npm test`: it needs a running model and takes a while.
 */

import fs from "node:fs";
import { createOllama } from "ollama-ai-provider-v2";
import { wrapLanguageModel } from "ai";
import { ollamaParamsMiddleware } from "@/lib/llm/providers/ollama-params";
import { generateValidated } from "@/lib/llm/structured";
import { taskCallSettings } from "@/lib/llm/task-profile";
import { parseCvWithLlm, type GenerateStructured } from "@/lib/cv/llm-parse";
import type { CvLayoutLine, ParsedCv } from "@/types/cv";
import { extractStructuredCv } from "../sidecar/src/parsers/cv-extractor";
import { renderCvLines } from "../sidecar/src/parsers/layout";
import { streamSectionedTailoring } from "@/lib/llm/cv-tailor-sectioned";
import { formatCvAsMarkdown } from "@/lib/cv/formatCvAsMarkdown";
import { parseCvSections } from "@/lib/cv/cv-sections";
import { computeExperienceYears, findUnsupportedFigures } from "@/lib/cv/cv-claims";
import type { Job } from "@/types";

interface Expected {
  full_name: string;
  location: string;
  email: string;
  experience: Array<{
    title: string;
    company: string;
    location: string;
    start_date: string;
    end_date: string | null;
    bullets: number;
  }>;
  education: Array<{ institution: string; location: string }>;
  languages: string[];
}

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const model = arg("model");
if (!model) {
  console.error("Usage: scripts/eval-cv-llm.ts --model <ollama model> [--base url] [--fixture path]");
  process.exit(1);
}
const base = arg("base", "http://localhost:11434")!;
const fixture = arg("fixture", "tests/fixtures/cv-layout/sample-resume.lines.json")!;
const expectedPath = arg("expected", fixture.replace(/\.lines\.json$/, ".expected.json"))!;
const useHeuristic = !process.argv.includes("--no-heuristic");
const maxNumCtx = Number(arg("num-ctx", "16384"));

const layout = JSON.parse(fs.readFileSync(fixture, "utf8")) as CvLayoutLine[];
const expected = JSON.parse(fs.readFileSync(expectedPath, "utf8")) as Expected;
const rawText = renderCvLines(layout);
const empty: ParsedCv = {
  full_name: "", email: "", phone: "", location: "", linkedin_url: "", github_url: "", portfolio_url: "",
  summary: "", skills: { technical: [], soft: [] }, experience: [], education: [], certifications: [],
  projects: [], languages: [],
};
const heuristic = useHeuristic ? (extractStructuredCv(rawText, layout) as ParsedCv) : empty;

const llm = wrapLanguageModel({
  model: createOllama({ baseURL: `${base}/api` })(model),
  middleware: ollamaParamsMiddleware(maxNumCtx),
});

let calls = 0;
const callLog: Array<{ schema: string; ms: number; ok: boolean }> = [];
const generate: GenerateStructured = async (opts) => {
  calls++;
  const started = Date.now();
  try {
    const value = await generateValidated({
      model: llm,
      ...opts,
      settings: taskCallSettings("ollama", "extract"),
      schemaInPrompt: true,
    });
    callLog.push({ schema: opts.schemaName, ms: Date.now() - started, ok: true });
    if (process.argv.includes("--debug")) console.error(`\n[${opts.schemaName}] ${JSON.stringify(value)}`);
    return value;
  } catch (err) {
    callLog.push({ schema: opts.schemaName, ms: Date.now() - started, ok: false });
    throw err;
  }
};

const started = Date.now();
const { parsed, warnings } = await parseCvWithLlm(
  { rawText, layout, heuristic },
  {
    generate,
    concurrency: 1,
    onProgress: (p) => process.stderr.write(p.step === "entries" ? `\r  entries ${p.done}/${p.total}` : "  segmenting…\n"),
  },
);
process.stderr.write("\n");

// ── Scoring ──────────────────────────────────────────────────────────────────
let checks = 0;
let passed = 0;
const failures: string[] = [];
function check(label: string, actual: unknown, want: unknown): void {
  checks++;
  if (JSON.stringify(actual) === JSON.stringify(want)) passed++;
  else failures.push(`${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(want)}`);
}

check("full_name", parsed.full_name, expected.full_name);
check("location", parsed.location, expected.location);
check("email", parsed.email, expected.email);
check("experience.length", parsed.experience.length, expected.experience.length);
expected.experience.forEach((want, i) => {
  const got = parsed.experience[i];
  for (const key of ["title", "company", "location", "start_date", "end_date"] as const) {
    check(`experience[${i}].${key}`, got ? got[key] : "(missing)", want[key]);
  }
  check(`experience[${i}].bullets`, got?.achievements.length ?? 0, want.bullets);
});
expected.education.forEach((want, i) => {
  check(`education[${i}].institution`, parsed.education[i]?.institution, want.institution);
  check(`education[${i}].location`, parsed.education[i]?.location, want.location);
});
check("languages", parsed.languages.map((l) => l.name), expected.languages);

const failedCalls = callLog.filter((c) => !c.ok).length;
console.log(`\nModel: ${model}  (heuristic hints: ${useHeuristic ? "on" : "off"})`);
console.log(`Score: ${passed}/${checks} checks (${Math.round((passed / checks) * 100)}%)`);
console.log(`Calls: ${calls} (${failedCalls} fell back)  Time: ${((Date.now() - started) / 1000).toFixed(1)}s`);
if (warnings.length) console.log(`Warnings:\n  ${warnings.join("\n  ")}`);
if (failures.length) console.log(`Failures:\n  ${failures.join("\n  ")}`);

// ── Optional: section-by-section tailoring ─────────────────────────────────────
if (process.argv.includes("--tailor")) {
  const job = {
    id: "eval-job",
    title: "Senior Backend Engineer (Java)",
    company_name: "Acme Payments",
    description:
      "We build real-time payment infrastructure. You will design Java 21 / Spring Boot microservices on AWS, " +
      "run event streaming with Apache Kafka, deploy with Kubernetes and Terraform, and own PostgreSQL data models. " +
      "Requirements: 7+ years of backend experience, Java, Spring Boot, Kafka, AWS, Kubernetes, PostgreSQL, CI/CD, " +
      "observability (Datadog). Nice to have: fintech or banking domain, Scala, gRPC.",
    skills_required: ["Java", "Spring Boot", "Kafka", "AWS", "Kubernetes", "PostgreSQL", "Terraform", "Datadog"],
    seniority_level: "senior",
    employment_type: "full_time",
  } as unknown as Job;
  const sourceMd = formatCvAsMarkdown(parsed);
  const rewrite: GenerateStructured = async (opts) => {
    calls++;
    return generateValidated({ model: llm, ...opts, settings: taskCallSettings("ollama", "rewrite"), schemaInPrompt: true });
  };
  const fallbacks: string[] = [];
  const tailorStarted = Date.now();
  let proposal = "";
  for await (const ev of streamSectionedTailoring(
    {
      candidateName: parsed.full_name,
      sourceMarkdown: sourceMd,
      job,
      analysis: null,
      outputLanguage: "en",
      sourceLanguage: "en",
      skillsToAdd: [
        { skill: "Terraform", importance: "important" },
        { skill: "Datadog", importance: "nice_to_have" },
      ],
      skillsToAvoid: ["gRPC"],
      experienceYears: computeExperienceYears(parsed),
      sourceCv: parsed,
    },
    { generate: rewrite, onFallback: (what, problems) => fallbacks.push(`${what}: ${problems.join("; ")}`) },
  )) {
    if (ev.type === "text") proposal += ev.text;
  }
  const roles = (md: string, prefix: "o" | "p") =>
    parseCvSections(md, prefix).nodes.filter((n) => n.kind === "subsection" && n.sectionType === "experience");
  const srcRoles = roles(sourceMd, "o");
  const outRoles = roles(proposal, "p");
  const sameHeadings = srcRoles.every((r, i) => outRoles[i]?.headingLine === r.headingLine);
  const sameDates = srcRoles.every((r, i) => outRoles[i]?.body.split("\n")[0] === r.body.split("\n")[0]);
  const invented = findUnsupportedFigures(sourceMd, proposal, { maxYears: computeExperienceYears(parsed) });
  console.log(`\nTailoring: ${((Date.now() - tailorStarted) / 1000).toFixed(1)}s`);
  console.log(`  roles ${outRoles.length}/${srcRoles.length}, headings ${sameHeadings ? "kept" : "CHANGED"}, date lines ${sameDates ? "kept" : "CHANGED"}`);
  console.log(`  invented figures: ${invented.length ? invented.join(", ") : "none"}`);
  console.log(`  gRPC mentioned: ${/grpc/i.test(proposal) ? "YES" : "no"}`);
  if (fallbacks.length) console.log(`  fell back to source:\n    ${fallbacks.join("\n    ")}`);
  if (process.argv.includes("--debug")) console.log(`\n${proposal}`);
}
