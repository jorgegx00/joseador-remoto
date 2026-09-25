import { getAllJobs, upsertJob } from "@/services/database";
import { isDrFriendly } from "@/lib/dr-filter";
import { storageService } from "@/services/storage";

/**
 * Bump when the dr-filter rules change so {@link backfillDrFlagsIfNeeded} reruns
 * once over existing rows. History:
 *   1 — original binary is_dr_friendly filter
 *   2 — tiered eligibility (explicit_latam | global_remote | restricted | ambiguous)
 *   3 — scoped matching: single/multi-country & city LATAM postings, on-site/hybrid,
 *       DR exclusions and DR aliases (RD, Rep. Dom., Punta Cana, …)
 *   4 — full non-LATAM country/city vocabulary + "based in <non-LATAM place>"; also
 *       resets AI verdicts made under the old "prefer global_remote" prompt
 */
const DR_CLASSIFIER_VERSION = "4";
const DR_CLASSIFIER_VERSION_KEY = "dr_classifier_version";

/**
 * Re-runs the (cheap, keyword-only) DR filter over every job in the DB and
 * updates is_dr_friendly / dr_filter_reason / dr_eligibility accordingly.
 *
 * Resolving `ambiguous` rows with the LLM is a separate, provider-gated step
 * (src/services/dr-adjudicate.ts) — this function never calls the network.
 */
export async function backfillDrFlags(): Promise<{ updated: number; total: number }> {
  const jobs = await getAllJobs();
  let updated = 0;

  for (const job of jobs) {
    const result = isDrFriendly(job.location ?? "", job.description ?? "", job.title ?? "");
    if (
      job.is_dr_friendly === result.friendly &&
      job.dr_filter_reason === result.reason &&
      job.dr_eligibility === result.eligibility
    ) {
      continue;
    }
    await upsertJob({
      ...job,
      is_dr_friendly: result.friendly,
      dr_filter_reason: result.reason,
      dr_eligibility: result.eligibility,
    });
    updated++;
  }

  return { updated, total: jobs.length };
}

/**
 * Runs the keyword backfill once per classifier version. Reruns when:
 *  - the stored classifier version differs from the current one (rules changed), or
 *  - rows exist but none carry a dr_filter_reason / dr_eligibility (predate the fix).
 * Records the version afterward so it won't rerun until the rules change again.
 */
export async function backfillDrFlagsIfNeeded(): Promise<{ ran: boolean; updated: number; total: number }> {
  const jobs = await getAllJobs();
  if (jobs.length === 0) {
    await storageService.saveSetting(DR_CLASSIFIER_VERSION_KEY, DR_CLASSIFIER_VERSION);
    return { ran: false, updated: 0, total: 0 };
  }

  let storedVersion: string | null = null;
  try {
    storedVersion = (await storageService.getSetting(DR_CLASSIFIER_VERSION_KEY)) ?? null;
  } catch {
    storedVersion = null;
  }

  const missingTiers = jobs.every((j) => j.dr_eligibility == null);
  const missingReasons = jobs.every((j) => !j.dr_filter_reason || j.dr_filter_reason.length === 0);
  const needsRun = storedVersion !== DR_CLASSIFIER_VERSION || missingTiers || missingReasons;
  if (!needsRun) {
    return { ran: false, updated: 0, total: jobs.length };
  }

  const { updated } = await backfillDrFlags();
  await storageService.saveSetting(DR_CLASSIFIER_VERSION_KEY, DR_CLASSIFIER_VERSION);
  return { ran: true, updated, total: jobs.length };
}
