import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { applications } from "./applications";

export const interviews = sqliteTable(
  "interviews",
  {
    id: text("id").primaryKey(),
    application_id: text("application_id")
      .notNull()
      .references(() => applications.id),
    scheduled_at: integer("scheduled_at").notNull(),
    duration_minutes: integer("duration_minutes").default(60),
    interview_type: text("interview_type").notNull(),
    location: text("location"),
    meeting_url: text("meeting_url"),
    interviewer_name: text("interviewer_name"),
    interviewer_role: text("interviewer_role"),
    interviewer_timezone: text("interviewer_timezone"),
    notes: text("notes").default(""),
    feedback: text("feedback").default(""),
    outcome: text("outcome").default("pending"),
    status: text("status").notNull().default("scheduled"),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_interviews_application_id").on(table.application_id),
    index("idx_interviews_scheduled_at").on(table.scheduled_at),
    index("idx_interviews_status").on(table.status),
  ]
);
