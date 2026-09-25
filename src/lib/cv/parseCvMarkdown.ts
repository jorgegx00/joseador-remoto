import type {
  CvEducation,
  CvExperience,
  CvExtraSection,
  CvLanguage,
  CvProject,
  ParsedCv,
} from "@/types";
import { EMPTY_ENTRY_HEADING, parseDateRange } from "@/lib/cv/formatCvAsMarkdown";
import { normalizeCvMarkdown } from "@/lib/cv/markdown-blocks";
import {
  canonicalSectionType,
  isSoftSkillsLabel,
  normalizeHeadingText,
  type CvSectionType,
} from "@/lib/cv/section-aliases";

/**
 * Deterministic markdown → ParsedCv parser: the inverse of `formatCvAsMarkdown`, tolerant
 * to the usual LLM deviations (Spanish headings, bold pseudo-headings, "Title @ Company",
 * en-dash dates, `*`/`•`/`1.` bullets, code fences, chat markers…).
 *
 * Principle: never drop content. Unknown sections land in `extra_sections` verbatim, and
 * anything that can't be mapped to a field produces a warning.
 */

export interface CvMarkdownParseResult {
  parsed: ParsedCv;
  warnings: string[];
  recognizedSections: CvSectionType[];
  confidence: "high" | "medium" | "low";
}

type Emphasis = "bold" | "italic" | null;
type EntryKind = "experience" | "education" | "projects";

interface Heading {
  level: number;
  text: string;
}

interface RawSection {
  type: CvSectionType | null;
  heading: string;
  lines: string[];
}

interface Segment {
  text: string;
  emph: Emphasis;
}

