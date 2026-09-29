/**
 * CV conventions per market: what personal data belongs on a CV, how long it
 * should be, its language and paper size. Feeds the CV tailoring prompt
 * (RULES_MARKET), the output guard and the PDF/DOCX exporters.
 *
 * Personal fields default to "omit" everywhere: anti-discrimination law forbids
 * asking for them in the US/CA/UK/PR, and elsewhere current guidance is to leave
 * them out unless the posting asks. When several markets apply (a job open to
 * LATAM and the US, or the user's whole target list), the STRICTEST rule wins.
 *
 * Sources (2025-2026): EEOC pre-employment inquiry guidance; Canadian Human Rights
 * Act / OHRC; UK Equality Act 2010; German AGG; Puerto Rico Ley 100-1959; Brazil
 * Lei 9.029/1995 + LGPD; Chile Código del Trabajo; DR Ley 172-13; national CV guides.
 */

import type { PaperSize } from "./countries";
import { getCountryProfile } from "./countries";
import { isRegionCode, REGIONS } from "./regions";

export type PhotoRule = "forbidden" | "optional" | "common";
export type PersonalFieldRule = "omit" | "if_requested" | "common";
export type CvLanguage = "en" | "es" | "pt" | "de";

export interface CvRules {
  photo: PhotoRule;
  dateOfBirth: PersonalFieldRule;
  maritalStatus: PersonalFieldRule;
  /** Cédula, SSN, CPF, DNI, RUT… */
  nationalId: "omit" | "if_requested";
  /** Show only city + country, never a street address. */
  cityOnlyAddress: boolean;
  maxPages: number;
  /** Languages a CV for this market is normally written in (first = default). */
  languages: CvLanguage[];
  paper: PaperSize;
  /** What the document is called locally ("résumé", "Lebenslauf", "hoja de vida"). */
  localName: string;
  /** Short, market-specific advice for the tailoring prompt. */
  notes: string[];
}

const BASE: CvRules = {
  photo: "optional",
  dateOfBirth: "if_requested",
  maritalStatus: "if_requested",
  nationalId: "omit",
  cityOnlyAddress: true,
  maxPages: 2,
  languages: ["en"],
  paper: "A4",
  localName: "CV",
  notes: [],
};

/** Strict anti-discrimination markets: US-style résumé. */
const US_STYLE: Partial<CvRules> = {
  photo: "forbidden",
  dateOfBirth: "omit",
  maritalStatus: "omit",
  nationalId: "omit",
};

const RULES: Record<string, Partial<CvRules>> = {
  US: {
    ...US_STYLE,
    maxPages: 2,
    languages: ["en"],
    localName: "résumé",
    notes: ["One page for early-career candidates; two pages are fine with 5+ years of experience.", "Single column, reverse-chronological, ATS-parseable."],
  },
  PR: {
    ...US_STYLE,
    languages: ["en", "es"],
    localName: "résumé",
    notes: ["US conventions apply; bilingual English/Spanish ability is valued."],
  },
  CA: {
    ...US_STYLE,
    languages: ["en"],
    localName: "resume",
    notes: ["Canadian conventions: no photo, age, marital status or SIN."],
  },
  GB: {
    ...US_STYLE,
    languages: ["en"],
    localName: "CV",
    notes: ["Two pages; open with a short personal statement."],
  },
  DO: {
    photo: "optional",
    dateOfBirth: "if_requested",
    maritalStatus: "if_requested",
    languages: ["es", "en"],
    maxPages: 2,
    localName: "currículum",
    notes: ["Leave out cédula, marital status and religion unless the posting asks; city only, no street address."],
  },
  MX: {
    photo: "optional",
    dateOfBirth: "if_requested",
    maritalStatus: "if_requested",
    languages: ["es"],
    localName: "currículum",
    notes: ["Omit age, marital status, CURP and RFC unless requested."],
  },
  CO: {
    photo: "optional",
    languages: ["es"],
    localName: "hoja de vida",
    notes: ["Omit cédula, date of birth and marital status unless the posting asks."],
  },
  CL: {
    photo: "optional",
    maritalStatus: "omit",
    languages: ["es"],
    localName: "CV",
    notes: ["Omit RUT, date of birth and marital status."],
  },
  AR: {
    photo: "optional",
    languages: ["es"],
    localName: "CV",
    notes: ["Omit DNI, age and marital status."],
  },
  BR: {
    photo: "optional",
    dateOfBirth: "omit",
    maritalStatus: "omit",
    languages: ["pt"],
    localName: "currículo",
    notes: ["Omit age, marital status, CPF and RG (Lei 9.029/1995, LGPD)."],
  },
  ES: {
    photo: "common",
    dateOfBirth: "if_requested",
    languages: ["es"],
    localName: "currículum vitae",
    notes: ["A professional photo is common; omit DNI."],
  },
  DE: {
    photo: "common",
    dateOfBirth: "common",
    languages: ["de", "en"],
    maxPages: 2,
    localName: "Lebenslauf",
    notes: ["Tabular Lebenslauf; a photo and date of birth are customary but voluntary (AGG). Up to 3 pages for senior profiles."],
  },
};

