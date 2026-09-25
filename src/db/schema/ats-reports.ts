import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { cvs } from "./cvs";
import { jobs } from "./jobs";

export const atsReports = sqliteTable(
  "ats_reports",
  {
    id: text("id").primaryKey(),
    cv_id: text("cv_id")
      .notNull()
      .references(() => cvs.id),
    job_id: text("job_id").references(() => jobs.id),
    ats_score: real("ats_score").notNull(),
    keyword_score: real("keyword_score"),
    format_score: real("format_score"),
    structure_score: real("structure_score"),
    contact_score: real("contact_score"),
    consistency_score: real("consistency_score"),
    spelling_score: real("spelling_score"),
    length_score: real("length_score"),
    keyword_matches: text("keyword_matches"), // JSON
    issues: text("issues"), // JSON
    checks: text("checks"), // JSON
    narrative_report: text("narrative_report"),
    narrative_scores: text("narrative_scores"), // JSON
    created_at: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_ats_reports_cv_id").on(table.cv_id),
    index("idx_ats_reports_job_id").on(table.job_id),
    index("idx_ats_reports_ats_score").on(table.ats_score),
  ]
);
