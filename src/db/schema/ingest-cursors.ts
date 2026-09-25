import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/** Resume state for paid job-source pagination (value is JSON). */
export const ingestCursors = sqliteTable("ingest_cursors", {
  id: text("id").primaryKey(),
  value: text("value").notNull(),
  updated_at: integer("updated_at").notNull(),
});
