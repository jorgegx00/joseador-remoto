import type { ParsedCv } from "@/types";

/**
 * Canonical ParsedCv → markdown serializer.
 *
 * The output format is the contract shared with `parseCvMarkdown` (its deterministic
 * inverse) and with the LLM prompts, so keep both in sync when changing it:
 *
 *   # Full Name
 *   email | phone | location
 *   LinkedIn: … / GitHub: … / Portfolio: …
 *   ## Professional Summary · ## Skills · ## Experience · ## Projects · ## Education
 *   ## Certifications · ## Languages · ## {extra section heading}
 *
 * Empty fields never produce fragments ("* - Present*", "### X in ", "|  - ") and empty
 * sections are omitted entirely.
 */

/** Heading used when an entry has no title/company (or degree/field, or name). Parsed back as empty. */
export const EMPTY_ENTRY_HEADING = "—";

const PRESENT_LABEL = "Present";

const PRESENT_WORD =
  /^(?:(?:the|la|el|a)\s+)?(?:present|current|currently|now|today|to date|actualidad|presente|actual|actualmente|hoy|la fecha|ongoing|en curso)\.?$/;

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/** Multi-line free text (summary, descriptions): keeps inner line breaks, trims the block. */
function cleanBlock(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .replace(/^(?:[ \t]*\n)+/, "")
    .replace(/\s+$/, "");
}

