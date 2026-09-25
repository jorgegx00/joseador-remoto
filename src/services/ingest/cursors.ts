import { eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "@/db/schema";
import type { CursorStore } from "./types";

/** CursorStore over the local ingest_cursors table (value column is JSON). */
export function createCursorStore(): CursorStore {
  return {
    async get(key) {
      const rows = await db
        .select()
        .from(schema.ingestCursors)
        .where(eq(schema.ingestCursors.id, key))
        .limit(1);
      if (rows.length === 0) return null;
      try {
        return JSON.parse(rows[0].value) as Record<string, unknown>;
      } catch {
        return null;
      }
    },
    async set(key, value) {
      const now = Date.now();
      await db
        .insert(schema.ingestCursors)
        .values({ id: key, value: JSON.stringify(value), updated_at: now })
        .onConflictDoUpdate({
          target: schema.ingestCursors.id,
          set: { value: JSON.stringify(value), updated_at: now },
        });
    },
    async clear(key) {
      await db.delete(schema.ingestCursors).where(eq(schema.ingestCursors.id, key));
    },
  };
}
