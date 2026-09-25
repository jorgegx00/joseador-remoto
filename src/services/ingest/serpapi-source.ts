/**
 * SerpApi Google Jobs adapter (https://serpapi.com/google-jobs-api), ported
 * from the retired Jobs Service (server/src/ingest/serpapi-source.ts).
 *  - engine=google_jobs, ltype=1 (remote only), gl=us / hl=en. Calibrated
 *    2026-06-12: Google Jobs has NO index for the DR locale — gl=do/hl=es and
 *    location="Dominican Republic" both return "Google hasn't returned any
 *    results" for every query, while gl=us/hl=en returns the remote postings
 *    we want. DR eligibility is recorded by the dr-filter as a flag.
 *  - each page = 1 paid search (≤10 jobs) → the injected budget hook runs
 *    BEFORE every request
 *  - next_page_token resume state is persisted per query so an aborted run
 *    (budget cap, crash) continues where it left off instead of re-buying pages
 *  - NEW vs the server version: a rotation cursor. The default query list is
 *    larger than the daily cap, so each run starts where the previous one
 *    stopped — successive runs sweep the full list round-robin instead of
 *    starving the tail queries.
 */

import type { CursorStore, JobSourceAdapter, Logger, RawSourceJob } from "./types";

interface SerpApiApplyOption {
  title?: string;
  link?: string;
}

export interface SerpApiJobResult {
  job_id?: string;
  title?: string;
  company_name?: string;
  location?: string;
  via?: string;
  description?: string;
  share_link?: string;
  apply_options?: SerpApiApplyOption[];
  detected_extensions?: {
    posted_at?: string;
    schedule_type?: string;
    work_from_home?: boolean;
    salary?: string;
  };
  extensions?: string[];
}

interface SerpApiResponse {
  error?: string;
  jobs_results?: SerpApiJobResult[];
  serpapi_pagination?: { next_page_token?: string };
}

export interface SerpApiSourceOptions {
  apiKey: string;
  queries: string[];
  maxPagesPerQuery: number;
  cursors: CursorStore;
  /** Throws BudgetExceededError when the paid budget is exhausted. */
  consumeBudget: () => Promise<unknown>;
  log: Logger;
  fetchImpl?: typeof fetch;
  /** Location bias. */
  gl?: string;
  hl?: string;
}

const BASE_URL = "https://serpapi.com/search.json";
const ROTATION_KEY = "serpapi:__rotation__";

