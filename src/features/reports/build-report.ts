/**
 * Plain-text weekly report (Spanish) of tech jobs open to one target market
 * (the Dominican Republic by default), in the format
 * agreed with the user: one block per job (titulo, empresa, local/extranjera,
 * salario, descripción, tecnologías, nivel+experiencia, perfiles recomendados,
 * link), grouped by role category with a summary header.
 */

import type { Company, Job } from "@/types";
import { CATEGORY_ORDER, classifyRole, type RoleCategory } from "./utils/role-category";
import { extractTechs } from "./utils/tech-extract";
import { formatSalary } from "./utils/salary-format";
import { formatLevel } from "./utils/experience";
import { companyOrigin } from "./utils/company-origin";
import { recommendedProfiles } from "./utils/recommended-profiles";
import { countryName } from "@/lib/markets/countries";
import { isRegionCode } from "@/lib/markets/regions";
import { isEligibleVerdict } from "@/lib/markets/eligibility";

export interface ReportOptions {
  /** Timestamp of the report run (header date). */
  now: number;
  /** Lower bound used to select the jobs (header context), or null for "all". */
  since: number | null;
  /** Target market the report is about (ISO country or region). Default: "DO". */
  market?: string;
}

const REGION_NAMES_ES: Record<string, string> = {
  WORLDWIDE: "CUALQUIER PAÍS (REMOTO)",
  LATAM: "LATINOAMÉRICA",
  CARIBBEAN: "EL CARIBE",
  NA: "NORTEAMÉRICA",
  EU: "LA UNIÓN EUROPEA",
  EUROPE: "EUROPA",
  EMEA: "EMEA",
  APAC: "ASIA-PACÍFICO",
};

/** Spanish header name of a market ("REPÚBLICA DOMINICANA"). */
function marketNameEs(market: string): string {
  return isRegionCode(market) ? REGION_NAMES_ES[market] : countryName(market, "es").toUpperCase();
}

/** Open to `market`. Rows without per-market verdicts fall back to the DR flag for "DO". */
export function isJobInMarket(job: Job, market: string): boolean {
  const verdict = job.market_eligibility?.[market]?.verdict;
  if (verdict) return isEligibleVerdict(verdict);
  return market === "DO" && job.is_dr_friendly;
}

export interface ReportResult {
  text: string;
  /** Jobs that made it into the report (DR-friendly tech roles). */
  included: number;
  /** Jobs skipped because the title didn't classify as a tech role. */
  skippedNonTech: number;
  byCategory: Partial<Record<RoleCategory, number>>;
}

const HEAVY_RULE = "=".repeat(60);
const LIGHT_RULE = "-".repeat(60);
const DESCRIPTION_MAX = 450;

function fmtDate(ts: number): string {
  return new Intl.DateTimeFormat("es-DO", { dateStyle: "long" }).format(new Date(ts));
}

/** Collapse whitespace and cut at a word boundary near the limit. */
function summarize(description: string): string {
  const collapsed = description.replace(/\s+/g, " ").trim();
  if (collapsed.length <= DESCRIPTION_MAX) return collapsed;
  const cut = collapsed.slice(0, DESCRIPTION_MAX);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 200 ? lastSpace : DESCRIPTION_MAX)}…`;
}

interface Entry {
  job: Job;
  company: Company | undefined;
  category: RoleCategory;
}

function renderJob(entry: Entry, index: number, market: string): string {
  const { job, company, category } = entry;
  const techs = extractTechs(job.title, job.description, job.skills_required);
  const level = formatLevel(job.seniority_level, job.description);
  const link = job.apply_url || job.source_url || "No disponible";

  const lines = [
    `[${index}] ${job.title}`,
    `Empresa: ${company?.name ?? "No especificada"}`,
    `Tipo: ${companyOrigin(company, market)}`,
    `Salario: ${formatSalary(job)}`,
    `Descripción: ${summarize(job.description)}`,
    `Tecnologías: ${techs.length > 0 ? techs.join(", ") : "No especificadas"}`,
    `Nivel: ${level}`,
    `Perfiles recomendados: ${recommendedProfiles(category, level === "No especificado" ? null : level.split(" — ")[0], techs, job.description)}`,
    `Aplicar: ${link}`,
  ];
  return lines.join("\n");
}

/**
 * Build the report over jobs open to the market. Non-tech titles are excluded;
 * `companiesById` resolves the Empresa/Tipo lines.
 */
export function buildReport(
  jobs: Job[],
  companiesById: Map<string, Company>,
  options: ReportOptions
): ReportResult {
  const market = options.market ?? "DO";
  const entries: Entry[] = [];
  let skippedNonTech = 0;

  for (const job of jobs) {
    if (!isJobInMarket(job, market)) continue;
    const category = classifyRole(job.title);
    if (category === null) {
      skippedNonTech++;
      continue;
    }
    entries.push({ job, company: companiesById.get(job.company_id), category });
  }

  const byCategory: Partial<Record<RoleCategory, number>> = {};
  for (const entry of entries) {
    byCategory[entry.category] = (byCategory[entry.category] ?? 0) + 1;
  }

  const header: string[] = [
    `REPORTE DE EMPLEOS REMOTOS — CONTRATAN EN ${marketNameEs(market)}`,
    `Fecha: ${fmtDate(options.now)}`,
    options.since !== null
      ? `Empleos nuevos desde el ${fmtDate(options.since)}: ${entries.length}`
      : `Total de empleos: ${entries.length}`,
  ];
  const summary = CATEGORY_ORDER.filter((c) => (byCategory[c] ?? 0) > 0)
    .map((c) => `${c} (${byCategory[c]})`)
    .join(" · ");
  if (summary) header.push(`Por categoría: ${summary}`);

  const sections: string[] = [header.join("\n"), HEAVY_RULE];

  let index = 0;
  for (const category of CATEGORY_ORDER) {
    const group = entries.filter((e) => e.category === category);
    if (group.length === 0) continue;
    sections.push(`\n■ ${category.toUpperCase()} (${group.length})\n`);
    for (const entry of group) {
      index++;
      sections.push(renderJob(entry, index, market));
      sections.push(LIGHT_RULE);
    }
  }

  if (entries.length === 0) {
    sections.push("\nNo hay empleos nuevos para este período.");
  }

  return {
    text: sections.join("\n"),
    included: entries.length,
    skippedNonTech,
    byCategory,
  };
}
