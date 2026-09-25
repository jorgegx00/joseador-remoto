import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { cvs } from "./cvs";
import { jobs } from "./jobs";

export const matchAnalyses = sqliteTable(
  "match_analyses",
  {
    id: text("id").primaryKey(),
    cv_id: text("cv_id")
      .notNull()
      .references(() => cvs.id, { onDelete: "cascade" }),
    job_id: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    analysis: text("analysis").notNull(), // JSON stored as text (MatchAnalysis)
    llm_provider: text("llm_provider"),
    llm_model: text("llm_model"),
    // Content fingerprints at analysis time — a mismatch marks the cached analysis stale.
    cv_fingerprint: text("cv_fingerprint"),
    job_fingerprint: text("job_fingerprint"),
    created_at: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_match_analyses_cv_job").on(table.cv_id, table.job_id),
    index("idx_match_analyses_cv_id").on(table.cv_id),
    index("idx_match_analyses_job_id").on(table.job_id),
  ],
);
