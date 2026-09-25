import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { jobs } from "./jobs";
import { cvs } from "./cvs";
import { generatedCvs } from "./generated-cvs";

export const applications = sqliteTable(
  "applications",
  {
    id: text("id").primaryKey(),
    job_id: text("job_id")
      .notNull()
      .references(() => jobs.id),
    cv_id: text("cv_id")
      .notNull()
      .references(() => cvs.id),
    generated_cv_id: text("generated_cv_id").references(() => generatedCvs.id),
    status: text("status").notNull().default("saved"),
    applied_at: integer("applied_at"),
    notes: text("notes").default(""),
    last_contact_at: integer("last_contact_at"),
    snoozed_until: integer("snoozed_until"),
    closed_reason: text("closed_reason"),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_applications_job_id").on(table.job_id),
    index("idx_applications_cv_id").on(table.cv_id),
    index("idx_applications_status").on(table.status),
  ]
);
