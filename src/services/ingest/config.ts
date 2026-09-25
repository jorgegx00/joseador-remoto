/**
 * Ingest configuration: settings-table rows layered over built-in defaults.
 * Unset (or invalid) rows fall back to the defaults; the Settings UI writes
 * via the setters and "restore defaults" simply deletes the row.
 */

import { storageService } from "../storage";
import {
  DEFAULT_APIFY_LINKEDIN_TITLES,
  DEFAULT_CAPS,
  DEFAULT_INGEST_QUERIES,
} from "./defaults";

export const INGEST_SETTING_KEYS = {
  queries: "ingest_queries",
  apifyTitles: "apify_linkedin_titles",
  serpapiDailyCap: "serpapi_daily_cap",
  serpapiMonthlyCap: "serpapi_monthly_cap",
  apifyDailyCap: "apify_daily_cap",
  apifyMonthlyCap: "apify_monthly_cap",
  apifyLinkedinLimit: "apify_linkedin_limit",
  maxPagesPerQuery: "ingest_max_pages_per_query",
} as const;

export interface IngestConfig {
  queries: string[];
  apifyTitles: string[];
  serpapiDailyCap: number;
  serpapiMonthlyCap: number;
  apifyDailyCap: number;
  apifyMonthlyCap: number;
  apifyLinkedinLimit: number;
  maxPagesPerQuery: number;
}

async function getStringArray(key: string): Promise<string[] | null> {
  const raw = await storageService.getSetting(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      const items = parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
      if (items.length > 0) return items;
    }
  } catch {
    // fall through to defaults
  }
  return null;
}

async function getPositiveNumber(key: string): Promise<number | null> {
  const raw = await storageService.getSetting(key);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export async function getIngestConfig(): Promise<IngestConfig> {
  const [queries, apifyTitles, serpapiDailyCap, serpapiMonthlyCap, apifyDailyCap, apifyMonthlyCap, apifyLinkedinLimit, maxPagesPerQuery] =
    await Promise.all([
      getStringArray(INGEST_SETTING_KEYS.queries),
      getStringArray(INGEST_SETTING_KEYS.apifyTitles),
      getPositiveNumber(INGEST_SETTING_KEYS.serpapiDailyCap),
      getPositiveNumber(INGEST_SETTING_KEYS.serpapiMonthlyCap),
      getPositiveNumber(INGEST_SETTING_KEYS.apifyDailyCap),
      getPositiveNumber(INGEST_SETTING_KEYS.apifyMonthlyCap),
      getPositiveNumber(INGEST_SETTING_KEYS.apifyLinkedinLimit),
      getPositiveNumber(INGEST_SETTING_KEYS.maxPagesPerQuery),
    ]);

  return {
    queries: queries ?? [...DEFAULT_INGEST_QUERIES],
    apifyTitles: apifyTitles ?? [...DEFAULT_APIFY_LINKEDIN_TITLES],
    serpapiDailyCap: serpapiDailyCap ?? DEFAULT_CAPS.serpapiDaily,
    serpapiMonthlyCap: serpapiMonthlyCap ?? DEFAULT_CAPS.serpapiMonthly,
    apifyDailyCap: apifyDailyCap ?? DEFAULT_CAPS.apifyDaily,
    apifyMonthlyCap: apifyMonthlyCap ?? DEFAULT_CAPS.apifyMonthly,
    apifyLinkedinLimit: apifyLinkedinLimit ?? DEFAULT_CAPS.apifyLinkedinLimit,
    maxPagesPerQuery: maxPagesPerQuery ?? DEFAULT_CAPS.maxPagesPerQuery,
  };
}

/** null resets the list to the built-in defaults. */
export async function setIngestTermList(
  key: typeof INGEST_SETTING_KEYS.queries | typeof INGEST_SETTING_KEYS.apifyTitles,
  terms: string[] | null,
): Promise<void> {
  if (terms === null) {
    await storageService.deleteSetting(key);
    return;
  }
  const cleaned = terms.map((t) => t.trim()).filter((t) => t.length > 0);
  await storageService.saveSetting(key, JSON.stringify(cleaned));
}

/** null resets the value to the built-in default. */
export async function setIngestNumber(key: string, value: number | null): Promise<void> {
  if (value === null || !Number.isFinite(value) || value <= 0) {
    await storageService.deleteSetting(key);
    return;
  }
  await storageService.saveSetting(key, String(Math.floor(value)));
}
