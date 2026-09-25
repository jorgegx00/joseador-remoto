import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { applications } from "./applications";

export const applicationEvents = sqliteTable(
  "application_events",
  {
    id: text("id").primaryKey(),
    application_id: text("application_id")
      .notNull()
      .references(() => applications.id),
    type: text("type").notNull(),
    from_status: text("from_status"),
    to_status: text("to_status"),
    payload: text("payload"), // JSON
    created_at: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_application_events_application_id").on(table.application_id),
  ]
);
