/**
 * Section-by-section CV tailoring for small local models.
 *
 * Rewriting a whole CV in one pass is too much for 8B-class models: they drop roles,
 * merge sections, change dates and invent metrics. Here code owns the structure and
 * the model only rewrites small pieces, each validated and reverted when it breaks a
 * rule (Grounded-Optimization style: invariants + regenerate-or-revert):
 *
 *   header, headings, role titles/dates/locations, Technologies lines → code
 *   skills section (reorder by job relevance + chosen skills)          → code
 *   skill placement (which role each chosen skill belongs to)          → 1 small call
 *   summary                                                            → 1 call
 *   bullets of each role / project                                     → 1 call each
 *   education / extra sections when translating                        → 1 call each
 *
 * Emits the same CvStreamEvents as the single-call path, one section at a time, so the
 * store, guards and review screen work unchanged.
 */

import { z } from "zod";
import type { FinishReason, LanguageModelUsage } from "ai";
import type { CvExperience, CvProject, ParsedCv } from "@/types";
import type { GenerateStructured } from "@/lib/cv/llm-parse";
import { StructuredOutputError } from "./structured";
import { isCancelledError } from "./errors";
import { findPlaceholderViolation } from "./cv-output-guard";
import {
  containsSkill,
  findNewTechTerms,
  findUnsupportedFigures,
  monthFromName,
} from "@/lib/cv/cv-claims";
import { buildJobKeywords } from "@/lib/cv/keyword-score";
import { formatDateRange } from "@/lib/cv/formatCvAsMarkdown";
import {
  LANGUAGE_NAME,
  VOCAB,
  type CvOptimizationInput,
  type CvOutputLanguage,
} from "./cv-optimization-prompts";

export type SectionedEvent =
  | { type: "text"; text: string }
  | { type: "finish"; finishReason: FinishReason; usage: LanguageModelUsage };

const EMPTY_USAGE: LanguageModelUsage = {
  inputTokens: undefined,
  inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: undefined, cacheWriteTokens: undefined },
  outputTokens: undefined,
  outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
  totalTokens: undefined,
};

const MAX_SKILLS_PER_ROLE = 3;
const SUMMARY_MAX_WORDS = 80;
const SENIORITY_WORDS = /\b(senior|sr\.?|lead|principal|staff|head|chief|manager|director|jefe|l[ií]der|gerente)\b/i;

// ---------------------------------------------------------------------------
// Small language helpers (code-side translation of labels and dates)
// ---------------------------------------------------------------------------

const MONTH_NAMES: Record<CvOutputLanguage, { long: string[]; short: string[] }> = {
  en: {
    long: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    short: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  },
  es: {
    long: ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"],
    short: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"],
  },
};

const PRESENT_RE = /\b(present|current|currently|now|actualidad|actual|actualmente|presente|hoy)\b/i;

/** Translates month names and "Present" in a date line; digits are never touched. */
export function translateDateText(text: string, lang: CvOutputLanguage): string {
  return text
    .replace(/\p{L}+\.?/gu, (word) => {
      const month = monthFromName(word);
      if (!month) return word;
      const isShort = word.replace(/\.$/, "").length <= 4;
      return (isShort ? MONTH_NAMES[lang].short : MONTH_NAMES[lang].long)[month - 1];
    })
    .replace(PRESENT_RE, VOCAB[lang].present);
}

const LEVEL_LABELS: Record<CvOutputLanguage, Record<string, string>> = {
  en: { native: "Native", fluent: "Fluent", advanced: "Advanced", intermediate: "Intermediate", basic: "Basic" },
  es: { native: "Nativo", fluent: "Fluido", advanced: "Avanzado", intermediate: "Intermedio", basic: "Básico" },
};

// ---------------------------------------------------------------------------
// Validation shared by every rewrite call
// ---------------------------------------------------------------------------

interface RewriteContext {
  /** Full source CV markdown: the only place facts (numbers, tech) may come from. */
  sourceMd: string;
  skillsToAvoid: string[];
  experienceYears: number | null;
  /** Job-post keywords: a rewrite may only use those its source already covers. */
  jobKeywords: string[];
}

