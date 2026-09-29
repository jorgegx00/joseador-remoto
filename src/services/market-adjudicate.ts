/**
 * LLM adjudication for the multi-market classifier: jobs whose keyword scope was
 * uninformative (bare "remote", no place, no worldwide statement) get their hiring
 * geography extracted by the active provider. The result is stored as an
 * `ai` LocationScope and judged against every target market by the app, so one
 * call per job serves any market list, including future market changes.
 *
 * DR residents' DO/LATAM/CARIBBEAN/WORLDWIDE markets are resolved by the DR
 * adjudicator (dr-adjudicate.ts); this runs only when some other market still
 * has an ambiguous verdict. Bounded like the DR step: batched, once per job,
 * no-op without a provider, failures leave rows ambiguous (never dropped).
 */

import { getAllJobs, getJobById, upsertJob } from "@/services/database";
import { getConfig } from "@/services/llm";
import { LlmService } from "@/lib/llm";
import { useSettingsStore } from "@/stores/settingsStore";
import { buildDescriptionForAdjudication } from "@/services/dr-adjudicate";
import { isUninformativeScope } from "@/lib/markets/eligibility";
import { isKnownCountry } from "@/lib/markets/countries";
import type { Job, LocationScope } from "@/types";

const BATCH_SIZE = 15;
const DR_MARKETS = new Set(["DO", "LATAM", "CARIBBEAN", "WORLDWIDE"]);

/** Jobs with an ambiguous verdict the keyword rules can't improve on. */
export function needsScopeAdjudication(job: Job, residence: string): boolean {
  if (!job.description.trim() || job.location_scope?.ai) return false;
  if (!job.location_scope || !isUninformativeScope(job.location_scope)) return false;
  return Object.entries(job.market_eligibility ?? {}).some(
    ([market, r]) => r.verdict === "ambiguous" && !(residence === "DO" && DR_MARKETS.has(market)),
  );
}

const codes = (list: string[]) => [...new Set(list.map((c) => c.trim().toUpperCase()).filter(isKnownCountry))].sort();

export async function adjudicateAmbiguousMarkets(
  opts: { maxJobs?: number } = {},
): Promise<{ ran: boolean; processed: number; updated: number }> {
  const { llm, market } = useSettingsStore.getState();
  if (!llm.active_provider) return { ran: false, processed: 0, updated: 0 };

  const all = await getAllJobs();
  const pending = all.filter((j) => needsScopeAdjudication(j, market.residenceCountry));
  const targets = opts.maxJobs != null ? pending.slice(0, opts.maxJobs) : pending;
  if (targets.length === 0) return { ran: true, processed: 0, updated: 0 };

  const service = new LlmService(await getConfig(llm.active_provider));
  let processed = 0;
  let updated = 0;

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    let results;
    try {
      results = await service.extractLocationScopes(
        batch.map((j) => ({
          id: j.id,
          title: j.title,
          location: j.location,
          descriptionHead: buildDescriptionForAdjudication(j.description),
        })),
      );
    } catch (err) {
      console.warn(`[market-adjudicate] batch failed, left ambiguous: ${String(err)}`);
      continue;
    }
    const byId = new Map(results.map((r) => [r.id, r]));
    for (const job of batch) {
      processed++;
      const r = byId.get(job.id);
      // Re-read: the LLM call took a while and the row may have changed meanwhile.
      const fresh = r ? await getJobById(job.id) : null;
      if (!r || !fresh?.location_scope) continue;
      const scope: LocationScope = {
        ...fresh.location_scope,
        workplace: r.workplace === "unknown" ? fresh.location_scope.workplace : r.workplace,
        countries: codes(r.countries),
        regions: [...new Set(r.regions)].sort(),
        excludedCountries: codes(r.excluded_countries),
        workAuth: codes(r.work_auth),
        global: r.global,
        ai: true,
      };
      await upsertJob({ ...fresh, location_scope: scope });
      updated++;
    }
  }
  return { ran: true, processed, updated };
}
