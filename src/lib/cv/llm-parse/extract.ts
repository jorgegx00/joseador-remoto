/**
 * Pass 2 of the LLM CV parser: one small call per entry (job, degree, project) and
 * one for the contact block. The model copies short fields verbatim and points at
 * bullet lines by number; code checks every field against the entry's own text and
 * rebuilds bullets from the lines, so content is never paraphrased or invented.
 */

import { z } from "zod";
import type { CvEducation, CvExperience, CvProject } from "@/types/cv";
import { findDateRange } from "@/lib/cv/cv-claims";
import { appearsIn, normalizeForMatch, renderLines, type ParseLine } from "./lines";
import { LINE_FORMAT_NOTE } from "./segment";

const lineNumbers = (what: string) => z.array(z.number().int()).describe(`Line numbers of ${what}, in order`);
const verbatim = (what: string) =>
  z.string().describe(`${what}, copied exactly from the lines; "" when the entry doesn't state it`);

export const experienceEntrySchema = z.object({
  title: verbatim("Job title (the role, e.g. \"Senior Software Engineer\")"),
  company: verbatim("Employer name (e.g. \"Acme Corp\")"),
  location: verbatim("City / country, or Remote"),
  dates: verbatim("Date range as written (e.g. \"08/2024 - Present\")"),
  description_lines: lineNumbers("a descriptive paragraph about the role or company that is not a bullet (usually none)"),
  achievement_lines: lineNumbers("achievement / responsibility lines (bullets)"),
  technologies: z
    .array(z.string())
    .describe("Technologies named in this entry (languages, frameworks, tools, platforms), copied exactly"),
});

export const educationEntrySchema = z.object({
  institution: verbatim("School or university"),
  degree: verbatim("Degree or title (e.g. \"BSc\", \"Técnico\")"),
  field: verbatim("Field of study (e.g. \"Computer Science\")"),
  location: verbatim("City / country"),
  dates: verbatim("Dates as written (e.g. \"2015 - 2019\")"),
  honor_lines: lineNumbers("honors, awards or notes lines"),
});

export const projectEntrySchema = z.object({
  name: verbatim("Project name"),
  url: verbatim("Project URL"),
  description_lines: lineNumbers("lines describing what the project is"),
  achievement_lines: lineNumbers("achievement / feature lines (bullets)"),
  technologies: z.array(z.string()).describe("Technologies named in this entry, copied exactly"),
});

export const contactSchema = z.object({
  full_name: verbatim("The candidate's full name"),
  location: verbatim("The candidate's city / region / country"),
});

export type ExperienceEntry = z.infer<typeof experienceEntrySchema>;
export type EducationEntry = z.infer<typeof educationEntrySchema>;
export type ProjectEntry = z.infer<typeof projectEntrySchema>;
export type ContactEntry = z.infer<typeof contactSchema>;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function entryText(lines: ParseLine[]): string {
  return lines.map((l) => l.text).join("\n");
}

function verbatimProblems(fields: Record<string, string>, lines: ParseLine[]): string[] {
  const text = entryText(lines);
  return Object.entries(fields)
    .filter(([, value]) => value.trim() && !appearsIn(value, text))
    .map(([field, value]) => `${field}: "${value}" is not in the lines; copy it exactly as written, or use "".`);
}

export function experienceProblems(value: ExperienceEntry, lines: ParseLine[]): string[] {
  const problems = [
    ...verbatimProblems(
      { title: value.title, company: value.company, location: value.location, dates: value.dates },
      lines,
    ),
  ];
  if (!value.title.trim() && !value.company.trim()) problems.push("title and company are both empty.");
  if (value.title.trim() && normalizeForMatch(value.title) === normalizeForMatch(value.company)) {
    problems.push("title and company are the same text; the title is the role, the company is the employer.");
  }
  return problems;
}

export function educationProblems(value: EducationEntry, lines: ParseLine[]): string[] {
  const problems = [
    ...verbatimProblems(
      {
        institution: value.institution,
        degree: value.degree,
        field: value.field,
        location: value.location,
        dates: value.dates,
      },
      lines,
    ),
  ];
  if (!value.institution.trim() && !value.degree.trim()) problems.push("institution and degree are both empty.");
  return problems;
}

