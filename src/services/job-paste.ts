/**
 * Pasted job posts -> real Job rows (source "manual").
 *
 * The pure pipeline lives in src/lib/jobs/pasted-job.ts; this module adds the optional
 * LLM extraction and the DB writes. A pasted post is never dropped: when the LLM is
 * unavailable or fails, the heuristic draft (with fallback title/company and the full
 * pasted text as description) is still saved.
 */

import { ulid } from "ulid";
import { LlmService } from "@/lib/llm/service";
import { CancelledError, describeLlmError, isCancelledError } from "@/lib/llm/errors";
import {
  finalizePastedJob,
  heuristicJobDraft,
  mergeJobDraft,
  pastedJobExternalId,
  resolvePastedCompanyName,
  type PastedJobDraft,
} from "@/lib/jobs/pasted-job";
import {
  findOrCreateCompanyByName,
  getJobByExternalId,
  getJobById,
  upsertJob,
} from "./database";
import { getActiveLlmConfig } from "./llm-active";
import type { Job } from "@/types";

export interface PastedJobExtractionResult {
  draft: PastedJobDraft;
  /** True when the LLM extraction succeeded and was merged into the draft. */
  usedLlm: boolean;
  /** Provider error message when the LLM call failed (heuristics were kept). */
  llmError: string | null;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new CancelledError();
}

/**
 * Heuristic draft first, then (when a provider is selected) the LLM extraction merged
 * on top. LLM failures keep the heuristic draft and are reported via `llmError`;
 * cancellation (abort) is rethrown.
 */
export async function extractPastedJobDraft(
  text: string,
  opts: { abortSignal?: AbortSignal } = {},
): Promise<PastedJobExtractionResult> {
  const { abortSignal } = opts;
  const heuristic = heuristicJobDraft(text);
  throwIfAborted(abortSignal);

  let config: Awaited<ReturnType<typeof getActiveLlmConfig>>;
  try {
    config = await getActiveLlmConfig();
  } catch (err) {
    // Provider selected but its config (e.g. API key) could not be loaded.
    return {
      draft: mergeJobDraft(heuristic, null),
      usedLlm: false,
      llmError: describeLlmError(err).message,
    };
  }
  throwIfAborted(abortSignal);
  if (!config) return { draft: mergeJobDraft(heuristic, null), usedLlm: false, llmError: null };

  try {
    const extraction = await new LlmService(config).extractJobPosting(
      heuristic.description || text,
      abortSignal,
    );
    throwIfAborted(abortSignal);
    return { draft: mergeJobDraft(heuristic, extraction), usedLlm: true, llmError: null };
  } catch (err) {
    if (isCancelledError(err) || abortSignal?.aborted) throw new CancelledError();
    console.warn("[job-paste] LLM extraction failed, keeping heuristics:", err);
    return {
      draft: mergeJobDraft(heuristic, null),
      usedLlm: false,
      llmError: describeLlmError(err).message,
    };
  }
}

/**
 * Persists a pasted post as a Job (source "manual"). Re-pasting the same text updates
 * the existing row (same external id) instead of creating a duplicate.
 */
export async function createJobFromPastedText(
  text: string,
  draft: PastedJobDraft,
): Promise<{ job: Job; wasExisting: boolean }> {
  const externalId = await pastedJobExternalId(text);
  const existing = await getJobByExternalId(externalId);
  const fields = finalizePastedJob(text, draft, Date.now());
  const companyName = resolvePastedCompanyName(draft);
  // No website: the post URL is usually a job board, not the company's site.
  const companyId = await findOrCreateCompanyByName(companyName, undefined, "manual");

  const id = existing?.id ?? ulid();
  await upsertJob({
    ...fields,
    id,
    external_id: externalId,
    company_id: companyId,
    company_name: companyName,
    // Keep the original paste date when the same post is saved again.
    posted_at: existing?.posted_at ?? fields.posted_at,
  });

  const job = await getJobById(id);
  if (!job) throw new Error(`Pasted job ${id} was not found after saving`);
  return { job, wasExisting: existing !== null };
}
