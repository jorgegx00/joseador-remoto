import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { companies } from "./companies";

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    external_id: text("external_id"),
    company_id: text("company_id")
      .notNull()
      .references(() => companies.id),
    title: text("title").notNull(),
    description: text("description").notNull(),
    location: text("location"),
    is_dr_friendly: integer("is_dr_friendly", { mode: "boolean" }).default(false),
    dr_filter_reason: text("dr_filter_reason"),
    dr_eligibility: text("dr_eligibility"), // explicit_latam | global_remote | restricted | ambiguous
    source: text("source").notNull(), // aggregator | career_page | manual (pasted) (legacy: google_jobs | linkedin | glassdoor)
    source_url: text("source_url"),
    apply_url: text("apply_url"),
    salary_min: real("salary_min"),
    salary_max: real("salary_max"),
    salary_currency: text("salary_currency").default("USD"),
    employment_type: text("employment_type").default("full_time"),
    seniority_level: text("seniority_level"),
    skills_required: text("skills_required"), // JSON array stored as text
    posted_at: integer("posted_at"),
    expires_at: integer("expires_at"),
    scraped_at: integer("scraped_at").notNull(),
    created_at: integer("created_at").notNull(),
    needs_recovery: integer("needs_recovery", { mode: "boolean" }).default(false),
    raw_payload: text("raw_payload"),
    workplace: text("workplace"), // remote | hybrid | onsite | unknown
    location_scope: text("location_scope"), // JSON LocationScope
    market_eligibility: text("market_eligibility"), // JSON Record<market, MarketEligibility>
    is_market_eligible: integer("is_market_eligible", { mode: "boolean" }).default(false),
    canonical_key: text("canonical_key"),
    salary_period: text("salary_period"),
  },
  (table) => [
    index("idx_jobs_company_id").on(table.company_id),
    index("idx_jobs_source").on(table.source),
    index("idx_jobs_is_dr_friendly").on(table.is_dr_friendly),
    index("idx_jobs_dr_eligibility").on(table.dr_eligibility),
    index("idx_jobs_posted_at").on(table.posted_at),
    index("idx_jobs_seniority_level").on(table.seniority_level),
    index("idx_jobs_external_id").on(table.external_id),
    index("idx_jobs_needs_recovery").on(table.needs_recovery),
    index("idx_jobs_is_market_eligible").on(table.is_market_eligible),
    index("idx_jobs_canonical_key").on(table.canonical_key),
  ]
);
