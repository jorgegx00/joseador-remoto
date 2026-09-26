/**
 * Line-indexed, two-pass LLM CV parser.
 *
 *   lines ─► pass 1: segment (sections + entry ranges, one call)
 *         ─► pass 2: one small call per job / degree / project + contact block
 *         ─► code: summary, skills, languages, certifications, extra sections
 *
 * Each call sees only the lines it needs and answers with line numbers or short
 * verbatim fields that code verifies against the source, so small local models
 * can't paraphrase, invent or lose content. Anything that fails validation falls
 * back to the rule-based parse for that section or entry.
 */

import type { z } from "zod";
import type { CvExperience, CvExtraSection, CvLayoutLine, ParsedCv } from "@/types/cv";
import { StructuredOutputError } from "@/lib/llm/structured";
import { isCancelledError } from "@/lib/llm/errors";
import { buildParseLines, sliceLines, appearsIn, type ParseLine } from "./lines";
import {
  ENTRY_KINDS,
  SEGMENT_SYSTEM,
  buildSegmentPrompt,
  heuristicSegmentation,
  normalizeSegmentation,
  segmentationProblems,
  segmentationSchema,
  segmentationWarnings,
  splitMergedEntries,
  enforceKnownHeadings,
  type Section,
  type Segmentation,
} from "./segment";
import {
  CONTACT_SYSTEM,
  EDUCATION_SYSTEM,
  EXPERIENCE_SYSTEM,
  PROJECT_SYSTEM,
  buildEducation,
  buildEntryPrompt,
  buildExperience,
  buildProject,
  contactProblems,
  contactSchema,
  educationEntrySchema,
  educationProblems,
  experienceEntrySchema,
  experienceProblems,
  projectEntrySchema,
  projectProblems,
} from "./extract";
import {
  emptyParsedCv,
  extraSection,
  extractContactFields,
  joinParagraph,
  parseCertifications,
  parseLanguages,
  parseSkills,
  preferLonger,
} from "./assemble";

export { buildParseLines, renderLines } from "./lines";
export { heuristicSegmentation } from "./segment";

/** The structured-call function the parser uses (LlmService binds it to a model). */
export type GenerateStructured = <S extends z.ZodType>(opts: {
  schema: S;
  schemaName: string;
  system: string;
  prompt: string;
  validate?: (value: z.infer<S>) => string[];
  maxOutputTokens?: number;
  abortSignal?: AbortSignal;
}) => Promise<z.infer<S>>;

export type CvParseProgress =
  | { step: "segmenting" }
  | { step: "entries"; done: number; total: number };

export interface LlmCvParseInput {
  rawText: string;
  layout?: CvLayoutLine[] | null;
  /** Rule-based parse: hints for the model and per-section fallback. */
  heuristic: ParsedCv;
}

export interface LlmCvParseOptions {
  generate: GenerateStructured;
  /** Parallel entry calls. Use 1 for local models (one GPU), more for cloud APIs. */
  concurrency?: number;
  onProgress?: (progress: CvParseProgress) => void;
  abortSignal?: AbortSignal;
}

export interface LlmCvParseResult {
  parsed: ParsedCv;
  /** Sections or entries that fell back to the rule-based parse. */
  warnings: string[];
}

/**
 * Runs a structured call; on validation failure returns the last value when it passes
 * `accept`, else null. Cancellation always propagates.
 */