export function projectProblems(value: ProjectEntry, lines: ParseLine[]): string[] {
  const problems = [
    ...verbatimProblems({ name: value.name, url: value.url }, lines),
  ];
  if (!value.name.trim()) problems.push("name is empty.");
  return problems;
}

export function contactProblems(value: ContactEntry, lines: ParseLine[]): string[] {
  return verbatimProblems({ full_name: value.full_name, location: value.location }, lines);
}

// ---------------------------------------------------------------------------
// Building the typed entries from line numbers
// ---------------------------------------------------------------------------

const TECH_LABEL_RE = /^(?:technologies|tech stack|tools|stack|environment|tecnolog[ií]as|herramientas|entorno)\s*[:：]\s*/i;

function splitList(text: string): string[] {
  return text
    .split(/\s*[,;|•·]\s*/)
    .map((s) => s.replace(/\.$/, "").trim())
    .filter((s) => s.length > 0 && s.length < 60);
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((v) => {
    const key = normalizeForMatch(v);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Lines that hold the entry's header fields (so they are never treated as bullets). */
function headerLineNumbers(lines: ParseLine[], fields: string[]): Set<number> {
  const set = new Set<number>();
  for (const field of fields.filter((f) => f.trim())) {
    const hit = lines.find((l) => appearsIn(field, l.text));
    if (hit) set.add(hit.n);
  }
  return set;
}

interface BodySplit {
  description: string[];
  achievements: string[];
  technologies: string[];
}

/**
 * Turns the model's line choices into text. Numbers outside the entry are ignored
 * (small models sometimes count positions instead of reading the L numbers); lines
 * it didn't assign are kept (as achievements when they look like bullets, else
 * description) so nothing is lost, and "Technologies: …" lines become the
 * technology list.
 */
function splitBody(
  lines: ParseLine[],
  headerLines: Set<number>,
  descriptionLines: number[],
  achievementLines: number[],
): BodySplit {
  const description = new Set(descriptionLines);
  const achievements = new Set(achievementLines.filter((n) => !description.has(n)));
  const out: BodySplit = { description: [], achievements: [], technologies: [] };
  for (const line of lines) {
    if (headerLines.has(line.n) && !achievements.has(line.n) && !description.has(line.n)) continue;
    const text = line.text.trim();
    if (TECH_LABEL_RE.test(text)) {
      out.technologies.push(...splitList(text.replace(TECH_LABEL_RE, "")));
      continue;
    }
    if (achievements.has(line.n)) out.achievements.push(text);
    else if (description.has(line.n)) out.description.push(text);
    else if (line.tags.includes("BULLET") || line.tags.includes("INDENT") || /[.!?]$/.test(text)) out.achievements.push(text);
    else out.description.push(text);
  }
  return out;
}

function splitDates(dates: string, lines: ParseLine[]): { start: string; end: string | null } {
  const range = findDateRange(dates) ?? lines.map((l) => findDateRange(l.text)).find(Boolean) ?? null;
  return range ? { start: range.start, end: range.end } : { start: "", end: null };
}

export function buildExperience(value: ExperienceEntry, lines: ParseLine[]): CvExperience {
  const text = entryText(lines);
  const headers = headerLineNumbers(lines, [value.title, value.company, value.dates]);
  const body = splitBody(lines, headers, value.description_lines, value.achievement_lines);
  const { start, end } = splitDates(value.dates, lines);
  return {
    title: value.title.trim(),
    company: value.company.trim(),
    location: value.location.trim(),
    start_date: start,
    end_date: end,
    description: body.description.join(" "),
    achievements: body.achievements,
    technologies: dedupe([...body.technologies, ...value.technologies.filter((t) => appearsIn(t, text))]),
  };
}

export function buildEducation(value: EducationEntry, lines: ParseLine[]): CvEducation {
  const honors = new Set(value.honor_lines);
  const { start, end } = splitDates(value.dates, lines);
  return {
    institution: value.institution.trim(),
    degree: value.degree.trim(),
    field: value.field.trim(),
    location: value.location.trim(),
    start_date: start === end ? "" : start,
    end_date: end ?? "",
    honors: lines.filter((l) => honors.has(l.n)).map((l) => l.text),
  };
}

export function buildProject(value: ProjectEntry, lines: ParseLine[]): CvProject {
  const text = entryText(lines);
  const headers = headerLineNumbers(lines, [value.name]);
  const body = splitBody(lines, headers, value.description_lines, value.achievement_lines);
  return {
    name: value.name.trim(),
    url: value.url.trim(),
    description: body.description.join(" "),
    achievements: body.achievements,
    technologies: dedupe([...body.technologies, ...value.technologies.filter((t) => appearsIn(t, text))]),
  };
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const ENTRY_RULES = `Rules:
1. Copy text fields exactly as they are written in the lines: same words, spelling and language. Never translate, correct, shorten or complete them. Use "" when the entry doesn't state something.
2. For bullets and descriptions answer with line numbers only, never with text.
3. One line often holds several fields separated by "|", ",", "—", "at" or "en" (e.g. "Acme Corp | Remote", "Backend Developer | 03/2021 - Present"). Copy each field separately, without the separators.
4. Only use the lines of this entry.`;

export const EXPERIENCE_SYSTEM = `You read one job entry from a CV and point at its parts.

${LINE_FORMAT_NOTE}

${ENTRY_RULES}
5. title is the role (e.g. "Senior Software Engineer"); company is the employer (e.g. "Acme Corp"). A line with a date is often "Title | dates".
6. achievement_lines: every bullet or sentence about what the person did or achieved. description_lines: only a paragraph describing the role or the company; usually [].
7. technologies: names of languages, frameworks, tools or platforms that appear in these lines.

Example:
L04 Acme Corp | Remote
L05 [DATE] Backend Developer | 03/2021 - Present
L06 [BULLET] Built payment APIs in Go and PostgreSQL.
L07 [BULLET] Mentored two junior developers.

Answer:
{"title":"Backend Developer","company":"Acme Corp","location":"Remote","dates":"03/2021 - Present","description_lines":[],"achievement_lines":[6,7],"technologies":["Go","PostgreSQL"]}`;

export const EDUCATION_SYSTEM = `You read one education entry from a CV and point at its parts.

${LINE_FORMAT_NOTE}

${ENTRY_RULES}
5. degree is the qualification (e.g. "BSc", "Master", "Ingeniería"); field is the subject (e.g. "Computer Science"). When the CV writes "BSc in Computer Science", degree is "BSc" and field is "Computer Science".

Example:
L20 [DATE] BSc in Computer Science, Universidad de Sevilla | 2015 - 2019
L21 [BULLET] Graduated with honors.

Answer:
{"institution":"Universidad de Sevilla","degree":"BSc","field":"Computer Science","location":"","dates":"2015 - 2019","honor_lines":[21]}`;

export const PROJECT_SYSTEM = `You read one project entry from a CV and point at its parts.

${LINE_FORMAT_NOTE}

${ENTRY_RULES}
5. name is the project's name; url only when a link is written.`;

export const CONTACT_SYSTEM = `You read the top of a CV (the name and contact details) and copy two fields.

${LINE_FORMAT_NOTE}

Rules:
1. Copy exactly as written; "" when absent.
2. full_name is the person's name (usually the first, largest line), without job titles.
3. location is where the person lives (city, region or country), not an employer.

Example:
L1 [BIG] Ana López
L2 Backend Engineer
L3 ana@mail.com | +34 600 000 000 | Madrid, Spain

Answer:
{"full_name":"Ana López","location":"Madrid, Spain"}`;

export function buildEntryPrompt(lines: ParseLine[], kind: string, guess: string | null): string {
  const hint = guess
    ? `\n\n<parser_guess>\nA rule-based parser read this entry as: ${guess}\nIt may be wrong; check it against the lines.\n</parser_guess>`
    : "";
  return `<entry_lines>
${renderLines(lines)}
</entry_lines>${hint}

Point at the parts of this ${kind} entry. Answer with the JSON object only.`;
}
