/**
 * Source-adapter unit tests — no DB, no network: in-memory cursor store and a
 * stubbed fetch. Ported from the retired server suite
 * (server/test/apify-linkedin.test.ts) plus new coverage for the SerpApi
 * query-rotation cursor.
 */

import { describe, expect, it } from "vitest";
import {
  ApifyLinkedInSource,
  mapApifyItem,
  toActorTimestamp,
  type ApifyLinkedInItem,
  type ApifyLinkedInSourceOptions,
} from "../../src/services/ingest/apify-linkedin-source";
import {
  SerpApiSource,
  type SerpApiSourceOptions,
} from "../../src/services/ingest/serpapi-source";
import { BudgetExceededError } from "../../src/services/ingest/budget";
import type { CursorStore, Logger, RawSourceJob } from "../../src/services/ingest/types";

const silentLog: Logger = { info: () => {}, warn: () => {}, error: () => {} };

function memCursors(): CursorStore & { data: Map<string, Record<string, unknown>> } {
  const data = new Map<string, Record<string, unknown>>();
  return {
    data,
    async get(key) {
      return data.get(key) ?? null;
    },
    async set(key, value) {
      data.set(key, value);
    },
    async clear(key) {
      data.delete(key);
    },
  };
}

async function collect(source: { fetch(): AsyncGenerator<RawSourceJob> }): Promise<RawSourceJob[]> {
  const out: RawSourceJob[] = [];
  for await (const job of source.fetch()) out.push(job);
  return out;
}

// ---------------------------------------------------------------------------
// Apify LinkedIn
// ---------------------------------------------------------------------------

interface RecordedCall {
  url: string;
  headers: Record<string, string>;
  input: Record<string, unknown>;
}

function stubApifyFetch(
  calls: RecordedCall[],
  respond: () => { ok: boolean; status?: number; body?: unknown },
): typeof fetch {
  return (async (url: unknown, init?: { body?: unknown; headers?: Record<string, string> }) => {
    calls.push({
      url: String(url),
      headers: init?.headers ?? {},
      input: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    });
    const r = respond();
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 201 : 500),
      statusText: r.ok ? "Created" : "Internal Server Error",
      json: async () => r.body,
    };
  }) as unknown as typeof fetch;
}

const SAMPLE_ITEM: ApifyLinkedInItem = {
  id: 4242,
  title: "Senior Backend Engineer",
  organization: "Globant",
  organization_url: "https://www.linkedin.com/company/globant",
  url: "https://www.linkedin.com/jobs/view/4242",
  external_apply_url: "https://jobs.example.com/apply/9",
  date_posted: "2026-06-10T12:00:00",
  locations_derived: ["Santo Domingo, Dominican Republic"],
  location_type: "TELECOMMUTE",
  description_text: "Build APIs. Open to candidates across LATAM.",
  employment_type: ["FULL_TIME"],
  ai_salary_currency: "USD",
  ai_salary_minvalue: 60000,
  ai_salary_maxvalue: 90000,
  ai_work_arrangement: "Remote Solely",
};

function makeApifySource(overrides: Partial<ApifyLinkedInSourceOptions>): ApifyLinkedInSource {
  return new ApifyLinkedInSource({
    token: "secret-token",
    titles: ["Backend Developer:*", "QA Engineer:*"],
    limit: 50,
    cursors: memCursors(),
    consumeBudget: async () => undefined,
    log: silentLog,
    ...overrides,
  });
}

