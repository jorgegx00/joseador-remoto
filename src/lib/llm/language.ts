import { detectLanguage } from "@/lib/cv/detect-language";
import type { Job } from "@/types";

export type MaterialLanguage = "en" | "es";

export const LANGUAGE_NAME: Record<MaterialLanguage, string> = { en: "English", es: "Spanish" };

export function toMaterialLanguage(lang: string | null | undefined): MaterialLanguage {
  return lang?.toLowerCase().startsWith("es") ? "es" : "en";
}

/**
 * Language for candidate-facing materials (answers, pitch, messages to the company):
 * an explicit override wins, then the job post's language (you interview in the
 * language the role is advertised in), then the UI language.
 */
export function resolveMaterialLanguage(
  job: Pick<Job, "title" | "description"> | null,
  uiLanguage: string,
  override?: MaterialLanguage | null,
): MaterialLanguage {
  if (override) return override;
  const detected = job ? detectLanguage(`${job.title}\n${job.description}`) : null;
  return detected ?? toMaterialLanguage(uiLanguage);
}
