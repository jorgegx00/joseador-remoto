/**
 * Legitimate job feeds: each API below is published by its owner for exactly
 * this use, with terms we follow — credit + direct link back to the source
 * (shown on every job from it, see ATTRIBUTION in ./sources.ts), modest request
 * rates (budget-capped), no reselling. Keyless ones work out of the box; Jooble
 * and Adzuna need the user's own free key.
 *
 * Every adapter yields RawSourceJob; eligibility for the user's markets is
 * stamped later on save, so feeds may over-fetch a little.
 */

import { htmlToText } from "@/lib/job-capture/html-text";
import { mapAshbyPosting, mapGreenhousePosting, mapLeverPosting } from "@/lib/job-capture/ats-api";
import type { CapturedJob } from "@/lib/job-capture/types";
import { analyzeUrl } from "@/lib/job-capture/canonical";
import type { JobSourceAdapter, Logger, RawSourceJob } from "./types";

export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

export interface FeedOptions {
  fetchImpl: FetchImpl;
  log: Logger;
  /** Called before every request; throws BudgetExceededError at the cap. */
  consumeBudget: () => Promise<unknown>;
  /** Search terms (the user's ingest queries). */
  queries: string[];
  /** Target markets (ISO countries and region codes). */
  markets: string[];
  residenceCountry: string;
  /** Requests per run (queries × pages). */
  maxRequests: number;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const num = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : Number.parseFloat(str(v));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const ms = (v: unknown): number | undefined => {
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v; // seconds or ms
  const t = Date.parse(str(v));
  return Number.isFinite(t) ? t : undefined;
};

/** Salary to annual figures (the Job convention). */
function annual(value: number | undefined, period: string): number | undefined {
  if (value === undefined) return undefined;
  const p = period.toLowerCase();
  if (p.startsWith("hour")) return Math.round(value * 2080);
  if (p.startsWith("day")) return Math.round(value * 260);
  if (p.startsWith("week")) return Math.round(value * 52);
  if (p.startsWith("month")) return Math.round(value * 12);
  return Math.round(value);
}

async function getJson(opts: FeedOptions, url: string, init?: RequestInit): Promise<unknown> {
  await opts.consumeBudget();
  const res = await opts.fetchImpl(url, { ...init, headers: { Accept: "application/json", ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Rotate queries so successive runs cover different terms within the request cap. */
function rotated(queries: string[], max: number, seed = Math.floor(Date.now() / 86_400_000)): string[] {
  if (queries.length <= max) return queries;
  const start = seed % queries.length;
  return [...queries.slice(start), ...queries.slice(0, start)].slice(0, max);
}

const raw = (fields: Omit<RawSourceJob, "raw_payload">, payload: unknown): RawSourceJob => ({
  ...fields,
  raw_payload: JSON.stringify(payload).slice(0, 20_000),
});

// ---------------------------------------------------------------------------
// Himalayas — remote jobs, filterable by applicant country. Credit + link required.
// https://himalayas.app/docs/remote-jobs-api
// ---------------------------------------------------------------------------
export class HimalayasSource implements JobSourceAdapter {
  readonly name = "himalayas";
  private readonly opts: FeedOptions;
  constructor(opts: FeedOptions) {
    this.opts = opts;
  }

  async *fetch(): AsyncGenerator<RawSourceJob> {
    const country = this.opts.residenceCountry;
    for (const q of rotated(this.opts.queries, this.opts.maxRequests)) {
      const url = `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q)}&country=${encodeURIComponent(country)}`;
      let data: Json;
      try {
        data = obj(await getJson(this.opts, url));
      } catch (err) {
        if ((err as Error).name === "BudgetExceededError") throw err;
        this.opts.log.warn({ q, err: String(err) }, "himalayas: request failed");
        continue;
      }
      for (const j of arr(data.jobs).map(obj)) {
        const restrictions = arr(j.locationRestrictions).map(str).filter(Boolean);
        const period = str(j.salaryPeriod);
        yield raw(
          {
            upstream_id: str(j.guid),
            title: str(j.title),
            company_name: str(j.companyName),
            location: restrictions.length > 0 ? `Remote (${restrictions.slice(0, 8).join(", ")})` : "Remote, worldwide",
            description: htmlToText(str(j.description)) || str(j.excerpt),
            apply_url: str(j.applicationLink) || str(j.guid),
            source_url: str(j.guid),
            salary_min: annual(num(j.minSalary), period),
            salary_max: annual(num(j.maxSalary), period),
            salary_currency: str(j.currency) || undefined,
            employment_type: str(j.employmentType),
            posted_at: ms(j.pubDate),
            work_from_home: true,
          },
          j,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Jobicy — remote jobs by region/country. Credit + direct link to the job URL.
// https://github.com/Jobicy/remote-jobs-api
// ---------------------------------------------------------------------------
const JOBICY_GEO: Record<string, string> = {
  LATAM: "latam", EU: "europe", EUROPE: "europe", EMEA: "emea", APAC: "apac", NA: "usa",
  US: "usa", CA: "canada", GB: "uk", MX: "mexico", BR: "brazil", AR: "argentina", CO: "colombia",
  CL: "chile", ES: "spain", DE: "germany",
};

export class JobicySource implements JobSourceAdapter {
  readonly name = "jobicy";
  private readonly opts: FeedOptions;
  constructor(opts: FeedOptions) {
    this.opts = opts;
  }

  async *fetch(): AsyncGenerator<RawSourceJob> {
    const geos = [...new Set(this.opts.markets.map((m) => JOBICY_GEO[m]).filter(Boolean))];
    if (this.opts.markets.includes("WORLDWIDE") || geos.length === 0) geos.push("anywhere");
    for (const geo of geos.slice(0, this.opts.maxRequests)) {
      const url = `https://jobicy.com/api/v2/remote-jobs?count=50&industry=dev&geo=${geo}`;
      let data: Json;
      try {
        data = obj(await getJson(this.opts, url));
      } catch (err) {
        if ((err as Error).name === "BudgetExceededError") throw err;
        this.opts.log.warn({ geo, err: String(err) }, "jobicy: request failed");
        continue;
      }
      for (const j of arr(data.jobs).map(obj)) {
        const geoLabel = str(j.jobGeo);
        yield raw(
          {
            upstream_id: str(j.id),
            title: htmlToText(str(j.jobTitle)),
            company_name: str(j.companyName),
            location: geoLabel && !/^anywhere$/i.test(geoLabel) ? `Remote (${geoLabel})` : "Remote, anywhere in the world",
            description: htmlToText(str(j.jobDescription)) || str(j.jobExcerpt),
            apply_url: str(j.url),
            source_url: str(j.url),
            salary_min: annual(num(j.annualSalaryMin) ?? num(j.salaryMin), str(j.salaryPeriod) || "year"),
            salary_max: annual(num(j.annualSalaryMax) ?? num(j.salaryMax), str(j.salaryPeriod) || "year"),
            salary_currency: str(j.salaryCurrency) || undefined,
            employment_type: str(arr(j.jobType)[0] ?? j.jobType),
            posted_at: ms(j.pubDate),
            work_from_home: true,
          },
          j,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Remotive — remote tech jobs. At most ~4 fetches a day (budget), credit + link.
// https://github.com/remotive-com/remote-jobs-api
// ---------------------------------------------------------------------------
export class RemotiveSource implements JobSourceAdapter {
  readonly name = "remotive";
  private readonly opts: FeedOptions;
  constructor(opts: FeedOptions) {
    this.opts = opts;
  }

  async *fetch(): AsyncGenerator<RawSourceJob> {
    let data: Json;
    try {
      data = obj(await getJson(this.opts, "https://remotive.com/api/remote-jobs?category=software-dev&limit=150"));
    } catch (err) {
      if ((err as Error).name === "BudgetExceededError") throw err;
      this.opts.log.warn({ err: String(err) }, "remotive: request failed");
      return;
    }
    for (const j of arr(data.jobs).map(obj)) {
      const where = str(j.candidate_required_location);
      yield raw(
        {
          upstream_id: str(j.id),
          title: str(j.title),
          company_name: str(j.company_name),
          location: where && !/^worldwide$/i.test(where) ? `Remote (${where})` : "Remote, worldwide",
          description: htmlToText(str(j.description)),
          apply_url: str(j.url),
          source_url: str(j.url),
          employment_type: str(j.job_type).replace("_", " "),
          posted_at: ms(j.publication_date),
          work_from_home: true,
        },
        j,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Get on Board — tech jobs in Latin America and Spain (remote and on-site).
// https://www.getonbrd.com/api-doc.html
// ---------------------------------------------------------------------------
export class GetOnBoardSource implements JobSourceAdapter {
  readonly name = "getonboard";
  private readonly opts: FeedOptions;
  constructor(opts: FeedOptions) {
    this.opts = opts;
  }

  async *fetch(): AsyncGenerator<RawSourceJob> {
    for (const q of rotated(this.opts.queries, this.opts.maxRequests)) {
      const url = `https://www.getonbrd.com/api/v0/search/jobs?query=${encodeURIComponent(q)}&per_page=50&expand=%5B%22company%22%5D`;
      let data: Json;
      try {
        data = obj(await getJson(this.opts, url));
      } catch (err) {
        if ((err as Error).name === "BudgetExceededError") throw err;
        this.opts.log.warn({ q, err: String(err) }, "getonboard: request failed");
        continue;
      }
      for (const item of arr(data.data).map(obj)) {
        const a = obj(item.attributes);
        const company = obj(obj(obj(a.company).data).attributes);
        const countries = arr(a.countries).map(str).filter((c) => c && !/^remote$/i.test(c));
        const modality = str(a.remote_modality);
        const remote = a.remote === true || modality === "fully_remote" || modality === "remote_local";
        const where = countries.slice(0, 6).join(", ");
        const location = remote ? (where ? `Remote (${where})` : "Remote") : [where, modality === "hybrid" ? "Hybrid" : "On-site"].filter(Boolean).join(" · ");
        const sections = [a.description, a.functions, a.desirable, a.benefits].map((s) => htmlToText(str(s))).filter(Boolean);
        const url = str(obj(item.links).public_url);
        yield raw(
          {
            upstream_id: str(item.id),
            title: str(a.title),
            company_name: str(company.name),
            location,
            description: sections.join("\n\n"),
            apply_url: url,
            source_url: url,
            salary_min: annual(num(a.min_salary), "month"),
            salary_max: annual(num(a.max_salary), "month"),
            salary_currency: num(a.min_salary) || num(a.max_salary) ? "USD" : undefined,
            posted_at: ms(a.published_at),
            work_from_home: remote,
          },
          item,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Jooble — aggregator with 60+ country sites, including the DR (user's own key).
// https://jooble.org/api/about
// ---------------------------------------------------------------------------
export class JoobleSource implements JobSourceAdapter {
  readonly name = "jooble";
  private readonly opts: FeedOptions & { apiKey: string; locations: string[] };
  constructor(opts: FeedOptions & { apiKey: string; locations: string[] }) {
    this.opts = opts;
  }

  async *fetch(): AsyncGenerator<RawSourceJob> {
    const pairs = this.opts.locations.flatMap((location) => this.opts.queries.map((q) => ({ q, location })));
    for (const { q, location } of rotated(pairs.map((p) => JSON.stringify(p)), this.opts.maxRequests).map((s) => JSON.parse(s) as { q: string; location: string })) {
      let data: Json;
      try {
        data = obj(
          await getJson(this.opts, `https://jooble.org/api/${encodeURIComponent(this.opts.apiKey)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keywords: q, location, page: "1" }),
          }),
        );
      } catch (err) {
        if ((err as Error).name === "BudgetExceededError") throw err;
        this.opts.log.warn({ q, location, err: String(err) }, "jooble: request failed");
        continue;
      }
      for (const j of arr(data.jobs).map(obj)) {
        yield raw(
          {
            upstream_id: str(j.id),
            title: str(j.title),
            company_name: str(j.company),
            location: str(j.location) || location,
            description: htmlToText(str(j.snippet)),
            apply_url: str(j.link),
            source_url: str(j.link),
            employment_type: str(j.type),
            posted_at: ms(j.updated),
          },
          j,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Adzuna — official API in ~19 countries (user's own app id + key). "Jobs by Adzuna" credit.
// https://developer.adzuna.com/
// ---------------------------------------------------------------------------
export const ADZUNA_COUNTRIES = ["gb", "us", "ca", "au", "de", "fr", "es", "it", "nl", "at", "be", "br", "mx", "in", "nz", "pl", "sg", "za", "ch"];
/** Adzuna reports salaries in the local currency of each country site. */
const ADZUNA_CURRENCY: Record<string, string> = {
  gb: "GBP", us: "USD", ca: "CAD", au: "AUD", de: "EUR", fr: "EUR", es: "EUR", it: "EUR", nl: "EUR", at: "EUR",
  be: "EUR", br: "BRL", mx: "MXN", in: "INR", nz: "NZD", pl: "PLN", sg: "SGD", za: "ZAR", ch: "CHF",
};

export class AdzunaSource implements JobSourceAdapter {
  readonly name = "adzuna";
  private readonly opts: FeedOptions & { appId: string; appKey: string };
  constructor(opts: FeedOptions & { appId: string; appKey: string }) {
    this.opts = opts;
  }

  async *fetch(): AsyncGenerator<RawSourceJob> {
    const countries = this.opts.markets.map((m) => m.toLowerCase()).filter((c) => ADZUNA_COUNTRIES.includes(c));
    const pairs = countries.flatMap((country) => this.opts.queries.map((q) => `${country}|${q}`));
    for (const pair of rotated(pairs, this.opts.maxRequests)) {
      const [country, q] = pair.split("|");
      const url =
        `https://api.adzuna.com/v1/api/jobs/${country}/search/1?results_per_page=50&content-type=application/json` +
        `&app_id=${encodeURIComponent(this.opts.appId)}&app_key=${encodeURIComponent(this.opts.appKey)}&what=${encodeURIComponent(q)}`;
      let data: Json;
      try {
        data = obj(await getJson(this.opts, url));
      } catch (err) {
        if ((err as Error).name === "BudgetExceededError") throw err;
        this.opts.log.warn({ country, q, err: String(err) }, "adzuna: request failed");
        continue;
      }
      for (const j of arr(data.results).map(obj)) {
        const loc = obj(j.location);
        yield raw(
          {
            upstream_id: str(j.id),
            title: htmlToText(str(j.title)),
            company_name: str(obj(j.company).display_name),
            location: str(loc.display_name) || country.toUpperCase(),
            description: htmlToText(str(j.description)),
            apply_url: str(j.redirect_url),
            source_url: str(j.redirect_url),
            salary_min: num(j.salary_min),
            salary_max: num(j.salary_max),
            salary_currency: num(j.salary_min) || num(j.salary_max) ? ADZUNA_CURRENCY[country] : undefined,
            employment_type: str(j.contract_time),
            posted_at: ms(j.created),
          },
          j,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Company boards the user follows (Greenhouse, Lever, Ashby list APIs).
// ---------------------------------------------------------------------------
export class AtsBoardsSource implements JobSourceAdapter {
  readonly name = "ats-boards";
  private readonly opts: FeedOptions & { boards: string[] };
  constructor(opts: FeedOptions & { boards: string[] }) {
    this.opts = opts;
  }

  async *fetch(): AsyncGenerator<RawSourceJob> {
    // One request per board (each list API returns full postings), rotating
    // through the list when the user follows more boards than one run fetches.
    for (const boardUrl of rotated(this.opts.boards, this.opts.maxRequests)) {
      const board = parseBoard(boardUrl);
      if (!board) {
        this.opts.log.warn({ boardUrl }, "ats-boards: unrecognized board URL");
        continue;
      }
      let postings: Array<{ url: string; job: CapturedJob }>;
      try {
        postings = await listBoard(board, this.opts);
      } catch (err) {
        if ((err as Error).name === "BudgetExceededError") throw err;
        this.opts.log.warn({ boardUrl, err: String(err) }, "ats-boards: list failed");
        continue;
      }
      for (const { url, job } of postings) {
        const info = analyzeUrl(url);
        yield raw(
          {
            upstream_id: info.canonicalKey ?? url,
            canonical_key: info.canonicalKey ?? undefined,
            title: job.title,
            company_name: job.company,
            location: job.location,
            description: job.description,
            apply_url: job.applyUrl ?? url,
            source_url: info.canonicalUrl,
            salary_min: job.salary ? annual(job.salary.min ?? undefined, job.salary.period ?? "year") : undefined,
            salary_max: job.salary ? annual(job.salary.max ?? undefined, job.salary.period ?? "year") : undefined,
            salary_currency: job.salary?.currency ?? undefined,
            employment_type: job.employmentType?.replace("_", " "),
            posted_at: job.postedAt ?? undefined,
            work_from_home: job.remote ?? undefined,
          },
          { board: boardUrl, url },
        );
      }
    }
  }
}

type Board = { kind: "greenhouse" | "lever" | "ashby"; slug: string; eu?: boolean };

/** "https://job-boards.greenhouse.io/acme", "jobs.lever.co/acme", "jobs.ashbyhq.com/acme" → board. */
export function parseBoard(input: string): Board | null {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  } catch {
    return null;
  }
  const slug = u.searchParams.get("for") ?? u.pathname.split("/").filter(Boolean)[0] ?? "";
  if (!/^[\w.-]+$/.test(slug)) return null;
  if (u.hostname.endsWith("greenhouse.io")) return { kind: "greenhouse", slug };
  if (u.hostname.endsWith("lever.co")) return { kind: "lever", slug, eu: u.hostname.includes(".eu.") };
  if (u.hostname.endsWith("ashbyhq.com")) return { kind: "ashby", slug };
  return null;
}

async function listBoard(board: Board, opts: FeedOptions): Promise<Array<{ url: string; job: CapturedJob }>> {
  if (board.kind === "greenhouse") {
    const d = obj(await getJson(opts, `https://boards-api.greenhouse.io/v1/boards/${board.slug}/jobs?content=true`));
    return arr(d.jobs)
      .map(obj)
      .map((j) => ({ url: `https://job-boards.greenhouse.io/${board.slug}/jobs/${str(j.id)}`, job: mapGreenhousePosting(j, board.slug) }));
  }
  if (board.kind === "lever") {
    const d = arr(await getJson(opts, `https://api${board.eu ? ".eu" : ""}.lever.co/v0/postings/${board.slug}?mode=json`));
    return d.map(obj).map((j) => ({ url: str(j.hostedUrl), job: mapLeverPosting(j, board.slug) }));
  }
  const d = obj(await getJson(opts, `https://api.ashbyhq.com/posting-api/job-board/${board.slug}?includeCompensation=true`));
  return arr(d.jobs)
    .map(obj)
    .map((j) => ({ url: str(j.jobUrl), job: mapAshbyPosting(j, board.slug) }));
}