// Same as markdown-blocks, but a closing "#" sequence must be preceded by a space ("C#").
const HEADING_RE = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const LIST_RE = /^(\s*)([-*+•]|\d{1,2}[.)])\s+(.*)$/;
const RULE_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE_RE = /^\s*```/;
// "**Label:** value", "**Label**: value", "Label: value", "*Label:* value".
const LABEL_RE = /^(\*\*|__|\*|_)?([^*_:\n]{1,50}?)\s*(?::\s*\1|\1\s*:)\s*(.*)$/;

const MONTHS = new Set([
  "jan", "january", "feb", "february", "mar", "march", "apr", "april", "may", "jun", "june",
  "jul", "july", "aug", "august", "sep", "sept", "september", "oct", "october", "nov",
  "november", "dec", "december", "ene", "enero", "febrero", "marzo", "abr", "abril", "mayo",
  "junio", "julio", "ago", "agosto", "septiembre", "setiembre", "octubre", "noviembre", "dic",
  "diciembre",
]);
const PRESENT_TOKENS = new Set([
  "present", "current", "currently", "now", "today", "date", "actualidad", "presente", "actual",
  "actualmente", "hoy", "fecha", "ongoing", "curso",
]);
const DATE_CONNECTORS = new Set([
  "to", "a", "hasta", "until", "till", "since", "desde", "de", "del", "the", "la", "el", "en",
  "y", "and", "of", "class", "expected", "graduated", "graduation", "in", "progress",
  "cursando", "spring", "summer", "fall", "autumn", "winter", "primavera", "verano", "otono",
  "invierno",
]);

const TECH_LABEL =
  /^(?:technologies(?: used)?|technology|tech(?: stack)?|stack(?: tecnologico)?|tecnologias(?: utilizadas)?|tecnologia|tools(?: (?:and|&) technologies)?|tool|herramientas|entorno|environment)$/;
const ACHIEVEMENT_LABEL =
  /^(?:key )?(?:achievements|accomplishments|highlights|responsibilities|results|logros(?: clave)?|responsabilidades|funciones|resultados)$/;
const HONORS_LABEL = /^(?:honors|honours|honores|distinciones|awards|premios|reconocimientos)$/;
const URL_LABEL =
  /^(?:url|link|links|repo|repository|repositorio|demo|live|website|web|sitio web|sitio|enlace|github|source|codigo)$/;

const TITLE_WORDS =
  /\b(?:engineer|developer|desarrollador|desarrolladora|ingeniero|ingeniera|programador|programadora|programmer|manager|gerente|designer|disenador|disenadora|analyst|analista|architect|arquitecto|arquitecta|consultant|consultor|consultora|scientist|cientifico|cientifica|specialist|especialista|director|directora|administrator|administrador|administradora|devops|sre|lead|lider|full ?stack|front ?end|back ?end|intern|pasante|coordinator|coordinador|coordinadora|product owner|scrum master|freelancer?)\b/;

const LEVEL_ALIASES: Array<[string, CvLanguage["level"]]> = (
  [
    ["native or bilingual proficiency", "native"],
    ["native or bilingual", "native"],
    ["native speaker", "native"],
    ["mother tongue", "native"],
    ["lengua materna", "native"],
    ["native", "native"],
    ["nativo", "native"],
    ["nativa", "native"],
    ["full professional proficiency", "fluent"],
    ["bilingual", "fluent"],
    ["bilingue", "fluent"],
    ["fluent", "fluent"],
    ["fluido", "fluent"],
    ["fluida", "fluent"],
    ["c2", "fluent"],
    ["professional working proficiency", "advanced"],
    ["advanced", "advanced"],
    ["avanzado", "advanced"],
    ["avanzada", "advanced"],
    ["c1", "advanced"],
    ["limited working proficiency", "intermediate"],
    ["intermediate", "intermediate"],
    ["intermedio", "intermediate"],
    ["intermedia", "intermediate"],
    ["b1", "intermediate"],
    ["b2", "intermediate"],
    ["elementary proficiency", "basic"],
    ["elementary", "basic"],
    ["elemental", "basic"],
    ["beginner", "basic"],
    ["principiante", "basic"],
    ["basic", "basic"],
    ["basico", "basic"],
    ["basica", "basic"],
    ["a1", "basic"],
    ["a2", "basic"],
  ] as Array<[string, CvLanguage["level"]]>
).sort((a, b) => b[0].length - a[0].length);

// ---------------------------------------------------------------------------
// Small text helpers
// ---------------------------------------------------------------------------

function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function matchHeading(line: string): Heading | null {
  const m = line.match(HEADING_RE);
  if (!m) return null;
  return { level: m[1].length, text: m[2].trim() };
}

/** Removes one layer of emphasis wrapping the WHOLE string ("**x**", "*x*", "_x_"). */
function unwrap(value: string): { text: string; emph: Emphasis } {
  const s = value.trim();
  for (const d of ["***", "**", "__", "*", "_"]) {
    if (s.length <= d.length * 2 || !s.startsWith(d) || !s.endsWith(d)) continue;
    const inner = s.slice(d.length, -d.length);
    if (!inner.trim() || /^\s|\s$/.test(inner)) continue;
    if (inner.includes(d.length === 3 ? "*" : d)) continue;
    return { text: inner, emph: d === "*" || d === "_" ? "italic" : "bold" };
  }
  return { text: s, emph: null };
}

function stripWrap(value: string): string {
  let current = value.trim();
  for (let i = 0; i < 3; i++) {
    const next = unwrap(current);
    if (next.emph === null) break;
    current = next.text.trim();
  }
  return current;
}

function matchLabel(line: string): { label: string; norm: string; value: string } | null {
  const m = line.trim().match(LABEL_RE);
  if (!m) return null;
  const label = m[2].trim();
  const value = m[3].trim();
  if (!label || value.startsWith("//")) return null;
  return { label, norm: normalizeHeadingText(label), value: stripWrap(value) };
}

/** Splits on , ; • · | outside parentheses/brackets. */
function splitList(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of value) {
    if (ch === "(" || ch === "[") depth++;
    else if ((ch === ")" || ch === "]") && depth > 0) depth--;
    if (depth === 0 && (ch === "," || ch === ";" || ch === "•" || ch === "·" || ch === "|")) {
      out.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  out.push(buf);
  return out
    .map((item) => stripWrap(item.trim()).replace(/\.$/, "").trim())
    .filter(Boolean);
}

function pushUnique(target: string[], items: string[]): void {
  const seen = new Set(target.map((t) => t.toLowerCase()));
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    target.push(item);
  }
}

function isDateLike(value: string): boolean {
  const s = fold(stripWrap(value)).replace(/^\(|\)$/g, "").trim();
  if (!s || s.length > 60) return false;
  let anchor = false;
  for (const token of s.split(/[^a-z0-9]+/).filter(Boolean)) {
    if (/^\d+$/.test(token)) {
      if (/^(?:19|20)\d{2}$/.test(token)) {
        anchor = true;
        continue;
      }
      if (token.length <= 2) continue;
      return false;
    }
    if (MONTHS.has(token) || PRESENT_TOKENS.has(token)) {
      anchor = true;
      continue;
    }
    if (DATE_CONNECTORS.has(token) || /^[qh][1-4]$/.test(token)) continue;
    return false;
  }
  return anchor;
}

function isUrlLike(value: string): boolean {
  const t = value.trim().replace(/^<|>$/g, "");
  if (!t || /\s/.test(t)) return false;
  if (/^https?:\/\/[^/\s]+\.[^/\s]+/i.test(t)) return true;
  const m = t.match(/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.([a-z]{2,})(?:[/?#]\S*)?$/i);
  return !!m && !/^(?:js|ts|jsx|tsx|py|rb|md|txt|json|yml|yaml|sh|css|html)$/i.test(m[1]);
}

const MD_LINK_RE = /^\[([^\]]+)\]\(\s*<?([^)\s>]+(?:\([^)\s]*\))?)>?\s*\)$/;

function extractUrl(value: string): string | null {
  const t = stripWrap(value.trim());
  const link = t.match(MD_LINK_RE);
  if (link) return link[2];
  const angle = t.match(/^<(\S+)>$/);
  if (angle && isUrlLike(angle[1])) return angle[1];
  return isUrlLike(t) ? t : null;
}

function isEmail(value: string): boolean {
  return /^(?:mailto:)?[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value);
}

function isPhone(value: string): boolean {
  if (!/^[+(\d][\d\s().-]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, "").length;
  return digits >= 7 && digits <= 16 && !isDateLike(value);
}

function urlField(url: string): "linkedin_url" | "github_url" | "portfolio_url" {
  const lower = url.toLowerCase();
  if (/(?:^|[/.])linkedin\.com/.test(lower)) return "linkedin_url";
  if (/(?:^|[/.])github\.com/.test(lower)) return "github_url";
  return "portfolio_url";
}

/** Drops leading/trailing blank lines; keeps everything else verbatim. */
function trimBlock(lines: string[]): string {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start++;
  while (end > start && !lines[end - 1].trim()) end--;
  return lines
    .slice(start, end)
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n");
}

/** Joins text lines into paragraphs: "" entries are paragraph breaks. */
function joinParagraphs(lines: string[]): string {
  const paragraphs: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line === "") {
      if (current.length) paragraphs.push(current.join("\n"));
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length) paragraphs.push(current.join("\n"));
  return paragraphs.join("\n\n");
}

function splitMetaSegments(line: string): Segment[] {
  let text = line.trim();
  let outer: Emphasis = null;
  const whole = unwrap(text);
  if (whole.emph && /\s*\|\s*|\s[·•]\s/.test(whole.text)) {
    text = whole.text;
    outer = whole.emph;
  }
  return text
    .split(/\s*\|\s*|\s+[·•]\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const u = unwrap(part);
      return { text: u.text.trim(), emph: u.emph ?? outer };
    });
}

/** "INTEC, 2012 - 2016" → ["INTEC", "2012 - 2016"]; otherwise null. */
function splitTrailingDate(value: string): [string, string] | null {
  for (let i = value.lastIndexOf(","); i > 0; i = value.lastIndexOf(",", i - 1)) {
    const head = value.slice(0, i).trim();
    const tail = value.slice(i + 1).trim();
    if (head && tail && isDateLike(tail)) return [head, tail];
  }
  return null;
}

/** "INTEC – Santo Domingo – 2012 – 2016" → ["INTEC", "Santo Domingo", "2012 – 2016"]. */
function splitDashes(text: string): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest) {
    const m = isDateLike(rest) ? null : /\s+[—–]\s+/.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    out.push(rest.slice(0, m.index).trim());
    rest = rest.slice(m.index + m[0].length).trim();
  }
  return out.filter(Boolean);
}

// "**University** — Orlando, FL", "*INTEC*, 2012 - 2016": emphasized prefix + plain rest.
const EMPH_PREFIX = /^(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)\s*(?:[,—–-]\s*)?(\S.*)$/;

/** Refines " | "-separated meta segments: emphasized prefixes, dash separators, trailing dates. */
function expandSegments(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const seg of segments) {
    if (isDateLike(seg.text)) {
      out.push(seg);
      continue;
    }
    let pieces: Segment[] = [seg];
    const prefix = seg.emph === null ? seg.text.match(EMPH_PREFIX) : null;
    if (prefix) {
      const head = unwrap(prefix[1]);
      pieces = [
        { text: head.text.trim(), emph: head.emph },
        { text: prefix[2].trim(), emph: null },
      ];
    }
    for (const piece of pieces) {
      for (const part of splitDashes(piece.text)) {
        const split = isDateLike(part) ? null : splitTrailingDate(part);
        if (split) out.push({ text: split[0], emph: piece.emph }, { text: split[1], emph: null });
        else out.push({ text: part, emph: piece.emph });
      }
    }
  }
  return out;
}

function isKnownInlineLabel(line: string): boolean {
  const lab = matchLabel(line);
  if (!lab) return false;
  return (
    TECH_LABEL.test(lab.norm) ||
    HONORS_LABEL.test(lab.norm) ||
    ACHIEVEMENT_LABEL.test(lab.norm) ||
    URL_LABEL.test(lab.norm)
  );
}

function isMetaLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 200 || LIST_RE.test(line) || matchHeading(t) || isKnownInlineLabel(t)) {
    return false;
  }
  if (unwrap(t).emph) return true;
  const segments = splitMetaSegments(t);
  if (segments.length === 0) return false;
  if (segments.some((s) => isDateLike(s.text))) return true;
  // "*INTEC* | Santo Domingo" or "*Remote*": leading emphasized segment followed by segments.
  const first = t.split(/\s*\|\s*|\s+[·•]\s+/)[0];
  return !!unwrap(first).emph && segments.length > 1;
}

function isEmptyEntryHeading(text: string): boolean {
  return !text || /^[-–—]+$/.test(text) || text === EMPTY_ENTRY_HEADING;
}

function splitOnce(text: string, re: RegExp, last: boolean): [string, string] | null {
  const matches = [...text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"))];
  if (matches.length === 0) return null;
  const m = last ? matches[matches.length - 1] : matches[0];
  const idx = m.index ?? 0;
  const left = text.slice(0, idx).trim();
  const right = text.slice(idx + m[0].length).trim();
  return left && right ? [left, right] : null;
}

// ---------------------------------------------------------------------------
// Payload extraction & document structure
// ---------------------------------------------------------------------------

function extractCvPayload(md: string): string {
  let text = (md ?? "").replace(/\r\n?/g, "\n");
  text = text.replace(
    /<<<\s*NOTES\s*>>>[\s\S]*?(?:<<<\s*END\s+NOTES\s*>>>|(?=<<<\s*CV\s*>>>)|$)/gi,
    "",
  );
  const cv = text.match(/<<<\s*CV\s*>>>([\s\S]*?)(?:<<<\s*END\s+CV\s*>>>|$)/i);
  if (cv) text = cv[1];
  return text;
}

const CHAT_PREAMBLE =
  /^(?:here(?:'s| is| are)|sure|certainly|of course|below is|aqu[ií]\s|claro|por supuesto|a continuaci[oó]n)\b/i;

function looksLikeName(line: string): boolean {
  const t = stripWrap(line.trim());
  if (!t || t.length > 60) return false;
  if (/[@:|]|https?:|www\./i.test(t)) return false;
  if ((t.match(/\d/g) ?? []).length > 2) return false;
  if (LIST_RE.test(line) || canonicalSectionType(t)) return false;
  const words = t.split(/\s+/);
  return words.length >= 1 && words.length <= 6 && /\p{L}/u.test(t);
}

/**
 * A plain line that is exactly a known section name ("Experience", "EXPERIENCIA LABORAL",
 * "**Skills:**") at a paragraph start becomes a `##` heading. "Tech stack" is skipped:
 * inside an entry it is a technologies label, not the skills section.
 */
