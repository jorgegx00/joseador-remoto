import type { Job, JobFilters } from "@/types";

/**
 * Location filter over the stored per-market verdicts. Pasted jobs always pass —
 * the user picked them on purpose. With `markets` empty, any target market counts.
 */
export function jobMatchesMarketFilter(
  job: Pick<Job, "source" | "market_eligibility">,
  mode: JobFilters["eligibilityFilter"],
  markets: string[],
): boolean {
  if (job.source === "manual") return true;
  const verdicts = Object.entries(job.market_eligibility ?? {}).filter(
    ([market]) => markets.length === 0 || markets.includes(market),
  );
  if (mode === "all") return markets.length === 0 || verdicts.length > 0;
  return verdicts.some(([, r]) => r.verdict === "explicit" || (mode === "eligible" && r.verdict === "global"));
}
