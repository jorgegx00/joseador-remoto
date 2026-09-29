/**
 * Claim checks for LLM-optimized CVs: invented metrics ("95% faster" that the source CV
 * never states), skills pulled in from the job post, and tech terms that appear out of
 * nowhere. Pure heuristics — they flag for human review, they never block.
 */

import type { ParsedCv } from "@/types/cv";
import type { Job } from "@/types/job";
import type { MatchAnalysis } from "@/types/llm";
import {
  COMMON_ENGLISH_WORDS,
  COMMON_SPANISH_WORDS,
  getSynonyms,
  isTechTerm,
} from "@/lib/ats/tech-dictionary";
import { STOP_WORDS } from "@/lib/ats/types";

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, ene: 1, enero: 1, janeiro: 1, januar: 1,
  feb: 2, february: 2, febrero: 2, fev: 2, fevereiro: 2, februar: 2,
  mar: 3, march: 3, marzo: 3, marco: 3, marz: 3,
  apr: 4, april: 4, abr: 4, abril: 4,
  may: 5, mayo: 5, mai: 5, maio: 5,
  jun: 6, june: 6, junio: 6, junho: 6, juni: 6,
  jul: 7, july: 7, julio: 7, julho: 7, juli: 7,
  aug: 8, august: 8, ago: 8, agosto: 8,
  sep: 9, sept: 9, september: 9, septiembre: 9, setiembre: 9, set: 9, setembro: 9,
  oct: 10, october: 10, octubre: 10, out: 10, outubro: 10, okt: 10, oktober: 10,
  nov: 11, november: 11, noviembre: 11, novembro: 11,
  dec: 12, december: 12, dic: 12, diciembre: 12, dez: 12, dezembro: 12, dezember: 12,
};

const MONTH_WORDS = Object.keys(MONTHS).join("|");

/** "January" / "ene." / "Sept" → 1..12; null for anything else. */
export function monthFromName(word: string): number | null {
  const key = stripAccents(word).toLowerCase().replace(/\.$/, "");
  return MONTHS[key] ?? null;
}

const PRESENT_RE =
  /\b(?:present|current|currently|now|today|ongoing|actualidad|actual|actualmente|presente|hoy|la fecha|en curso|atual|atualmente|heute|aktuell)\b/;

export type CvDate = { year: number; month: number | null } | "present";

/**
 * Parses a CV date: "2021-01", "01/2021", "January 2021", "Jan 2021", "Enero 2021",
 * "ene. 2021", "2016", "Present" / "Actualidad". Null when nothing parseable.
 */