function promotePlainSectionLine(line: string, atParagraphStart: boolean): string {
  if (!atParagraphStart) return line;
  const t = line.trim();
  if (!t || t.length > 50 || /^\s/.test(line) || matchHeading(t) || LIST_RE.test(line)) return line;
  const text = stripWrap(t).replace(/\s*:\s*$/, "").trim();
  if (!text || /[*_]/.test(text) || TECH_LABEL.test(normalizeHeadingText(text))) return line;
  return canonicalSectionType(text) ? `## ${text}` : line;
}

function isEntryKind(type: CvSectionType | null): type is EntryKind {
  return type === "experience" || type === "education" || type === "projects";
}

function nextNonEmpty(lines: string[], from: number): string | null {
  for (let i = from; i < lines.length; i++) {
    if (lines[i].trim()) return lines[i];
  }
  return null;
}

function looksLikeEntryHeading(kind: EntryKind, text: string, next: string | null): boolean {
  const t = stripWrap(text);
  if (kind === "experience") {
    if (/\s(?:at|@|—|–|\|)\s/i.test(t)) return true;
    return !!next && isMetaLine(next);
  }
  if (kind === "education") {
    if (/\s(?:in|en)\s/i.test(t)) return true;
    return !!next && isMetaLine(next);
  }
  if (MD_LINK_RE.test(t)) return true;
  return !!next && !!extractUrl(next);
}

// ---------------------------------------------------------------------------
// Header / contact
// ---------------------------------------------------------------------------

type IdentityField = "email" | "phone" | "location" | "linkedin_url" | "github_url" | "portfolio_url";

interface HeaderState {
  overflow: string[];
  headlines: string[];
  summary: string[];
}

function setIdentity(cv: ParsedCv, field: IdentityField, value: string, state: HeaderState): void {
  const v = value.trim();
  if (!v) return;
  if (!cv[field]) cv[field] = v;
  else if (cv[field].toLowerCase() !== v.toLowerCase()) state.overflow.push(v);
}

