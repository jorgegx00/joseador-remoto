/**
 * The user's job-hunting markets (where they live, which countries/regions they
 * target) and the per-job eligibility fields derived from it.
 *
 * The profile lives in the settings table as JSON under {@link MARKET_PROFILE_KEY}.
 * A module-level copy is kept so the persistence layer (upsertJob) can stamp
 * eligibility on every write without importing a UI store.
 */

import { assessJobMarkets, ELIGIBILITY_RULES_VERSION } from "@/lib/markets/eligibility";
import { isKnownCountry } from "@/lib/markets/countries";
import { isRegionCode } from "@/lib/markets/regions";
import { DEFAULT_MARKET_PROFILE, type Job, type MarketEligibility, type MarketProfile } from "@/types";

export const MARKET_PROFILE_KEY = "market_profile";
/** Set once the user confirmed their markets (onboarding or settings). */
export const MARKET_PROFILE_CONFIGURED_KEY = "market_profile_configured";

let current: MarketProfile = { ...DEFAULT_MARKET_PROFILE };

export function getMarketProfile(): MarketProfile {
  return current;
}

export function setCurrentMarketProfile(profile: MarketProfile): void {
  current = profile;
}

function isMarket(value: unknown): value is string {
  return typeof value === "string" && (isKnownCountry(value) || isRegionCode(value));
}

function countryList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((c): c is string => typeof c === "string" && isKnownCountry(c)) : [];
}

/** Parse a stored profile, falling back field-by-field to the DR defaults. */
export function parseMarketProfile(raw: string | null | undefined): MarketProfile {
  if (!raw) return { ...DEFAULT_MARKET_PROFILE };
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ...DEFAULT_MARKET_PROFILE };
  }
  const residence =
    typeof data.residenceCountry === "string" && isKnownCountry(data.residenceCountry)
      ? data.residenceCountry
      : DEFAULT_MARKET_PROFILE.residenceCountry;
  const markets = Array.isArray(data.targetMarkets) ? data.targetMarkets.filter(isMarket) : [];
  return {
    residenceCountry: residence,
    citizenships: countryList(data.citizenships),
    workAuthorizations: countryList(data.workAuthorizations),
    targetMarkets: markets.length > 0 ? [...new Set(markets)] : [residence, "WORLDWIDE"],
    openToRelocate: data.openToRelocate === true,
    acceptsContractor: data.acceptsContractor !== false,
    preferredCurrency:
      typeof data.preferredCurrency === "string" && /^[A-Z]{3}$/.test(data.preferredCurrency)
        ? data.preferredCurrency
        : DEFAULT_MARKET_PROFILE.preferredCurrency,
  };
}

/**
 * Identifies the rules + profile a stored verdict was computed under, so the
 * backfill knows when to recompute. Only fields that affect eligibility count.
 */
export function marketSignature(profile: MarketProfile = current): string {
  return JSON.stringify([
    ELIGIBILITY_RULES_VERSION,
    profile.residenceCountry,
    [...profile.citizenships].sort(),
    [...profile.workAuthorizations].sort(),
    [...profile.targetMarkets].sort(),
  ]);
}

const DR_TIER_VERDICT = {
  explicit_latam: "explicit",
  global_remote: "global",
  restricted: "restricted",
  ambiguous: "ambiguous",
} as const;

/** Markets the DR classifier answers for DR residents (mirrors eligibility.ts). */
const DR_MARKETS = new Set(["DO", "LATAM", "CARIBBEAN", "WORLDWIDE"]);

export type MarketFields = Pick<Job, "workplace" | "location_scope" | "market_eligibility" | "is_market_eligible">;

/**
 * Eligibility fields for a job under the current profile. Verdicts an LLM
 * adjudicated ("AI: …") survive while the keyword rules still say "ambiguous" —
 * otherwise every re-save would throw the paid-for answer away.
 */
export function computeMarketFields(
  job: Pick<Job, "location" | "description" | "title"> &
    Partial<Pick<Job, "market_eligibility" | "location_scope" | "dr_eligibility" | "dr_filter_reason">>,
  profile: MarketProfile = current,
): MarketFields {
  const assessment = assessJobMarkets(
    { location: job.location ?? "", description: job.description ?? "", title: job.title ?? "" },
    profile,
    undefined,
    job.location_scope,
  );
  const markets: Record<string, MarketEligibility> = { ...assessment.markets };
  // DR residents: the DR adjudicator stores its answer in dr_eligibility ("AI: …").
  const drAi =
    profile.residenceCountry === "DO" &&
    job.dr_filter_reason?.startsWith("AI:") &&
    job.dr_eligibility &&
    job.dr_eligibility !== "ambiguous"
      ? { verdict: DR_TIER_VERDICT[job.dr_eligibility], reason: job.dr_filter_reason }
      : null;
  for (const [market, result] of Object.entries(markets)) {
    if (result.verdict !== "ambiguous") continue;
    if (drAi && DR_MARKETS.has(market)) {
      markets[market] = drAi;
      continue;
    }
    const previous = job.market_eligibility?.[market];
    if (previous && previous.reason.startsWith("AI:")) markets[market] = previous;
  }
  return {
    workplace: assessment.scope.workplace,
    location_scope: assessment.scope,
    market_eligibility: markets,
    is_market_eligible: Object.values(markets).some((m) => m.verdict === "explicit" || m.verdict === "global"),
  };
}
