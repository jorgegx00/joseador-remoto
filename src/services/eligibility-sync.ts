/**
 * Keeps stored location eligibility in step with the rules and the user's
 * markets. Two bounded passes each for the DR tiers and the per-market verdicts:
 * a cheap keyword recompute (only when rules/markets changed), then LLM
 * adjudication of the residual ambiguous rows (no-op without a provider).
 */

import { backfillDrFlagsIfNeeded } from "@/services/dr-backfill";
import { adjudicateAmbiguousDrJobs } from "@/services/dr-adjudicate";
import { backfillMarketEligibility, backfillMarketEligibilityIfNeeded } from "@/services/eligibility-backfill";
import { adjudicateAmbiguousMarkets } from "@/services/market-adjudicate";
import { useJobStore } from "@/stores/jobStore";

let running: Promise<void> | null = null;
let rerun = false;

async function reconcile(): Promise<void> {
  const kw = await backfillDrFlagsIfNeeded();
  const market = await backfillMarketEligibilityIfNeeded();
  if (kw.ran || market.ran) {
    console.info(`[eligibility] keyword backfill: DR ${kw.updated}, markets ${market.updated}`);
  }
  const drAdj = await adjudicateAmbiguousDrJobs();
  // DR verdicts are copied into the DO/LATAM markets on the next save.
  if (drAdj.updated > 0) await backfillMarketEligibility();
  const marketAdj = await adjudicateAmbiguousMarkets();
  if (drAdj.updated > 0 || marketAdj.updated > 0) {
    console.info(`[eligibility] LLM adjudication: DR ${drAdj.updated}, markets ${marketAdj.updated}`);
  }
  if (kw.updated > 0 || market.updated > 0 || drAdj.updated > 0 || marketAdj.updated > 0) {
    await useJobStore.getState().fetchJobs();
  }
}

/**
 * Run a reconciliation; calls made while one runs coalesce into one more run, so
 * rapid market edits never stack work.
 */
export function reconcileEligibility(): Promise<void> {
  if (running) {
    rerun = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        rerun = false;
        await reconcile();
      } while (rerun);
    } catch (err) {
      console.error("[eligibility] reconciliation failed:", err);
    } finally {
      running = null;
    }
  })();
  return running;
}
