/**
 * Local data retention. Everything the app stores stays on this computer; this
 * limits how long the ORIGINAL text of pasted/captured job pages is kept (the
 * job's fields and description remain).
 */

import { purgeRawPayloads } from "./database";
import { storageService } from "./storage";

export const RETENTION_KEY = "raw_text_retention_days";
/** Days; 0 = don't keep, -1 = keep forever. */
export const RETENTION_OPTIONS = [0, 30, 90, 365, -1] as const;
export const DEFAULT_RETENTION_DAYS = 90;

export async function getRetentionDays(): Promise<number> {
  const raw = await storageService.getSetting(RETENTION_KEY);
  const n = raw === null ? DEFAULT_RETENTION_DAYS : Number(raw);
  return (RETENTION_OPTIONS as readonly number[]).includes(n) ? n : DEFAULT_RETENTION_DAYS;
}

export async function setRetentionDays(days: number): Promise<void> {
  await storageService.saveSetting(RETENTION_KEY, String(days));
  await applyRetention();
}

/** Runs at startup and when the setting changes. */
export async function applyRetention(now = Date.now()): Promise<number> {
  const days = await getRetentionDays();
  if (days < 0) return 0;
  return purgeRawPayloads(now - days * 86_400_000);
}

/** "Clear now": drop all stored original page text. */
export function clearStoredPageText(): Promise<number> {
  return purgeRawPayloads(Date.now() + 1);
}