describe("ApifyLinkedInSource", () => {
  it("makes one actor run with titles, remote filter, limit — budget consumed BEFORE the request", async () => {
    const events: string[] = [];
    const calls: RecordedCall[] = [];
    const source = makeApifySource({
      consumeBudget: async () => {
        events.push("budget");
        return undefined;
      },
      fetchImpl: ((url: unknown, init?: { body?: unknown }) => {
        events.push("fetch");
        return stubApifyFetch(calls, () => ({ ok: true, body: [] }))(url as string, init as never);
      }) as unknown as typeof fetch,
    });

    await collect(source);

    expect(events).toEqual(["budget", "fetch"]);
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    // Token travels in the Authorization header, never in the (logged) URL.
    expect(call.headers["Authorization"]).toBe("Bearer secret-token");
    expect(call.url).not.toContain("secret-token");
    expect(call.input.titleSearch).toEqual(["Backend Developer:*", "QA Engineer:*"]);
    expect(call.input.aiWorkArrangementFilter).toEqual(["Remote OK", "Remote Solely"]);
    expect(call.input.descriptionType).toBe("text");
    expect(call.input.limit).toBe(50);
    expect(call.input.datePostedAfter).toBeUndefined(); // first run: actor default window
  });

  it("maps dataset items to RawSourceJob", async () => {
    const calls: RecordedCall[] = [];
    const source = makeApifySource({
      fetchImpl: stubApifyFetch(calls, () => ({ ok: true, body: [SAMPLE_ITEM] })),
    });

    const jobs = await collect(source);
    expect(jobs).toHaveLength(1);
    const job = jobs[0]!;
    expect(job.upstream_id).toBe("4242");
    expect(job.title).toBe("Senior Backend Engineer");
    expect(job.company_name).toBe("Globant");
    expect(job.location).toBe("Santo Domingo, Dominican Republic");
    expect(job.apply_url).toBe("https://jobs.example.com/apply/9"); // external beats LinkedIn URL
    expect(job.source_url).toBe("https://www.linkedin.com/jobs/view/4242");
    expect(job.salary_min).toBe(60000);
    expect(job.salary_max).toBe(90000);
    expect(job.salary_currency).toBe("USD");
    expect(job.employment_type).toBe("full time"); // normalized for the employment-type map
    expect(job.posted_at).toBe(Date.parse("2026-06-10T12:00:00"));
    expect(job.work_from_home).toBe(true);
    expect(job.raw_payload).toBe(JSON.stringify(SAMPLE_ITEM));
  });

  it("an empty/renamed payload degrades to recoverable blanks, never a crash", () => {
    const job = mapApifyItem({});
    expect(job.title).toBe("");
    expect(job.company_name).toBe("");
    expect(job.description).toBe("");
    expect(job.work_from_home).toBeUndefined();
    expect(job.raw_payload).toBe("{}");
  });

  it("advances the cursor on success and replays it (minus 1h overlap) as datePostedAfter", async () => {
    const cursors = memCursors();
    const calls: RecordedCall[] = [];
    const fetchImpl = stubApifyFetch(calls, () => ({ ok: true, body: [] }));

    await collect(makeApifySource({ cursors, fetchImpl }));
    const saved = cursors.data.get("apify-linkedin");
    expect(typeof saved?.last_run_iso).toBe("string");

    await collect(makeApifySource({ cursors, fetchImpl }));
    const second = calls[1]!;
    const expected = toActorTimestamp(Date.parse(saved!.last_run_iso as string) - 3_600_000);
    expect(second.input.datePostedAfter).toBe(expected);
  });

  it("a failed run yields nothing and leaves the cursor untouched", async () => {
    const cursors = memCursors();
    const calls: RecordedCall[] = [];
    const source = makeApifySource({
      cursors,
      fetchImpl: stubApifyFetch(calls, () => ({ ok: false, status: 500 })),
    });

    const jobs = await collect(source);
    expect(jobs).toHaveLength(0);
    expect(cursors.data.size).toBe(0); // next run re-covers the window
  });

  it("BudgetExceededError propagates without touching the network", async () => {
    const calls: RecordedCall[] = [];
    const source = makeApifySource({
      consumeBudget: async () => {
        throw new BudgetExceededError("apify-linkedin", "daily", 5, 4);
      },
      fetchImpl: stubApifyFetch(calls, () => ({ ok: true, body: [] })),
    });

    await expect(collect(source)).rejects.toThrow(BudgetExceededError);
    expect(calls).toHaveLength(0);
  });

  it("never logs the token", async () => {
    const lines: string[] = [];
    const captureLog: Logger = {
      info: (data, msg) => lines.push(`${JSON.stringify(data)} ${msg}`),
      warn: (data, msg) => lines.push(`${JSON.stringify(data)} ${msg}`),
      error: (data, msg) => lines.push(`${JSON.stringify(data)} ${msg}`),
    };

    const calls: RecordedCall[] = [];
    await collect(
      makeApifySource({ log: captureLog, fetchImpl: stubApifyFetch(calls, () => ({ ok: true, body: [] })) }),
    );

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toContain("secret-token");
    }
  });
});

// ---------------------------------------------------------------------------
// SerpApi — pagination cursor + query rotation
// ---------------------------------------------------------------------------

