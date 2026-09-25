import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { applications } from "./applications";

export const interviewPreps = sqliteTable(
  "interview_preps",
  {
    id: text("id").primaryKey(),
    application_id: text("application_id")
      .notNull()
      .references(() => applications.id),
    pitch_casual: text("pitch_casual"),
    pitch_formal: text("pitch_formal"),
    pitch_technical: text("pitch_technical"),
    strengths: text("strengths"), // JSON
    weaknesses: text("weaknesses"), // JSON
    company_brief: text("company_brief"),
    custom_questions: text("custom_questions"), // JSON
    checklist_state: text("checklist_state"), // JSON
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_interview_preps_application_id").on(table.application_id),
  ]
);
