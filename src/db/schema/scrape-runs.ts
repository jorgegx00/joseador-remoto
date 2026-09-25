import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const scrapeRuns = sqliteTable(
  "scrape_runs",
  {
    id: text("id").primaryKey(),
    scraper_id: text("scraper_id").notNull(),
    status: text("status").notNull().default("queued"),
    jobs_found: integer("jobs_found").default(0),
    jobs_new: integer("jobs_new").default(0),
    searches_used: integer("searches_used").default(0),
    error_message: text("error_message"),
    started_at: integer("started_at").notNull(),
    completed_at: integer("completed_at"),
  },
  (table) => [
    index("idx_scrape_runs_scraper_id").on(table.scraper_id),
    index("idx_scrape_runs_status").on(table.status),
    index("idx_scrape_runs_started_at").on(table.started_at),
  ]
);
