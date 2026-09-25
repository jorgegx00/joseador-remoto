/**
 * Pasted job posts: the user copies a job post from any website and pastes the raw
 * text; it becomes a real Job row with source "manual".
 *
 * Pipeline (all pure except the SHA-256 id):
 *   heuristicJobDraft(text)          deterministic draft, always usable (never drops)
 *   mergeJobDraft(draft, llm | null) optional LLM extraction wins where non-null
 *   finalizePastedJob(text, draft)   Job fields (fallbacks, DR tier, raw payload)
 *   resolvePastedCompanyName(draft)  name for the companies row
 *   pastedJobExternalId(text)        stable dedup id ("manual:<sha256-hex-40>")
 */

import type { EmploymentType, Job, SeniorityLevel } from "@/types/job";
import type { PastedJobExtraction } from "@/lib/llm/job-extraction";
import { isDrFriendly } from "@/lib/dr-filter";
import { extractKeywords } from "@/lib/ats/keyword-matcher";
import {
  COMMON_ENGLISH_WORDS,
  COMMON_SPANISH_WORDS,
  TECH_TERMS,
  isTechTerm,
} from "@/lib/ats/tech-dictionary";
import { inferSeniority, sanitizeText } from "@/services/ingest/map";

export const PASTED_JOB_FALLBACK_TITLE = "Pasted job";
export const PASTED_JOB_FALLBACK_COMPANY = "Unknown company";

const MAX_HEURISTIC_SKILLS = 20;
const MAX_MERGED_SKILLS = 25;
const MAX_TITLE_CHARS = 200;
const MAX_COMPANY_CHARS = 120;

export interface PastedJobDraft {
  title: string;
  company_name: string;
  location: string;
  employment_type: EmploymentType | null;
  seniority_level: SeniorityLevel | null;
  skills_required: string[];
  /** Annualized (see {@link normalizeSalary}). */
  salary_min: number | null;
  /** Annualized (see {@link normalizeSalary}). */
  salary_max: number | null;
  salary_currency: string | null;
  apply_url: string;
  source_url: string;
  description: string;
}

