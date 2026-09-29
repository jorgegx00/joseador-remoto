/**
 * Job-source registry: what each source is, which markets it serves, what it
 * needs (key or not), the credit its terms require, and whether it's on.
 *
 * Enabled state lives in the settings table (`source_enabled_<id>`). Unset means
 * the default: keyless feeds on; key-based ones on once a key is saved.
 * SerpApi and Apify (Google/LinkedIn scraping resellers) carry a legal-risk
 * notice: Google sued SerpApi in Dec 2025 and LinkedIn's terms forbid scraping.
 */

import { storageService } from "../storage";
import { isRegionCode } from "@/lib/markets/regions";
import { ADZUNA_COUNTRIES } from "./feed-sources";

export type SourceId =
  | "himalayas"
  | "jobicy"
  | "remotive"
  | "getonboard"
  | "jooble"
  | "adzuna"
  | "ats-boards"
  | "serpapi"
  | "apify-linkedin";

export interface SourceDef {
  id: SourceId;
  label: string;
  website: string;
  /** Credit shown on every job from this source (required by its terms). */
  attribution: string;
  /** Short description key suffix in the settings i18n namespace (sources.<id>.description). */
  coverage: "remote" | "latam" | "countries" | "companies" | "google" | "linkedin";
  /** Keys the user must provide (stored in the OS credential store). */
  keys: Array<{ name: string; label: "api_key" | "app_id" | "app_key"; signupUrl: string }>;
  /** Default caps (requests). */
  daily: number;
  monthly: number;
  /** Requests per run. */
  perRun: number;
  legalRisk?: boolean;
}

export const SOURCES: readonly SourceDef[] = [
  { id: "himalayas", label: "Himalayas", website: "https://himalayas.app", attribution: "Remote job from Himalayas", coverage: "remote", keys: [], daily: 40, monthly: 1000, perRun: 8 },
  { id: "jobicy", label: "Jobicy", website: "https://jobicy.com", attribution: "Remote job from Jobicy", coverage: "remote", keys: [], daily: 20, monthly: 500, perRun: 4 },
  { id: "remotive", label: "Remotive", website: "https://remotive.com", attribution: "Remote job from Remotive", coverage: "remote", keys: [], daily: 4, monthly: 120, perRun: 1 },
  { id: "getonboard", label: "Get on Board", website: "https://www.getonbrd.com", attribution: "Job from Get on Board", coverage: "latam", keys: [], daily: 30, monthly: 600, perRun: 6 },
  {
    id: "jooble",
    label: "Jooble",
    website: "https://jooble.org",
    attribution: "Job from Jooble",
    coverage: "countries",
    keys: [{ name: "jooble", label: "api_key", signupUrl: "https://jooble.org/api/about" }],
    daily: 15,
    monthly: 450,
    perRun: 6,
  },
  {
    id: "adzuna",
    label: "Adzuna",
    website: "https://www.adzuna.com",
    attribution: "Jobs by Adzuna",
    coverage: "countries",
    keys: [
      { name: "adzuna_app_id", label: "app_id", signupUrl: "https://developer.adzuna.com/signup" },
      { name: "adzuna_app_key", label: "app_key", signupUrl: "https://developer.adzuna.com/signup" },
    ],
    daily: 25,
    monthly: 250,
    perRun: 6,
  },
  { id: "ats-boards", label: "Company boards", website: "", attribution: "From the company's own job board", coverage: "companies", keys: [], daily: 60, monthly: 1500, perRun: 20 },
  {
    id: "serpapi",
    label: "Google Jobs (SerpApi)",
    website: "https://serpapi.com",
    attribution: "Via Google Jobs (SerpApi)",
    coverage: "google",
    keys: [{ name: "serpapi", label: "api_key", signupUrl: "https://serpapi.com/manage-api-key" }],
    daily: 0,
    monthly: 0,
    perRun: 0,
    legalRisk: true,
  },
  {
    id: "apify-linkedin",
    label: "LinkedIn (Apify)",
    website: "https://apify.com",
    attribution: "Via LinkedIn (Apify)",
    coverage: "linkedin",
    keys: [{ name: "apify", label: "api_key", signupUrl: "https://console.apify.com/settings/integrations" }],
    daily: 0,
    monthly: 0,
    perRun: 0,
    legalRisk: true,
  },
];

