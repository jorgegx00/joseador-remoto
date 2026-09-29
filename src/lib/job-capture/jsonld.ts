/**
 * schema.org JobPosting (JSON-LD) → {@link CapturedJob}. Most career sites embed
 * it on job pages because Google for Jobs requires it, so it is the best
 * extraction path after an ATS API.
 * https://developers.google.com/search/docs/appearance/structured-data/job-posting
 */

import { resolveCountry } from "@/lib/markets/countries";
import type { EmploymentType, SalaryPeriod } from "@/types";
import { htmlToText } from "./html-text";
import { emptyCapturedJob, type CapturedJob } from "./types";

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function hasType(node: Json, type: string): boolean {
  const t = node["@type"];
  return t === type || (Array.isArray(t) && t.includes(type));
}

/** Every JobPosting node in the blocks, looking through arrays and @graph wrappers. */
export function findJobPostings(blocks: string[]): Json[] {
  const found: Json[] = [];
  const visit = (node: unknown, depth: number) => {
    if (depth > 6) return;
    if (Array.isArray(node)) {
      node.forEach((n) => visit(n, depth + 1));
    } else if (isObject(node)) {
      if (hasType(node, "JobPosting")) found.push(node);
      if (node["@graph"]) visit(node["@graph"], depth + 1);
    }
  };
  for (const raw of blocks) {
    try {
      // Some sites leave raw newlines / control chars inside strings.
      visit(JSON.parse(raw.replace(/[\u0000-\u001f]+/g, " ")), 0);
    } catch {
      // A broken block is skipped; others may still parse.
    }
  }
  return found;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const first = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);

function dateMs(v: unknown): number | null {
  const s = str(v);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function nameOf(v: unknown): string {
  const n = first(v);
  return isObject(n) ? str(n.name) : str(n);
}

function addressText(place: unknown): string {
  const p = isObject(place) ? place : {};
  const addr = isObject(p.address) ? p.address : null;
  if (!addr) return str(p.name);
  const country = isObject(addr.addressCountry) ? str(addr.addressCountry.name) : str(addr.addressCountry);
  return [str(addr.addressLocality), str(addr.addressRegion), country].filter(Boolean).join(", ");
}

const EMPLOYMENT: Record<string, EmploymentType> = {
  FULL_TIME: "full_time",
  PART_TIME: "part_time",
  CONTRACTOR: "contract",
  TEMPORARY: "contract",
  INTERN: "contract",
};

const PERIOD: Record<string, SalaryPeriod> = { HOUR: "hour", DAY: "day", WEEK: "week", MONTH: "month", YEAR: "year" };

function salaryOf(base: unknown): CapturedJob["salary"] {
  const b = first(base);
  if (!isObject(b)) return null;
  const value = isObject(b.value) ? b.value : null;
  const num = (v: unknown) => {
    const n = typeof v === "number" ? v : Number.parseFloat(str(v).replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const single = value ? num(value.value) : num(b.value);
  const min = value ? num(value.minValue) ?? single : single;
  const max = value ? num(value.maxValue) ?? single : single;
  if (min === null && max === null) return null;
  const unit = str(value?.unitText ?? b.unitText).toUpperCase();
  return { min, max, currency: str(b.currency).toUpperCase() || null, period: PERIOD[unit] ?? null };
}

/** The best JobPosting in the blocks as a CapturedJob, or null when there is none. */
export function jobFromJsonLd(blocks: string[]): CapturedJob | null {
  const postings = findJobPostings(blocks);
  // Prefer the richest node (some pages also embed related-job stubs).
  const node = postings.sort((a, b) => str(b.description).length - str(a.description).length)[0];
  if (!node) return null;

  const job = emptyCapturedJob("json_ld");
  job.title = htmlToText(str(node.title));
  job.company = nameOf(node.hiringOrganization);
  job.description = htmlToText(str(node.description));
  job.postedAt = dateMs(node.datePosted);
  job.expiresAt = dateMs(node.validThrough);
  job.employmentType = EMPLOYMENT[str(first(node.employmentType)).toUpperCase()] ?? null;
  job.salary = salaryOf(node.baseSalary ?? node.estimatedSalary);
  job.applyUrl = str(node.url) || null;

  const locations = list(node.jobLocation).map(addressText).filter(Boolean);
  const remote = list(node.jobLocationType).some((t) => str(t).toUpperCase() === "TELECOMMUTE");
  job.remote = remote || null;
  job.applicantCountries = list(node.applicantLocationRequirements)
    .map((r) => resolveCountry(nameOf(r)))
    .filter((c): c is string => c !== null);
  const requirement = list(node.applicantLocationRequirements).map(nameOf).filter(Boolean);
  const remotePart = remote ? (requirement.length > 0 ? `Remote (${requirement.slice(0, 6).join(", ")})` : "Remote") : "";
  job.location = [remotePart, locations.slice(0, 3).join(" / ")].filter(Boolean).join(" · ");
  return job.title || job.description ? job : null;
}

/** The JSON-LD blocks of an HTML document (for pages fetched without a DOM). */
export function extractJsonLdBlocks(html: string): string[] {
  const blocks: string[] = [];
  const re = /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && blocks.length < 10) {
    const body = m[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, "");
    if (body) blocks.push(body.slice(0, 100_000));
  }
  return blocks;
}
