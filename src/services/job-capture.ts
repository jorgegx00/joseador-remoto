/**
 * Job postings imported from a link (paste-by-URL) → Job rows.
 *
 * Extraction order, most to least trustworthy — the first that yields a posting wins:
 *   1. the ATS's public posting API (Greenhouse, Lever, Ashby, SmartRecruiters, Workday)
 *   2. schema.org JobPosting JSON-LD embedded in the page
 *   3. the page text through the paste pipeline (heuristics + optional LLM)
 * Page content is untrusted: it only ever becomes structured fields and plain
 * text, and the LLM (step 3) sees it as delimited data with no tools.
 */

import { ulid } from "ulid";
import { invoke } from "@tauri-apps/api/core";
import { analyzeUrl, stripTracking } from "@/lib/job-capture/canonical";
import { fetchAtsJob } from "@/lib/job-capture/ats-api";
import { extractJsonLdBlocks, jobFromJsonLd } from "@/lib/job-capture/jsonld";
import { htmlToText } from "@/lib/job-capture/html-text";
import { capturedToDraft } from "@/lib/job-capture/to-draft";
import type { CapturedJob } from "@/lib/job-capture/types";
import {
  finalizePastedJob,
  pastedJobExternalId,
  resolvePastedCompanyName,
  type PastedJobDraft,
} from "@/lib/jobs/pasted-job";
import {
  findOrCreateCompanyByName,
  getJobByCanonicalKey,
  getJobByExternalId,
  getJobById,
  upsertJob,
} from "./database";
import { extractPastedJobDraft } from "./job-paste";
import { rustFetch } from "./http";
import type { Job } from "@/types";

/** Page text handed to the extraction step (the paste pipeline caps it further). */
const MAX_TEXT_CHARS = 60_000;

/** A job page to resolve: its URL, embedded JSON-LD blocks and visible text. */
export interface PageSnapshot {
  url: string;
  jsonLd: string[];
  text: string;
}

export interface ResolvedCapture {
  draft: PastedJobDraft;
  via: CapturedJob["via"];
  canonicalKey: string | null;
  canonicalUrl: string;
  llmError: string | null;
}

/** Steps 1–2; null when neither produced a posting. */
async function structuredCapture(payload: Pick<PageSnapshot, "url" | "jsonLd">): Promise<CapturedJob | null> {
  const { ats } = analyzeUrl(payload.url);
  if (ats) {
    try {
      const job = await fetchAtsJob(ats, rustFetch);
      if (job) return job;
    } catch (err) {
      console.warn(`[job-capture] ATS API failed, falling back: ${String(err)}`);
    }
  }
  return jobFromJsonLd(payload.jsonLd);
}

export async function resolveCapture(
  payload: PageSnapshot,
  opts: { abortSignal?: AbortSignal } = {},
): Promise<ResolvedCapture> {
  const info = analyzeUrl(payload.url);
  const structured = await structuredCapture(payload);
  if (structured) {
    return {
      draft: capturedToDraft(structured, info.canonicalUrl),
      via: structured.via,
      canonicalKey: info.canonicalKey,
      canonicalUrl: info.canonicalUrl,
      llmError: null,
    };
  }
  const { draft, llmError } = await extractPastedJobDraft(payload.text, opts);
  return {
    draft: { ...draft, source_url: info.canonicalUrl, apply_url: draft.apply_url || info.canonicalUrl },
    via: "text",
    canonicalKey: info.canonicalKey,
    canonicalUrl: info.canonicalUrl,
    llmError,
  };
}

/** Existing job for a capture identity: canonical key first, then the URL-derived id. */
export async function findCapturedJob(url: string): Promise<Job | null> {
  const { canonicalKey, canonicalUrl } = analyzeUrl(url);
  if (canonicalKey) {
    const byKey = await getJobByCanonicalKey(canonicalKey);
    if (byKey) return byKey;
  }
  return getJobByExternalId(await pastedJobExternalId(stripTracking(canonicalUrl)));
}

/**
 * Saves a resolved capture as a Job (source "manual": the user picked it, so it
 * bypasses location filters and the company blacklist like a pasted post).
 * Capturing the same posting again updates the existing row.
 */
export async function saveCapturedJob(
  resolved: ResolvedCapture,
  rawText: string,
): Promise<{ job: Job; duplicate: boolean }> {
  const existing = await findCapturedJob(resolved.canonicalUrl);
  const fields = finalizePastedJob(rawText || resolved.draft.description, resolved.draft, Date.now());
  const companyName = resolvePastedCompanyName(resolved.draft);
  const companyId = await findOrCreateCompanyByName(companyName, undefined, "manual");
  const id = existing?.id ?? ulid();
  await upsertJob({
    ...fields,
    // Raw page text is only kept when it was the source of the fields.
    raw_payload: resolved.via === "text" ? fields.raw_payload : null,
    id,
    external_id: existing?.external_id ?? resolved.canonicalKey ?? (await pastedJobExternalId(stripTracking(resolved.canonicalUrl))),
    canonical_key: resolved.canonicalKey,
    company_id: companyId,
    company_name: companyName,
    posted_at: existing?.posted_at ?? fields.posted_at,
  });
  const job = await getJobById(id);
  if (!job) throw new Error(`Captured job ${id} was not found after saving`);
  return { job, duplicate: existing !== null };
}

/** Sites whose terms forbid automated access: captured from the user's browser only. */
const BROWSER_ONLY_SITES = new Set(["linkedin", "indeed", "google_jobs"]);

export class BrowserOnlySiteError extends Error {
  readonly site: string;
  constructor(site: string) {
    super(`browser_only:${site}`);
    this.site = site;
  }
}

/**
 * Paste-by-URL: resolves a job from a link. ATS links use the ATS API; other
 * public career pages are fetched once (Rust `fetch_public_page`: https, public
 * IPs only, size-capped) and read through JSON-LD, then text. LinkedIn, Indeed
 * and Google are never fetched by the app (see {@link BrowserOnlySiteError}).
 */
export async function resolveCaptureFromUrl(url: string, opts: { abortSignal?: AbortSignal } = {}): Promise<ResolvedCapture> {
  const info = analyzeUrl(url);
  if (BROWSER_ONLY_SITES.has(info.site)) throw new BrowserOnlySiteError(info.site);
  if (info.ats) {
    const viaAts = await structuredCapture({ url, jsonLd: [] });
    if (viaAts) {
      return { draft: capturedToDraft(viaAts, info.canonicalUrl), via: viaAts.via, canonicalKey: info.canonicalKey, canonicalUrl: info.canonicalUrl, llmError: null };
    }
  }
  const page = await invoke<{ finalUrl: string; html: string }>("fetch_public_page", { url: info.canonicalUrl });
  return resolveCapture(
    { url: page.finalUrl, jsonLd: extractJsonLdBlocks(page.html), text: htmlToText(page.html).slice(0, MAX_TEXT_CHARS) },
    opts,
  );
}
