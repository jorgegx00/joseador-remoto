import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { applications } from "./applications";

export const prepDocuments = sqliteTable(
  "prep_documents",
  {
    id: text("id").primaryKey(),
    application_id: text("application_id")
      .notNull()
      .references(() => applications.id),
    interview_id: text("interview_id").notNull().default(""), // "" = application-level
    kind: text("kind").notNull(), // gap_brief | round_pack
    language: text("language").notNull(),
    content: text("content").notNull(), // JSON
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_prep_documents_application_id").on(table.application_id),
    uniqueIndex("idx_prep_documents_unique").on(table.application_id, table.interview_id, table.kind),
  ]
);
