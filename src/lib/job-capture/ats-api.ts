/**
 * Public, unauthenticated job-posting APIs of the common ATSs. These are the
 * employers' own published feeds (meant to be consumed by job boards), so
 * fetching one posting the user is looking at is both the cleanest data and the
 * least intrusive way to get it. Runs in the app through the Rust HTTP proxy
 * (see ALLOWED_HOSTS in src-tauri/src/commands/http.rs).
 *
 *   Greenhouse      GET boards-api.greenhouse.io/v1/boards/{board}/jobs/{id}
 *   Lever           GET api(.eu).lever.co/v0/postings/{site}/{id}?mode=json
 *   Ashby           GET api.ashbyhq.com/posting-api/job-board/{org}?includeCompensation=true
 *   SmartRecruiters GET api.smartrecruiters.com/v1/companies/{company}/postings/{id}
 *   Workday         GET {origin}/wday/cxs/{tenant}/{site}{path}   (undocumented, best effort)
 */

import type { EmploymentType, SalaryPeriod } from "@/types";
import type { AtsRef } from "./canonical";
import { htmlToText } from "./html-text";
import { emptyCapturedJob, type CapturedJob } from "./types";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type Json = Record<string, unknown>;
export const obj = (v: unknown): Json => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : {});
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
const ms = (v: unknown): number | null => {
  const t = typeof v === "number" ? v : Date.parse(str(v));
  return Number.isFinite(t) && t > 0 ? t : null;
};