function stubSerpFetch(
  queriesSeen: string[],
  respond: (query: string, pageToken: string | undefined) => {
    jobs?: Array<{ title: string }>;
    next_page_token?: string;
    error?: string;
  },
): typeof fetch {
  return (async (rawUrl: unknown) => {
    const url = new URL(String(rawUrl));
    const query = url.searchParams.get("q") ?? "";
    const token = url.searchParams.get("next_page_token") ?? undefined;
    queriesSeen.push(query);
    const r = respond(query, token);
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        error: r.error,
        jobs_results: (r.jobs ?? []).map((j) => ({
          job_id: `${query}-${j.title}`,
          title: j.title,
          company_name: "Acme",
          description: "desc",
        })),
        serpapi_pagination: r.next_page_token ? { next_page_token: r.next_page_token } : undefined,
      }),
    };
  }) as unknown as typeof fetch;
}

function makeSerpSource(overrides: Partial<SerpApiSourceOptions>): SerpApiSource {
  return new SerpApiSource({
    apiKey: "serp-secret",
    queries: ["alpha", "beta", "gamma"],
    maxPagesPerQuery: 2,
    cursors: memCursors(),
    consumeBudget: async () => undefined,
    log: silentLog,
    ...overrides,
  });
}

/** Budget hook that allows `n` calls, then throws like the real gate. */
function budgetAllowing(n: number): () => Promise<unknown> {
  let used = 0;
  return async () => {
    used++;
    if (used > n) throw new BudgetExceededError("serpapi", "daily", used, n);
    return undefined;
  };
}

describe("SerpApiSource rotation", () => {
  it("sweeps all queries in order and wraps the rotation pointer", async () => {
    const cursors = memCursors();
    const seen: string[] = [];
    const source = makeSerpSource({
      cursors,
      fetchImpl: stubSerpFetch(seen, () => ({ jobs: [{ title: "t" }] })),
    });

    const jobs = await collect(source);
    expect(seen).toEqual(["alpha", "beta", "gamma"]); // 1 page each (no tokens)
    expect(jobs).toHaveLength(3);
    expect(cursors.data.get("serpapi:__rotation__")).toEqual({ next_query: "alpha" });
  });

  it("budget exhaustion mid-sweep leaves the pointer on the unfinished query; next run resumes there", async () => {
    const cursors = memCursors();
    const seen: string[] = [];
    const fetchImpl = stubSerpFetch(seen, () => ({ jobs: [{ title: "t" }] }));

    // Run 1: budget allows 2 pages → alpha and beta complete, gamma never starts.
    await expect(
      collect(makeSerpSource({ cursors, fetchImpl, consumeBudget: budgetAllowing(2) })),
    ).rejects.toThrow(BudgetExceededError);
    expect(seen).toEqual(["alpha", "beta"]);
    expect(cursors.data.get("serpapi:__rotation__")).toEqual({ next_query: "gamma" });

    // Run 2 (fresh budget): the sweep starts at gamma.
    seen.length = 0;
    await collect(makeSerpSource({ cursors, fetchImpl }));
    expect(seen[0]).toBe("gamma");
    expect(seen).toEqual(["gamma", "alpha", "beta"]);
  });

  it("a removed query falls back to the start of the configured list", async () => {
    const cursors = memCursors();
    cursors.data.set("serpapi:__rotation__", { next_query: "deleted-query" });
    const seen: string[] = [];
    await collect(makeSerpSource({ cursors, fetchImpl: stubSerpFetch(seen, () => ({})) }));
    expect(seen[0]).toBe("alpha");
  });

  it("persists the page token mid-query and resumes the same page next run", async () => {
    const cursors = memCursors();
    const seen: string[] = [];
    // alpha has 3+ pages (token every time) but maxPagesPerQuery=2 caps the run.
    const fetchImpl = stubSerpFetch(seen, (query, token) =>
      query === "alpha"
        ? { jobs: [{ title: token ?? "p0" }], next_page_token: `${token ?? "t"}+` }
        : { jobs: [] },
    );

    await collect(makeSerpSource({ cursors, fetchImpl, queries: ["alpha"] }));
    // After 2 pages the token for page 3 is saved for the next run.
    expect(cursors.data.get("serpapi:alpha")).toEqual({ next_page_token: "t++" });
  });

  it("never logs the api key", async () => {
    const lines: string[] = [];
    const captureLog: Logger = {
      info: (data, msg) => lines.push(`${JSON.stringify(data)} ${msg}`),
      warn: (data, msg) => lines.push(`${JSON.stringify(data)} ${msg}`),
      error: (data, msg) => lines.push(`${JSON.stringify(data)} ${msg}`),
    };
    const seen: string[] = [];
    await collect(
      makeSerpSource({ log: captureLog, fetchImpl: stubSerpFetch(seen, () => ({})) }),
    );
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toContain("serp-secret");
    }
  });
});
