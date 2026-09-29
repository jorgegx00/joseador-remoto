/**
 * Manual scrape orchestrator (port of server/src/ingest/run.ts):
 *   fetch from each configured source → map (DR is a flag, never a gate) →
 *   dedupService.deduplicateAndSave (exact + fuzzy, in-DB) → scrape_runs log.
 *
 * Never drops a job: missing fields → needs_recovery=true + raw_payload
 * preserved (feedback_no_drop_on_parse_fail); non-DR jobs are stored with
 * is_dr_friendly=false and surfaced through the UI filter.
 */

import { ulid } from "ulid";
import { insertScrapeRun, updateScrapeRun } from "../database";
import { dedupService, type IncomingScrapedJob } from "../dedup";
import { rustFetch } from "../http";
import { storageService } from "../storage";
import { BudgetExceededError, consumeBudget } from "./budget";
import { getIngestConfig } from "./config";
import { createCursorStore } from "./cursors";
import { mapRawJob } from "./map";
import { ApifyLinkedInSource } from "./apify-linkedin-source";
import { SerpApiSource } from "./serpapi-source";
import { consoleLogger, type JobSourceAdapter } from "./types";
import {
  AdzunaSource,
  AtsBoardsSource,
  GetOnBoardSource,
  HimalayasSource,
  JobicySource,
  JoobleSource,
  RemotiveSource,
  type FeedOptions,
} from "./feed-sources";
import { SOURCE_BY_ID, getFollowedBoards, isSourceEnabled, sourceServesMarkets, type SourceId } from "./sources";
import { getMarketProfile } from "@/services/market-profile";
import { countryName } from "@/lib/markets/countries";
import { isRegionCode } from "@/lib/markets/regions";

/**
 * Google Jobs locale for the user's country. Countries Google Jobs indexes get
 * their own gl/hl; everything else (including the DR, which has no index —
 * see serpapi-source.ts) searches the US index in English.
 */
const SERP_LOCALES: Record<string, { gl: string; hl: string }> = {
  US: { gl: "us", hl: "en" },
  PR: { gl: "us", hl: "en" },
  CA: { gl: "ca", hl: "en" },
  GB: { gl: "uk", hl: "en" },
  MX: { gl: "mx", hl: "es" },
  CO: { gl: "co", hl: "es" },
  CL: { gl: "cl", hl: "es" },
  AR: { gl: "ar", hl: "es" },
  ES: { gl: "es", hl: "es" },
  BR: { gl: "br", hl: "pt" },
  DE: { gl: "de", hl: "de" },
};

function serpLocale(country: string): { gl: string; hl: string } {
  return SERP_LOCALES[country] ?? { gl: "us", hl: "en" };
}

/** Thrown when every job source is switched off (or lacks its key). */
export class NoApiKeysError extends Error {
  constructor() {
    super("no job source enabled: turn one on in Settings → Job search");
    this.name = "NoApiKeysError";
  }
}

/** Legitimate feeds for the user's markets (see ./sources.ts). */
async function feedSources(
  queries: string[],
  budgetFor: (provider: string, caps: { daily: number; monthly: number }) => () => Promise<unknown>,
  log: typeof consoleLogger,
): Promise<JobSourceAdapter[]> {
  const profile = getMarketProfile();
  const markets = profile.targetMarkets;
  const out: JobSourceAdapter[] = [];
  const base = (id: SourceId): FeedOptions => {
    const def = SOURCE_BY_ID[id];
    return {
      fetchImpl: rustFetch,
      log,
      consumeBudget: budgetFor(id, { daily: def.daily, monthly: def.monthly }),
      queries,
      markets,
      residenceCountry: profile.residenceCountry,
      maxRequests: def.perRun,
    };
  };
  const on = async (id: SourceId) => {
    const def = SOURCE_BY_ID[id];
    return sourceServesMarkets(def, markets) && (await isSourceEnabled(def));
  };

  if (await on("himalayas")) out.push(new HimalayasSource(base("himalayas")));
  if (await on("jobicy")) out.push(new JobicySource(base("jobicy")));
  if (await on("remotive")) out.push(new RemotiveSource(base("remotive")));
  if (await on("getonboard")) out.push(new GetOnBoardSource(base("getonboard")));
  if (await on("jooble")) {
    const apiKey = await storageService.getApiKey("jooble");
    const locations = markets.filter((m) => !isRegionCode(m)).map((c) => countryName(c, "en"));
    if (apiKey && locations.length > 0) out.push(new JoobleSource({ ...base("jooble"), apiKey, locations }));
  }
  if (await on("adzuna")) {
    const [appId, appKey] = await Promise.all([storageService.getApiKey("adzuna_app_id"), storageService.getApiKey("adzuna_app_key")]);
    if (appId && appKey) out.push(new AdzunaSource({ ...base("adzuna"), appId, appKey }));
  }
  const boards = await getFollowedBoards();
  if (boards.length > 0 && (await on("ats-boards"))) out.push(new AtsBoardsSource({ ...base("ats-boards"), boards }));
  return out;
}