export const SOURCE_BY_ID: Readonly<Record<string, SourceDef>> = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

/** Hosts whose links identify the feed (the credit must match the link we show). */
const SOURCE_HOSTS: ReadonlyArray<[string, SourceId]> = [
  ["himalayas.app", "himalayas"],
  ["jobicy.com", "jobicy"],
  ["remotive.com", "remotive"],
  ["getonbrd.com", "getonboard"],
  ["jooble.org", "jooble"],
  ["adzuna.", "adzuna"],
];

/**
 * Source credit for a stored job. Decided by the link shown next to it (after a
 * cross-source merge the kept URL can come from a different feed than the
 * external id), falling back to the "<adapter>:<fingerprint>" external id.
 */
export function attributionFor(job: { external_id: string; source_url?: string; apply_url?: string }): SourceDef | null {
  const link = job.source_url || job.apply_url || "";
  let host = "";
  try {
    host = link ? new URL(link).hostname.toLowerCase() : "";
  } catch {
    host = "";
  }
  const byHost = SOURCE_HOSTS.find(([h]) => host === h || host.endsWith(`.${h}`) || (h.endsWith(".") && host.includes(h)));
  if (byHost) return SOURCE_BY_ID[byHost[1]];
  const byId = SOURCE_BY_ID[job.external_id.split(":")[0] ?? ""] ?? null;
  // A feed's credit only makes sense next to that feed's own link.
  return byId && SOURCE_HOSTS.some(([, id]) => id === byId.id) ? null : byId;
}

const enabledKey = (id: SourceId) => `source_enabled_${id}`;
export const FOLLOWED_BOARDS_KEY = "ingest_followed_boards";

async function hasKeys(def: SourceDef): Promise<boolean> {
  if (def.keys.length === 0) return true;
  const values = await Promise.all(def.keys.map((k) => storageService.getSetting(`api_key_${k.name}`)));
  return values.every(Boolean);
}

export async function isSourceEnabled(def: SourceDef): Promise<boolean> {
  const stored = await storageService.getSetting(enabledKey(def.id));
  if (stored === "true") return hasKeys(def);
  if (stored === "false") return false;
  // Default: keyless feeds on; key-based on once configured (keeps existing
  // SerpApi/Apify users working — the settings page shows the legal notice).
  return hasKeys(def);
}

export async function setSourceEnabled(id: SourceId, enabled: boolean): Promise<void> {
  await storageService.saveSetting(enabledKey(id), String(enabled));
}

export async function getFollowedBoards(): Promise<string[]> {
  try {
    const raw = await storageService.getSetting(FOLLOWED_BOARDS_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((b): b is string => typeof b === "string" && b.trim().length > 0) : [];
  } catch {
    return [];
  }
}

export async function setFollowedBoards(boards: string[]): Promise<void> {
  await storageService.saveSetting(FOLLOWED_BOARDS_KEY, JSON.stringify(boards.map((b) => b.trim()).filter(Boolean)));
}

/** Whether a source has anything to offer for these markets (UI hint + run selection). */
export function sourceServesMarkets(def: SourceDef, markets: string[]): boolean {
  switch (def.coverage) {
    case "latam":
      return markets.some((m) => m === "LATAM" || m === "WORLDWIDE" || ["MX", "CO", "CL", "AR", "BR", "PE", "UY", "DO", "ES"].includes(m));
    case "countries":
      if (def.id === "adzuna") return markets.some((m) => ADZUNA_COUNTRIES.includes(m.toLowerCase()));
      return markets.some((m) => !isRegionCode(m));
    default:
      return true;
  }
}
