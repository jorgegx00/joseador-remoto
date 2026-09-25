/**
 * LLM adjudication for jobs the cheap keyword classifier (src/lib/dr-filter.ts)
 * left as `dr_eligibility = "ambiguous"` — bare "remote"/"anywhere" postings with
 * no decisive geographic signal, which are frequently US-only in practice.
 *
 * Cost is bounded on purpose:
 *  - only `ambiguous` rows are ever sent (explicit/global/restricted are decided for free),
 *  - each job is resolved once and persisted, so re-runs only touch NEW ambiguous rows,
 *  - jobs are batched into a single LLM call each.
 *
 * Guarded: with no LLM provider configured it no-ops (ambiguous jobs simply stay
 * hidden from the strict view but remain visible under "All" — never dropped,
 * per feedback_no_drop_on_parse_fail).
 */

import { getAllJobs, upsertJob } from "@/services/database";
import { getConfig } from "@/services/llm";
import { LlmService } from "@/lib/llm";
import { useSettingsStore } from "@/stores/settingsStore";

export interface AdjudicateResult {
  ran: boolean;
  processed: number;
  updated: number;
}

const DEFAULT_BATCH_SIZE = 15;
const DESCRIPTION_HEAD_CHARS = 1200;
const LOCATION_EXCERPT_CHARS = 1000;

/**
 * Where a posting states its location is often far below the intro ("-> Team in
 * Greece <-" near the end), so beyond the description head we also send every later
 * sentence that talks about location, remoteness or eligibility.
 */
const LOCATION_SENTENCE_RE =
  /\b(?:remote|remoto|based|located|location|reside|resident|relocat|country|countries|region|time ?zone|office|on-?site|hybrid|in[- ]person|eligib|authori[sz]|visa|citizen|anywhere|worldwide|global|latam|latin|caribbean|team in|teams in|hire|hiring)\w*/i;

export function buildDescriptionForAdjudication(description: string): string {
  const head = description.slice(0, DESCRIPTION_HEAD_CHARS);
  const rest = description.slice(DESCRIPTION_HEAD_CHARS);
  if (!rest.trim()) return head;
  let excerpt = "";
  for (const sentence of rest.split(/[.!?]\s+|\n+/)) {
    const trimmed = sentence.trim();
    if (!trimmed || !LOCATION_SENTENCE_RE.test(trimmed)) continue;
    if (excerpt.length + trimmed.length > LOCATION_EXCERPT_CHARS) break;
    excerpt += `${trimmed}\n`;
  }
  return excerpt ? `${head}\n[…]\n${excerpt.trim()}` : head;
}

/**
 * Resolve ambiguous DR-eligibility rows via the active LLM provider.
 * @param opts.batchSize jobs per LLM call (default 15)
 * @param opts.maxJobs   cap on how many ambiguous rows to process this run (default: all)
 */
export async function adjudicateAmbiguousDrJobs(
  opts: { batchSize?: number; maxJobs?: number } = {},
): Promise<AdjudicateResult> {
  const activeProvider = useSettingsStore.getState().llm.active_provider;
  if (!activeProvider) {
    return { ran: false, processed: 0, updated: 0 };
  }

  const all = await getAllJobs();
  // Skip rows with no description — the model would have nothing to judge, and
  // sending them would waste tokens. They stay ambiguous for a future re-run.
  const ambiguous = all.filter(
    (j) => j.dr_eligibility === "ambiguous" && j.description.trim().length > 0,
  );
  if (ambiguous.length === 0) {
    return { ran: true, processed: 0, updated: 0 };
  }

  const config = await getConfig(activeProvider);
  const service = new LlmService(config);

  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const targets =
    opts.maxJobs != null ? ambiguous.slice(0, opts.maxJobs) : ambiguous;

  let processed = 0;
  let updated = 0;

  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);

    let results;
    try {
      results = await service.classifyDrEligibility(
        batch.map((j) => ({
          id: j.id,
          title: j.title,
          location: j.location,
          descriptionHead: buildDescriptionForAdjudication(j.description),
        })),
      );
    } catch (err) {
      // Never drop — leave the batch as ambiguous so a later run can retry.
      console.warn(`[dr-adjudicate] batch failed, left as ambiguous: ${String(err)}`);
      continue;
    }

    const byId = new Map(results.map((r) => [r.id, r]));
    for (const job of batch) {
      processed++;
      const r = byId.get(job.id);
      if (!r) continue; // model omitted this id — leave it ambiguous

      const friendly = r.eligibility === "explicit_latam" || r.eligibility === "global_remote";
      if (job.dr_eligibility === r.eligibility && job.is_dr_friendly === friendly) {
        continue;
      }
      await upsertJob({
        ...job,
        is_dr_friendly: friendly,
        dr_eligibility: r.eligibility,
        dr_filter_reason: `AI: ${r.reason}`,
      });
      updated++;
    }
  }

  return { ran: true, processed, updated };
}

/** How many jobs are currently awaiting LLM adjudication. */
export async function countAmbiguousDrJobs(): Promise<number> {
  const all = await getAllJobs();
  return all.filter((j) => j.dr_eligibility === "ambiguous").length;
}
