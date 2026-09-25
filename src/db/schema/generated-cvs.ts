import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { cvs } from "./cvs";
import { jobs } from "./jobs";

export const generatedCvs = sqliteTable(
  "generated_cvs",
  {
    id: text("id").primaryKey(),
    cv_id: text("cv_id")
      .notNull()
      .references(() => cvs.id),
    job_id: text("job_id")
      .notNull()
      .references(() => jobs.id),
    content: text("content").notNull(),
    match_score_before: real("match_score_before"),
    match_score_after: real("match_score_after"),
    llm_provider: text("llm_provider"),
    llm_model: text("llm_model"),
    created_at: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_generated_cvs_cv_id").on(table.cv_id),
    index("idx_generated_cvs_job_id").on(table.job_id),
  ]
);
