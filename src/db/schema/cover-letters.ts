import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { cvs } from "./cvs";
import { jobs } from "./jobs";

export const coverLetters = sqliteTable(
  "cover_letters",
  {
    id: text("id").primaryKey(),
    cv_id: text("cv_id")
      .notNull()
      .references(() => cvs.id),
    job_id: text("job_id")
      .notNull()
      .references(() => jobs.id),
    content: text("content").notNull(),
    tone: text("tone").default("professional"),
    llm_provider: text("llm_provider"),
    llm_model: text("llm_model"),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_cover_letters_cv_id").on(table.cv_id),
    index("idx_cover_letters_job_id").on(table.job_id),
  ]
);
