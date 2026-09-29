import type { RegionCode } from "@/lib/markets/regions";

export type { RegionCode };

/**
 * A market the user is job hunting in: an ISO 3166-1 alpha-2 country ("DO", "US")
 * or a region ("LATAM", "EU", "WORLDWIDE" = remote from where I live).
 */
export type TargetMarket = string;

export interface MarketProfile {
  /** Where the user lives (ISO alpha-2). Drives "remote from home" eligibility. */
  residenceCountry: string;
  citizenships: string[];
  /** Countries the user may legally work in (beyond citizenship). */
  workAuthorizations: string[];
  /** Countries and/or regions the user is job hunting in. Never empty. */
  targetMarkets: TargetMarket[];
  openToRelocate: boolean;
  acceptsContractor: boolean;
  /** ISO 4217 currency salaries are shown in (besides the original). */
  preferredCurrency: string;
}

/**
 * Eligibility of one job for one market, most to least accessible:
 * - `explicit`   — the posting names the market (or a region/city inside it).
 * - `global`     — genuinely worldwide remote, no geographic restriction.
 * - `restricted` — limited to other places, excludes the market, or needs a work
 *                  authorization the market doesn't give.
 * - `ambiguous`  — underspecified; awaits LLM adjudication (never shown as eligible).
 */
export type MarketVerdict = "explicit" | "global" | "restricted" | "ambiguous";

export interface MarketEligibility {
  verdict: MarketVerdict;
  reason: string;
}

export type Workplace = "remote" | "hybrid" | "onsite" | "unknown";

/** Where a job can be done from and who it hires, as extracted from its text. */
export interface LocationScope {
  workplace: Workplace;
  /** Countries the role is located in / open to (ISO alpha-2). */
  countries: string[];
  regions: RegionCode[];
  excludedCountries: string[];
  excludedRegions: RegionCode[];
  /** Countries whose work authorization / residency / citizenship is required. */
  workAuth: string[];
  /** Explicit "hire from anywhere in the world" statement. */
  global: boolean;
  remoteMentioned: boolean;
  /** Head says remote but something says on-site/hybrid — never auto-approve. */
  onsiteConflict: boolean;
  visaSponsorship: "yes" | "no" | "unknown";
  /** Produced by LLM adjudication rather than the keyword rules. */
  ai?: boolean;
}

export const DEFAULT_MARKET_PROFILE: MarketProfile = {
  residenceCountry: "DO",
  citizenships: [],
  workAuthorizations: [],
  targetMarkets: ["DO", "LATAM", "WORLDWIDE"],
  openToRelocate: false,
  acceptsContractor: true,
  preferredCurrency: "USD",
};