export function parseCvDate(input: string): CvDate | null {
  const t = stripAccents(input ?? "").toLowerCase().trim();
  if (!t) return null;
  let m = t.match(/\b((?:19|20)\d{2})[-/.](\d{1,2})\b/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return { year: +m[1], month: +m[2] };
  m = t.match(/\b(\d{1,2})[-/.]((?:19|20)\d{2})\b/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return { year: +m[2], month: +m[1] };
  const year = t.match(/\b((?:19|20)\d{2})\b/);
  if (year) {
    let month: number | null = null;
    for (const word of t.match(/[a-z]+/g) ?? []) {
      month = monthFromName(word);
      if (month) break;
    }
    return { year: +year[1], month };
  }
  return PRESENT_RE.test(t) ? "present" : null;
}

const DATE_TOKEN = `(?:(?:${MONTH_WORDS})\\.?,?\\s+(?:de\\s+)?(?:19|20)\\d{2}|\\d{1,2}[-/.](?:19|20)\\d{2}|(?:19|20)\\d{2}[-/.]\\d{1,2}|(?:19|20)\\d{2})`;
const PRESENT_TOKEN =
  "(?:present|current|currently|now|today|ongoing|actualidad|actual|actualmente|presente|hoy|la fecha|en curso)";
const DATE_RANGE_RE = new RegExp(
  `(${DATE_TOKEN})\\s*(?:[-–—]+|\\bto\\b|\\ba\\b|\\bhasta\\b|\\bal?\\b)\\s*(${DATE_TOKEN}|${PRESENT_TOKEN})`,
  "i",
);
const SINGLE_DATE_RE = new RegExp(`(${DATE_TOKEN})`, "i");

export interface DateRangeMatch {
  /** The matched text, verbatim ("08/2024 - Present"). */
  text: string;
  /** Start as written ("08/2024"). */
  start: string;
  /** End as written, or null when the role is current. */
  end: string | null;
}

/**
 * Finds a date range in a line and returns its parts verbatim, keeping the CV's own
 * format ("January 2021", "01/2021", "2016"). A lone date counts as a range with the
 * same start and end ("2019" for a degree).
 */
export function findDateRange(text: string): DateRangeMatch | null {
  // Strip accents one character at a time so indexes still match `text`.
  const normalized = text.replace(/[^\u0000-\u007f]/g, (c) => {
    const base = stripAccents(c);
    return base.length === 1 ? base : c;
  });
  const range = DATE_RANGE_RE.exec(normalized);
  if (range) {
    // Slice the original text so accents survive ("Enero 2021 – Actualidad").
    const original = text.slice(range.index, range.index + range[0].length);
    const startOriginal = text.slice(range.index, range.index + range[1].length);
    const endOffset = range.index + range[0].length - range[2].length;
    const endOriginal = text.slice(endOffset, range.index + range[0].length);
    const end = parseCvDate(range[2]) === "present" ? null : endOriginal;
    return { text: original, start: startOriginal.trim(), end: end?.trim() ?? null };
  }
  const single = SINGLE_DATE_RE.exec(normalized);
  if (single) {
    const original = text.slice(single.index, single.index + single[0].length).trim();
    return { text: original, start: original, end: original };
  }
  return null;
}

/**
 * Total professional experience in whole years: union of the role intervals (overlaps
 * merged, so parallel jobs don't double count), floored. A year-only start counts from
 * January, a year-only end through December. Missing/"Present" end dates run to `now`.
 * Null when no role has a parseable start date.
 */
export function computeExperienceYears(cv: ParsedCv, now: Date = new Date()): number | null {
  const nowIdx = now.getFullYear() * 12 + now.getMonth();
  const intervals: Array<[number, number]> = [];
  for (const exp of cv.experience ?? []) {
    const start = parseCvDate(exp.start_date ?? "");
    if (!start || start === "present") continue;
    const startIdx = start.year * 12 + (start.month ?? 1) - 1;
    let endIdx: number;
    const rawEnd = exp.end_date;
    if (rawEnd == null || !rawEnd.trim()) {
      endIdx = nowIdx;
    } else {
      const end = parseCvDate(rawEnd);
      if (!end) continue;
      endIdx = end === "present" ? nowIdx : end.year * 12 + (end.month ?? 12) - 1;
    }
    endIdx = Math.min(endIdx, nowIdx);
    if (endIdx < startIdx) continue;
    intervals.push([startIdx, endIdx + 1]);
  }
  if (intervals.length === 0) return null;
  intervals.sort((x, y) => x[0] - y[0]);
  let total = 0;
  let [curStart, curEnd] = intervals[0];
  for (const [s, e] of intervals.slice(1)) {
    if (s <= curEnd) {
      curEnd = Math.max(curEnd, e);
    } else {
      total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    }
  }
  total += curEnd - curStart;
  return Math.floor(total / 12);
}

// ---------------------------------------------------------------------------
// Figures (metrics)
// ---------------------------------------------------------------------------

export type FigureKind = "percent" | "multiplier" | "number";

export interface FigureMatch {
  /** As written in the text, e.g. "US$ 50k", "95 %". */
  raw: string;
  /** Comparison key: "95%", "3x", "1000000". Currency and plain numbers share the number space. */
  canonical: string;
  kind: FigureKind;
  value: number;
  /** Offset of `raw` within the text. */
  index: number;
  /** Followed by "years"/"años" — eligible for the experience-years allowance. */
  years: boolean;
}

const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const DOMAIN_RE =
  /\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|io|dev|app|ai|co|me|es|do|mx|info|tech|xyz|ly|gg|site|page|link|us|uk|ca)\b(?:\/\S*)?/gi;
const PHONE_RE =
  /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\b\d{2,4}[\s.-])\d{3,4}[\s.-]\d{3,4}\b/g;
