import type { LocationScope, MarketEligibility, Workplace } from "./market";

export type SalaryPeriod = "hour" | "day" | "week" | "month" | "year";

export type JobSource =
  | "aggregator"
  | "career_page"
  // Job post the user pasted manually (copied from any website).
  | "manual"
  // Legacy values — retained so rows persisted before the browser-based
  // scrapers were removed still deserialize cleanly. No active scraper emits these.
  | "google_jobs"
  | "linkedin";
export type SeniorityLevel = "junior" | "mid" | "senior" | "lead" | "principal";
export type EmploymentType = "full_time" | "contract" | "part_time";

/**
 * DR/LATAM eligibility tier for a job, from most to least accessible:
 * - `explicit_latam` — text explicitly names DR / LATAM / Caribbean (or ≥2 LATAM countries).
 * - `global_remote`  — genuinely worldwide, no geographic restriction.
 * - `restricted`     — limited to a non-LATAM region or a single non-DR LATAM location.
 * - `ambiguous`      — remote but underspecified; awaits LLM adjudication (never shown as friendly).
 * `is_dr_friendly` is derived as (explicit_latam || global_remote).
 */
export type DrEligibility = "explicit_latam" | "global_remote" | "restricted" | "ambiguous";

export interface Job {
  id: string;
  external_id: string;
  company_id: string;
  /** Resolved from the companies table at read time (joined). Empty if the company row is missing. */
  company_name: string;
  title: string;
  description: string;
  location: string;
  is_dr_friendly: boolean;
  dr_filter_reason: string;
  /**
   * Location eligibility tier (see {@link DrEligibility}). Null on rows persisted before the
   * tiered classifier existed — the DR backfill populates them on next run.
   */
  dr_eligibility: DrEligibility | null;
  source: JobSource;
  source_url: string;
  apply_url: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  employment_type: EmploymentType;
  seniority_level: SeniorityLevel;
  skills_required: string[];
  posted_at: number;
  expires_at: number | null;
  scraped_at: number;
  created_at: number;
  /**
   * True when scraping could not extract one or more critical fields cleanly. The job
   * is still persisted (never silently dropped) and the UI surfaces a badge so the user
   * can audit / retry. Cleared once recovery succeeds.
   */
  needs_recovery: boolean;
  /**
   * Original raw payload (JSON or HTML) preserved while `needs_recovery` is true so the
   * LLM-recovery step has source material to extract from. Cleared on successful recovery.
   */
  raw_payload: string | null;
  /**
   * Multi-market eligibility, stamped on every save from the user's market profile
   * (src/services/market-profile.ts). Optional so rows/objects built before the
   * feature (and hand-built fixtures) still type-check; null/undefined = not computed.
   */
  workplace?: Workplace | null;
  location_scope?: LocationScope | null;
  /** Verdict per target market ("DO", "US", "LATAM", "WORLDWIDE"…). */
  market_eligibility?: Record<string, MarketEligibility> | null;
  /** Eligible (explicit or global) for at least one target market. */
  is_market_eligible?: boolean;
  /**
   * Stable identity of the posting across sources and captures
   * ("linkedin:123", "gh:acme:456"); null when the source URL doesn't reveal one.
   */
  canonical_key?: string | null;
  /** Period the salary figures are expressed in; null = unknown (legacy rows are annual). */
  salary_period?: SalaryPeriod | null;
}

export interface JobFilters {
  search: string;
  sources: JobSource[];
  /**
   * Location strictness for the list, judged against the user's target markets:
   * - `explicit` — only jobs that explicitly name one of the markets.
   * - `eligible` — explicit + verified global remote. Default.
   * - `all`      — no location filtering (includes restricted + ambiguous).
   */
  eligibilityFilter: "explicit" | "eligible" | "all";
  /** Restrict to these target markets (empty = any of the user's markets). */
  markets: string[];
  seniorityLevels: SeniorityLevel[];
  employmentTypes: EmploymentType[];
  salaryMin: number | null;
  salaryMax: number | null;
  companies: string[];
  skills: string[];
  /** Derived tech tags (see jobTaxonomy). OR within each dimension, AND across dimensions. */
  languages: string[];
  frameworks: string[];
  roles: string[];
  datePosted: "today" | "this_week" | "this_month" | "all_time";
  sortBy: "newest" | "match_score" | "salary_desc" | "company_asc";
}

export interface Company {
  id: string;
  name: string;
  website: string;
  careers_url: string;
  logo_url: string;
  scraper_id: string;
  is_nearshore: boolean;
  headquarters_country: string;
  glassdoor_url: string;
  created_at: number;
  updated_at: number;
}