type SalaryPeriod = "year" | "month" | "hour";

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/** Lowercase + strip diacritics (for comparisons only; never for output). */
function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Folded, punctuation-free key used for set lookups ("About the job:" -> "about the job"). */
function lineKey(s: string): string {
  return fold(s)
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalizes pasted text: NFC, CRLF, invisible format chars (zero-width spaces, BOM,
 * soft hyphens), NBSP and other exotic spaces, HTML remnants; trims every line and
 * collapses runs of blank lines.
 */
export function cleanPastedText(text: string): string {
  const pre = text
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/\p{Cf}/gu, "")
    .replace(/[^\S\n]+/g, " ");
  return sanitizeText(pre)
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const MIDDOT = String.fromCharCode(0xb7);
const BULLET = String.fromCharCode(0x2022);
/** Segment separators: middle dot / bullet ("Acme <dot> Santo Domingo <dot> 2 days ago") and "|". */
const SEGMENT_SPLIT_RE = new RegExp(String.raw`\s*[|${MIDDOT}${BULLET}]\s*`, "u");
/** "Title - Company" (dash / pipe / dot with spaces around it). */
const DASH_SPLIT_RE = new RegExp(
  String.raw`^(.{3,100}?)\s+[\p{Pd}|${MIDDOT}${BULLET}]\s+(.{2,80})$`,
  "u",
);
const AT_SPLIT_RE = /^(.{3,100}?)\s+(?:at|@)\s+(.{2,80})$/iu;

function firstSegment(s: string): string {
  return s.split(SEGMENT_SPLIT_RE)[0]?.trim() ?? "";
}

// ---------------------------------------------------------------------------
// Company-name helpers
// ---------------------------------------------------------------------------

/** Job boards / aggregators / ATS vendors: never the hiring company. Keys in lineKey form. */
const JOB_BOARD_NAMES: ReadonlySet<string> = new Set([
  "linkedin",
  "linkedin jobs",
  "indeed",
  "glassdoor",
  "computrabajo",
  "remoteok",
  "remote ok",
  "remote co",
  "weworkremotely",
  "we work remotely",
  "getonboard",
  "get on board",
  "getonbrd",
  "torre",
  "wellfound",
  "angellist",
  "angel list",
  "angel co",
  "ziprecruiter",
  "zip recruiter",
  "monster",
  "simplyhired",
  "simply hired",
  "dice",
  "bumeran",
  "occ",
  "occ mundial",
  "occmundial",
  "laborum",
  "zonajobs",
  "jooble",
  "remotive",
  "himalayas",
  "working nomads",
  "workingnomads",
  "jobspresso",
  "upwork",
  "workana",
  "google jobs",
  "infojobs",
  "tecnoempleo",
  "trabajando",
  "multitrabajos",
  "careerbuilder",
  "flexjobs",
  "otta",
  "welcome to the jungle",
  "builtin",
  "built in",
  "hireline",
  "aldaba",
  "empleate",
  "jobatus",
  "jobgether",
  "nodesk",
  "dynamite jobs",
  "arc dev",
  "lever",
  "greenhouse",
  "workable",
  "ashby",
  "smartrecruiters",
  "bamboohr",
  "teamtailor",
  "breezy",
  "breezy hr",
]);

/** True for job-board / aggregator names ("LinkedIn", "Indeed.com", "www.computrabajo.com.do"). */
export function isJobBoardName(name: string | null | undefined): boolean {
  if (!name) return false;
  const base = fold(name).trim().replace(/^https?:\/\//, "").replace(/^www\./, "");
  const candidates = new Set<string>();
  const add = (s: string) => {
    const key = lineKey(s);
    if (!key) return;
    candidates.add(key);
    candidates.add(key.replace(/\s+(jobs|empleos|careers|empleo)$/, ""));
  };
  add(base);
  add(base.replace(/(\.(com|co|io|dev|net|org|mx|do|ar|cl|pe|ec|uy|ve|es|ai))+\/?$/, ""));
  for (const key of candidates) if (JOB_BOARD_NAMES.has(key)) return true;
  return false;
}

const UNKNOWN_COMPANY_NAMES: ReadonlySet<string> = new Set([
  "",
  "unknown company",
  "empresa desconocida",
]);

/** True for empty / placeholder company names ("Unknown company", "Empresa desconocida"). */
export function isUnknownCompany(name: string | null | undefined): boolean {
  return UNKNOWN_COMPANY_NAMES.has(collapse(name ?? "").toLowerCase());
}

function cleanCompany(raw: string): string {
  return collapse(firstSegment(raw))
    .replace(/^[,;:\s]+|[,;:\s]+$/g, "")
    .slice(0, MAX_COMPANY_CHARS)
    .trim();
}

function cleanValue(raw: string, max = MAX_TITLE_CHARS): string {
  return collapse(raw).slice(0, max).trim();
}

// ---------------------------------------------------------------------------
// Line classification
// ---------------------------------------------------------------------------

// Accented letters are matched with "." (text is NFC, so one code point each).
const TITLE_LABEL_RE =
  /^(?:job\s+title|title|position|role|rol|puesto|cargo|vacante|posici.n|t.tulo(?:\s+del\s+puesto)?|nombre\s+del\s+puesto)\s*:\s*(.{2,})$/iu;
const COMPANY_LABEL_RE =
  /^(?:company(?:\s+name)?|hiring\s+company|employer|empresa|compa..a|organizaci.n|empleador)\s*:\s*(.{2,})$/iu;
const LOCATION_LABEL_RE =
  /^(?:location|job\s+location|work\s+location|ubicaci.n|lugar(?:\s+de\s+trabajo)?|localizaci.n|locaci.n|localidad)\s*:\s*(.{2,})$/iu;
/** Any "Label: value" line (never a title candidate). */
const GENERIC_LABEL_LINE_RE = /^\p{L}[\p{L} ]{1,30}:\s*\S/u;
const ABOUT_X_RE = /^(?:about|acerca\s+de|sobre)\s+(.{2,60}?)\s*:?$/iu;

/** Site chrome / section headers (lineKey form). */
const BOILERPLATE_LINES: ReadonlySet<string> = new Set([
  "about the job",
  "about this job",
  "about the role",
  "about this role",
  "about the position",
  "about the company",
  "about us",
  "job description",
  "full job description",
  "description",
  "job details",
  "details",
  "overview",
  "summary",
  "job summary",
  "descripcion del puesto",
  "descripcion del empleo",
  "descripcion de la oferta",
  "descripcion de la vacante",
  "descripcion",
  "detalles del empleo",
  "detalles de la oferta",
  "resumen",
  "acerca del empleo",
  "acerca del puesto",
  "acerca de la empresa",
  "acerca de nosotros",
  "sobre el puesto",
  "sobre el empleo",
  "sobre nosotros",
  "sobre la empresa",
  "apply",
  "apply now",
  "easy apply",
  "apply on company website",
  "save",
  "saved",
  "save job",
  "share",
  "share job",
  "show more options",
  "more options",
  "report",
  "report this job",
  "postular",
  "postularme",
  "postulate",
  "aplicar",
  "aplicar ahora",
  "solicitar",
  "solicitar empleo",
  "guardar",
  "compartir",
  "denunciar",
  "show more",
  "show less",
  "see more",
  "see less",
  "ver mas",
  "ver menos",
  "mostrar mas",
  "mostrar menos",
  "more",
  "less",
  "promoted",
  "promocionado",
  "actively recruiting",
  "reposted",
  "new",
  "nuevo",
  "urgent",
  "urgente",
  "home",
  "jobs",
  "empleos",
  "sign in",
  "log in",
  "join now",
  "iniciar sesion",
  "registrate",
  "menu",
  "skip to main content",
  "responsibilities",
  "requirements",
  "qualifications",
  "benefits",
  "nice to have",
  "responsabilidades",
  "requisitos",
  "beneficios",
  "funciones",
]);

/** Work-mode / contract chips that are never a title (lineKey form). */
const WORK_MODE_LINES: ReadonlySet<string> = new Set([
  "remote",
  "remoto",
  "remota",
  "hybrid",
  "hibrido",
  "on site",
  "onsite",
  "presencial",
  "full time",
  "fulltime",
  "part time",
  "contract",
  "contractor",
  "freelance",
  "tiempo completo",
  "medio tiempo",
  "tiempo parcial",
]);

/** Section headers whose NEXT line is usually the company name (LinkedIn layout). */
const ABOUT_COMPANY_HEADERS: ReadonlySet<string> = new Set([
  "about the company",
  "about the employer",
  "about company",
  "acerca de la empresa",
  "sobre la empresa",
]);

/** "About {X}" where X is a section, not a company (after dropping a leading article). */
const GENERIC_ABOUT_TARGETS: ReadonlySet<string> = new Set([
  "job",
  "role",
  "position",
  "company",
  "employer",
  "team",
  "opportunity",
  "us",
  "you",
  "yourself",
  "me",
  "client",
  "product",
  "mission",
  "culture",
  "benefits",
  "perks",
  "compensation",
  "process",
  "hiring process",
  "interview process",
  "empleo",
  "puesto",
  "empresa",
  "compania",
  "vacante",
  "rol",
  "posicion",
  "oportunidad",
  "equipo",
  "nosotros",
  "ti",
  "cliente",
  "proceso",
  "beneficios",
]);

/** Applicant counts, "posted 3 days ago", follower counts... (tested on lineKey). */
const METADATA_RE =
  /\b(?:ago|applicants?|postulantes?|solicitudes|candidatos|clicked apply|reposted|posted|publicad[oa]|promoted|promocionad[oa]|responses managed|followers|seguidores|employees|empleados)\b|\bhace (?:\d|un|una|unos|unas)\b/;
const TIME_AGO_RE =
  /\b\d+ (?:minute|hour|day|week|month|year)s? ago\b|\b(?:an?|one) (?:minute|hour|day|week|month|year) ago\b|\bhace (?:\d|un|una|unos|unas)\b|\b(?:just now|yesterday|today|ayer|hoy|reposted)\b/;

const LOCATION_ISH_RE =
  /\b(?:remote|remoto|remota|anywhere|worldwide|global|latam|latin america|latinoamerica|hybrid|hibrido|on ?site|presencial|usa|us|united states|europe|emea|americas|canada|mexico|colombia|argentina|brazil|brasil|chile|peru|dominican republic|republica dominicana|santo domingo|costa rica|uruguay|ecuador|spain|espana)\b/;
const ROLE_ISH_RE =
  /\b(?:senior|junior|jr|sr|ssr|semi ?senior|mid|lead|staff|principal|intern|trainee|backend|back end|frontend|front end|full ?stack|mobile|web|data|platform|devops|ios|android|cloud|security|qa|ux|ui|ml|ai|contract|contractor|freelance|part time|full time|tiempo completo|medio tiempo)\b/;
const REMOTE_RE =
  /\b(?:remote|remoto|remota|teletrabajo|work from home|trabajo desde casa|home office)\b/;

function isTitleCandidate(line: string, company: string): boolean {
  if (line.length < 3 || line.length > 120) return false;
  if (!/\p{L}/u.test(line)) return false;
  if (/^[\p{Sc}\d]/u.test(line)) return false;
  if (/https?:\/\/|www\.|\S@\S+\.\w/i.test(line)) return false;
  if (line.endsWith(":")) return false;
  const key = lineKey(line);
  if (!key || BOILERPLATE_LINES.has(key) || WORK_MODE_LINES.has(key)) return false;
  if (METADATA_RE.test(key)) return false;
  if (GENERIC_LABEL_LINE_RE.test(line)) return false;
  if (/^(?:about|acerca de|sobre)\b/.test(key)) return false;
  if (isJobBoardName(line)) return false;
  if (company && key === lineKey(company)) return false;
  const words = line.split(/\s+/).length;
  if (words > 12) return false;
  if (/[.!?]$/.test(line) && words > 6) return false;
  return true;
}

function isPlausibleCompanyLine(line: string): boolean {
  if (line.length < 2 || line.length > 80) return false;
  if (!/^[\p{L}\p{N}]/u.test(line)) return false;
  if (/https?:\/\/|www\./i.test(line)) return false;
  if (/[.!?:]$/.test(line) && !/\b(?:inc|corp|co|ltd|llc|s\.?a|s\.?r\.?l)\.$/i.test(line)) return false;
  const key = lineKey(line);
  if (!key || BOILERPLATE_LINES.has(key) || WORK_MODE_LINES.has(key)) return false;
  if (METADATA_RE.test(key)) return false;
  if (line.split(/\s+/).length > 8) return false;
  return !isJobBoardName(line);
}

function isPlausibleAboutName(name: string): boolean {
  if (!/^[\p{Lu}\p{N}]/u.test(name)) return false;
  if (/[.!?]$/.test(name)) return false;
  if (name.split(/\s+/).length > 6) return false;
  const target = lineKey(name).replace(
    /^(?:the|this|our|your|el|la|los|las|nuestra|nuestro|nuestros|nuestras|esta|este|tu|su)\s+/,
    "",
  );
  if (GENERIC_ABOUT_TARGETS.has(target)) return false;
  return !isJobBoardName(name);
}

function companyFromAbout(lines: string[]): string {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (ABOUT_COMPANY_HEADERS.has(lineKey(line))) {
      for (const next of lines.slice(i + 1, i + 3)) {
        if (isPlausibleCompanyLine(next)) return cleanCompany(next);
      }
      continue;
    }
    const m = line.match(ABOUT_X_RE);
    if (m) {
      const name = cleanCompany(m[1]);
      if (name && isPlausibleAboutName(name)) return name;
    }
  }
  return "";
}

function splitTitleAtCompany(line: string): { title: string; company: string } | null {
  const m = line.match(AT_SPLIT_RE);
  if (!m) return null;
  const title = cleanValue(m[1]);
  const company = cleanCompany(m[2].replace(/\s*[([].*$/, ""));
  if (!title) return null;
  if (!company || isJobBoardName(company) || !/^[\p{L}\p{N}]/u.test(company)) {
    return { title, company: "" };
  }
  return { title, company };
}

/** "X - Y": Y is a company unless it looks like a location or a role qualifier. */
function splitTitleDash(
  line: string,
  knownCompany: string,
): { title: string; company: string } {
  const m = line.match(DASH_SPLIT_RE);
  if (!m) return { title: cleanValue(line), company: "" };
  const left = cleanValue(m[1]);
  const right = collapse(m[2]);
  const rightKey = lineKey(right);
  if (LOCATION_ISH_RE.test(rightKey) || /^[([]/.test(right)) return { title: left, company: "" };
  if (ROLE_ISH_RE.test(rightKey) || isTechTerm(right)) return { title: cleanValue(line), company: "" };
  if (isJobBoardName(right)) return { title: left, company: "" };
  if (knownCompany) {
    return lineKey(knownCompany) === rightKey
      ? { title: left, company: "" }
      : { title: cleanValue(line), company: "" };
  }
  return { title: left, company: cleanCompany(right) };
}

/** LinkedIn-style "Location <dot> 2 weeks ago <dot> 40 applicants" line -> "Location". */
function locationFromMetadataLine(lines: string[], company: string): string {
  for (const line of lines.slice(0, 20)) {
    const segments = line
      .split(SEGMENT_SPLIT_RE)
      .map((s) => s.trim())
      .filter(Boolean);
    if (segments.length < 2) continue;
    if (!segments.some((s) => TIME_AGO_RE.test(lineKey(s)))) continue;
    for (const segment of segments) {
      const key = lineKey(segment);
      if (!key || TIME_AGO_RE.test(key) || METADATA_RE.test(key)) continue;
      if (company && key === lineKey(company)) continue;
      if (segment.length > 80) continue;
      return cleanValue(segment);
    }
  }
  return "";
}

// ---------------------------------------------------------------------------
// Field detectors
// ---------------------------------------------------------------------------

function detectEmploymentType(foldedText: string): EmploymentType | null {
  if (
    /\b(?:contractor|freelance|freelancer|por proyecto|contrato de servicios|contrato por (?:obra|proyecto|servicios|honorarios))\b/.test(
      foldedText,
    )
  ) {
    return "contract";
  }
  if (/\b(?:part[\s-]?time|medio tiempo|tiempo parcial|media jornada)\b/.test(foldedText)) {
    return "part_time";
  }
  if (/\b(?:full[\s-]?time|tiempo completo|jornada completa|permanent|indefinido)\b/.test(foldedText)) {
    return "full_time";
  }
  if (/\b(?:contract|contrato|temporary|temporal)\b/.test(foldedText)) return "contract";
  return null;
}

const SENIORITY_LEVELS: ReadonlySet<string> = new Set([
  "junior",
  "mid",
  "senior",
  "lead",
  "principal",
]);

function asSeniority(value: string | null | undefined): SeniorityLevel | null {
  return value && SENIORITY_LEVELS.has(value) ? (value as SeniorityLevel) : null;
}

function detectSeniority(title: string): SeniorityLevel | null {
  const t = fold(title);
  // Before inferSeniority: "Semi Senior" contains "senior".
  if (/\b(?:semi[\s-]?senior|semisenior|ssr|mid[\s-]?level|mid|intermedio|middle)\b/.test(t)) {
    return "mid";
  }
  const inferred = asSeniority(inferSeniority(title));
  if (inferred) return inferred;
  if (/\b(?:lider|head of|jefe)\b/.test(t)) return "lead";
  if (/\b(?:practicante|pasante|becario|entry[\s-]?level|graduate)\b/.test(t)) return "junior";
  return null;
}

// --- Salary ----------------------------------------------------------------

const CURRENCY_CODES = "USD|EUR|GBP|CAD|AUD|DOP|MXN|COP|ARS|CLP|PEN|BRL|UYU|CRC";
const LATAM_CURRENCIES: ReadonlySet<string> = new Set([
  "DOP",
  "MXN",
  "COP",
  "ARS",
  "CLP",
  "PEN",
  "BRL",
  "UYU",
  "CRC",
]);

function currencyPrefix(name: string): string {
  return String.raw`(?<${name}>US\$|U\$S|RD\$|MX\$|COP\$|CA\$|C\$|A\$|R\$|\p{Sc}|\b(?:${CURRENCY_CODES})\b)?`;
}
function amount(name: string, mult: string): string {
  // Whole numbers only (no match starting/ending mid-number), then an optional
  // thousands multiplier, never followed by a millions/billions suffix.
  return (
    String.raw`(?<![\d.,])(?<${name}>\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?![.,]?\d)` +
    String.raw`(?:\s?(?<${mult}>k|mil)\b)?` +
    String.raw`(?!\s*(?:m|mm|mill|million|millones|b|bn|billion)\b)`
  );
}

const SALARY_RE = new RegExp(
  currencyPrefix("curA") +
    String.raw`\s*` +
    amount("a", "ka") +
    String.raw`(?:\s*(?:\p{Pd}|~|\bto\b|\band\b|\ba\b|\by\b|\bhasta\b)\s*` +
    currencyPrefix("curB") +
    String.raw`\s*` +
    amount("b", "kb") +
    String.raw`)?` +
    String.raw`(?:\s*(?<curS>\b(?:${CURRENCY_CODES})\b|d.lares|dollars|euros|pesos))?` +
    String.raw`(?:\s*(?:\/|\bper\b|\bpor\b|\ba\b|\bal\b|\ban\b|\beach\b)?\s*(?<period>year|yr|annum|annually|yearly|annual|anuales|anual|a.o|monthly|month|mo|mensuales|mensual|mes|hourly|hour|hr|h|hora)\b)?`,
  "giu",
);

const SALARY_KEYWORD_RE =
  /\b(?:salary|salario|sueldo|compensation|compensacion|pay|paga|remuneracion|rate|tarifa|base|ote|range|rango|ingreso|income|budget|presupuesto)\b/;

function parseAmount(raw: string, multiplier: string | undefined): number | null {
  let s = raw;
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (hasDot && hasComma) {
    const decimal = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    s = s.split(thousands).join("").replace(",", ".");
  } else if (/^\d{1,3}(?:[.,]\d{3})+$/.test(s)) {
    s = s.replace(/[.,]/g, "");
  } else {
    s = s.replace(",", ".");
  }
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return multiplier ? n * 1000 : n;
}

function currencyCode(raw: string | undefined): string | null {
  if (!raw) return null;
  const r = raw.trim().toUpperCase();
  if (r === "$" || r === "US$" || r === "U$S" || r === "DOLLARS" || /^D.LARES$/u.test(r)) return "USD";
  if (r === "RD$") return "DOP";
  if (r === "MX$") return "MXN";
  if (r === "COP$") return "COP";
  if (r === "CA$" || r === "C$") return "CAD";
  if (r === "A$") return "AUD";
  if (r === "R$") return "BRL";
  if (r === "EUROS") return "EUR";
  if (/^[A-Z]{3}$/.test(r) && r !== "PESOS") return r;
  const cp = r.codePointAt(0);
  if (cp === 0x20ac) return "EUR";
  if (cp === 0xa3) return "GBP";
  return null;
}

function periodFromWord(raw: string | undefined): SalaryPeriod | null {
  if (!raw) return null;
  const p = fold(raw);
  if (/^(?:year|yr|annum|annually|yearly|annual|anual|anuales|ano)$/.test(p)) return "year";
  if (/^(?:month|mo|monthly|mensual|mensuales|mes)$/.test(p)) return "month";
  if (/^(?:hour|hr|h|hourly|hora)$/.test(p)) return "hour";
  return null;
}

function periodFromLine(foldedLine: string): SalaryPeriod | null {
  if (/per hour|hourly|an hour|\/ ?hr\b|\/ ?hour|por hora|la hora/.test(foldedLine)) return "hour";
  if (/per month|monthly|a month|\/ ?month|\/ ?mo\b|mensual|al mes|por mes/.test(foldedLine)) return "month";
  if (/per year|annual|yearly|a year|\/ ?year|\/ ?yr\b|anual|al ano|por ano/.test(foldedLine)) return "year";
  return null;
}

function detectSalary(cleaned: string): {
  min: number | null;
  max: number | null;
  currency: string | null;
} {
  const none = { min: null, max: null, currency: null };
  for (const line of cleaned.split("\n")) {
    const foldedLine = fold(line);
    const re = new RegExp(SALARY_RE.source, SALARY_RE.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      const g = m.groups ?? {};
      const hasCurrency = Boolean(g.curA || g.curB || g.curS);
      if (!hasCurrency || !g.a) continue;

      let a = parseAmount(g.a, g.ka);
      let b = g.b ? parseAmount(g.b, g.kb) : null;
      if (a === null) continue;
      // "$120-150k": the multiplier on the upper bound applies to both.
      if (!g.ka && g.kb && a < 1000) a *= 1000;
      const isRange = b !== null;
      const explicitPeriod = periodFromWord(g.period);
      if (!explicitPeriod && !isRange && !SALARY_KEYWORD_RE.test(lineKey(line))) continue;

      const currency =
        currencyCode(g.curA) ?? currencyCode(g.curB) ?? currencyCode(g.curS) ?? null;
      const top = Math.max(a, b ?? a);
      const period: SalaryPeriod =
        explicitPeriod ??
        periodFromLine(foldedLine) ??
        (top < 300
          ? "hour"
          : currency && LATAM_CURRENCIES.has(currency)
            ? "month"
            : top < 20_000
              ? "month"
              : "year");

      const floor = period === "hour" ? 5 : period === "month" ? 100 : 1000;
      if (top < floor) continue;
      if (b !== null && b <= 0) b = null;

      const normalized = normalizeSalary(a, b ?? a, period);
      if (normalized.min === null && normalized.max === null) continue;
      return { min: normalized.min, max: normalized.max, currency };
    }
  }
  return none;
}

// --- Skills ----------------------------------------------------------------

let canonicalTechNames: Map<string, string> | null = null;

function canonicalTechName(term: string): string {
  if (!canonicalTechNames) {
    canonicalTechNames = new Map();
    for (const t of TECH_TERMS) {
      const key = t.toLowerCase();
      if (!canonicalTechNames.has(key)) canonicalTechNames.set(key, t);
    }
  }
  return canonicalTechNames.get(term.toLowerCase()) ?? term;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Tech terms that are also everyday words ("React", "Go", "REST") need their canonical casing. */
function needsExactCase(key: string): boolean {
  return key.length <= 2 || COMMON_ENGLISH_WORDS.has(key) || COMMON_SPANISH_WORDS.has(key);
}

function containsExact(text: string, term: string): boolean {
  return new RegExp(String.raw`(?<![\p{L}\p{N}])${escapeRegExp(term)}(?![\p{L}\p{N}])`, "u").test(
    text,
  );
}

function detectSkills(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const { keyword } of extractKeywords(text)) {
    if (!isTechTerm(keyword)) continue;
    const canonical = canonicalTechName(keyword);
    const key = canonical.toLowerCase();
    if (seen.has(key)) continue;
    if (needsExactCase(key) && !containsExact(text, canonical)) continue;
    seen.add(key);
    out.push(canonical);
    if (out.length >= MAX_HEURISTIC_SKILLS) break;
  }
  return out;
}

// --- URLs ------------------------------------------------------------------

function firstUrl(text: string): string {
  const m = text.match(/https?:\/\/[^\s<>"'`)\]]+/i);
  return m ? m[0].replace(/[.,;:!?]+$/, "") : "";
}

/** LLM URLs are only trusted when http(s) and their host literally appears in the paste. */
function acceptLlmUrl(url: string | null | undefined, pastedText: string): string | null {
  const trimmed = url?.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null;
  try {
    const host = new URL(trimmed).hostname.replace(/^www\./i, "").toLowerCase();
    if (!host || !pastedText.toLowerCase().includes(host)) return null;
    return trimmed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Deterministic draft from raw pasted text (English or Spanish). Never throws. */
export function heuristicJobDraft(text: string): PastedJobDraft {
  const cleaned = cleanPastedText(text);
  const lines = cleaned
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const folded = fold(cleaned);

  let title = "";
  let company = "";
  let location = "";
  for (const line of lines) {
    if (!title) {
      const m = line.match(TITLE_LABEL_RE);
      if (m) title = cleanValue(m[1]);
    }
    if (!company) {
      const m = line.match(COMPANY_LABEL_RE);
      if (m) company = cleanCompany(m[1]);
    }
    if (!location) {
      const m = line.match(LOCATION_LABEL_RE);
      if (m) location = cleanValue(m[1]);
    }
  }
  if (company && isJobBoardName(company)) company = "";
  if (!company) company = companyFromAbout(lines);

  if (!title) {
    const candidates = lines.filter((l) => isTitleCandidate(l, company)).slice(0, 3);
    for (const candidate of candidates) {
      const split = splitTitleAtCompany(candidate);
      if (split) {
        title = split.title;
        if (!company) company = split.company;
        break;
      }
    }
    if (!title && candidates.length > 0) {
      const split = splitTitleDash(candidates[0], company);
      title = split.title;
      if (!company) company = split.company;
    }
  }

  if (!location) location = locationFromMetadataLine(lines, company);
  if (!location && REMOTE_RE.test(folded)) location = "Remote";

  const salary = detectSalary(cleaned);
  const url = firstUrl(cleaned);

  return {
    title,
    company_name: company,
    location,
    employment_type: detectEmploymentType(folded),
    seniority_level: title ? detectSeniority(title) : null,
    skills_required: detectSkills(cleaned),
    salary_min: salary.min,
    salary_max: salary.max,
    salary_currency: salary.currency,
    apply_url: url,
    source_url: url,
    description: cleaned,
  };
}

/**
 * Converts a salary to annual figures: month x12, hour x2080 (40 h * 52 w). Non-positive
 * or non-finite values become null; a reversed range is swapped. Rounded to integers.
 */
export function normalizeSalary(
  min: number | null,
  max: number | null,
  period: SalaryPeriod | null,
): { min: number | null; max: number | null } {
  const factor = period === "month" ? 12 : period === "hour" ? 2080 : 1;
  const norm = (v: number | null): number | null =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v * factor) : null;
  let lo = norm(min);
  let hi = norm(max);
  if (lo !== null && hi !== null && lo > hi) [lo, hi] = [hi, lo];
  return { min: lo, max: hi };
}

function nonEmpty(value: string | null | undefined, max = MAX_TITLE_CHARS): string | null {
  if (typeof value !== "string") return null;
  const v = cleanValue(value, max);
  return v || null;
}

function normalizeCurrency(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  return currencyCode(v) ?? (/^[a-z]{3}$/i.test(v) ? v.toUpperCase() : null);
}

/**
 * Merges the optional LLM extraction into the heuristic draft. Non-null LLM values win;
 * job-board names are never accepted as the company; LLM salary figures are annualized
 * with their period and replace the heuristic salary as a unit; LLM URLs must appear in
 * the pasted text; skills are merged case-insensitively (LLM first).
 */
export function mergeJobDraft(h: PastedJobDraft, llm: PastedJobExtraction | null): PastedJobDraft {
  const heuristicCompany =
    h.company_name && !isJobBoardName(h.company_name) && !isUnknownCompany(h.company_name)
      ? h.company_name
      : "";
  if (!llm) return { ...h, company_name: heuristicCompany, skills_required: [...h.skills_required] };

  const llmCompany = nonEmpty(llm.company_name, MAX_COMPANY_CHARS);
  const company =
    llmCompany && !isJobBoardName(llmCompany) && !isUnknownCompany(llmCompany)
      ? llmCompany
      : heuristicCompany;

  const llmSalary = normalizeSalary(llm.salary_min, llm.salary_max, llm.salary_period);
  const useLlmSalary = llmSalary.min !== null || llmSalary.max !== null;

  const skills: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...(llm.skills_required ?? []), ...h.skills_required]) {
    if (typeof raw !== "string") continue;
    const skill = collapse(raw);
    const key = skill.toLowerCase();
    if (!skill || seen.has(key)) continue;
    seen.add(key);
    skills.push(skill);
    if (skills.length >= MAX_MERGED_SKILLS) break;
  }

  return {
    title: nonEmpty(llm.title) ?? h.title,
    company_name: company,
    location: nonEmpty(llm.location) ?? h.location,
    employment_type: llm.employment_type ?? h.employment_type,
    seniority_level: asSeniority(llm.seniority_level) ?? h.seniority_level,
    skills_required: skills,
    salary_min: useLlmSalary ? llmSalary.min : h.salary_min,
    salary_max: useLlmSalary ? llmSalary.max : h.salary_max,
    salary_currency: normalizeCurrency(llm.salary_currency) ?? h.salary_currency,
    apply_url: acceptLlmUrl(llm.apply_url, h.description) ?? h.apply_url,
    source_url: h.source_url,
    description: h.description,
  };
}

/** Company name for the companies row: the draft's (trimmed) or the fallback. */
export function resolvePastedCompanyName(d: PastedJobDraft): string {
  const name = collapse(d.company_name ?? "");
  if (!name || isJobBoardName(name) || isUnknownCompany(name)) return PASTED_JOB_FALLBACK_COMPANY;
  return name;
}

/**
 * Final Job fields for a pasted post. The caller adds id / company_id (from
 * {@link resolvePastedCompanyName}) / external_id (from {@link pastedJobExternalId}) /
 * created_at.
 */
export function finalizePastedJob(
  rawText: string,
  d: PastedJobDraft,
  now: number,
): Omit<Job, "id" | "company_id" | "company_name" | "external_id" | "created_at"> {
  const title = collapse(d.title ?? "") || PASTED_JOB_FALLBACK_TITLE;
  const description = (d.description ?? "").trim() || cleanPastedText(rawText);
  const location = collapse(d.location ?? "");
  const dr = isDrFriendly(location, description, title);
  const sourceUrl = d.source_url?.trim() || d.apply_url?.trim() || "";
  const applyUrl = d.apply_url?.trim() || sourceUrl;

  return {
    title,
    description,
    location,
    is_dr_friendly: dr.friendly,
    dr_filter_reason: dr.reason,
    dr_eligibility: dr.eligibility,
    source: "manual",
    source_url: sourceUrl,
    apply_url: applyUrl,
    salary_min: d.salary_min,
    salary_max: d.salary_max,
    salary_currency: normalizeCurrency(d.salary_currency) ?? "USD",
    employment_type: d.employment_type ?? "full_time",
    seniority_level: d.seniority_level ?? asSeniority(inferSeniority(title)) ?? "mid",
    skills_required: [...d.skills_required],
    posted_at: now,
    expires_at: null,
    scraped_at: now,
    needs_recovery: false,
    raw_payload: rawText,
  };
}

/**
 * Stable dedup id for a pasted post: "manual:" + the first 40 hex chars of the SHA-256
 * of the lowercased, whitespace-collapsed text (so re-pasting the same post with
 * different line breaks / casing maps to the same row).
 */
export async function pastedJobExternalId(text: string): Promise<string> {
  const normalized = text.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized),
  );
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `manual:${hex.slice(0, 40)}`;
}