const NUMERIC_DATE_RE = /\b\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}\b/g;
const YEAR_MONTH_RE = /\b(?:19|20)\d{2}[-/.](?:0?[1-9]|1[0-2])\b/g;
const MONTH_YEAR_RE = /\b(?:0?[1-9]|1[0-2])[-/.](?:19|20)\d{2}\b/g;
const YEAR_RANGE_SHORT_RE = /\b(?:19|20)\d{2}\s*[-–—]\s*\d{2}\b/g;
const RATIO_RE = /\b\d+(?:[/:]\d+)+\b/g;
const MONTH_DAY_YEAR_RE = new RegExp(
  String.raw`\b(?:${MONTH_WORDS})\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+(?:19|20)\d{2}\b`,
  "gi",
);
const DAY_MONTH_RE = new RegExp(
  String.raw`\b\d{1,2}\s+(?:de\s+(?:${MONTH_WORDS})\b|(?:${MONTH_WORDS})\.?\s+(?:de\s+)?(?:19|20)\d{2}\b)`,
  "gi",
);
const LIST_MARKER_RE = /^\s*\d{1,2}[.)]\s/;

const FIGURE_RE = new RegExp(
  String.raw`(?<cur>(?:US\$|RD\$|USD|EUR|MXN|DOP|\$|€|£)\s?)?` +
    String.raw`(?<num>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)` +
    String.raw`(?:(?<pct>\s?%|\s(?:por\s?ciento|percent)\b)` +
    String.raw`|(?<mult>[x×X](?![\p{L}\p{N}])|\s(?:times|veces)\b)` +
    String.raw`|(?<scale>\s?(?:[kK]|MM|M|m|B|bn)(?![\p{L}\p{N}])|\s(?:mil\s+millones|millones|mill\p{L}\p{M}?n|millions?|billions?|thousand|mil)(?![\p{L}])))?` +
    String.raw`(?<plus>\s?\+)?`,
  "gu",
);

/** Units a number may be glued to and still be a metric ("200ms", "4GB", "24h"). */
const UNIT_WORDS = new Set([
  "ms", "s", "sec", "secs", "h", "hr", "hrs", "hs", "min", "mins", "gb", "mb", "tb", "kb", "pb",
  "gbps", "mbps", "hz", "ghz", "mhz", "px", "rps", "qps", "tps", "rpm", "yr", "yrs", "y",
]);

/** Words after which a small number is a version, not a metric ("Web 2.0", "Office 365"). */
const VERSION_WORDS = new Set([
  "version", "v", "release", "gen", "generation", "level", "tier", "phase", "web",
  "oauth", "ios", "android", "windows", "macos", "ubuntu", "debian", "centos", "rhel", "fedora",
  "office", "microsoft", "dynamics", "iso", "soc", "pci", "dss", "ecmascript", "html",
  "css", "http", "ipv", "python", "java", "php", "angular", "vue", "react", "node", "c#",
  ".net", "c++", "swift", "kotlin", "rails", "django", "laravel", "spring", "jdk", "jre",
]);

const MIN_PLAIN_NUMBER = 2;

/**
 * Every metric-like figure in `text` with its canonical form. Ignores years (1950–2099),
 * dates and date ranges, versions glued to tech names (EC2, ES6, HTML5, "Java 17",
 * "Web 2.0"), phone numbers, emails, URLs, ordinals ("1st") and markdown heading lines.
 */
