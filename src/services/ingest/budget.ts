/**
 * Paid-API budget gate (port of server/src/ingest/budget.ts). Counters are
 * incremented BEFORE the upstream HTTP call, so retries and double-clicks
 * can't exceed the caps — at worst a unit is counted and not spent.
 *
 * Unlike the server version this can't use INSERT…RETURNING: the Tauri
 * execute_sql command only returns rows for SELECT statements, so counters
 * are read back with a separate SELECT. Fine for a single-writer desktop app.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../database";
import * as schema from "@/db/schema";

export class BudgetExceededError extends Error {
  readonly provider: string;
  readonly period: "daily" | "monthly";
  readonly used: number;
  readonly cap: number;

  constructor(provider: string, period: "daily" | "monthly", used: number, cap: number) {
    super(`${provider} ${period} budget exceeded: ${used}/${cap}`);
    this.name = "BudgetExceededError";
    this.provider = provider;
    this.period = period;
    this.used = used;
    this.cap = cap;
  }
}

/** UTC period keys, e.g. day "2026-06-10", month "2026-06". */
export function currentPeriods(now: number = Date.now()): { day: string; month: string } {
  const d = new Date(now);
  const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const day = `${month}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return { day, month };
}

/**
 * Consume one unit of budget for `provider`. Throws BudgetExceededError when
 * either cap is already exhausted (the increment that crossed the line is
 * intentionally kept — conservative accounting).
 */
export async function consumeBudget(
  provider: string,
  caps: { daily: number; monthly: number },
  now: number = Date.now(),
): Promise<{ dailyUsed: number; monthlyUsed: number }> {
  const { day, month } = currentPeriods(now);

  for (const period of [day, month]) {
    await db
      .insert(schema.apiUsage)
      .values({ provider, period, count: 1 })
      .onConflictDoUpdate({
        target: [schema.apiUsage.provider, schema.apiUsage.period],
        set: { count: sql`${schema.apiUsage.count} + 1` },
      });
  }

  const rows = await db
    .select()
    .from(schema.apiUsage)
    .where(and(eq(schema.apiUsage.provider, provider), inArray(schema.apiUsage.period, [day, month])));

  const dailyUsed = rows.find((r) => r.period === day)?.count ?? 0;
  const monthlyUsed = rows.find((r) => r.period === month)?.count ?? 0;

  if (dailyUsed > caps.daily) {
    throw new BudgetExceededError(provider, "daily", dailyUsed, caps.daily);
  }
  if (monthlyUsed > caps.monthly) {
    throw new BudgetExceededError(provider, "monthly", monthlyUsed, caps.monthly);
  }
  return { dailyUsed, monthlyUsed };
}

/** Read current usage without consuming (for the Settings UI). */
export async function getBudgetUsage(
  provider: string,
  now: number = Date.now(),
): Promise<{ dailyUsed: number; monthlyUsed: number }> {
  const { day, month } = currentPeriods(now);
  const rows = await db
    .select()
    .from(schema.apiUsage)
    .where(and(eq(schema.apiUsage.provider, provider), inArray(schema.apiUsage.period, [day, month])));
  return {
    dailyUsed: rows.find((r) => r.period === day)?.count ?? 0,
    monthlyUsed: rows.find((r) => r.period === month)?.count ?? 0,
  };
}
