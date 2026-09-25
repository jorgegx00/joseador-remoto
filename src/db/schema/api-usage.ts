import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

/** Paid-API budget counters; period is UTC "YYYY-MM-DD" (daily) or "YYYY-MM" (monthly). */
export const apiUsage = sqliteTable(
  "api_usage",
  {
    provider: text("provider").notNull(),
    period: text("period").notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.provider, table.period] })]
);
