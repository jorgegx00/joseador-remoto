import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { companies } from "./companies";

export const glassdoorInterviewReviews = sqliteTable(
  "glassdoor_interview_reviews",
  {
    id: text("id").primaryKey(),
    company_id: text("company_id")
      .notNull()
      .references(() => companies.id),
    role_title: text("role_title").notNull(),
    difficulty: text("difficulty").notNull(), // "easy" | "medium" | "hard"
    overall_experience: text("overall_experience").notNull(), // "positive" | "negative" | "neutral"
    interview_process: text("interview_process").notNull().default(""),
    questions: text("questions").notNull().default("[]"), // JSON array of strings
    tips: text("tips").notNull().default(""),
    offer_received: integer("offer_received").notNull().default(0), // boolean as integer
    scraped_at: integer("scraped_at").notNull(),
    created_at: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_glassdoor_interview_reviews_company_id").on(table.company_id),
    index("idx_glassdoor_interview_reviews_difficulty").on(table.difficulty),
    index("idx_glassdoor_interview_reviews_experience").on(table.overall_experience),
  ]
);
