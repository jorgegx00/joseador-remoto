import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const companies = sqliteTable(
  "companies",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    website: text("website"),
    careers_url: text("careers_url"),
    logo_url: text("logo_url"),
    scraper_id: text("scraper_id"),
    is_nearshore: integer("is_nearshore", { mode: "boolean" }).default(true),
    headquarters_country: text("headquarters_country"),
    glassdoor_url: text("glassdoor_url"),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_companies_name").on(table.name),
    index("idx_companies_scraper_id").on(table.scraper_id),
  ]
);
