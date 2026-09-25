import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { companies } from "./companies";

export const glassdoorReviews = sqliteTable(
  "glassdoor_reviews",
  {
    id: text("id").primaryKey(),
    company_id: text("company_id")
      .notNull()
      .references(() => companies.id),
    rating: real("rating"),
    title: text("title"),
    pros: text("pros"),
    cons: text("cons"),
    role: text("role"),
    employment_status: text("employment_status"),
    review_date: text("review_date"),
    helpful_count: integer("helpful_count").default(0),
    scraped_at: integer("scraped_at").notNull(),
    created_at: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_glassdoor_reviews_company_id").on(table.company_id),
    index("idx_glassdoor_reviews_rating").on(table.rating),
  ]
);