/** Region markets default to the strictest conventions of their members we know. */
const REGION_DEFAULTS: Record<string, Partial<CvRules>> = {
  WORLDWIDE: { ...US_STYLE, languages: ["en"], localName: "CV", notes: ["International remote: follow US/UK conventions."] },
  NA: { ...US_STYLE, languages: ["en"], localName: "résumé" },
};

export function cvRulesFor(market: string): CvRules {
  const specific = RULES[market] ?? REGION_DEFAULTS[market];
  const paper = isRegionCode(market) ? (market === "NA" ? "LETTER" : "A4") : getCountryProfile(market).paper;
  if (specific) return { ...BASE, paper, ...specific };
  if (isRegionCode(market)) {
    const members = REGIONS[market].countries.filter((c) => RULES[c]);
    return members.length > 0 ? { ...strictest(members.map((c) => cvRulesFor(c))), paper } : { ...BASE, paper };
  }
  return { ...BASE, paper };
}

const PHOTO_ORDER: PhotoRule[] = ["forbidden", "optional", "common"];
const FIELD_ORDER: PersonalFieldRule[] = ["omit", "if_requested", "common"];

function minBy<T>(order: T[], values: T[]): T {
  return values.reduce((a, b) => (order.indexOf(b) < order.indexOf(a) ? b : a));
}

/**
 * Combine rules for several markets: the most restrictive personal-data rule,
 * the shortest page limit, languages in first-seen order. Paper follows the
 * first market.
 */
export function strictest(rules: CvRules[]): CvRules {
  if (rules.length === 0) return { ...BASE };
  if (rules.length === 1) return rules[0];
  const languages: CvLanguage[] = [];
  for (const r of rules) for (const l of r.languages) if (!languages.includes(l)) languages.push(l);
  return {
    photo: minBy(PHOTO_ORDER, rules.map((r) => r.photo)),
    dateOfBirth: minBy(FIELD_ORDER, rules.map((r) => r.dateOfBirth)),
    maritalStatus: minBy(FIELD_ORDER, rules.map((r) => r.maritalStatus)),
    nationalId: rules.some((r) => r.nationalId === "omit") ? "omit" : "if_requested",
    cityOnlyAddress: rules.some((r) => r.cityOnlyAddress),
    maxPages: Math.min(...rules.map((r) => r.maxPages)),
    languages,
    paper: rules[0].paper,
    localName: rules[0].localName,
    notes: [...new Set(rules.flatMap((r) => r.notes))],
  };
}

/** Rules for a set of markets (e.g. the markets a job is eligible for). */
export function cvRulesForMarkets(markets: string[]): CvRules {
  return strictest(markets.map(cvRulesFor));
}

/** Prompt block describing the rules; empty rules produce no block. */
export function formatCvRulesForPrompt(rules: CvRules, marketLabel: string): string {
  const field = (name: string, rule: PersonalFieldRule) =>
    rule === "omit"
      ? `- Do NOT include ${name}; remove it if the source has it.`
      : rule === "if_requested"
        ? `- Include ${name} only if <target_job> explicitly asks for it; otherwise remove it.`
        : `- ${name} is customary; keep it if the source has it (never invent it).`;
  const photo =
    rules.photo === "forbidden"
      ? "- No photo, and no mention of one."
      : "- Never add a photo placeholder; the photo (if any) is handled outside the text.";
  return `## Market conventions (${marketLabel}: ${rules.localName})
${field("date of birth or age", rules.dateOfBirth)}
${field("marital status, number of children, religion or nationality", rules.maritalStatus)}
- Do NOT include national ID numbers (cédula, SSN, SIN, CPF, DNI, RUT, CURP)${rules.nationalId === "if_requested" ? " unless <target_job> explicitly asks for one" : ""}.
${rules.cityOnlyAddress ? "- Location: city and country only — never a street address." : ""}
${photo}
- Aim for at most ${rules.maxPages} page${rules.maxPages === 1 ? "" : "s"}.
${rules.notes.map((n) => `- ${n}`).join("\n")}`.replace(/\n{2,}/g, "\n");
}

/**
 * Markets whose CV conventions apply to one job: the countries the role is in
 * (when the posting names a few), else the user's markets the job is eligible
 * for, else all the user's target markets.
 */
export function cvMarketsForJob(
  job: { location_scope?: { countries: string[] } | null; market_eligibility?: Record<string, { verdict: string }> | null },
  targetMarkets: string[],
): string[] {
  const countries = job.location_scope?.countries ?? [];
  if (countries.length > 0 && countries.length <= 3) return countries;
  const eligible = Object.entries(job.market_eligibility ?? {})
    .filter(([, r]) => r.verdict === "explicit" || r.verdict === "global")
    .map(([m]) => m);
  return eligible.length > 0 ? eligible : targetMarkets;
}
