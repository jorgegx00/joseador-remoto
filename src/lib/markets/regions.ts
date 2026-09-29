/**
 * Hiring regions. A region is a named set of ISO countries plus the phrases job
 * postings use for it ("LATAM", "América Latina", "EMEA"…).
 *
 * `WORLDWIDE` is special: it contains every country, and as a *target market* it
 * means "remote roles I can take from where I live".
 */

export type RegionCode = "LATAM" | "CARIBBEAN" | "NA" | "EU" | "EUROPE" | "EMEA" | "APAC" | "WORLDWIDE";

export const REGION_CODES: readonly RegionCode[] = [
  "WORLDWIDE", "LATAM", "CARIBBEAN", "NA", "EU", "EUROPE", "EMEA", "APAC",
];

const LATAM = [
  "AR", "BO", "BR", "CL", "CO", "CR", "CU", "DO", "EC", "GT", "HN", "MX", "NI", "PA", "PE", "PR",
  "PY", "SV", "UY", "VE", "BZ", "GY", "SR", "HT", "JM", "TT", "BS", "BB",
];
const CARIBBEAN = [
  "DO", "PR", "CU", "HT", "JM", "TT", "BS", "BB", "AG", "DM", "GD", "KN", "LC", "VC", "AW", "CW",
  "SX", "BQ", "KY", "TC", "VG", "VI", "AI", "MS", "GP", "MQ", "BL", "MF",
];
const EU = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV",
  "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];
const EUROPE = [
  ...EU, "GB", "NO", "CH", "IS", "LI", "AL", "BA", "ME", "MK", "RS", "XK", "MD", "UA", "BY", "AD",
  "MC", "SM", "VA", "GI", "IM", "JE", "GG", "FO", "TR",
];
const MIDDLE_EAST = ["AE", "SA", "QA", "KW", "BH", "OM", "IL", "JO", "LB", "PS", "IQ", "IR", "SY", "YE", "EG"];
const AFRICA = [
  "DZ", "AO", "BJ", "BW", "BF", "BI", "CV", "CM", "CF", "TD", "KM", "CG", "CD", "CI", "DJ", "EG",
  "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN", "GW", "KE", "LS", "LR", "LY", "MG", "MW", "ML",
  "MR", "MU", "MA", "MZ", "NA", "NE", "NG", "RW", "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD",
  "TZ", "TG", "TN", "UG", "ZM", "ZW",
];
const APAC = [
  "AU", "NZ", "JP", "KR", "CN", "HK", "MO", "TW", "SG", "MY", "ID", "PH", "TH", "VN", "KH", "LA",
  "MM", "BN", "IN", "PK", "BD", "LK", "NP", "BT", "MV", "MN", "PG", "FJ",
];

export interface RegionDef {
  code: RegionCode;
  /** Member countries (ISO alpha-2). Empty for WORLDWIDE, which matches all. */
  countries: readonly string[];
  /** Normalized phrases that name the region in postings. */
  terms: readonly string[];
  /**
   * Terms too loose to trust in prose ("customers across the Americas") — they only
   * count in the head (title + location).
   */
  weakTerms?: readonly string[];
}

export const REGIONS: Readonly<Record<RegionCode, RegionDef>> = {
  WORLDWIDE: {
    code: "WORLDWIDE",
    countries: [],
    terms: [],
  },
  LATAM: {
    code: "LATAM",
    countries: LATAM,
    terms: [
      "latam", "latin america", "latinoamerica", "latino america", "america latina", "latinoamerica",
      "south america", "sudamerica", "suramerica", "america do sul", "central america", "centroamerica",
    ],
    weakTerms: ["americas", "western hemisphere", "nearshore"],
  },
  CARIBBEAN: {
    code: "CARIBBEAN",
    countries: CARIBBEAN,
    terms: ["caribbean", "caribe"],
  },
  NA: {
    code: "NA",
    countries: ["US", "CA", "MX"],
    terms: ["north america", "norteamerica", "america del norte"],
  },
  EU: {
    code: "EU",
    countries: EU,
    terms: ["european union", "eu", "union europea", "ue"],
  },
  EUROPE: {
    code: "EUROPE",
    countries: EUROPE,
    terms: ["europe", "europa", "european"],
  },
  EMEA: {
    code: "EMEA",
    countries: [...EUROPE, ...MIDDLE_EAST, ...AFRICA],
    terms: ["emea", "middle east", "africa"],
  },
  APAC: {
    code: "APAC",
    countries: APAC,
    terms: ["apac", "asia pacific", "asia-pacific", "asia", "oceania"],
  },
};

export function isRegionCode(value: string): value is RegionCode {
  return (REGION_CODES as readonly string[]).includes(value);
}

/** True when `country` belongs to `region` (every country belongs to WORLDWIDE). */
export function regionContains(region: RegionCode, country: string): boolean {
  if (region === "WORLDWIDE") return true;
  return REGIONS[region].countries.includes(country);
}

/** Regions a country belongs to (excluding WORLDWIDE). */
export function regionsOf(country: string): RegionCode[] {
  return REGION_CODES.filter((r) => r !== "WORLDWIDE" && REGIONS[r].countries.includes(country));
}