export interface IngestProgress {
  source: string;
  jobsFound: number;
}

export interface IngestSummary {
  runId: string;
  status: "completed" | "failed";
  jobsFound: number;
  jobsNew: number;
  duplicates: number;
  searchesUsed: number;
  note?: string;
}

export async function runScrape(
  onProgress?: (progress: IngestProgress) => void,
): Promise<IngestSummary> {
  const log = consoleLogger;
  const config = await getIngestConfig();
  const cursors = createCursorStore();

  let searchesUsed = 0;
  const budgetFor =
    (provider: string, caps: { daily: number; monthly: number }) => async () => {
      const usage = await consumeBudget(provider, caps);
      searchesUsed++;
      return usage;
    };

  const [serpapiKey, apifyToken] = await Promise.all([
    storageService.getApiKey("serpapi"),
    storageService.getApiKey("apify"),
  ]);

  const sources: JobSourceAdapter[] = await feedSources(config.queries, budgetFor, log);
  if (serpapiKey && (await isSourceEnabled(SOURCE_BY_ID.serpapi))) {
    sources.push(
      new SerpApiSource({
        apiKey: serpapiKey,
        ...serpLocale(getMarketProfile().residenceCountry),
        queries: config.queries,
        maxPagesPerQuery: config.maxPagesPerQuery,
        cursors,
        log,
        fetchImpl: rustFetch,
        consumeBudget: budgetFor("serpapi", {
          daily: config.serpapiDailyCap,
          monthly: config.serpapiMonthlyCap,
        }),
      }),
    );
  }
  if (apifyToken && (await isSourceEnabled(SOURCE_BY_ID["apify-linkedin"]))) {
    sources.push(
      new ApifyLinkedInSource({
        token: apifyToken,
        titles: config.apifyTitles,
        limit: config.apifyLinkedinLimit,
        cursors,
        log,
        fetchImpl: rustFetch,
        consumeBudget: budgetFor("apify-linkedin", {
          daily: config.apifyDailyCap,
          monthly: config.apifyMonthlyCap,
        }),
      }),
    );
  }

  if (sources.length === 0) {
    throw new NoApiKeysError();
  }

  const runId = ulid();
  const scraperId = sources.map((s) => s.name).join("+");
  await insertScrapeRun({
    id: runId,
    scraper_id: scraperId,
    status: "running",
    jobs_found: 0,
    jobs_new: 0,
    searches_used: 0,
    error_message: "",
    started_at: Date.now(),
  });

  let jobsFound = 0;
  const batch: IncomingScrapedJob[] = [];
  const notes: string[] = [];

  try {
    // All sources feed ONE batch so dedup also merges cross-source duplicates
    // (same job on Google Jobs and LinkedIn).
    for (const source of sources) {
      try {
        for await (const raw of source.fetch()) {
          jobsFound++;
          batch.push(await mapRawJob(raw, source.name));
          onProgress?.({ source: source.name, jobsFound });
        }
      } catch (err) {
        if (err instanceof BudgetExceededError) {
          // Expected stop: caps are per provider — the remaining sources have
          // their own budgets and still run. Persist what we got.
          notes.push(err.message);
          log.warn({ err: err.message, source: source.name }, "source stopped at budget cap");
        } else {
          throw err;
        }
      }
    }

    const stats = await dedupService.deduplicateAndSave(batch);
    const note = notes.length > 0 ? notes.join("; ") : undefined;

    await updateScrapeRun(runId, {
      status: "completed",
      jobs_found: jobsFound,
      jobs_new: stats.new,
      searches_used: searchesUsed,
      error_message: note ?? "",
      completed_at: Date.now(),
    });

    const summary: IngestSummary = {
      runId,
      status: "completed",
      jobsFound,
      jobsNew: stats.new,
      duplicates: stats.duplicates,
      searchesUsed,
      note,
    };
    log.info(summary, "scrape run finished");
    return summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateScrapeRun(runId, {
      status: "failed",
      jobs_found: jobsFound,
      searches_used: searchesUsed,
      error_message: message,
      completed_at: Date.now(),
    });
    log.error({ err }, "scrape run failed");
    return {
      runId,
      status: "failed",
      jobsFound,
      jobsNew: 0,
      duplicates: 0,
      searchesUsed,
      note: message,
    };
  }
}
