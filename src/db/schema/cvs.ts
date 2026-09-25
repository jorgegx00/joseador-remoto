import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const cvs = sqliteTable(
  "cvs",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    file_path: text("file_path").notNull(),
    file_type: text("file_type").notNull(), // pdf | docx | md (tailored CVs)
    raw_text: text("raw_text"),
    parsed_data: text("parsed_data"), // JSON stored as text
    is_primary: integer("is_primary", { mode: "boolean" }).default(false),
    source: text("source").notNull().default("upload"), // upload | tailored
    // Provenance of tailored CVs. Plain text on purpose (no FK): tailored CVs outlive
    // job wipes and deletes of their source CV.
    parent_cv_id: text("parent_cv_id"),
    target_job_id: text("target_job_id"),
    target_job_title: text("target_job_title"),
    target_company: text("target_company"),
    generated_cv_id: text("generated_cv_id"),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_cvs_is_primary").on(table.is_primary),
    index("idx_cvs_source").on(table.source),
    index("idx_cvs_parent_cv_id").on(table.parent_cv_id),
  ]
);