/**
 * Problems with rewritten text: invented numbers or tech, placeholders, avoided skills.
 * Tech terms must come from `localSource` (this role's own text) or `allowedSkills`:
 * a tool the candidate used elsewhere in the CV still can't move into this role.
 */
function textProblems(
  text: string,
  localSource: string,
  ctx: RewriteContext,
  allowedSkills: string[],
): string[] {
  const problems: string[] = [];
  const figures = findUnsupportedFigures(localSource, text, {
    allowedTexts: [ctx.sourceMd],
    maxYears: ctx.experienceYears,
  });
  if (figures.length > 0) {
    problems.push(`Uses numbers that are not in the source: ${figures.join(", ")}. Remove them or describe the impact in words.`);
  }
  const newTech = findNewTechTerms(localSource, text, allowedSkills.join("\n"));
  if (newTech.length > 0) {
    problems.push(`Mentions ${newTech.join(", ")}, which this part of the CV doesn't mention. Only use tools from the source text or from <skills_to_weave>.`);
  }
  const borrowed = ctx.jobKeywords.filter(
    (k) =>
      containsSkill(text, k) &&
      !containsSkill(localSource, k) &&
      !allowedSkills.some((s) => containsSkill(s, k) || containsSkill(k, s)),
  );
  if (borrowed.length > 0) {
    problems.push(`Adds job-post terms this part of the CV doesn't support: ${borrowed.join(", ")}. Keep only what the source says.`);
  }
  const avoided = ctx.skillsToAvoid.filter((s) => containsSkill(text, s) && !containsSkill(localSource, s));
  if (avoided.length > 0) problems.push(`Must not mention: ${avoided.join(", ")}.`);
  const placeholder = findPlaceholderViolation(text, 0);
  if (placeholder) problems.push(`Contains a placeholder (${placeholder}); write only real content.`);
  return problems;
}

// ---------------------------------------------------------------------------
// Prompts (compact: small models follow short numbered rules best)
// ---------------------------------------------------------------------------

function rewriteRules(lang: CvOutputLanguage, current: boolean): string {
  return `Rules:
1. Keep the facts of every bullet: the same work, scope and results. Improve the wording: start with a strong action verb, then what was done, then the outcome.
2. Numbers: use only numbers that appear in the source bullets. Never add, change or round one. When a bullet has no metric, describe the impact in words.
3. Never add employers, projects, tools or responsibilities that the bullets don't mention — except the skills in <skills_to_weave>: attach each to the one existing bullet where it fits best (at most one per bullet).
4. When a bullet mentions something from <job_keywords>, use the keyword's exact spelling.
5. Write in ${LANGUAGE_NAME[lang]}, ${current ? "present tense (current role)" : "past tense"}, no "I" or "my", no clichés ("results-driven", "passionate"), at most 30 words per bullet.`;
}

const BULLET_EXAMPLE = `Example:
<bullets>
1. Worked on the payments backend in Java and Postgres, reducing failed transactions by 30%.
</bullets>
<job_keywords>PostgreSQL, Spring Boot, microservices</job_keywords>
<skills_to_weave>Docker</skills_to_weave>
Answer:
{"bullets":["Reduced failed transactions by 30% by hardening the Java payments backend on PostgreSQL, packaged as Docker containers"]}`;

function entrySystem(lang: CvOutputLanguage, current: boolean, translateHeader: boolean): string {
  const header = translateHeader
    ? `\n6. title: the job title translated into ${LANGUAGE_NAME[lang]} with the same meaning and seniority (never add "Senior", "Lead"…). description: the description translated, or "" when there is none.`
    : "";
  return `You rewrite the bullet points of one entry of a CV so it reads well for a target job, without changing any fact.

${rewriteRules(lang, current)}${header}

${BULLET_EXAMPLE}`;
}

function bulletsSchema(count: number, translateHeader: boolean) {
  const min = Math.max(1, count - 1);
  const max = Math.max(1, count + 1);
  const bullets = z
    .array(z.string())
    .min(min)
    .max(max)
    .describe(`The rewritten bullets, in the best order for the target job (${min}-${max} items)`);
  return translateHeader
    ? z.object({ title: z.string(), description: z.string(), bullets })
    : z.object({ bullets });
}