export function extractFigureMatches(text: string): FigureMatch[] {
  const out: FigureMatch[] = [];
  let offset = 0;
  for (const line of (text ?? "").split("\n")) {
    const lineOffset = offset;
    offset += line.length + 1;
    if (/^\s*#/.test(line)) continue;

    const cleaned = maskNonMetrics(line);
    const re = new RegExp(FIGURE_RE.source, FIGURE_RE.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(cleaned)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      const g = m.groups ?? {};
      const start = m.index;
      const end = start + m[0].trimEnd().length;
      const prev = cleaned[start - 1] ?? "";
      const prev2 = cleaned[start - 2] ?? "";
      // Glued to a word ("EC2", "ES6", "B2B") or a tail of a version/code ("1.2.3", "COVID-19").
      if (/[\p{L}\p{N}_]/u.test(prev)) continue;
      if (/[.,/:+#]/.test(prev) && /[\p{L}\p{N}]/u.test(prev2)) continue;
      if (prev === "-" && /\p{L}/u.test(prev2)) continue; // "COVID-19"; "10-15" stays a range

      const after = cleaned.slice(end);
      if (/^[.,]\d/.test(after) || /^[/:]\d/.test(after)) continue;
      const glued = after.match(/^\p{L}+/u)?.[0];
      if (glued && !UNIT_WORDS.has(glued.toLowerCase())) continue; // "1st", "5G", "3D", "2FA"

      const num = g.num;
      const cur = g.cur ?? "";
      const pct = g.pct;
      const mult = g.mult;
      let scaleWord = (g.scale ?? "").trim();
      const plus = g.plus ?? "";
      if (scaleWord === "m" && !cur) scaleWord = ""; // "15m" = minutes/meters, not millions

      const prevWord = cleaned.slice(0, start).match(/([\p{L}\p{N}.#+]+)\s+$/u)?.[1];
      if (prevWord && !pct && !mult && !scaleWord && !cur && isVersionPrefix(prevWord, num)) continue;

      let value = parseLocaleNumber(num);
      if (!Number.isFinite(value)) continue;
      value *= scaleFactor(scaleWord);

      let kind: FigureKind = "number";
      if (pct) kind = "percent";
      else if (mult) kind = "multiplier";

      if (kind === "number") {
        const isYear =
          !cur && !scaleWord && /^\d{4}$/.test(num) && value >= 1950 && value <= 2099;
        if (isYear) continue;
        if (value < MIN_PLAIN_NUMBER) continue;
      }

      const canonical =
        kind === "percent" ? `${fmt(value)}%` : kind === "multiplier" ? `${fmt(value)}x` : fmt(value);
      const raw = line.slice(start, end).trim();
      const years =
        kind === "number" && /^\s*\+?\s*(?:years?|yrs?\b|a\p{L}os|anos)/iu.test(cleaned.slice(end));
      out.push({ raw: raw || `${cur}${num}${plus}`, canonical, kind, value, index: lineOffset + start, years });
    }
  }
  return out;
}

/** Canonical forms of the metric-like figures in `text`, deduped, in order of appearance. */
export function extractFigures(text: string): string[] {
  return [...new Set(extractFigureMatches(text).map((f) => f.canonical))];
}

/**
 * Figures in `candidateText` (as written, deduped by canonical form) that the source CV
 * does not support. Supported = same canonical figure in the source, in any of
 * `allowedTexts`, or in `allowedFigures`. A plain number is also supported when the same
 * value appears in the source as any kind. "N+ years" / "N años" pass when N ≤ `maxYears`.
 */
export function findUnsupportedFigures(
  sourceText: string,
  candidateText: string,
  opts: { allowedTexts?: string[]; allowedFigures?: string[]; maxYears?: number | null } = {},
): string[] {
  const allowed = new Set<string>();
  const allowedValues = new Set<number>();
  const addText = (text: string) => {
    for (const f of extractFigureMatches(text)) {
      allowed.add(f.canonical);
      allowedValues.add(f.value);
    }
  };
  addText(sourceText ?? "");
  for (const t of opts.allowedTexts ?? []) addText(t ?? "");
  for (const f of opts.allowedFigures ?? []) {
    const matches = extractFigureMatches(f ?? "");
    if (matches.length > 0) matches.forEach((x) => allowed.add(x.canonical));
    else if (f?.trim()) allowed.add(f.trim().toLowerCase());
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const f of extractFigureMatches(candidateText ?? "")) {
    if (allowed.has(f.canonical)) continue;
    if (f.kind === "number" && allowedValues.has(f.value)) continue;
    if (f.years && opts.maxYears != null && f.value <= opts.maxYears) continue;
    if (seen.has(f.canonical)) continue;
    seen.add(f.canonical);
    out.push(f.raw);
  }
  return out;
}

/** Replaces URLs, emails, phones and dates with spaces (same length, so offsets stay valid). */
function maskNonMetrics(line: string): string {
  let s = line.replace(LIST_MARKER_RE, (m) => " ".repeat(m.length));
  for (const re of [
    URL_RE,
    EMAIL_RE,
    DOMAIN_RE,
    MONTH_DAY_YEAR_RE,
    DAY_MONTH_RE,
    NUMERIC_DATE_RE,
    YEAR_MONTH_RE,
    MONTH_YEAR_RE,
    YEAR_RANGE_SHORT_RE,
    PHONE_RE,
    RATIO_RE,
  ]) {
    s = s.replace(re, (m) => " ".repeat(m.length));
  }
  return s;
}

function isVersionPrefix(word: string, num: string): boolean {
  const lower = stripAccents(word).toLowerCase().replace(/[.,:;]+$/, "");
  if (VERSION_WORDS.has(lower)) return /^\d{1,5}(?:\.\d+)*$/.test(num);
  // Tech names written with a capital ("Python 3", "Angular 17"); lowercase ones are often plain words.
  if (isTechTerm(lower) && word !== word.toLowerCase()) return /^\d{1,2}(?:\.\d+)*$/.test(num);
  return false;
}

/** "1,000" / "1.000" / "1000" → 1000; "2.5" / "2,5" → 2.5; "1,000.50" → 1000.5. */
function parseLocaleNumber(s: string): number {
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    return s.lastIndexOf(".") > s.lastIndexOf(",")
      ? Number(s.replace(/,/g, ""))
      : Number(s.replace(/\./g, "").replace(",", "."));
  }
  if (!hasComma && !hasDot) return Number(s);
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ""));
  return Number(s.replace(",", "."));
}

function scaleFactor(word: string): number {
  if (!word) return 1;
  const w = stripAccents(word).toLowerCase().replace(/\s+/g, " ");
  if (w === "k" || w === "thousand" || w === "mil") return 1e3;
  if (w === "mil millones" || w === "b" || w === "bn" || /^billions?$/.test(w)) return 1e9;
  if (w === "m" || w === "mm" || /^(?:millon|millones|millions?)$/.test(w)) return 1e6;
  return 1;
}

function fmt(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

/** Synonyms too generic to count as the skill when they are not the skill itself. */
const EXCLUDED_SYNONYMS = new Set([
  "next", "nest", "solid", "elastic", "rabbit", "dynamo", "spring", "tf", "py", "dl",
]);

/** True for words that are also common English/Spanish words or ≤2 letters ("go", "react", "r"). */
export function isAmbiguousWord(lower: string): boolean {
  if (!/^\p{L}+$/u.test(lower)) return false;
  return (
    lower.length <= 2 ||
    STOP_WORDS.has(lower) ||
    COMMON_ENGLISH_WORDS.has(lower) ||
    COMMON_SPANISH_WORDS.has(lower)
  );
}

const skillRegexCache = new Map<string, RegExp[]>();

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function variantPattern(variant: string, ambiguous: boolean): string {
  const body = escapeRe(variant)
    .split(/\s+/)
    .map((part) => part.replace(/\\?-/g, "[\\s\\-]?"))
    .join("[\\s\\-]+");
  const tail = ambiguous ? "(?![\\p{L}\\p{N}_+#]|-\\p{L})" : "(?![\\p{L}\\p{N}_+#])";
  return `(?<![\\p{L}\\p{N}_])${body}${tail}`;
}

function skillRegexes(skill: string): RegExp[] {
  const key = skill.trim();
  const cached = skillRegexCache.get(key);
  if (cached) return cached;
  const base = stripAccents(key);
  const res: RegExp[] = [];
  const variants = new Set<string>([base.toLowerCase()]);
  for (const syn of getSynonyms(base)) {
    if (!EXCLUDED_SYNONYMS.has(syn) || syn === base.toLowerCase()) variants.add(stripAccents(syn));
  }
  for (const v of variants) {
    if (!v) continue;
    if (isAmbiguousWord(v)) {
      // Case-sensitive: "Go" (the language) must not match "go"/"good"; "JS" not "js".
      const forms = new Set([v.toUpperCase(), v[0].toUpperCase() + v.slice(1)]);
      if (v === base.toLowerCase()) forms.add(base);
      for (const f of forms) res.push(new RegExp(variantPattern(f, true), "u"));
    } else {
      res.push(new RegExp(variantPattern(v, false), "iu"));
    }
  }
  if (skillRegexCache.size > 2000) skillRegexCache.clear();
  skillRegexCache.set(key, res);
  return res;
}

/**
 * True when `text` mentions `skill` (or a known synonym: JS ↔ JavaScript, k8s ↔ Kubernetes).
 * Word-boundary aware for symbol tokens (C++, C#, .NET, Node.js, CI/CD); short or
 * common-word skills ("Go", "R") match case-sensitively so "good"/"go" don't count.
 */
export function containsSkill(text: string, skill: string): boolean {
  if (!text || !skill || !skill.trim()) return false;
  const haystack = stripAccents(text);
  return skillRegexes(skill).some((re) => re.test(haystack));
}

/** JD skills the candidate text mentions but the source CV does not. Deduped, in input order. */
export function findAddedJdSkills(
  sourceText: string,
  candidateText: string,
  jdSkills: string[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const skill of jdSkills) {
    const key = skillKey(skill);
    if (!skill?.trim() || seen.has(key)) continue;
    if (containsSkill(candidateText, skill) && !containsSkill(sourceText, skill)) {
      seen.add(key);
      out.push(skill);
    }
  }
  return out;
}

const TERM_TOKEN_RE =
  /(?:(?<![\p{L}\p{N}_.])\.)?[\p{L}\p{N}_]+(?:[./-][\p{L}\p{N}_]+)*[+#]*/gu;

/**
 * Tech terms (dictionary-based, longest n-gram first) written in the candidate text that
 * appear in neither the source CV nor the job text — likely hallucinated tooling.
 * Lowercase mentions and sentence-initial common words ("Command", "Go ahead") are ignored.
 */
export function findNewTechTerms(
  sourceText: string,
  candidateText: string,
  jobText: string,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of (candidateText ?? "").split("\n")) {
    const tokens = [...line.matchAll(TERM_TOKEN_RE)];
    let i = 0;
    while (i < tokens.length) {
      let consumed = 1;
      for (const n of [3, 2, 1]) {
        if (i + n > tokens.length) continue;
        const slice = tokens.slice(i, i + n);
        if (!contiguous(line, slice)) continue;
        const phrase = slice.map((t) => t[0]).join(" ");
        if (!isTechTerm(phrase)) continue;
        consumed = n;
        if (!acceptWrittenTerm(phrase, n, line, slice[0].index ?? 0)) break;
        const key = skillKey(phrase);
        if (seen.has(key)) break;
        seen.add(key);
        if (!containsSkill(sourceText, phrase) && !containsSkill(jobText, phrase)) out.push(phrase);
        break;
      }
      i += consumed;
    }
  }
  return out;
}

function contiguous(line: string, tokens: RegExpMatchArray[]): boolean {
  for (let k = 1; k < tokens.length; k++) {
    const prevEnd = (tokens[k - 1].index ?? 0) + tokens[k - 1][0].length;
    if (!/^[ \t]+$/.test(line.slice(prevEnd, tokens[k].index ?? 0))) return false;
  }
  return true;
}

function acceptWrittenTerm(phrase: string, n: number, line: string, index: number): boolean {
  if (/[A-Z]/.test(phrase.slice(1)) || /[\d.#+/]/.test(phrase)) return true; // GraphQL, K8s, CI/CD
  if (phrase === phrase.toLowerCase()) return false;
  if (n > 1) return true;
  const lower = phrase.toLowerCase();
  const common =
    STOP_WORDS.has(lower) || COMMON_ENGLISH_WORDS.has(lower) || COMMON_SPANISH_WORDS.has(lower);
  if (!common) return true;
  const before = line.slice(0, index).trim();
  const sentenceStart =
    before === "" || /[.!?]$/.test(before) || /^(?:[-*+•]|\d{1,2}[.)])$/.test(before);
  return !sentenceStart;
}

function skillKey(skill: string): string {
  const syn = getSynonyms(skill ?? "");
  if (syn.size > 0) return [...syn].sort()[0];
  return (skill ?? "").trim().toLowerCase();
}

export type SkillImportance = "critical" | "important" | "nice_to_have";

const IMPORTANCE_RANK: Record<SkillImportance, number> = {
  critical: 0,
  important: 1,
  nice_to_have: 2,
};

/**
 * Job skills the source CV lacks: the analysis' `found: false` skills (with their
 * importance; dropped when the CV text does contain them) plus `skills_required` entries
 * not found in the CV ("important"). Deduped via synonyms/containment keeping the highest
 * importance; ordered critical → important → nice_to_have.
 */
export function computeMissingJdSkills(
  sourceText: string,
  job: Pick<Job, "skills_required" | "description" | "title">,
  analysis: MatchAnalysis | null,
): Array<{ skill: string; importance: SkillImportance }> {
  const candidates: Array<{ skill: string; importance: SkillImportance }> = [];
  for (const s of analysis?.skills_match ?? []) {
    if (!s?.skill?.trim() || s.found) continue;
    if (containsSkill(sourceText, s.skill)) continue;
    const importance: SkillImportance = s.importance in IMPORTANCE_RANK ? s.importance : "important";
    candidates.push({ skill: s.skill.trim(), importance });
  }
  for (const skill of job.skills_required ?? []) {
    if (!skill?.trim() || containsSkill(sourceText, skill)) continue;
    candidates.push({ skill: skill.trim(), importance: "important" });
  }

  const out: Array<{ skill: string; importance: SkillImportance }> = [];
  for (const c of candidates) {
    const dup = out.find(
      (o) =>
        skillKey(o.skill) === skillKey(c.skill) ||
        containsSkill(o.skill, c.skill) ||
        containsSkill(c.skill, o.skill),
    );
    if (!dup) {
      out.push({ ...c });
    } else if (IMPORTANCE_RANK[c.importance] < IMPORTANCE_RANK[dup.importance]) {
      dup.importance = c.importance;
    }
  }
  return out
    .map((o, i) => ({ o, i }))
    .sort((a, b) => IMPORTANCE_RANK[a.o.importance] - IMPORTANCE_RANK[b.o.importance] || a.i - b.i)
    .map(({ o }) => o);
}

// ---------------------------------------------------------------------------

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}
