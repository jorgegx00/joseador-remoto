/**
 * Deterministic pieces of the LLM CV parser: sections that need no model (summary,
 * skills, languages, certifications, extra sections, contact regexes) and the final
 * assembly with per-section fallback to the rule-based parse.
 */

import type { CvExtraSection, CvLanguage, CvSkills, ParsedCv } from "@/types/cv";
import { isSoftSkillsLabel } from "@/lib/cv/section-aliases";
import { normalizeForMatch, type ParseLine } from "./lines";

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /\+?\(?\d[\d\s().-]{7,}\d/;
const LINKEDIN_RE = /(?:https?:\/\/)?(?:[\w-]+\.)?linkedin\.com\/[^\s|,]+/i;
const GITHUB_RE = /(?:https?:\/\/)?(?:www\.)?github\.com\/[^\s|,]+/i;
const URL_RE = /(?:https?:\/\/|www\.)[^\s|,]+|\b[\w-]+\.(?:dev|io|me|com|net|org|app|site)(?:\/[^\s|,]*)?\b/i;

export interface ContactFields {
  email: string;
  phone: string;
  linkedin_url: string;
  github_url: string;
  portfolio_url: string;
}

export function extractContactFields(text: string): ContactFields {
  const email = EMAIL_RE.exec(text)?.[0] ?? "";
  const withoutEmail = email ? text.replace(email, " ") : text;
  const linkedin = LINKEDIN_RE.exec(withoutEmail)?.[0] ?? "";
  const github = GITHUB_RE.exec(withoutEmail)?.[0] ?? "";
  const rest = [linkedin, github].filter(Boolean).reduce((t, url) => t.replace(url, " "), withoutEmail);
  return {
    email,
    phone: PHONE_RE.exec(rest)?.[0].trim() ?? "",
    linkedin_url: linkedin,
    github_url: github,
    portfolio_url: URL_RE.exec(rest)?.[0] ?? "",
  };
}

// Soft skills are a small, recognizable vocabulary; anything else listed under
// skills (tools, products, frameworks) is treated as technical.
const SOFT_SKILL_RE =
  /\b(?:communicat|leadership|teamwork|team work|collaborat|problem[- ]solving|critical thinking|adaptab|flexib|time management|creativ|negotiat|empath|mentor|coaching|presentation|public speaking|interpersonal|organi[sz]ation|attention to detail|self[- ]motivat|proactiv|work ethic|decision[- ]making|conflict|emotional intelligence|customer service|stakeholder|comunicaci|liderazgo|trabajo en equipo|resolucion de problemas|pensamiento critico|adaptabilidad|gestion del tiempo|creatividad|negociaci|empatia|responsab|organizacion|colaboraci|toma de decisiones)/;

function isSoftSkill(skill: string): boolean {
  return SOFT_SKILL_RE.test(normalizeForMatch(skill));
}

function splitItems(text: string): string[] {
  // "/" is kept: "C/C++", "CI/CD" are single skills.
  return text
    .split(/\s*[,;|•·]\s*/)
    .map((s) => s.replace(/^[-–]\s*/, "").replace(/\.$/, "").trim())
    .filter((s) => s.length > 0 && s.length < 60);
}

/** Skills section → technical / soft, honouring "Soft skills:" style group labels. */
export function parseSkills(lines: ParseLine[]): CvSkills {
  const technical: string[] = [];
  const soft: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const labelled = /^([^:：]{2,40})[:：]\s*(.+)$/.exec(line.text);
    const label = labelled ? labelled[1] : "";
    const items = splitItems(labelled ? labelled[2] : line.text);
    for (const item of items) {
      const key = normalizeForMatch(item);
      if (seen.has(key)) continue;
      seen.add(key);
      if ((label && isSoftSkillsLabel(label)) || isSoftSkill(item)) soft.push(item);
      else technical.push(item);
    }
  }
  return { technical, soft };
}

const LEVELS: Array<[RegExp, CvLanguage["level"]]> = [
  [/\b(?:native|nativ[oa]|mother tongue|lengua materna|materno)\b/, "native"],
  [/\b(?:fluent|fluid[oa]|bilingual|biling[uü]e|c2|proficient)\b/, "fluent"],
  [/\b(?:advanced|avanzad[oa]|c1)\b/, "advanced"],
  [/\b(?:intermediate|intermedi[oa]|b1|b2|conversational)\b/, "intermediate"],
  [/\b(?:basic|b[aá]sic[oa]|elementary|elemental|beginner|principiante|a1|a2)\b/, "basic"],
];
const LANGUAGE_CERT_RE = /\b(TOEFL|IELTS|TOEIC|DELE|DELF|DALF|Goethe|HSK|JLPT|TOPIK|Cambridge [A-Z]+)\b/i;

/** "English (Fluent), Spanish – Native" → one entry per language. */
export function parseLanguages(lines: ParseLine[]): CvLanguage[] {
  const out: CvLanguage[] = [];
  for (const line of lines) {
    for (const item of line.text.split(/\s*[,;|•·]\s*/)) {
      const text = item.trim();
      if (!text) continue;
      const norm = normalizeForMatch(text);
      const level = LEVELS.find(([re]) => re.test(norm))?.[1] ?? "intermediate";
      const name = text
        .replace(/\(.*?\)/g, "")
        .split(/\s*[-–—:]\s*/)[0]
        .replace(/\b(?:[ABC][12])\b/gi, "")
        .trim();
      if (!name || name.length > 30) continue;
      out.push({ name, level, certification: LANGUAGE_CERT_RE.exec(text)?.[1] ?? "" });
    }
  }
  return out;
}

export function parseCertifications(lines: ParseLine[]): string[] {
  return lines.map((l) => l.text.trim()).filter((t) => t.length > 2);
}

export function joinParagraph(lines: ParseLine[]): string {
  return lines.map((l) => l.text.trim()).join(" ").trim();
}

export function extraSection(heading: string, lines: ParseLine[]): CvExtraSection {
  return {
    heading,
    body: lines.map((l) => (l.tags.includes("BULLET") ? `- ${l.text}` : l.text)).join("\n"),
  };
}

/**
 * Keeps the rule-based result for a list the model lost: an LLM result with fewer
 * entries than the heuristic one found is more likely a failure than a correction.
 */
export function preferLonger<T>(llm: T[], heuristic: T[]): T[] {
  return llm.length === 0 && heuristic.length > 0 ? heuristic : llm;
}

export function emptyParsedCv(): ParsedCv {
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