/** Parse Google's relative "posted at" strings ("3 days ago", "2 hours ago"). */
export function parseRelativePostedAt(text: string | undefined, now: number = Date.now()): number | undefined {
  if (!text) return undefined;
  const m = /(\d+)\s+(minute|hour|day|week|month)s?\s+ago/i.exec(text.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  const unit = m[2]?.toLowerCase();
  const ms =
    unit === "minute" ? 60_000
    : unit === "hour" ? 3_600_000
    : unit === "day" ? 86_400_000
    : unit === "week" ? 7 * 86_400_000
    : unit === "month" ? 30 * 86_400_000
    : undefined;
  if (ms === undefined) return undefined;
  return now - n * ms;
}

/**
 * Pick the best apply link: prefer LinkedIn, then any non-Google direct link,
 * then the share link.
 */
export function pickApplyUrl(job: SerpApiJobResult): string {
  const options = job.apply_options ?? [];
  const withLinks = options.filter((o): o is Required<SerpApiApplyOption> => Boolean(o.link));

  const linkedin = withLinks.find((o) => o.link.includes("linkedin.com"));
  if (linkedin) return linkedin.link;

  const direct = withLinks.find((o) => {
    try {
      const host = new URL(o.link).hostname;
      return !host.endsWith("google.com");
    } catch {
      return false;
    }
  });
  if (direct) return direct.link;

  return withLinks[0]?.link ?? job.share_link ?? "";
}

/** Strip the api_key query param before a URL ever reaches a log line. */
function redactUrl(url: URL): string {
  const clone = new URL(url.toString());
  clone.searchParams.set("api_key", "[redacted]");
  return clone.toString();
}

export class SerpApiSource implements JobSourceAdapter {
  readonly name = "serpapi";
  private readonly opts: SerpApiSourceOptions;

  constructor(opts: SerpApiSourceOptions) {
    this.opts = opts;
  }

  async *fetch(): AsyncGenerator<RawSourceJob> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;

    // Start the sweep at the query the previous run stopped on. A budget
    // throw mid-query leaves the pointer (and that query's page cursor)
    // intact, so the next run resumes the exact same page.
    const rotation = await this.opts.cursors.get(ROTATION_KEY);
    const nextQuery = typeof rotation?.next_query === "string" ? rotation.next_query : undefined;
    const startIdx = nextQuery ? Math.max(0, this.opts.queries.indexOf(nextQuery)) : 0;
    const ordered = [...this.opts.queries.slice(startIdx), ...this.opts.queries.slice(0, startIdx)];

    for (let i = 0; i < ordered.length; i++) {
      const query = ordered[i];
      const cursorKey = `serpapi:${query}`;
      const saved = await this.opts.cursors.get(cursorKey);
      let nextPageToken =
        typeof saved?.next_page_token === "string" ? saved.next_page_token : undefined;

      for (let page = 0; page < this.opts.maxPagesPerQuery; page++) {
        // Budget gate BEFORE the paid request. On exhaustion the saved cursor
        // lets the next run resume this exact page.
        await this.opts.consumeBudget();

        const url = new URL(BASE_URL);
        url.searchParams.set("engine", "google_jobs");
        url.searchParams.set("q", query);
        url.searchParams.set("api_key", this.opts.apiKey);
        url.searchParams.set("ltype", "1"); // remote only
        url.searchParams.set("gl", this.opts.gl ?? "us");
        url.searchParams.set("hl", this.opts.hl ?? "en");
        if (nextPageToken) url.searchParams.set("next_page_token", nextPageToken);

        this.opts.log.info({ query, page, url: redactUrl(url) }, "serpapi: fetching page");

        let data: SerpApiResponse;
        try {
          const res = await fetchImpl(url.toString(), { headers: { Accept: "application/json" } });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status} ${res.statusText}`);
          }
          data = (await res.json()) as SerpApiResponse;
        } catch (err) {
          // Keep the cursor so the next run retries this page, then move on to
          // the next query rather than failing the whole run.
          this.opts.log.error({ query, page, err }, "serpapi: page fetch failed");
          break;
        }

        if (data.error) {
          // "...hasn't returned any results" is SerpApi's empty-result marker.
          this.opts.log.info({ query, serpapiError: data.error }, "serpapi: no results / api error");
          await this.opts.cursors.clear(cursorKey);
          nextPageToken = undefined;
          break;
        }

        for (const job of data.jobs_results ?? []) {
          yield {
            upstream_id: job.job_id ?? "",
            title: job.title ?? "",
            company_name: job.company_name ?? "",
            location: job.location ?? (job.detected_extensions?.work_from_home ? "Remote" : ""),
            description: job.description ?? "",
            apply_url: pickApplyUrl(job),
            source_url: job.share_link,
            employment_type: job.detected_extensions?.schedule_type,
            posted_at: parseRelativePostedAt(job.detected_extensions?.posted_at),
            work_from_home: job.detected_extensions?.work_from_home,
            raw_payload: JSON.stringify(job),
          };
        }

        nextPageToken = data.serpapi_pagination?.next_page_token;
        if (nextPageToken) {
          await this.opts.cursors.set(cursorKey, { next_page_token: nextPageToken });
        } else {
          await this.opts.cursors.clear(cursorKey);
          break; // no more pages for this query
        }
      }

      // This query's window is done (pages exhausted, cap hit, or error-skip):
      // point the next run at the following query.
      await this.opts.cursors.set(ROTATION_KEY, {
        next_query: ordered[(i + 1) % ordered.length],
      });
    }
  }
}
