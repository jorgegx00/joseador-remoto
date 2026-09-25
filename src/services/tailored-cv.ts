import { ulid } from "ulid";
import { LlmService } from "@/lib/llm/service";
import type { LlmProviderConfig } from "@/lib/llm/providers/base";
import {
  parseCvMarkdown,
  needsLlmParseFallback,
  fillIdentityFromSource,
} from "@/lib/cv/parseCvMarkdown";
import { defaultTailoredCvName } from "@/lib/cv/cv-document";
import { isUnknownCompany } from "@/lib/jobs/pasted-job";
import { getCvById, insertCv, updateTailoredCv, upsertGeneratedCv } from "./database";
import type { CvRecord, GeneratedCv, Job, ParsedCv } from "@/types";

/**
 * Turns a tailored CV's markdown into structured data. Deterministic parser first; the
 * LLM is only a fallback when the parse looks incomplete (low confidence or missing
 * roles). Never throws — a parse problem must not lose the user's CV.
 */
export async function parseTailoredMarkdown(
  markdown: string,
  sourceParsed: ParsedCv | null,
  llm: LlmProviderConfig | null,
): Promise<{ parsed: ParsedCv; warnings: string[]; usedLlm: boolean }> {
  const result = parseCvMarkdown(markdown);
  const warnings = [...result.warnings];
  let parsed = result.parsed;
  let usedLlm = false;

  if (llm && needsLlmParseFallback(result, sourceParsed)) {
    try {
      const refined = await new LlmService(llm).refineCvParsing(markdown, result.parsed);
      // The LLM schema has no slot for unknown sections — keep the deterministic ones.
      parsed = { ...refined, extra_sections: result.parsed.extra_sections };
      usedLlm = true;
    } catch (err) {
      warnings.push(`LLM parse fallback failed: ${String(err)}`);
    }
  }

  if (sourceParsed) parsed = fillIdentityFromSource(parsed, sourceParsed);
  return { parsed, warnings, usedLlm };
}

export interface SaveTailoredCvInput {
  /** CV row to update (same session re-save). Null → create a new CV. */
  existingCvId: string | null;
  name: string;
  markdown: string;
  sourceCv: CvRecord;
  job: Pick<Job, "id" | "title" | "company_name">;
  /** Generation-history row to upsert alongside (scores, provider). */
  generated: GeneratedCv | null;
  llm: LlmProviderConfig | null;
  /** Used when `name` is blank: "Tailored" / "Adaptado". */
  defaultNamePrefix?: string;
}

export interface SaveTailoredCvResult {
  cvId: string;
  created: boolean;
  warnings: string[];
  usedLlm: boolean;
}

/**
 * Saves an optimized CV as a first-class CV (source = "tailored"). Updates the existing
 * row when `existingCvId` still exists, so saving twice never duplicates.
 */
export async function saveTailoredCv(input: SaveTailoredCvInput): Promise<SaveTailoredCvResult> {
  const { markdown, sourceCv, job } = input;
  const { parsed, warnings, usedLlm } = await parseTailoredMarkdown(
    markdown,
    sourceCv.parsed_data,
    input.llm,
  );

  const name =
    input.name.trim() ||
    defaultTailoredCvName(input.defaultNamePrefix ?? "Tailored", job.title, job.company_name);
  const targetCompany = isUnknownCompany(job.company_name) ? null : job.company_name;

  // History row first so the CV can point at it. Best effort: the job or the source CV
  // may have been deleted mid-session (FK failure) — the tailored CV is still saved.
  let generatedId: string | null = null;
  if (input.generated) {
    try {
      await upsertGeneratedCv({ ...input.generated, content: markdown });
      generatedId = input.generated.id;
    } catch (err) {
      console.warn("[saveTailoredCv] generation history not saved:", err);
    }
  }

  const existing = input.existingCvId ? await getCvById(input.existingCvId) : null;
  if (existing) {
    await updateTailoredCv(existing.id, {
      name,
      raw_text: markdown,
      parsed_data: parsed,
      generated_cv_id: generatedId ?? existing.generated_cv_id,
      target_job_id: job.id,
      target_job_title: job.title,
      target_company: targetCompany,
    });
    return { cvId: existing.id, created: false, warnings, usedLlm };
  }

  const cvId = ulid();
  await insertCv({
    id: cvId,
    name,
    file_path: "",
    file_type: "md",
    raw_text: markdown,
    parsed_data: parsed,
    is_primary: false,
    source: "tailored",
    parent_cv_id: sourceCv.id,
    target_job_id: job.id,
    target_job_title: job.title,
    target_company: targetCompany,
    generated_cv_id: generatedId,
  });
  return { cvId, created: true, warnings, usedLlm };
}
