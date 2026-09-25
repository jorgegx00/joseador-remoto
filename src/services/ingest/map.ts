/**
 * RawSourceJob → IncomingScrapedJob mapping, ported from the retired Jobs
 * Service (server/src/ingest/map.ts): sanitize → DR-flag (never a gate) →
 * needs_recovery flagging (never drop) → stable fingerprint external_id.
 */

import { isDrFriendly } from "@/lib/dr-filter";
import { generateFingerprint, type IncomingScrapedJob } from "../dedup";
import type { RawSourceJob } from "./types";

/** Adapter name → user-facing source badge. Unlisted adapters show as aggregator. */
const SOURCE_LABELS: Record<string, string> = {
  serpapi: "aggregator",
  "apify-linkedin": "linkedin",
};

/** Minimal HTML/whitespace sanitizer (the upstream APIs return mostly-plain text). */
export function sanitizeText(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const EMPLOYMENT_TYPE_MAP: Record<string, string> = {
  "full-time": "full_time",
  "full time": "full_time",
  "contractor": "contract",
  "contract": "contract",
  "part-time": "part_time",
  "part time": "part_time",
  "temporary": "contract",
  "internship": "contract",
  "intern": "contract",
};

function mapEmploymentType(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return EMPLOYMENT_TYPE_MAP[raw.trim().toLowerCase()];
}

/** Light seniority inference from the title; absent → left null. */
export function inferSeniority(title: string): string | undefined {
  const t = title.toLowerCase();
  if (/\b(principal|staff)\b/.test(t)) return "principal";
  if (/\blead\b/.test(t)) return "lead";
  if (/\b(senior|sr\.?)\b/.test(t)) return "senior";
  if (/\b(junior|jr\.?|trainee|intern)\b/.test(t)) return "junior";
  return undefined;
}

/** Hex SHA-256 via Web Crypto (available in the WebView and Node ≥ 19). */
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function mapRawJob(raw: RawSourceJob, sourceName = "serpapi"): Promise<IncomingScrapedJob> {
  const cleanTitle = sanitizeText(raw.title);
  const cleanCompany = sanitizeText(raw.company_name);
  const cleanDescription = sanitizeText(raw.description);
  const location = sanitizeText(raw.location) || (raw.work_from_home ? "Remote" : "");

  const drResult = isDrFriendly(location, cleanDescription, cleanTitle);

  // Never drop on missing fields — flag for recovery and keep the payload
  // (feedback_no_drop_on_parse_fail).
  const needsRecovery =
    cleanTitle.length === 0 || cleanCompany.length === 0 || cleanDescription.length === 0;

  const job: IncomingScrapedJob = {
    external_id: "", // filled below from the fingerprint
    title: cleanTitle,
    company_name: cleanCompany,
    company_website: raw.company_website,
    description: cleanDescription,
    location,
    source: SOURCE_LABELS[sourceName] ?? "aggregator",
    source_url: raw.source_url ?? raw.apply_url,
    apply_url: raw.apply_url,
    salary_min: raw.salary_min,
    salary_max: raw.salary_max,
    salary_currency: raw.salary_currency,
    employment_type: mapEmploymentType(raw.employment_type),
    seniority_level: inferSeniority(cleanTitle),
    skills_required: [],
    posted_at: raw.posted_at,
    is_dr_friendly: drResult.friendly,
    dr_filter_reason: drResult.reason,
    dr_eligibility: drResult.eligibility,
    needs_recovery: needsRecovery || undefined,
    raw_payload: needsRecovery ? raw.raw_payload : undefined,
  };

  // Upstream ids (e.g. SerpApi job_id) are unstable across searches, so the
  // stable identity is a content fingerprint (title+company+description head),
  // namespaced per adapter. The "<source>:<sha256-hex-40>" scheme matches the
  // retired server's exactly, so re-scraped jobs dedupe against rows synced
  // before the merge. Cross-source duplicates are handled by fuzzy dedup, not
  // by external_id collisions.
  const fingerprint = generateFingerprint(job);
  job.external_id = `${sourceName}:${(await sha256Hex(fingerprint)).slice(0, 40)}`;

  return job;
}
