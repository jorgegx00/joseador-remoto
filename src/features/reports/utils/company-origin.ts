/**
 * "Local (empresa dominicana) o extranjera" line. The companies table only
 * carries `headquarters_country` when a scraper provided it, so unknown
 * defaults to "Extranjera" (the SerpApi feed is overwhelmingly foreign) —
 * unless the company's own name/website signals a Dominican base. The job
 * description is deliberately NOT consulted: foreign companies that hire in
 * DR mention the country constantly and would false-positive as "Local".
 */

import type { Company } from "@/types";
import { countryName } from "@/lib/markets/countries";
import { isRegionCode, regionContains } from "@/lib/markets/regions";

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

function localLabel(market: string, hq: string): string {
  if (hq === "DO") return "Local (empresa dominicana)";
  return `Local (${COUNTRY_NAMES_ES[hq] ?? countryName(hq, "es")})`;
}

/**
 * Spanish "Tipo" line for a job's company, relative to the report's market: a
 * company headquartered in the market (or inside a region market) is "Local".
 * Name/website hints only exist for the Dominican Republic.
 */
export function companyOrigin(company: Company | undefined, market = "DO"): string {
  const hq = company?.headquarters_country?.trim().toUpperCase() ?? "";
  const isLocal = (code: string) => (isRegionCode(market) ? market !== "WORLDWIDE" && regionContains(market, code) : code === market);
  if (hq && isLocal(hq)) return localLabel(market, hq);
  if (hq) return `Extranjera (${COUNTRY_NAMES_ES[hq] ?? countryName(hq, "es")})`;
  if (
    isLocal("DO") &&
    company &&
    (DOMINICAN_NAME_HINTS.test(company.name) || DOMINICAN_TLD.test(company.website ?? ""))
  ) {
    return "Local (empresa dominicana)";
  }
  return "Extranjera";
}