/** "acme-corp" → "Acme Corp" (Lever/Ashby only expose the board slug). */
function slugName(slug: string): string {
  return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function employment(raw: string): EmploymentType | null {
  const r = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (r.includes("parttime")) return "part_time";
  if (/contract|temporary|intern|freelance/.test(r)) return "contract";
  if (r.includes("fulltime") || r === "permanent") return "full_time";
  return null;
}

async function getJson(fetchImpl: FetchLike, url: string): Promise<unknown> {
  const res = await fetchImpl(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** One Greenhouse posting (detail, or list item fetched with ?content=true). */
export function mapGreenhousePosting(d: Json, board: string): CapturedJob {
  const job = emptyCapturedJob("ats_api");
  job.title = str(d.title);
  job.company = str(d.company_name) || slugName(board);
  job.location = str(obj(d.location).name);
  job.description = htmlToText(str(d.content));
  job.postedAt = ms(d.first_published) ?? ms(d.updated_at);
  job.applyUrl = str(d.absolute_url) || null;
  job.remote = /\bremote\b/i.test(job.location) || null;
  const pay = Array.isArray(d.pay_input_ranges) ? obj(d.pay_input_ranges[0]) : null;
  if (pay) {
    const cents = (v: unknown) => (num(v) === null ? null : num(v)! / 100);
    job.salary = { min: cents(pay.min_cents), max: cents(pay.max_cents), currency: str(pay.currency_type) || null, period: "year" };
  }
  return job;
}

async function greenhouse(ref: Extract<AtsRef, { kind: "greenhouse" }>, f: FetchLike): Promise<CapturedJob | null> {
  if (!ref.board) return null; // career-site embed: board token unknown, use JSON-LD instead
  const d = obj(await getJson(f, `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(ref.board)}/jobs/${ref.id}?pay_transparency=true`));
  return mapGreenhousePosting(d, ref.board);
}

/** One Lever posting (detail or list item, mode=json). */
export function mapLeverPosting(d: Json, site: string): CapturedJob {
  const cats = obj(d.categories);
  const job = emptyCapturedJob("ats_api");
  job.title = str(d.text);
  job.company = slugName(site);
  job.location = [str(cats.location), str(d.workplaceType) === "remote" ? "Remote" : ""].filter(Boolean).join(" · ");
  const lists = Array.isArray(d.lists)
    ? d.lists.map((l) => `## ${str(obj(l).text)}\n${htmlToText(str(obj(l).content))}`).join("\n\n")
    : "";
  job.description = [str(d.descriptionPlain) || htmlToText(str(d.description)), lists, str(d.additionalPlain)]
    .filter(Boolean)
    .join("\n\n");
  job.employmentType = employment(str(cats.commitment));
  job.postedAt = ms(d.createdAt);
  job.applyUrl = str(d.applyUrl) || str(d.hostedUrl) || null;
  job.remote = str(d.workplaceType) === "remote" || null;
  const sal = obj(d.salaryRange);
  if (num(sal.min) !== null || num(sal.max) !== null) {
    const interval = str(sal.interval).toLowerCase();
    const period: SalaryPeriod | null = interval.includes("hour") ? "hour" : interval.includes("month") ? "month" : interval.includes("year") ? "year" : null;
    job.salary = { min: num(sal.min), max: num(sal.max), currency: str(sal.currency) || null, period };
  }
  return job;
}

async function lever(ref: Extract<AtsRef, { kind: "lever" }>, f: FetchLike): Promise<CapturedJob> {
  const host = ref.eu ? "api.eu.lever.co" : "api.lever.co";
  const d = obj(await getJson(f, `https://${host}/v0/postings/${encodeURIComponent(ref.site)}/${ref.id}?mode=json`));
  return mapLeverPosting(d, ref.site);
}

/** One posting from an Ashby job-board response. */
export function mapAshbyPosting(posting: Json, org: string): CapturedJob {
  const job = emptyCapturedJob("ats_api");
  job.title = str(posting.title);
  job.company = slugName(org);
  const secondary = Array.isArray(posting.secondaryLocations) ? posting.secondaryLocations.map((l) => str(obj(l).location)) : [];
  job.location = [str(posting.location), ...secondary].filter(Boolean).slice(0, 4).join(" / ");
  job.description = str(posting.descriptionPlain) || htmlToText(str(posting.descriptionHtml));
  job.employmentType = employment(str(posting.employmentType));
  job.postedAt = ms(posting.publishedAt);
  job.applyUrl = str(posting.applyUrl) || str(posting.jobUrl) || null;
  job.remote = posting.isRemote === true || str(posting.workplaceType).toLowerCase() === "remote" || null;
  const tiers = Array.isArray(obj(posting.compensation).compensationTiers) ? (obj(posting.compensation).compensationTiers as unknown[]) : [];
  const salary = tiers
    .flatMap((t) => (Array.isArray(obj(t).components) ? (obj(t).components as unknown[]) : []))
    .map(obj)
    .find((c) => str(c.compensationType) === "Salary");
  if (salary) {
    const interval = str(salary.interval).toUpperCase();
    job.salary = {
      min: num(salary.minValue),
      max: num(salary.maxValue),
      currency: str(salary.currencyCode) || null,
      period: interval.includes("HOUR") ? "hour" : interval.includes("MONTH") ? "month" : "year",
    };
  }
  return job;
}

async function ashby(ref: Extract<AtsRef, { kind: "ashby" }>, f: FetchLike): Promise<CapturedJob | null> {
  const d = obj(await getJson(f, `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(ref.org)}?includeCompensation=true`));
  const posting = (Array.isArray(d.jobs) ? d.jobs : []).map(obj).find((j) => str(j.id).toLowerCase() === ref.id.toLowerCase());
  return posting ? mapAshbyPosting(posting, ref.org) : null;
}

async function smartrecruiters(ref: Extract<AtsRef, { kind: "smartrecruiters" }>, f: FetchLike): Promise<CapturedJob> {
  const d = obj(await getJson(f, `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(ref.company)}/postings/${ref.id}`));
  const loc = obj(d.location);
  const sections = obj(obj(d.jobAd).sections);
  const job = emptyCapturedJob("ats_api");
  job.title = str(d.name);
  job.company = str(obj(d.company).name) || slugName(ref.company);
  job.location = [str(loc.fullLocation) || [str(loc.city), str(loc.country).toUpperCase()].filter(Boolean).join(", "), loc.remote === true ? "Remote" : ""]
    .filter(Boolean)
    .join(" · ");
  job.description = ["jobDescription", "qualifications", "additionalInformation"]
    .map((k) => obj(sections[k]))
    .filter((s) => str(s.text))
    .map((s) => `## ${str(s.title)}\n${htmlToText(str(s.text))}`)
    .join("\n\n");
  job.employmentType = employment(str(obj(d.typeOfEmployment).label));
  job.postedAt = ms(d.releasedDate);
  job.applyUrl = str(d.applyUrl) || str(d.postingUrl) || null;
  job.remote = loc.remote === true || null;
  return job;
}

async function workday(ref: Extract<AtsRef, { kind: "workday" }>, f: FetchLike): Promise<CapturedJob> {
  const d = obj(await getJson(f, `${ref.origin}/wday/cxs/${encodeURIComponent(ref.tenant)}/${encodeURIComponent(ref.site)}${ref.path}`));
  const info = obj(d.jobPostingInfo);
  const job = emptyCapturedJob("ats_api");
  job.title = str(info.title);
  job.company = str(obj(d.hiringOrganization).name) || slugName(ref.tenant);
  job.location = [str(info.location), ...(Array.isArray(info.additionalLocations) ? info.additionalLocations.map(str) : [])]
    .filter(Boolean)
    .slice(0, 4)
    .join(" / ");
  job.description = htmlToText(str(info.jobDescription));
  job.employmentType = employment(str(info.timeType));
  job.postedAt = ms(info.startDate);
  job.expiresAt = ms(info.endDate);
  job.applyUrl = str(info.externalUrl) || null;
  job.remote = /\bremote\b/i.test(job.location) || str(info.remoteType).toLowerCase().includes("remote") || null;
  return job;
}

/**
 * Fetch one posting from its ATS. Null when the ATS has no usable public API for
 * this reference (e.g. Greenhouse embeds without a board token) or the posting
 * is gone; network/HTTP errors are thrown.
 */
export async function fetchAtsJob(ref: AtsRef, fetchImpl: FetchLike): Promise<CapturedJob | null> {
  let job: CapturedJob | null;
  switch (ref.kind) {
    case "greenhouse":
      job = await greenhouse(ref, fetchImpl);
      break;
    case "lever":
      job = await lever(ref, fetchImpl);
      break;
    case "ashby":
      job = await ashby(ref, fetchImpl);
      break;
    case "smartrecruiters":
      job = await smartrecruiters(ref, fetchImpl);
      break;
    case "workday":
      job = await workday(ref, fetchImpl);
      break;
  }
  return job && (job.title || job.description) ? job : null;
}

/** Hosts {@link fetchAtsJob} calls — mirrored in the Rust proxy allowlist. */
export const ATS_API_HOSTS = [
  "boards-api.greenhouse.io",
  "api.lever.co",
  "api.eu.lever.co",
  "api.ashbyhq.com",
  "api.smartrecruiters.com",
  "myworkdayjobs.com",
] as const;
