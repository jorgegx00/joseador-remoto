import { getAllJobs, getJobById, upsertJob } from "@/services/database";
import { storageService } from "@/services/storage";
import { computeMarketFields, marketSignature } from "@/services/market-profile";

/** Signature (rules version + profile) the stored verdicts were computed under. */
const MARKET_SIGNATURE_KEY = "market_eligibility_signature";

/**
 * Recomputes per-market eligibility for every stored job and saves only the rows
 * whose verdicts changed. Keyword-only: never calls the network.
 */
export async function backfillMarketEligibility(): Promise<{ updated: number; total: number }> {
  const jobs = await getAllJobs();
  let updated = 0;
  for (const job of jobs) {
    const next = computeMarketFields(job);
    const same =
      job.is_market_eligible === next.is_market_eligible &&
      job.workplace === next.workplace &&
      JSON.stringify(job.market_eligibility ?? null) === JSON.stringify(next.market_eligibility) &&
      JSON.stringify(job.location_scope ?? null) === JSON.stringify(next.location_scope);
    if (same) continue;
    // Re-read so a concurrent save (capture, scrape merge, retention purge) isn't undone.
    const fresh = await getJobById(job.id);
    if (!fresh) continue;
    await upsertJob(fresh); // upsertJob stamps the fresh market fields itself
    updated++;
  }
  return { updated, total: jobs.length };
}

/**
 * Runs {@link backfillMarketEligibility} when the rules or the user's markets
 * changed, or when some row has no verdicts yet (written before this feature).
 */
export async function backfillMarketEligibilityIfNeeded(): Promise<{ ran: boolean; updated: number; total: number }> {
  const signature = marketSignature();
  let stored: string | null = null;
  try {
    stored = await storageService.getSetting(MARKET_SIGNATURE_KEY);
  } catch {
    stored = null;
  }
  if (stored === signature) {
    const jobs = await getAllJobs();
    if (!jobs.some((j) => j.market_eligibility == null)) return { ran: false, updated: 0, total: jobs.length };
  }
  const result = await backfillMarketEligibility();
  await storageService.saveSetting(MARKET_SIGNATURE_KEY, signature);
  return { ran: true, ...result };
}
