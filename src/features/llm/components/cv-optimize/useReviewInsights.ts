import { useMemo } from "react";
import {
  composeFinal,
  rowFinalBody,
  explainChange,
  reviewProgress,
  type ChangeReason,
} from "@/lib/cv/review-state";
import {
  findAddedJdSkills,
  findUnsupportedFigures,
  findNewTechTerms,
  computeExperienceYears,
} from "@/lib/cv/cv-claims";
import { buildJobKeywords, keywordCoverage } from "@/lib/cv/keyword-score";
import type { OptimizationSession } from "@/stores/cvOptimizationStore";
import type { CvRecord, Job, MatchAnalysis } from "@/types";
import type { RowFlags } from "./ReviewRow";

export interface RowInsight {
  flags: RowFlags;
  reasons: ChangeReason[];
  addedKeywords: string[];
}

export interface ReviewInsights {
  finalMd: string;
  coverageOriginal: number;
  coverageFinal: number;
  missingKeywords: string[];
  perRow: Map<string, RowInsight>;
  /** Job-post skills newly claimed in the final CV. */
  addedSkills: string[];
  unacknowledgedSkills: string[];
  unsupportedFigures: string[];
  newTech: string[];
  /** Row ids with at least one flag, in document order. */
  flaggedRowIds: string[];
  translated: boolean;
  progress: { changed: number; reviewed: number };
}

const EMPTY_FLAGS: RowFlags = { addedSkills: [], unsupportedFigures: [], newTech: [] };

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}

/**
 * Everything the review UI derives from the session: keyword coverage (before/after),
 * per-row flags (skills newly claimed, figures not in the source, unknown tech terms) and
 * "why" chips. Pure computation, memoized on the session.
 */
export function useReviewInsights(
  session: OptimizationSession | null,
  job: Job | null,
  cv: CvRecord | null,
  analysis: MatchAnalysis | null,
): ReviewInsights | null {
  return useMemo(() => {
    if (!session?.review || !job) return null;
    const state = session.review.present;
    const originalMd = session.originalMd;
    const finalMd = composeFinal(state);

    const keywords = buildJobKeywords(job, analysis);
    const before = keywordCoverage(originalMd, keywords);
    const after = keywordCoverage(finalMd, keywords);

    const jdSkills = unique([...session.skillCandidates.map((c) => c.skill), ...job.skills_required]);
    const userTexts = session.chat.filter((t) => t.role === "user").map((t) => t.content);
    const maxYears = cv ? computeExperienceYears(cv.parsed_data) : null;
    const jobText = `${job.title}\n${job.description}\n${job.skills_required.join(", ")}`;
    const translated = session.sourceLanguage !== null && session.sourceLanguage !== session.outputLanguage;
    const keywordList = keywords.map((k) => k.keyword);

    const perRow = new Map<string, RowInsight>();
    const flaggedRowIds: string[] = [];
    for (const row of state.rows) {
      const inFinal = row.status === "ai" || row.status === "edited";
      const body = inFinal ? rowFinalBody(row) : null;
      const flags: RowFlags = body
        ? {
            // The user's own edits are their claims — don't flag skills they typed.
            addedSkills: row.status === "edited" ? [] : findAddedJdSkills(originalMd, body, jdSkills),
            unsupportedFigures: findUnsupportedFigures(originalMd, body, {
              allowedTexts: userTexts,
              allowedFigures: session.allowedFigures,
              maxYears,
            }),
            newTech: row.status === "edited" ? [] : findNewTechTerms(originalMd, body, jobText),
          }
        : EMPTY_FLAGS;
      const { reasons, addedKeywords } =
        row.status === "unchanged"
          ? { reasons: [] as ChangeReason[], addedKeywords: [] as string[] }
          : explainChange(row.original, row.proposed, keywordList, translated);
      perRow.set(row.id, { flags, reasons, addedKeywords });
      if (flags.addedSkills.length + flags.unsupportedFigures.length + flags.newTech.length > 0) {
        flaggedRowIds.push(row.id);
      }
    }

    const all = [...perRow.values()];
    const addedSkills = unique(all.flatMap((r) => r.flags.addedSkills));
    const acknowledged = new Set(session.acknowledgedClaims.map((s) => s.toLowerCase()));

    return {
      finalMd,
      coverageOriginal: before.score,
      coverageFinal: after.score,
      missingKeywords: after.missing,
      perRow,
      addedSkills,
      unacknowledgedSkills: addedSkills.filter((s) => !acknowledged.has(s.toLowerCase())),
      unsupportedFigures: unique(all.flatMap((r) => r.flags.unsupportedFigures)),
      newTech: unique(all.flatMap((r) => r.flags.newTech)),
      flaggedRowIds,
      translated,
      progress: reviewProgress(state),
    };
  }, [session, job, cv, analysis]);
}