async function attempt<T>(run: () => Promise<T>, accept?: (value: T) => boolean): Promise<T | null> {
  try {
    return await run();
  } catch (err) {
    if (isCancelledError(err)) throw err;
    if (err instanceof StructuredOutputError && err.lastValue !== undefined && accept?.(err.lastValue as T)) {
      return err.lastValue as T;
    }
    console.warn("[llm-parse] call failed, using fallback:", err);
    return null;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function contentLines(lines: ParseLine[], section: Section): ParseLine[] {
  return sliceLines(lines, section.start_line, section.end_line).filter((l) => l.n !== section.heading_line);
}

/** The heuristic experience entry that matches these lines, as a hint string. */
function experienceGuess(entryLines: ParseLine[], heuristic: ParsedCv): { guess: string | null; match: CvExperience | null } {
  const text = entryLines.map((l) => l.text).join("\n");
  const match =
    heuristic.experience.find(
      (e) => (e.title || e.company) && appearsIn(e.title, text) && appearsIn(e.company, text),
    ) ?? null;
  if (!match) return { guess: null, match: null };
  const dates = [match.start_date, match.end_date ?? "Present"].filter(Boolean).join(" - ");
  return {
    guess: `title "${match.title}", company "${match.company}", location "${match.location}", dates "${dates}"`,
    match,
  };
}

export async function parseCvWithLlm(input: LlmCvParseInput, options: LlmCvParseOptions): Promise<LlmCvParseResult> {
  const { generate, abortSignal } = options;
  const warnings: string[] = [];
  const lines = buildParseLines(input.rawText, input.layout);
  if (lines.length === 0) return { parsed: input.heuristic, warnings: ["The CV has no text lines."] };
  const heuristic = input.heuristic;

  // ── Pass 1: sections and entry ranges ────────────────────────────────────
  options.onProgress?.({ step: "segmenting" });
  const guess = heuristicSegmentation(lines);
  // Problems code can repair (clamping, gaps, sections shorter than their entries)
  // don't cost a retry: only what survives normalization is structural.
  const structural = (seg: Segmentation) =>
    seg.sections.length === 0
      ? segmentationProblems(seg, lines.length)
      : segmentationProblems(normalizeSegmentation(seg, lines), lines.length);
  const llmSegmentation = await attempt(
    () =>
      generate({
        schema: segmentationSchema,
        schemaName: "CvStructure",
        system: SEGMENT_SYSTEM,
        prompt: buildSegmentPrompt(lines, guess),
        maxOutputTokens: 2000,
        abortSignal,
        validate: (seg) => [...structural(seg), ...segmentationWarnings(seg, lines)],
      }),
    // Advisory warnings alone don't make a segmentation unusable.
    (seg) => structural(seg).length === 0,
  );
  if (!llmSegmentation) warnings.push("Section detection fell back to the layout heuristics.");
  // Code guards what small models get wrong most: sections running past a known
  // heading, skipped lines, and several jobs merged into one entry.
  const segmentation = llmSegmentation
    ? normalizeSegmentation(
        splitMergedEntries(enforceKnownHeadings(normalizeSegmentation(llmSegmentation, lines), lines), lines),
        lines,
      )
    : normalizeSegmentation(guess, lines);

  // ── Pass 2: entries and contact, one small call each ──────────────────────
  type Job =
    | { kind: "contact"; lines: ParseLine[] }
    | { kind: "experience" | "education" | "projects"; lines: ParseLine[] };
  const jobs: Job[] = [];
  const contactSection = segmentation.sections.find((s) => s.kind === "contact");
  const contactLines = contactSection ? contentLines(lines, contactSection) : lines.slice(0, 5);
  if (contactLines.length > 0) jobs.push({ kind: "contact", lines: contactLines });
  for (const section of segmentation.sections) {
    if (!ENTRY_KINDS.has(section.kind)) continue;
    for (const entry of section.entries) {
      jobs.push({
        kind: section.kind as "experience" | "education" | "projects",
        lines: sliceLines(lines, entry.start_line, entry.end_line),
      });
    }
  }

  let done = 0;
  const total = jobs.length;
  options.onProgress?.({ step: "entries", done, total });
  const parsed = emptyParsedCv();

  const results = await mapLimit(jobs, options.concurrency ?? 1, async (job) => {
    const result = await runJob(job);
    done++;
    options.onProgress?.({ step: "entries", done, total });
    return result;
  });

  async function runJob(job: Job) {
    switch (job.kind) {
      case "contact":
        return {
          job,
          value: await attempt(
            () =>
              generate({
                schema: contactSchema,
                schemaName: "CvContact",
                system: CONTACT_SYSTEM,
                prompt: buildEntryPrompt(job.lines, "contact", null),
                maxOutputTokens: 300,
                abortSignal,
                validate: (v) => contactProblems(v, job.lines),
              }),
          ),
        };
      case "experience": {
        const { guess: hint, match } = experienceGuess(job.lines, heuristic);
        const value = await attempt(() =>
          generate({
            schema: experienceEntrySchema,
            schemaName: "CvJob",
            system: EXPERIENCE_SYSTEM,
            prompt: buildEntryPrompt(job.lines, "job", hint),
            maxOutputTokens: 1000,
            abortSignal,
            validate: (v) => experienceProblems(v, job.lines),
          }),
        );
        return { job, value, match };
      }
      case "education":
        return {
          job,
          value: await attempt(() =>
            generate({
              schema: educationEntrySchema,
              schemaName: "CvEducation",
              system: EDUCATION_SYSTEM,
              prompt: buildEntryPrompt(job.lines, "education", null),
              maxOutputTokens: 500,
              abortSignal,
              validate: (v) => educationProblems(v, job.lines),
            }),
          ),
        };
      case "projects":
        return {
          job,
          value: await attempt(() =>
            generate({
              schema: projectEntrySchema,
              schemaName: "CvProject",
              system: PROJECT_SYSTEM,
              prompt: buildEntryPrompt(job.lines, "project", null),
              maxOutputTokens: 800,
              abortSignal,
              validate: (v) => projectProblems(v, job.lines),
            }),
          ),
        };
    }
  }

  let failedEntries = 0;
  for (const result of results) {
    const { job } = result;
    switch (job.kind) {
      case "contact": {
        const value = result.value as z.infer<typeof contactSchema> | null;
        parsed.full_name = value?.full_name.trim() || heuristic.full_name;
        parsed.location = value?.location.trim() || heuristic.location;
        break;
      }
      case "experience": {
        const value = result.value as z.infer<typeof experienceEntrySchema> | null;
        const match = "match" in result ? (result.match as CvExperience | null) : null;
        if (value) parsed.experience.push(buildExperience(value, job.lines));
        else {
          failedEntries++;
          // Keep the entry: the rule-based reading of it, or at worst its raw lines.
          parsed.experience.push(
            match ?? buildExperience(
              { title: job.lines[0].text, company: "", location: "", dates: "", description_lines: [], achievement_lines: [], technologies: [] },
              job.lines,
            ),
          );
        }
        break;
      }
      case "education": {
        const value = result.value as z.infer<typeof educationEntrySchema> | null;
        if (value) parsed.education.push(buildEducation(value, job.lines));
        else failedEntries++;
        break;
      }
      case "projects": {
        const value = result.value as z.infer<typeof projectEntrySchema> | null;
        if (value) parsed.projects.push(buildProject(value, job.lines));
        else failedEntries++;
        break;
      }
    }
  }
  if (failedEntries > 0) warnings.push(`${failedEntries} entr${failedEntries === 1 ? "y" : "ies"} could not be read by the model and kept the rule-based result.`);

  // ── Deterministic sections ────────────────────────────────────────────────
  const allText = lines.map((l) => l.text).join("\n");
  const contact = extractContactFields(contactLines.map((l) => l.text).join("\n") || allText);
  parsed.email = contact.email || heuristic.email;
  parsed.phone = contact.phone || heuristic.phone;
  parsed.linkedin_url = contact.linkedin_url || heuristic.linkedin_url;
  parsed.github_url = contact.github_url || heuristic.github_url;
  parsed.portfolio_url = contact.portfolio_url || heuristic.portfolio_url;

  const extras: CvExtraSection[] = [];
  for (const section of segmentation.sections) {
    const body = contentLines(lines, section);
    switch (section.kind) {
      case "summary":
        parsed.summary = [parsed.summary, joinParagraph(body)].filter(Boolean).join(" ");
        break;
      case "skills": {
        const skills = parseSkills(body);
        parsed.skills.technical.push(...skills.technical);
        parsed.skills.soft.push(...skills.soft);
        break;
      }
      case "languages":
        parsed.languages.push(...parseLanguages(body));
        break;
      case "certifications":
        parsed.certifications.push(...parseCertifications(body));
        break;
      case "other": {
        const heading = lines.find((l) => l.n === section.heading_line)?.text ?? "Other";
        if (body.length > 0) extras.push(extraSection(heading, body));
        break;
      }
      default:
        break;
    }
  }
  if (extras.length > 0) parsed.extra_sections = extras;

  // Lists the model pipeline lost entirely keep the rule-based result.
  parsed.experience = preferLonger(parsed.experience, heuristic.experience);
  parsed.education = preferLonger(parsed.education, heuristic.education);
  parsed.projects = preferLonger(parsed.projects, heuristic.projects);
  parsed.languages = preferLonger(parsed.languages, heuristic.languages);
  parsed.certifications = preferLonger(parsed.certifications, heuristic.certifications);
  if (!parsed.summary) parsed.summary = heuristic.summary;
  if (parsed.skills.technical.length + parsed.skills.soft.length === 0) {
    const fromRoles = parsed.experience.flatMap((e) => e.technologies);
    parsed.skills = fromRoles.length > 0 ? { technical: [...new Set(fromRoles)], soft: [] } : heuristic.skills;
  }

  return { parsed, warnings };
}