function classifyContactPart(raw: string, cv: ParsedCv, state: HeaderState): void {
  let part = raw.trim().replace(/^[^\p{L}\p{N}+([<*_]+/u, "").trim();
  part = stripWrap(part);
  if (!part) return;
  if (cv.full_name && part.toLowerCase() === cv.full_name.toLowerCase()) return;

  const lab = matchLabel(part);
  if (lab && lab.value && !/^https?$/i.test(lab.label)) {
    const norm = fold(lab.label).replace(/[^a-z ]/g, "").trim();
    const value = extractUrl(lab.value) ?? lab.value;
    if (/^(?:linkedin|linked in)$/.test(norm)) return setIdentity(cv, "linkedin_url", value, state);
    if (/^(?:github|git hub|git)$/.test(norm)) return setIdentity(cv, "github_url", value, state);
    if (/^(?:portfolio|portafolio|website|web site|web|sitio web|pagina web|blog|site|url)$/.test(norm)) {
      return setIdentity(cv, urlField(value), value, state);
    }
    if (/^(?:email|e mail|mail|correo|correo electronico)$/.test(norm)) {
      return setIdentity(cv, "email", value.replace(/^mailto:/i, ""), state);
    }
    if (/^(?:phone|tel|telephone|telefono|movil|celular|mobile|cell|whatsapp)$/.test(norm)) {
      return setIdentity(cv, "phone", value, state);
    }
    if (/^(?:location|ubicacion|direccion|address|ciudad|city|based in)$/.test(norm)) {
      return setIdentity(cv, "location", value, state);
    }
  }

  const link = part.match(MD_LINK_RE);
  if (link) {
    const url = link[2].replace(/^mailto:/i, "");
    if (isEmail(url)) return setIdentity(cv, "email", url, state);
    const text = fold(link[1]);
    if (/linkedin/.test(text)) return setIdentity(cv, "linkedin_url", url, state);
    if (/github/.test(text)) return setIdentity(cv, "github_url", url, state);
    return setIdentity(cv, urlField(url), url, state);
  }

  const bare = part.replace(/^<|>$/g, "");
  if (isEmail(bare)) return setIdentity(cv, "email", bare.replace(/^mailto:/i, ""), state);
  if (isPhone(bare)) return setIdentity(cv, "phone", bare, state);
  if (isUrlLike(bare)) return setIdentity(cv, urlField(bare), bare, state);

  if (TITLE_WORDS.test(fold(part)) && !part.includes(",")) {
    state.headlines.push(part);
    return;
  }
  setIdentity(cv, "location", part, state);
}

function parseContactLines(lines: string[], cv: ParsedCv, state: HeaderState): void {
  for (const raw of lines) {
    let t = raw.trim();
    if (!t || RULE_RE.test(t)) continue;
    const h = matchHeading(t);
    if (h) t = h.text;
    const li = t.match(LIST_RE);
    if (li) t = li[3].trim();
    if (!t) continue;
    if (t.split(/\s+/).length >= 12 && !/\s[|·•]\s/.test(t)) {
      state.summary.push(t);
      continue;
    }
    for (const part of t.split(/\s*\|\s*|\s+[·•]\s+/)) classifyContactPart(part, cv, state);
  }
}

// ---------------------------------------------------------------------------
// Entries (experience / education / projects)
// ---------------------------------------------------------------------------

interface RawEntry {
  heading: string | null;
  body: string[];
}

const BOLD_ENTRY_RE = /^\*\*[^*]+\*\*/;

interface ParseContext {
  warnings: string[];
  /** Entries built from content without an entry heading: the structure didn't match. */
  untitledEntries: number;
}

function splitEntries(lines: string[], sectionLevel: number, ctx: ParseContext, label: string): RawEntry[] {
  const deeper = lines
    .map((line) => matchHeading(line))
    .filter((h): h is Heading => !!h && h.level > sectionLevel);
  const entries: RawEntry[] = [];
  let current: RawEntry | null = null;
  const pre: string[] = [];

  if (deeper.length > 0) {
    const entryLevel = Math.min(...deeper.map((h) => h.level));
    for (const line of lines) {
      const h = matchHeading(line);
      if (h && h.level === entryLevel) {
        current = { heading: h.text, body: [] };
        entries.push(current);
        continue;
      }
      if (current) current.body.push(line);
      else pre.push(line);
    }
  } else {
    // No sub-headings: bold-led lines at paragraph starts act as entry headers.
    let prevBlank = true;
    for (const line of lines) {
      const t = line.trim();
      if (
        prevBlank &&
        BOLD_ENTRY_RE.test(t) &&
        !LIST_RE.test(line) &&
        !matchLabel(t)
      ) {
        current = { heading: t.replace(/\*\*/g, "").trim(), body: [] };
        entries.push(current);
        prevBlank = false;
        continue;
      }
      prevBlank = !t;
      if (current) current.body.push(line);
      else pre.push(line);
    }
  }

  if (pre.some((l) => l.trim())) {
    ctx.warnings.push(`${label}: content without an entry heading was kept as an untitled entry`);
    ctx.untitledEntries++;
    entries.unshift({ heading: null, body: pre });
  }
  return entries;
}

/** Consumes meta lines right after an entry heading (before the first blank line). */
function takeMetaLines(body: string[], forceFirst: boolean): { meta: string[]; rest: string[] } {
  const meta: string[] = [];
  let i = 0;
  while (i < body.length && !body[i].trim()) i++;
  while (i < body.length && body[i].trim()) {
    const line = body[i];
    const candidate =
      isMetaLine(line) ||
      (forceFirst &&
        meta.length === 0 &&
        !LIST_RE.test(line) &&
        !matchHeading(line.trim()) &&
        !isKnownInlineLabel(line) &&
        !extractUrl(line));
    if (!candidate) break;
    meta.push(line.trim());
    i++;
  }
  return { meta, rest: body.slice(i) };
}

function parseExperienceEntry(entry: RawEntry, warnings: string[]): CvExperience {
  const exp: CvExperience = {
    company: "",
    location: "",
    title: "",
    start_date: "",
    end_date: "",
    description: "",
    achievements: [],
    technologies: [],
  };
  let dateText = "";
  const locationParts: string[] = [];

  // Heading: "Title at Company", "Title | Company | dates", "Title @ Company", "Título en Empresa".
  const heading = stripWrap(entry.heading ?? "");
  if (!isEmptyEntryHeading(heading)) {
    const segments = heading.split(/\s*\|\s*/).map((s) => stripWrap(s)).filter(Boolean);
    const nonDate: string[] = [];
    for (const seg of segments) {
      if (!dateText && isDateLike(seg)) dateText = seg;
      else nonDate.push(seg);
    }
    if (nonDate.length >= 2) {
      exp.title = nonDate[0];
      exp.company = nonDate[1];
      locationParts.push(...nonDate.slice(2));
    } else if (nonDate.length === 1) {
      let text = nonDate[0];
      const paren = text.match(/^(.*?)\s*\(([^()]+)\)$/);
      if (paren && isDateLike(paren[2]) && !dateText) {
        dateText = paren[2];
        text = paren[1].trim();
      }
      const split =
        splitOnce(text, /\s+at\s+/i, true) ??
        splitOnce(text, /\s+@\s+/, true) ??
        splitOnce(text, /\s+[—–]\s+/, false) ??
        splitOnce(text, /\s+-\s+/, false) ??
        splitOnce(text, /\s+en\s+/, true);
      if (split && isDateLike(split[1]) && !dateText) {
        exp.title = split[0];
        dateText = split[1];
      } else if (split) {
        exp.title = stripWrap(split[0]);
        exp.company = stripWrap(split[1]);
      } else {
        exp.title = text;
      }
    }
  }

  const { meta, rest } = takeMetaLines(entry.body, false);
  for (const line of meta) {
    const segments = expandSegments(splitMetaSegments(line));
    const nonDate: Segment[] = [];
    for (const seg of segments) {
      if (!dateText && isDateLike(seg.text)) dateText = seg.text;
      else nonDate.push(seg);
    }
    if (!exp.company && nonDate.length >= 2) {
      exp.company = nonDate.shift()!.text;
    } else if (!exp.company) {
      const boldIdx = nonDate.findIndex((s) => s.emph === "bold");
      if (boldIdx >= 0) exp.company = nonDate.splice(boldIdx, 1)[0].text;
    }
    locationParts.push(...nonDate.map((s) => s.text));
  }
  exp.location = locationParts.join(" | ");

  if (dateText) {
    const range = parseDateRange(dateText, "experience");
    exp.start_date = range.start;
    exp.end_date = range.end;
  }

  const body = parseEntryBody(rest, {
    onTechnologies: (items) => pushUnique(exp.technologies, items),
  });
  exp.achievements = body.achievements;
  exp.description = joinParagraphs(body.text);
  if (!exp.title && !exp.company && entry.heading !== null && !isEmptyEntryHeading(heading)) {
    warnings.push(`Experience entry "${heading}" has no title/company`);
  }
  return exp;
}

interface EntryBody {
  achievements: string[];
  /** Free text lines, "" = paragraph break. */
  text: string[];
  urls: string[];
}

function parseEntryBody(
  lines: string[],
  opts: {
    onTechnologies: (items: string[]) => void;
    urlLabels?: boolean;
    honors?: boolean;
  },
): EntryBody {
  const out: EntryBody = { achievements: [], text: [], urls: [] };
  let mode: "normal" | "tech" = "normal";
  let lastWasBullet = false;

  const pushText = (line: string) => {
    out.text.push(line);
    lastWasBullet = false;
  };

  for (const raw of lines) {
    const t = raw.trim();
    if (!t) {
      if (out.text.length && out.text[out.text.length - 1] !== "") out.text.push("");
      lastWasBullet = false;
      continue;
    }
    if (FENCE_RE.test(t) || RULE_RE.test(t)) continue;

    const h = matchHeading(t);
    if (h) {
      const norm = normalizeHeadingText(h.text);
      if (TECH_LABEL.test(norm)) mode = "tech";
      else if (ACHIEVEMENT_LABEL.test(norm) || (opts.honors && HONORS_LABEL.test(norm))) {
        mode = "normal";
      } else pushText(t);
      continue;
    }

    const li = raw.match(LIST_RE);
    if (li) {
      const content = li[3].trim();
      const lab = matchLabel(content);
      if (lab && TECH_LABEL.test(lab.norm)) {
        if (lab.value) opts.onTechnologies(splitList(lab.value));
        else mode = "tech";
        lastWasBullet = false;
        continue;
      }
      if (mode === "tech") {
        opts.onTechnologies(splitList(content));
        continue;
      }
      out.achievements.push(content);
      lastWasBullet = true;
      continue;
    }

    if (lastWasBullet && /^\s{2,}\S/.test(raw) && out.achievements.length > 0) {
      out.achievements[out.achievements.length - 1] += ` ${t}`;
      continue;
    }

    const lab = matchLabel(t);
    if (lab && TECH_LABEL.test(lab.norm)) {
      if (lab.value) {
        opts.onTechnologies(splitList(lab.value));
        mode = "normal";
      } else mode = "tech";
      lastWasBullet = false;
      continue;
    }
    if (lab && ACHIEVEMENT_LABEL.test(lab.norm) && !lab.value) {
      mode = "normal";
      lastWasBullet = false;
      continue;
    }
    if (opts.urlLabels && lab && URL_LABEL.test(lab.norm) && extractUrl(lab.value)) {
      out.urls.push(extractUrl(lab.value)!);
      lastWasBullet = false;
      continue;
    }
    mode = "normal";
    pushText(t);
  }
  while (out.text.length && out.text[out.text.length - 1] === "") out.text.pop();
  return out;
}

function parseEducationEntry(entry: RawEntry): CvEducation {
  const edu: CvEducation = {
    institution: "",
    location: "",
    degree: "",
    field: "",
    start_date: "",
    end_date: "",
    honors: [],
  };
  let dateText = "";
  const locationParts: string[] = [];

  const heading = stripWrap(entry.heading ?? "");
  if (!isEmptyEntryHeading(heading)) {
    const segments = heading.split(/\s*\|\s*/).map((s) => stripWrap(s)).filter(Boolean);
    const nonDate: string[] = [];
    for (const seg of segments) {
      if (!dateText && isDateLike(seg)) dateText = seg;
      else nonDate.push(seg);
    }
    const degreeText = nonDate[0] ?? "";
    if (nonDate[1]) edu.institution = nonDate[1];
    locationParts.push(...nonDate.slice(2));
    const split =
      splitOnce(degreeText, /\s+in\s+/i, false) ??
      splitOnce(degreeText, /\s+en\s+/i, false) ??
      splitOnce(degreeText, /,\s+/, false);
    if (split) {
      edu.degree = stripWrap(split[0]);
      edu.field = stripWrap(split[1]);
    } else {
      edu.degree = degreeText;
    }
  }

  const { meta, rest } = takeMetaLines(entry.body, true);
  for (const line of meta) {
    const segments = expandSegments(splitMetaSegments(line));
    const nonDate: Segment[] = [];
    for (const seg of segments) {
      if (!dateText && isDateLike(seg.text)) dateText = seg.text;
      else nonDate.push(seg);
    }
    if (!edu.institution) {
      const emphIdx = nonDate.findIndex((s) => s.emph !== null);
      const idx = emphIdx >= 0 ? emphIdx : nonDate.length > 0 ? 0 : -1;
      if (idx >= 0) edu.institution = nonDate.splice(idx, 1)[0].text;
    }
    locationParts.push(...nonDate.map((s) => s.text));
  }
  edu.location = locationParts.join(" | ");

  if (dateText) {
    const range = parseDateRange(dateText, "education");
    edu.start_date = range.start;
    edu.end_date = range.end === null ? "Present" : range.end;
  }

  // Honors: "Honors: a, b" (split), "Honors:" + bullets (verbatim), other lines verbatim.
  for (const raw of rest) {
    const t = raw.trim();
    if (!t) continue;
    const li = raw.match(LIST_RE);
    const content = li ? li[3].trim() : t;
    const h = matchHeading(t);
    if (h) {
      if (!HONORS_LABEL.test(normalizeHeadingText(h.text))) edu.honors.push(h.text);
      continue;
    }
    const lab = matchLabel(content);
    if (lab && HONORS_LABEL.test(lab.norm)) {
      if (lab.value) pushUnique(edu.honors, splitList(lab.value));
      continue;
    }
    edu.honors.push(content);
  }
  return edu;
}

function parseProjectEntry(entry: RawEntry): CvProject {
  const project: CvProject = {
    name: "",
    description: "",
    achievements: [],
    technologies: [],
    url: "",
  };

  let heading = stripWrap(entry.heading ?? "");
  const link = heading.match(MD_LINK_RE);
  if (link) {
    heading = stripWrap(link[1]);
    project.url = link[2];
  } else {
    const trailing = heading.match(/^(.*?)\s+(?:\||—|–|-)\s+(\S+)$/);
    if (trailing && extractUrl(trailing[2])) {
      heading = trailing[1].trim();
      project.url = extractUrl(trailing[2])!;
    }
  }
  project.name = isEmptyEntryHeading(heading) ? "" : heading;

  const body = [...entry.body];
  const firstIdx = body.findIndex((l) => l.trim());
  if (firstIdx >= 0 && !project.url && !LIST_RE.test(body[firstIdx])) {
    const url = extractUrl(body[firstIdx]);
    if (url) {
      project.url = url;
      body.splice(firstIdx, 1);
    }
  }

  const parsed = parseEntryBody(body, {
    onTechnologies: (items) => pushUnique(project.technologies, items),
    urlLabels: true,
  });
  project.achievements = parsed.achievements;
  const text = [...parsed.text];
  for (const url of parsed.urls) {
    if (!project.url) project.url = url;
    else text.push("", url);
  }
  project.description = joinParagraphs(text);
  return project;
}

// ---------------------------------------------------------------------------
// Skills, certifications, languages
// ---------------------------------------------------------------------------

function parseSkills(section: RawSection, cv: ParsedCv): void {
  const sectionBucket: "technical" | "soft" = isSoftSkillsLabel(section.heading) ? "soft" : "technical";
  let bucket = sectionBucket;
  const add = (target: "technical" | "soft", items: string[]) => pushUnique(cv.skills[target], items);
  const labelBucket = (label: string): "technical" | "soft" => {
    if (isSoftSkillsLabel(label)) return "soft";
    if (/\b(?:tech|technical|tecnicas?|hard|duras)\b/.test(normalizeHeadingText(label))) return "technical";
    return sectionBucket;
  };

  for (const raw of section.lines) {
    const t = raw.trim();
    if (!t || FENCE_RE.test(t) || RULE_RE.test(t)) continue;
    const h = matchHeading(t);
    if (h) {
      bucket = labelBucket(h.text);
      continue;
    }
    const li = raw.match(LIST_RE);
    const content = li ? li[3].trim() : t;
    const lab = matchLabel(content);
    if (lab && lab.label.length <= 40) {
      const target = labelBucket(lab.label);
      if (lab.value) add(target, splitList(lab.value));
      else bucket = target;
      continue;
    }
    add(bucket, splitList(content));
  }
}

function parseCertifications(section: RawSection, cv: ParsedCv): void {
  let lastWasBullet = false;
  for (const raw of section.lines) {
    const t = raw.trim();
    if (!t || FENCE_RE.test(t) || RULE_RE.test(t)) {
      lastWasBullet = false;
      continue;
    }
    const h = matchHeading(t);
    if (h) {
      cv.certifications.push(h.text);
      lastWasBullet = false;
      continue;
    }
    const li = raw.match(LIST_RE);
    if (li) {
      cv.certifications.push(li[3].trim());
      lastWasBullet = true;
      continue;
    }
    if (lastWasBullet && /^\s{2,}\S/.test(raw) && cv.certifications.length > 0) {
      cv.certifications[cv.certifications.length - 1] += ` ${t}`;
      continue;
    }
    cv.certifications.push(t);
    lastWasBullet = false;
  }
}

function matchLevelPrefix(text: string): { level: CvLanguage["level"]; rest: string } | null {
  const nfc = text.normalize("NFC").trim();
  const norm = fold(nfc);
  for (const [alias, level] of LEVEL_ALIASES) {
    if (!norm.startsWith(alias)) continue;
    const next = norm.charAt(alias.length);
    if (next && /[a-z0-9]/.test(next)) continue;
    return { level, rest: nfc.slice(alias.length) };
  }
  return null;
}

function parseLanguageEntry(text: string, warnings: string[]): CvLanguage | null {
  const t = text.trim().replace(/\.$/, "");
  if (!t) return null;
  let name = t;
  let rest = "";

  const lab = matchLabel(t);
  // Dash/paren forms only split outside parentheses: "English (Fluent - TOEFL 110)".
  const dash = t.match(/^([^()]+?)\s+[—–|-]\s+(.+)$/);
  const paren = t.match(/^([^()]+?)\s*\((.+)\)$/);
  if (lab && !lab.label.includes("(")) {
    name = lab.label;
    rest = lab.value;
  } else if (dash) {
    name = dash[1];
    rest = dash[2];
  } else if (paren) {
    name = paren[1];
    rest = paren[2];
  }
  name = stripWrap(name).trim();
  if (!name) return null;

  let levelText = stripWrap(rest.trim());
  let certification = "";
  const certParen = levelText.match(/^(.*?)\s*\((.+)\)$/);
  if (certParen && certParen[1].trim()) {
    levelText = stripWrap(certParen[1].trim());
    certification = certParen[2].trim();
  }

  const found = matchLevelPrefix(levelText);
  if (found) {
    const extra = found.rest.replace(/^[\s,;:/–—-]+/, "").trim();
    if (extra) certification = [extra, certification].filter(Boolean).join(", ");
    return { name, level: found.level, certification };
  }
  if (!levelText && certification) {
    const inner = matchLevelPrefix(certification);
    if (inner) {
      return { name, level: inner.level, certification: inner.rest.replace(/^[\s,;:/–—-]+/, "").trim() };
    }
  }
  if (levelText) {
    warnings.push(`Language "${name}": unknown level "${levelText}" kept in certification`);
    certification = [certification, levelText].filter(Boolean).join("; ");
  } else {
    warnings.push(`Language "${name}": no proficiency level, defaulted to intermediate`);
  }
  return { name, level: "intermediate", certification };
}

function parseLanguages(section: RawSection, cv: ParsedCv, warnings: string[]): void {
  for (const raw of section.lines) {
    const t = raw.trim();
    if (!t || FENCE_RE.test(t) || RULE_RE.test(t)) continue;
    const h = matchHeading(t);
    const li = raw.match(LIST_RE);
    const content = h ? h.text : li ? li[3].trim() : t;

    const pieces = splitTopLevel(content);
    const hasMarker = (p: string) => /[:(]|\s[—–|-]\s/.test(p);
    const multiple =
      pieces.length > 1 &&
      (pieces.every(hasMarker) || pieces.every((p) => !hasMarker(p) && p.split(/\s+/).length <= 3));
    for (const piece of multiple ? pieces : [content]) {
      const lang = parseLanguageEntry(piece, warnings);
      if (lang) cv.languages.push(lang);
    }
  }
}

/** Splits on , and ; outside parentheses (keeps emphasis untouched). */
function splitTopLevel(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of value) {
    if (ch === "(" || ch === "[") depth++;
    else if ((ch === ")" || ch === "]") && depth > 0) depth--;
    if (depth === 0 && (ch === "," || ch === ";")) {
      out.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  out.push(buf.trim());
  return out.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

function emptyCv(): ParsedCv {
  return {
    full_name: "",
    email: "",
    phone: "",
    location: "",
    linkedin_url: "",
    github_url: "",
    portfolio_url: "",
    summary: "",
    skills: { technical: [], soft: [] },
    experience: [],
    education: [],
    certifications: [],
    projects: [],
    languages: [],
  };
}

export function parseCvMarkdown(markdown: string): CvMarkdownParseResult {
  const warnings: string[] = [];
  const ctx: ParseContext = { warnings, untitledEntries: 0 };
  const cv = emptyCv();
  const extras: CvExtraSection[] = [];
  const recognized: CvSectionType[] = [];

  const payload = extractCvPayload(markdown);
  const hadHeadings = payload
    .split("\n")
    .some((line) => HEADING_RE.test(line.replace(/\s+$/, "")));
  const lines = normalizeCvMarkdown(payload)
    .split("\n")
    .filter((line) => !FENCE_RE.test(line))
    .map((line, i, all) => promotePlainSectionLine(line, i === 0 || !all[i - 1].trim()));
  const promoted = !hadHeadings && lines.some((line) => HEADING_RE.test(line));

  const headings = lines
    .map((line, i) => ({ i, h: matchHeading(line) }))
    .filter((x): x is { i: number; h: Heading } => x.h !== null);

  // --- Name -----------------------------------------------------------------
  let nameIdx = -1;
  const headerLines: string[] = [];
  const firstCanonical = headings.find((x) => canonicalSectionType(x.h.text));
  const firstH1 = headings.find((x) => x.h.level === 1);
  if (
    firstH1 &&
    !canonicalSectionType(firstH1.h.text) &&
    (!firstCanonical || firstCanonical.i > firstH1.i)
  ) {
    nameIdx = firstH1.i;
  } else if (headings.length > 0 && !canonicalSectionType(headings[0].h.text)) {
    const first = headings[0];
    const before = lines.slice(0, first.i).some((l) => l.trim());
    if (!before && looksLikeName(first.h.text)) {
      nameIdx = first.i;
      warnings.push(`Name taken from a level-${first.h.level} heading`);
    }
  }
  if (nameIdx >= 0) {
    const text = stripWrap(matchHeading(lines[nameIdx])!.text);
    const [name, ...restParts] = text.split(/\s+[|·•—–]\s+/);
    cv.full_name = stripWrap(name);
    if (restParts.length) headerLines.push(restParts.join(" | "));
  } else {
    const firstLineIdx = lines.findIndex((l) => l.trim());
    const stop = firstCanonical ? firstCanonical.i : lines.length;
    if (firstLineIdx >= 0 && firstLineIdx < stop && !matchHeading(lines[firstLineIdx])) {
      const candidate = lines[firstLineIdx].trim();
      const bold = unwrap(candidate);
      if ((bold.emph === "bold" && looksLikeName(bold.text)) || looksLikeName(candidate)) {
        cv.full_name = stripWrap(candidate);
        nameIdx = firstLineIdx;
        warnings.push("Name taken from the first line (no # heading)");
      }
    }
    if (!cv.full_name) warnings.push("Could not find the candidate name");
  }

  // --- Section level & boundaries -----------------------------------------------
  const canonicalLevels = headings
    .filter((x) => x.i !== nameIdx && canonicalSectionType(x.h.text))
    .map((x) => x.h.level);
  const sectionLevel = canonicalLevels.length > 0 ? Math.min(...canonicalLevels) : 2;

  const sections: RawSection[] = [];
  let current: RawSection | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (i === nameIdx) continue;
    const line = lines[i];
    const h = matchHeading(line);
    if (h && h.level <= sectionLevel) {
      const type = canonicalSectionType(h.text);
      if (type) {
        current = { type, heading: stripWrap(h.text), lines: [] };
        sections.push(current);
        continue;
      }
      if (current && promoted && /:\s*$/.test(h.text)) {
        // A promoted "**Label:**" line, not a heading.
        current.lines.push(`**${h.text}**`);
        continue;
      }
      if (
        current &&
        isEntryKind(current.type) &&
        (promoted || looksLikeEntryHeading(current.type, h.text, nextNonEmpty(lines, i + 1)))
      ) {
        current.lines.push(`${"#".repeat(Math.min(6, sectionLevel + 1))} ${h.text}`);
        continue;
      }
      current = { type: null, heading: stripWrap(h.text), lines: [] };
      sections.push(current);
      continue;
    }
    if (current) current.lines.push(line);
    else headerLines.push(line);
  }

  // --- Header -----------------------------------------------------------------
  const header: HeaderState = { overflow: [], headlines: [], summary: [] };
  const headerContent = headerLines.filter((line) => {
    if (CHAT_PREAMBLE.test(line.trim())) {
      warnings.push(`Ignored chat preamble: "${line.trim().slice(0, 80)}"`);
      return false;
    }
    return true;
  });
  parseContactLines(headerContent, cv, header);

  // --- Sections -----------------------------------------------------------------
  for (const sec of sections) {
    if (!sec.type) {
      const body = trimBlock(sec.lines);
      if (!body) {
        warnings.push(`Empty unrecognized section "${sec.heading}" ignored`);
        continue;
      }
      extras.push({ heading: sec.heading, body });
      warnings.push(`Unrecognized section "${sec.heading}" kept verbatim`);
      continue;
    }
    if (!recognized.includes(sec.type)) recognized.push(sec.type);

    switch (sec.type) {
      case "summary": {
        const body = trimBlock(sec.lines);
        if (body) cv.summary = cv.summary ? `${cv.summary}\n\n${body}` : body;
        break;
      }
      case "skills":
        parseSkills(sec, cv);
        break;
      case "experience":
        for (const entry of splitEntries(sec.lines, sectionLevel, ctx, "Experience")) {
          cv.experience.push(parseExperienceEntry(entry, warnings));
        }
        break;
      case "education":
        for (const entry of splitEntries(sec.lines, sectionLevel, ctx, "Education")) {
          cv.education.push(parseEducationEntry(entry));
        }
        break;
      case "projects":
        for (const entry of splitEntries(sec.lines, sectionLevel, ctx, "Projects")) {
          cv.projects.push(parseProjectEntry(entry));
        }
        break;
      case "certifications":
        parseCertifications(sec, cv);
        break;
      case "languages":
        parseLanguages(sec, cv, warnings);
        break;
      case "contact":
        parseContactLines(sec.lines, cv, header);
        break;
    }
  }

  // --- Header leftovers (never dropped) -----------------------------------------
  if (header.summary.length > 0) {
    const text = header.summary.join("\n\n");
    cv.summary = cv.summary ? `${text}\n\n${cv.summary}` : text;
    warnings.push("Summary taken from an unlabeled paragraph in the header");
  }
  if (header.headlines.length > 0) {
    extras.unshift({ heading: "Headline", body: header.headlines.join("\n") });
    warnings.push(`Headline "${header.headlines.join(" | ")}" kept as an extra section`);
  }
  if (header.overflow.length > 0) {
    extras.push({ heading: "Additional Contact Info", body: header.overflow.join("\n") });
    warnings.push(`Unmapped contact details kept as an extra section: ${header.overflow.join(", ")}`);
  }

  if (extras.length > 0) cv.extra_sections = extras;

  // Untitled entries mean the entry structure wasn't recognized (e.g. plain-text roles).
  const coreSections = recognized.filter((t) => t !== "contact");
  const confidence: CvMarkdownParseResult["confidence"] =
    !cv.full_name || coreSections.length === 0 || ctx.untitledEntries > 0
      ? "low"
      : warnings.length > 0
        ? "medium"
        : "high";

  return { parsed: cv, warnings, recognizedSections: recognized, confidence };
}

/**
 * True when the deterministic parse is not trustworthy enough and the caller should ask
 * the LLM to structure the CV instead: low confidence, or fewer roles than the source CV.
 */
export function needsLlmParseFallback(
  result: CvMarkdownParseResult,
  source?: ParsedCv | null,
): boolean {
  if (result.confidence === "low") return true;
  const sourceRoles = source?.experience?.length ?? 0;
  return sourceRoles > 0 && result.parsed.experience.length < sourceRoles;
}

const IDENTITY_FIELDS = [
  "full_name",
  "email",
  "phone",
  "location",
  "linkedin_url",
  "github_url",
  "portfolio_url",
] as const;

/** Fills ONLY empty identity/contact fields from the source CV; never overwrites. */
export function fillIdentityFromSource(parsed: ParsedCv, source: ParsedCv): ParsedCv {
  const out: ParsedCv = { ...parsed };
  for (const field of IDENTITY_FIELDS) {
    if (!(out[field] ?? "").trim() && (source?.[field] ?? "").trim()) {
      out[field] = source[field];
    }
  }
  return out;
}
