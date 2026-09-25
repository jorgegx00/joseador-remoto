/**
 * "Local (empresa dominicana) o extranjera" line. The companies table only
 * carries `headquarters_country` when a scraper provided it, so unknown
 * defaults to "Extranjera" (the SerpApi feed is overwhelmingly foreign) —
 * unless the company's own name/website signals a Dominican base. The job
 * description is deliberately NOT consulted: foreign companies that hire in
 * DR mention the country constantly and would false-positive as "Local".
 */

import type { Company } from "@/types";

const COUNTRY_NAMES_ES: Record<string, string> = {
  US: "Estados Unidos",
  CA: "Canadá",
  MX: "México",
  CO: "Colombia",
  AR: "Argentina",
  BR: "Brasil",
  CL: "Chile",
  PE: "Perú",
  UY: "Uruguay",
  CR: "Costa Rica",
  PA: "Panamá",
  GT: "Guatemala",
  SV: "El Salvador",
  HN: "Honduras",
  NI: "Nicaragua",
  EC: "Ecuador",
  VE: "Venezuela",
  PY: "Paraguay",
  BO: "Bolivia",
  ES: "España",
  GB: "Reino Unido",
  DE: "Alemania",
  FR: "Francia",
  NL: "Países Bajos",
  IN: "India",
  AU: "Australia",
};

const DOMINICAN_NAME_HINTS = /(dominican[ao]?|república dominicana|republica dominicana|santo domingo|\brd\b)/i;
const DOMINICAN_TLD = /\.do(\/|$)/i;

/** Spanish "Tipo" line for a job's company. */
export function companyOrigin(company: Company | undefined): string {
  const hq = company?.headquarters_country?.trim().toUpperCase() ?? "";
  if (hq === "DO") return "Local (empresa dominicana)";
  if (hq) return `Extranjera (${COUNTRY_NAMES_ES[hq] ?? hq})`;
  if (company && (DOMINICAN_NAME_HINTS.test(company.name) || DOMINICAN_TLD.test(company.website ?? ""))) {
    return "Local (empresa dominicana)";
  }
  return "Extranjera";
}
