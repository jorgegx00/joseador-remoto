/**
 * Plain-text weekly report (Spanish) of DR-friendly tech jobs, in the format
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

export interface ReportOptions {
  /** Timestamp of the report run (header date). */
  now: number;
  /** Lower bound used to select the jobs (header context), or null for "all". */
  since: number | null;
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

function renderJob(entry: Entry, index: number): string {
  const { job, company, category } = entry;
  const techs = extractTechs(job.title, job.description, job.skills_required);
  const level = formatLevel(job.seniority_level, job.description);
  const link = job.apply_url || job.source_url || "No disponible";

  const lines = [
    `[${index}] ${job.title}`,
    `Empresa: ${company?.name ?? "No especificada"}`,
    `Tipo: ${companyOrigin(company)}`,
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
 * Build the report over DR-friendly jobs. Non-tech titles are excluded;
 * `companiesById` resolves the Empresa/Tipo lines.
 */
export function buildReport(
  jobs: Job[],
  companiesById: Map<string, Company>,
  options: ReportOptions
): ReportResult {
  const entries: Entry[] = [];
  let skippedNonTech = 0;

  for (const job of jobs) {
    if (!job.is_dr_friendly) continue;
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
    `REPORTE DE EMPLEOS REMOTOS — CONTRATAN EN REPÚBLICA DOMINICANA`,
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
      sections.push(renderJob(entry, index));
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
