import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { createLlmService } from "@/lib/llm/service";
import { getConfig } from "@/services/llm";
import { getJobById } from "@/services/database";
import { useLlmStore } from "@/stores/llmStore";
import type { GlassdoorInterviewReview, CompanyBrief } from "@/types";

interface UseCompanyBriefResult {
  brief: CompanyBrief | null;
  isGenerating: boolean;
  error: string | null;
  hasLlmProvider: boolean;
  generateBrief: (
    companyName: string,
    reviews: GlassdoorInterviewReview[],
    jobId?: string,
  ) => Promise<void>;
  regenerate: (
    companyName: string,
    reviews: GlassdoorInterviewReview[],
    jobId?: string,
  ) => Promise<void>;
}

/**
 * Compute interview stats from reviews without requiring LLM.
 * These stats are always available as long as reviews exist.
 */
function computeInterviewStats(reviews: GlassdoorInterviewReview[]): {
  averageDifficulty: string;
  successRate: number;
  typicalStages: string;
} {
  if (reviews.length === 0) {
    return { averageDifficulty: "N/A", successRate: 0, typicalStages: "N/A" };
  }

  const difficultyMap: Record<string, number> = { easy: 1, medium: 2, hard: 3 };
  let totalDifficulty = 0;
  let offerCount = 0;

  for (const review of reviews) {
    totalDifficulty += difficultyMap[review.difficulty] ?? 2;
    if (review.offer_received) offerCount++;
  }

  const avgDiff = totalDifficulty / reviews.length;
  let averageDifficulty: string;
  if (avgDiff < 1.5) averageDifficulty = "Easy";
  else if (avgDiff < 2.5) averageDifficulty = "Medium";
  else averageDifficulty = "Hard";

  const successRate = Math.round((offerCount / reviews.length) * 100);

  // Infer typical stages from process descriptions
  const stageKeywords = [
    "phone screen",
    "recruiter call",
    "technical",
    "coding",
    "onsite",
    "behavioral",
    "system design",
    "hiring manager",
    "final",
    "take home",
    "panel",
  ];

  const stageCounts: Record<string, number> = {};
  for (const review of reviews) {
    const lower = review.interview_process.toLowerCase();
    for (const keyword of stageKeywords) {
      if (lower.includes(keyword)) {
        stageCounts[keyword] = (stageCounts[keyword] ?? 0) + 1;
      }
    }
  }

  const sortedStages = Object.entries(stageCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
    .map(([stage]) => stage.charAt(0).toUpperCase() + stage.slice(1));

  const typicalStages =
    sortedStages.length > 0
      ? sortedStages.join(" -> ")
      : "Multiple rounds reported";

  return { averageDifficulty, successRate, typicalStages };
}

/**
 * Extract the most frequently mentioned questions from reviews.
 * This is done locally without LLM.
 */
function extractCommonQuestions(
  reviews: GlassdoorInterviewReview[],
  limit: number = 10,
): string[] {
  const questionCounts = new Map<string, number>();

  for (const review of reviews) {
    for (const question of review.questions) {
      const normalized = question.trim().toLowerCase();
      if (normalized.length < 10) continue;
      const existing = questionCounts.get(normalized) ?? 0;
      questionCounts.set(normalized, existing + 1);
    }
  }

  // Sort by frequency, then take top N
  const sorted = Array.from(questionCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit);

  // Return with original casing from first occurrence
  const result: string[] = [];
  for (const [normalizedQ] of sorted) {
    for (const review of reviews) {
      const match = review.questions.find(
        (q) => q.trim().toLowerCase() === normalizedQ,
      );
      if (match) {
        result.push(match.trim());
        break;
      }
    }
  }

  // If we have fewer than limit unique questions from frequency, add more
  if (result.length < limit) {
    const existingSet = new Set(result.map((q) => q.toLowerCase()));
    for (const review of reviews) {
      for (const question of review.questions) {
        if (result.length >= limit) break;
        const lower = question.trim().toLowerCase();
        if (lower.length >= 10 && !existingSet.has(lower)) {
          existingSet.add(lower);
          result.push(question.trim());
        }
      }
      if (result.length >= limit) break;
    }
  }

  return result;
}

/**
 * Aggregate candidate tips from reviews (no LLM required).
 */
function aggregateTips(reviews: GlassdoorInterviewReview[]): string[] {
  const tips: string[] = [];
  const seen = new Set<string>();

  for (const review of reviews) {
    const tip = review.tips.trim();
    if (tip.length > 10) {
      const lower = tip.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        tips.push(tip);
      }
    }
  }

  return tips.slice(0, 15);
}

