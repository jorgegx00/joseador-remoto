import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { cvs } from "./cvs";

export const starStories = sqliteTable(
  "star_stories",
  {
    id: text("id").primaryKey(),
    cv_id: text("cv_id")
      .notNull()
      .references(() => cvs.id),
    experience_index: integer("experience_index").notNull(),
    title: text("title").notNull(),
    situation: text("situation").notNull(),
    task: text("task").notNull(),
    action: text("action").notNull(),
    result: text("result").notNull(),
    skills_demonstrated: text("skills_demonstrated"), // JSON array
    is_user_edited: integer("is_user_edited", { mode: "boolean" }).default(false),
    created_at: integer("created_at").notNull(),
    updated_at: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_star_stories_cv_id").on(table.cv_id),
  ]
);