function stripAccentsLower(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function isPresentWord(value: string): boolean {
  const norm = stripAccentsLower(value)
    .replace(/^[*_]+|[*_]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return PRESENT_WORD.test(norm);
}

/**
 * Formats a start/end pair for display. `end === null` means an ongoing role/degree
 * ("Present"). Never returns dangling separators: a missing side is simply omitted.
 */
export function formatDateRange(
  start: string,
  end: string | null,
  kind: "experience" | "education",
): string {
  void kind; // Same rules for both kinds today; kept for call-site clarity.
  const s = clean(start);
  const e = end === null || end === undefined ? PRESENT_LABEL : clean(end);
  if (s && e) return `${s} - ${e}`;
  return s || e;
}

const RANGE_SEPARATOR = /\s+(?:-|–|—|to|a|hasta|until|till)\s+/i;

function hasYear(value: string): boolean {
  return /(?:^|\D)(?:19|20)\d{2}(?:\D|$)/.test(value);
}

/**
 * Inverse of `formatDateRange`. Accepts " - ", " – ", " — ", " to ", " a ", " hasta "
 * (and unspaced dashes between years: "2012-2016"). Present/Current/Now/Actualidad/
 * Presente/Actual/Hoy map to `end: null`.
 *
 * A single date is ambiguous: for experience it is read as the start date, for
 * education as the end (graduation) date.
 */
export function parseDateRange(
  s: string,
  kind: "experience" | "education" = "experience",
): { start: string; end: string | null } {
  let text = clean(s)
    .replace(/^[*_]+|[*_]+$/g, "")
    .trim();
  if (/^\(.*\)$/.test(text)) text = text.slice(1, -1).trim();
  if (!text) return { start: "", end: "" };

  const toEnd = (value: string): string | null => {
    const v = value.trim();
    return isPresentWord(v) ? null : v;
  };

  const spaced = RANGE_SEPARATOR.exec(text);
  if (spaced && spaced.index > 0) {
    const left = text.slice(0, spaced.index).trim();
    const right = text.slice(spaced.index + spaced[0].length).trim();
    if (left && right) return { start: left, end: toEnd(right) };
  }

  // Unspaced en/em dash: "2012–2016", "Jan 2020—Present".
  const dash = text.match(/^(.+?)\s*[–—]\s*(.+)$/);
  if (dash) return { start: dash[1].trim(), end: toEnd(dash[2]) };

  // Unspaced hyphen only between year-bearing sides ("2012-2016", "Jan 2020-Present"),
  // never inside ISO-like "2020-01".
  for (let i = text.indexOf("-"); i > 0; i = text.indexOf("-", i + 1)) {
    const left = text.slice(0, i).trim();
    const right = text.slice(i + 1).trim();
    if (!left || !right) continue;
    if (/^\d{4}$/.test(left) && /^\d{1,2}$/.test(right)) continue;
    if (hasYear(left) && (hasYear(right) || isPresentWord(right))) {
      return { start: left, end: toEnd(right) };
    }
  }

  const since = text.match(/^(?:since|desde)\s+(.+)$/i);
  if (since) return { start: since[1].trim(), end: null };

  if (isPresentWord(text)) return { start: "", end: null };
  return kind === "education" ? { start: "", end: text } : { start: text, end: "" };
}

function joinList(items: string[] | null | undefined): string {
  return (items ?? []).map(clean).filter(Boolean).join(", ");
}

function hasTopLevelComma(value: string): boolean {
  let depth = 0;
  for (const ch of value) {
    if (ch === "(" || ch === "[") depth++;
    else if ((ch === ")" || ch === "]") && depth > 0) depth--;
    else if ((ch === "," || ch === ";") && depth === 0) return true;
  }
  return false;
}

function bullets(items: string[] | null | undefined): string {
  return (items ?? [])
    .map(clean)
    .filter(Boolean)
    .map((item) => `- ${item}`)
    .join("\n");
}

function section(heading: string, body: string): string {
  return body.trim() ? `## ${heading}\n\n${body}` : "";
}

export function formatCvAsMarkdown(cv: ParsedCv): string {
  const blocks: string[] = [];

  const name = clean(cv.full_name);
  if (name) blocks.push(`# ${name}`);

  const headerLines: string[] = [];
  const contact = [cv.email, cv.phone, cv.location].map(clean).filter(Boolean);
  if (contact.length > 0) headerLines.push(contact.join(" | "));
  if (clean(cv.linkedin_url)) headerLines.push(`LinkedIn: ${clean(cv.linkedin_url)}`);
  if (clean(cv.github_url)) headerLines.push(`GitHub: ${clean(cv.github_url)}`);
  if (clean(cv.portfolio_url)) headerLines.push(`Portfolio: ${clean(cv.portfolio_url)}`);
  if (headerLines.length > 0) blocks.push(headerLines.join("\n"));

  const summary = cleanBlock(cv.summary);
  if (summary) blocks.push(section("Professional Summary", summary));

  const technical = joinList(cv.skills?.technical);
  const soft = joinList(cv.skills?.soft);
  const skillLines: string[] = [];
  if (technical) skillLines.push(`**Technical Skills:** ${technical}`);
  if (soft) skillLines.push(`**Soft Skills:** ${soft}`);
  if (skillLines.length > 0) blocks.push(section("Skills", skillLines.join("\n")));

  const experience = (cv.experience ?? [])
    .map((exp) => {
      const title = clean(exp.title);
      const company = clean(exp.company);
      const location = clean(exp.location);
      const dates = formatDateRange(exp.start_date ?? "", exp.end_date ?? null, "experience");
      const description = cleanBlock(exp.description);
      const achievements = bullets(exp.achievements);
      const technologies = joinList(exp.technologies);

      // Dates/location alone don't identify a role: skip empty stubs instead of "### —".
      if (!title && !company && !description && !achievements && !technologies) return "";

      const heading =
        title && company ? `${title} at ${company}` : title || company || EMPTY_ENTRY_HEADING;
      const head = [`### ${heading}`];
      if (dates && location) head.push(`*${dates}* | ${location}`);
      else if (dates) head.push(`*${dates}*`);
      else if (location) head.push(`*${location}*`);

      return [
        head.join("\n"),
        description,
        achievements,
        technologies ? `**Technologies:** ${technologies}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
    })
    .filter(Boolean);
  if (experience.length > 0) blocks.push(section("Experience", experience.join("\n\n")));

  const projects = (cv.projects ?? [])
    .map((project) => {
      const projectName = clean(project.name);
      const url = clean(project.url);
      const description = cleanBlock(project.description);
      const achievements = bullets(project.achievements);
      const technologies = joinList(project.technologies);
      if (!projectName && !url && !description && !achievements && !technologies) return "";

      const head = [`### ${projectName || EMPTY_ENTRY_HEADING}`];
      if (url) head.push(url);
      return [
        head.join("\n"),
        description,
        achievements,
        technologies ? `**Technologies:** ${technologies}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
    })
    .filter(Boolean);
  if (projects.length > 0) blocks.push(section("Projects", projects.join("\n\n")));

  const education = (cv.education ?? [])
    .map((edu) => {
      const degree = clean(edu.degree);
      const field = clean(edu.field);
      const institution = clean(edu.institution);
      const location = clean(edu.location);
      const dates = formatDateRange(
        edu.start_date ?? "",
        (edu.end_date as string | null | undefined) ?? "",
        "education",
      );
      const honors = (edu.honors ?? []).map(clean).filter(Boolean);
      if (!degree && !field && !institution && !location && !dates && honors.length === 0) {
        return "";
      }

      const heading =
        degree && field ? `${degree} in ${field}` : degree || field || EMPTY_ENTRY_HEADING;
      const lines = [`### ${heading}`];
      const meta = [institution ? `*${institution}*` : "", location, dates].filter(Boolean);
      if (meta.length > 0) lines.push(meta.join(" | "));
      if (honors.length > 0) {
        // Honors containing commas can't survive a comma-joined line: use bullets instead.
        if (honors.some(hasTopLevelComma)) {
          lines.push("Honors:", ...honors.map((h) => `- ${h}`));
        } else {
          lines.push(`Honors: ${honors.join(", ")}`);
        }
      }
      return lines.join("\n");
    })
    .filter(Boolean);
  if (education.length > 0) blocks.push(section("Education", education.join("\n\n")));

  const certifications = bullets(cv.certifications);
  if (certifications) blocks.push(section("Certifications", certifications));

  const languages = (cv.languages ?? [])
    .map((lang) => {
      const langName = clean(lang.name);
      if (!langName) return "";
      const level = clean(lang.level);
      const certification = clean(lang.certification);
      let line = `- ${langName}`;
      if (level) line += `: ${level}`;
      if (certification) line += ` (${certification})`;
      return line;
    })
    .filter(Boolean);
  if (languages.length > 0) blocks.push(section("Languages", languages.join("\n")));

  for (const extra of cv.extra_sections ?? []) {
    const heading = clean(extra.heading) || "Additional Information";
    const body = cleanBlock(extra.body);
    if (body) blocks.push(section(heading, body));
  }

  const content = blocks.filter(Boolean).join("\n\n");
  return content ? `${content}\n` : "";
}
