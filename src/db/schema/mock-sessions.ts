import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { applications } from "./applications";

export const mockSessions = sqliteTable(
  "mock_sessions",
  {
    id: text("id").primaryKey(),
    application_id: text("application_id")
      .notNull()
      .references(() => applications.id),
    interview_id: text("interview_id").notNull().default(""),
    interview_type: text("interview_type").notNull(),
    language: text("language").notNull(),
    coaching_language: text("coaching_language").notNull(),
    total_questions: integer("total_questions").notNull(),
    turns: text("turns").notNull(), // JSON MockTurn[]
    report: text("report"), // JSON MockReport
    status: text("status").notNull().default("active"),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [index("idx_mock_sessions_application_id").on(table.application_id)]
);