function numbered(items: string[]): string {
  return items.map((item, i) => `${i + 1}. ${item}`).join("\n");
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export interface SectionedTailorDeps {
  generate: GenerateStructured;
  abortSignal?: AbortSignal;
  /** Called when a piece fell back to the source text (for logs / notes). */
  onFallback?: (what: string, problems: string[]) => void;
}

async function attempt<T>(
  what: string,
  deps: SectionedTailorDeps,
  run: () => Promise<T>,
): Promise<T | null> {
  try {
    return await run();
  } catch (err) {
    if (isCancelledError(err)) throw err;
    deps.onFallback?.(what, err instanceof StructuredOutputError ? err.problems : [String(err)]);
    return null;
  }
}

function sourceHeader(sourceMd: string): string {
  const firstSection = sourceMd.search(/^##\s/m);
  return (firstSection >= 0 ? sourceMd.slice(0, firstSection) : sourceMd).trim();
}

function roleHeading(title: string, company: string, lang: CvOutputLanguage): string {
  const v = VOCAB[lang];
  return title && company ? `${title} ${v.roleConnector} ${company}` : title || company || "—";
}

function dateLine(start: string, end: string | null, location: string, lang: CvOutputLanguage, translate: boolean): string {
  let dates = formatDateRange(start ?? "", end ?? null, "experience");
  if (translate) dates = translateDateText(dates, lang);
  else if (end === null || end === undefined) dates = dates.replace(/\bPresent$/, VOCAB[lang].present);
  if (dates && location) return `*${dates}* | ${location}`;
  if (dates) return `*${dates}*`;
  return location ? `*${location}*` : "";
}

/** Skills ordered by job relevance (keywords first, by weight), then the rest in CV order. */
function orderByRelevance(skills: string[], keywords: Array<{ keyword: string; weight: number }>): string[] {
  const score = (skill: string) => {
    const hit = keywords.find((k) => containsSkill(skill, k.keyword) || containsSkill(k.keyword, skill));
    return hit ? hit.weight : 0;
  };
  return skills
    .map((skill, i) => ({ skill, i, s: score(skill) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.skill);
}

export async function* streamSectionedTailoring(
  input: CvOptimizationInput & { sourceCv: ParsedCv },
  deps: SectionedTailorDeps,
): AsyncGenerator<SectionedEvent> {
  const { generate, abortSignal } = deps;
  const cv = input.sourceCv;
  const lang = input.outputLanguage;
  const v = VOCAB[lang];
  const translating = Boolean(input.sourceLanguage && input.sourceLanguage !== lang);
  const keywords = buildJobKeywords(input.job, input.analysis);
  const ctx: RewriteContext = {
    sourceMd: input.sourceMarkdown,
    skillsToAvoid: input.skillsToAvoid,
    experienceYears: input.experienceYears,
    jobKeywords: keywords.map((k) => k.keyword),
  };
  const keywordList = keywords.slice(0, 15).map((k) => k.keyword).join(", ") || "(none)";
  const toWeave = input.skillsToAdd.filter((s) => s.importance !== "nice_to_have").map((s) => s.skill);

  // ── Header: copied verbatim ────────────────────────────────────────────────
  const header = sourceHeader(input.sourceMarkdown) || `# ${input.candidateName}`;
  yield { type: "text", text: `${header}\n\n` };

  // ── Skill placement: which existing role each chosen skill attaches to ─────
  const roles = cv.experience.filter((e) => e.title || e.company || e.achievements.length);
  const placement = new Map<number, string[]>();
  if (toWeave.length > 0 && roles.length > 0) {
    const placementSchema = z.object({
      placements: z.array(
        z.object({
          skill: z.string(),
          role: z.number().int().nullable().describe("Role number from <roles>, or null when no role fits"),
        }),
      ),
    });
    const rolesText = roles
      .map((r, i) => `${i + 1}. ${roleHeading(r.title, r.company, "en")}: ${r.achievements.slice(0, 4).join(" / ").slice(0, 400)}`)
      .join("\n");
    const result = await attempt("skill placement", deps, () =>
      generate({
        schema: placementSchema,
        schemaName: "SkillPlacement",
        system: `You decide where a candidate's CV should mention each skill. Pick the role whose existing work is most plausibly related to the skill (prefer recent roles). Use null when no role is related. Answer with the role numbers from <roles>.`,
        prompt: `<roles>\n${rolesText}\n</roles>\n\n<skills>\n${toWeave.join("\n")}\n</skills>\n\nFor each skill in <skills>, choose the related role.`,
        maxOutputTokens: 600,
        abortSignal,
        validate: (value) => {
          const problems: string[] = [];
          for (const p of value.placements) {
            if (!toWeave.some((s) => s.toLowerCase() === p.skill.toLowerCase())) problems.push(`"${p.skill}" is not in <skills>.`);
            if (p.role !== null && (p.role < 1 || p.role > roles.length)) problems.push(`role ${p.role} doesn't exist (1-${roles.length}).`);
          }
          return problems;
        },
      }),
    );
    for (const skill of toWeave) {
      const chosen = result?.placements.find((p) => p.skill.toLowerCase() === skill.toLowerCase());
      // Fallback: the most recent role.
      const index = chosen ? chosen.role : 1;
      if (index === null) continue;
      const list = placement.get(index - 1) ?? [];
      if (list.length < MAX_SKILLS_PER_ROLE) placement.set(index - 1, [...list, skill]);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const summarySource = cv.summary.trim();
  const summaryResult = await attempt("summary", deps, () =>
    generate({
      schema: z.object({ summary: z.string().describe(`3-4 sentences, at most ${SUMMARY_MAX_WORDS} words`) }),
      schemaName: "CvSummary",
      system: `You write the professional summary at the top of a CV, tailored to a target job.

Rules:
1. 3-4 sentences, at most ${SUMMARY_MAX_WORDS} words, in ${LANGUAGE_NAME[lang]}, no "I" or "my", no clichés ("results-driven", "passionate").
2. Say who the candidate is (role and years of experience), their core strengths for the target job, and their value.
3. Use only facts from <source_summary> and <cv_facts>. Numbers only when they appear there; years of experience only as "${input.experienceYears ?? "N"}+ years" if <cv_facts> gives them.
4. Mention the most relevant skills from <job_keywords> that the candidate has, spelled exactly as in <job_keywords>.
5. Never mention the target company's name.`,
      prompt: `<source_summary>
${summarySource || "(none)"}
</source_summary>

<cv_facts>
experience_years: ${input.experienceYears ?? "unknown"}
roles: ${roles.slice(0, 5).map((r) => roleHeading(r.title, r.company, "en")).join("; ")}
skills: ${[...cv.skills.technical, ...toWeave].slice(0, 30).join(", ")}
</cv_facts>

<job_keywords>
${keywordList}
</job_keywords>

<target_role>${input.job.title}</target_role>

Write the tailored summary.`,
      maxOutputTokens: 600,
      abortSignal,
      validate: (value) => {
        const problems = textProblems(value.summary, `${summarySource}\n${input.sourceMarkdown}`, ctx, toWeave);
        const words = value.summary.trim().split(/\s+/).length;
        if (words > SUMMARY_MAX_WORDS + 10) problems.push(`The summary has ${words} words; keep it under ${SUMMARY_MAX_WORDS}.`);
        const company = (input.job.company_name ?? "").trim();
        if (company.length > 2 && containsSkill(value.summary, company)) problems.push(`Don't mention the target company (${company}).`);
        return problems;
      },
    }),
  );
  const summary = summaryResult?.summary.trim() || summarySource;
  if (summary) yield { type: "text", text: `## ${v.summary}\n\n${summary}\n\n` };

  // ── Skills: deterministic ───────────────────────────────────────────────────
  const technical = orderByRelevance(cv.skills.technical, keywords);
  for (const skill of input.skillsToAdd.map((s) => s.skill)) {
    if (!technical.some((t) => containsSkill(t, skill) || containsSkill(skill, t))) technical.push(skill);
  }
  const skillLines = [
    technical.length ? `**${v.technical}:** ${technical.join(", ")}` : "",
    cv.skills.soft.length ? `**${v.soft}:** ${cv.skills.soft.join(", ")}` : "",
  ].filter(Boolean);
  if (skillLines.length) yield { type: "text", text: `## ${v.skills}\n\n${skillLines.join("\n")}\n\n` };

  // ── Entries (roles, projects): one call each ────────────────────────────────
  async function rewriteEntry(
    label: string,
    entry: { title: string; description: string; achievements: string[]; technologies: string[] },
    skills: string[],
    current: boolean,
    headerText: string,
  ): Promise<{ title: string; description: string; bullets: string[] }> {
    const source = { title: entry.title, description: entry.description, bullets: entry.achievements };
    if (entry.achievements.length === 0 && !(translating && (entry.title || entry.description))) return source;
    const count = entry.achievements.length;
    const localSource = [entry.title, entry.description, ...entry.achievements, entry.technologies.join(", ")].join("\n");
    const schema = bulletsSchema(count, translating);
    const result = await attempt(label, deps, () =>
      generate({
        schema,
        schemaName: "CvBullets",
        system: entrySystem(lang, current, translating),
        prompt: `<entry>${headerText}</entry>
${translating ? `\n<title>${entry.title}</title>\n<description>${entry.description || "(none)"}</description>\n` : ""}
<bullets>
${numbered(entry.achievements) || "(none)"}
</bullets>

<job_keywords>${keywordList}</job_keywords>
<skills_to_weave>${skills.join(", ") || "(none)"}</skills_to_weave>

Rewrite the ${count} bullets in <bullets>${translating ? ` and translate the title and description into ${LANGUAGE_NAME[lang]}` : ""}.`,
        maxOutputTokens: 400 + count * 120,
        abortSignal,
        validate: (value) => {
          const out = value as { bullets: string[]; title?: string; description?: string };
          const text = [out.title ?? "", out.description ?? "", ...out.bullets].join("\n");
          const problems = textProblems(text, localSource, ctx, skills);
          if (out.title !== undefined && SENIORITY_WORDS.test(out.title) && !SENIORITY_WORDS.test(entry.title)) {
            problems.push(`The title adds a seniority word; translate "${entry.title}" without changing its level.`);
          }
          const tooLong = out.bullets.filter((b) => b.split(/\s+/).length > 40);
          if (tooLong.length) problems.push(`${tooLong.length} bullet(s) exceed 30 words; shorten them.`);
          return problems;
        },
      }),
    );
    if (!result) return source;
    const out = result as { bullets: string[]; title?: string; description?: string };
    return {
      title: out.title?.trim() || entry.title,
      description: out.description !== undefined ? out.description.trim() : entry.description,
      bullets: out.bullets.map((b) => b.trim().replace(/^[-•*]\s*/, "")).filter(Boolean),
    };
  }

  function renderEntry(heading: string, meta: string, description: string, bullets: string[], technologies: string[]): string {
    return [
      [`### ${heading}`, meta].filter(Boolean).join("\n"),
      description,
      bullets.map((b) => `- ${b}`).join("\n"),
      technologies.length ? `**${v.technologies}:** ${technologies.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (roles.length > 0) {
    yield { type: "text", text: `## ${v.experience}\n\n` };
    for (const [i, role] of roles.entries()) {
      const skills = placement.get(i) ?? [];
      const current = role.end_date === null || role.end_date === undefined || /present|actual/i.test(role.end_date ?? "");
      const rewritten = await rewriteEntry(
        `role ${i + 1}`,
        role,
        skills,
        current,
        `${roleHeading(role.title, role.company, "en")} (${formatDateRange(role.start_date, role.end_date, "experience")})`,
      );
      const technologies = [...role.technologies];
      for (const skill of skills) {
        if (!technologies.some((t) => containsSkill(t, skill))) technologies.push(skill);
      }
      const block = renderEntry(
        roleHeading(rewritten.title, role.company, lang),
        dateLine(role.start_date, role.end_date, role.location, lang, translating),
        rewritten.description,
        rewritten.bullets,
        technologies,
      );
      yield { type: "text", text: `${block}\n\n` };
    }
  }

  const projects = cv.projects.filter((p: CvProject) => p.name || p.achievements.length || p.description);
  if (projects.length > 0) {
    yield { type: "text", text: `## ${v.projects}\n\n` };
    for (const [i, project] of projects.entries()) {
      const rewritten = await rewriteEntry(
        `project ${i + 1}`,
        { title: project.name, description: project.description, achievements: project.achievements, technologies: project.technologies },
        [],
        false,
        project.name,
      );
      // Project names are proper names: never translated.
      const block = renderEntry(project.name || "—", project.url, rewritten.description, rewritten.bullets, project.technologies);
      yield { type: "text", text: `${block}\n\n` };
    }
  }

  // ── Education, certifications, languages, extra sections ─────────────────────
  async function translateBlock(label: string, text: string): Promise<string> {
    if (!translating || !text.trim()) return text;
    const result = await attempt(label, deps, () =>
      generate({
        schema: z.object({ text: z.string() }),
        schemaName: "CvTranslation",
        system: `You translate a part of a CV into ${LANGUAGE_NAME[lang]}. Keep the markdown formatting, line breaks, names of institutions, companies, products, technologies and certifications exactly as they are. Translate faithfully: add nothing, remove nothing, never change a number or a date's digits.`,
        prompt: `<text>\n${text}\n</text>\n\nTranslate <text> into ${LANGUAGE_NAME[lang]}.`,
        maxOutputTokens: 200 + Math.ceil(text.length / 2),
        abortSignal,
        validate: (value) => textProblems(value.text, text, ctx, []),
      }),
    );
    return result?.text.trim() || text;
  }

  if (cv.education.length > 0) {
    const connector = lang === "es" ? "en" : "in";
    const blocks = cv.education
      .map((edu) => {
        const heading = edu.degree && edu.field ? `${edu.degree} ${connector} ${edu.field}` : edu.degree || edu.field || "—";
        let dates = formatDateRange(edu.start_date ?? "", edu.end_date ?? "", "education");
        if (translating) dates = translateDateText(dates, lang);
        const meta = [edu.institution ? `*${edu.institution}*` : "", edu.location, dates].filter(Boolean).join(" | ");
        const honors = edu.honors.length ? `Honors: ${edu.honors.join(", ")}` : "";
        return [`### ${heading}`, meta, honors].filter(Boolean).join("\n");
      })
      .join("\n\n");
    yield { type: "text", text: `## ${v.education}\n\n${await translateBlock("education", blocks)}\n\n` };
  }

  if (cv.certifications.length > 0) {
    yield { type: "text", text: `## ${v.certifications}\n\n${cv.certifications.map((c) => `- ${c}`).join("\n")}\n\n` };
  }

  if (cv.languages.length > 0) {
    const lines = cv.languages.map((l) => {
      const level = LEVEL_LABELS[lang][l.level] ?? l.level;
      return `- ${l.name}: ${level}${l.certification ? ` (${l.certification})` : ""}`;
    });
    yield { type: "text", text: `## ${v.languages}\n\n${await translateBlock("languages", lines.join("\n"))}\n\n` };
  }

  for (const [i, extra] of (cv.extra_sections ?? []).entries()) {
    if (!extra.body.trim()) continue;
    const translated = await translateBlock(`extra section ${i + 1}`, `## ${extra.heading}\n\n${extra.body.trim()}`);
    yield { type: "text", text: `${translated.startsWith("## ") ? translated : `## ${extra.heading}\n\n${translated}`}\n\n` };
  }

  yield { type: "finish", finishReason: "stop", usage: EMPTY_USAGE };
}

/** True when a role list has content worth the sectioned path (otherwise use one call). */
export function canTailorBySection(cv: ParsedCv | undefined): cv is ParsedCv {
  return Boolean(cv && cv.experience.some((e: CvExperience) => e.achievements.length > 0));
}
