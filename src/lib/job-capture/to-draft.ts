/**
 * CapturedJob → PastedJobDraft, so captured postings flow through the same
 * finalize/save path as pasted ones. Structured fields win; the text heuristics
 * only fill what the structure lacks (skills, seniority).
 */

import { heuristicJobDraft, mergeJobDraft, normalizeSalary, type PastedJobDraft } from "@/lib/jobs/pasted-job";
import type { CapturedJob } from "./types";

function annualSalary(salary: CapturedJob["salary"]): { min: number | null; max: number | null } {
  if (!salary) return { min: null, max: null };
  const { min, max, period } = salary;
  // normalizeSalary knows year/month/hour; day/week are scaled to a year first.
  const scale = period === "day" ? 260 : period === "week" ? 52 : 1;
  const p = period === "day" || period === "week" ? "year" : period;
  return normalizeSalary(min === null ? null : min * scale, max === null ? null : max * scale, p);
}

export function capturedToDraft(captured: CapturedJob, pageUrl: string): PastedJobDraft {
  const heuristic = heuristicJobDraft(
    [captured.title, captured.company, captured.location, captured.description].filter(Boolean).join("\n\n"),
  );
  const base = mergeJobDraft(heuristic, null);
  const salary = annualSalary(captured.salary);
  const hasSalary = salary.min !== null || salary.max !== null;
  return {
    ...base,
    title: captured.title || base.title,
    company_name: captured.company || base.company_name,
    location: captured.location || base.location,
    employment_type: captured.employmentType ?? base.employment_type,
    salary_min: hasSalary ? salary.min : base.salary_min,
    salary_max: hasSalary ? salary.max : base.salary_max,
    salary_currency: (hasSalary ? captured.salary?.currency : null) ?? base.salary_currency,
    description: captured.description || base.description,
    source_url: pageUrl,
    apply_url: captured.applyUrl || pageUrl,
  };
}