export function useCompanyBrief(): UseCompanyBriefResult {
  const { t } = useTranslation("interview-prep");
  const [brief, setBrief] = useState<CompanyBrief | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeProvider = useLlmStore((s) => s.activeProvider);

  const hasLlmProvider = activeProvider !== null;

  const generateBrief = useCallback(
    async (
      companyName: string,
      reviews: GlassdoorInterviewReview[],
      jobId?: string,
    ) => {
      setIsGenerating(true);
      setError(null);

      try {
        // Get job data if available
        const job = jobId ? await getJobById(jobId) : null;

        // Compute locally-derived data (always available)
        const interviewStats = computeInterviewStats(reviews);
        const commonQuestions = extractCommonQuestions(reviews, 10);
        const candidateTips = aggregateTips(reviews);

        // If LLM is configured, generate the AI-powered sections
        let overview = `${companyName} - based on ${reviews.length} interview reviews.`;
        let cultureValues: string[] = [];
        let interviewProcess = `Average difficulty: ${interviewStats.averageDifficulty}. Success rate: ${interviewStats.successRate}%. Typical stages: ${interviewStats.typicalStages}.`;
        let pros: string[] = [];
        let cons: string[] = [];
        let talkingPoints: string[] = [];
        let questionsToAsk: string[] = [];

        if (hasLlmProvider && activeProvider) {
          try {
            const config = await getConfig(activeProvider);
            const llmService = createLlmService({
              provider: config.provider,
              model: config.model,
              apiKey: config.apiKey,
              baseUrl: config.baseUrl,
            });

            // Build review texts for LLM
            const reviewTexts = reviews.map((r) => ({
              text: `Role: ${r.role_title}. Difficulty: ${r.difficulty}. Experience: ${r.overall_experience}. Process: ${r.interview_process}. Tips: ${r.tips}`,
              rating: r.overall_experience === "positive" ? 5 : r.overall_experience === "neutral" ? 3 : 1,
              source: "glassdoor",
            }));

            // Build a minimal Job object for the LLM service
            const jobForLlm = job ?? {
              id: "",
              external_id: "",
              company_id: "",
              company_name: companyName,
              title: "Software Engineer",
              description: `Position at ${companyName}`,
              location: "",
              is_dr_friendly: false,
              dr_filter_reason: "",
              dr_eligibility: null,
              source: "career_page" as const,
              source_url: "",
              apply_url: "",
              salary_min: null,
              salary_max: null,
              salary_currency: "USD",
              employment_type: "full_time" as const,
              seniority_level: "mid" as const,
              skills_required: [],
              posted_at: Date.now(),
              expires_at: null,
              scraped_at: Date.now(),
              created_at: Date.now(),
              needs_recovery: false,
              raw_payload: null,
            };

            const briefResult = await llmService.generateCompanyBrief(
              companyName,
              reviewTexts,
              jobForLlm,
            );

            overview = briefResult.overview || overview;
            cultureValues = briefResult.culture_values ?? [];
            interviewProcess = briefResult.interview_process || interviewProcess;
            pros = briefResult.pros ?? [];
            cons = briefResult.cons ?? [];
            talkingPoints = briefResult.talking_points ?? [];
            questionsToAsk = briefResult.questions_to_ask ?? [];
          } catch (llmErr) {
            const llmMsg = llmErr instanceof Error ? llmErr.message : String(llmErr);
            console.warn("LLM brief generation failed, using local data:", llmMsg);
            // Fall back to locally computed data (already set above)
          }
        }

        const newBrief: CompanyBrief = {
          overview,
          culture_values: cultureValues,
          interview_process: interviewProcess,
          pros,
          cons,
          talking_points: talkingPoints,
          questions_to_ask: questionsToAsk,
          generated_at: Date.now(),
        };

        // Attach locally computed fields to the brief object
        // The component will use these directly
        setBrief(newBrief);
        toast.success(t("company_brief.generated_success"));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        toast.error(msg);
      } finally {
        setIsGenerating(false);
      }
    },
    [hasLlmProvider, activeProvider],
  );

  const regenerate = useCallback(
    async (
      companyName: string,
      reviews: GlassdoorInterviewReview[],
      jobId?: string,
    ) => {
      setBrief(null);
      await generateBrief(companyName, reviews, jobId);
    },
    [generateBrief],
  );

  return {
    brief,
    isGenerating,
    error,
    hasLlmProvider,
    generateBrief,
    regenerate,
  };
}

// Re-export utility functions for use in CompanyBrief component
export { extractCommonQuestions, aggregateTips, computeInterviewStats };
