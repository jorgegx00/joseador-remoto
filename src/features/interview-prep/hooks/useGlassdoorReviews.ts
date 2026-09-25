import { useState, useCallback, useEffect } from "react";
import { getGlassdoorInterviewReviewsByCompanyId } from "@/services/database";
import type {
  GlassdoorInterviewReview,
  GlassdoorDifficulty,
  GlassdoorExperience,
} from "@/types";

/**
 * Read-only Glassdoor interview reviews.
 * The Glassdoor scraper was removed with the rest of the on-device scrapers —
 * legacy rows persisted before the migration are still browsable, and the
 * interview-prep AI features degrade gracefully when no reviews exist.
 */

interface GlassdoorReviewStats {
  total: number;
  difficultyBreakdown: Record<GlassdoorDifficulty, number>;
  experienceBreakdown: Record<GlassdoorExperience, number>;
  offerRate: number;
  uniqueRoles: string[];
}

interface GlassdoorReviewFilters {
  role: string;
  difficulties: GlassdoorDifficulty[];
  experiences: GlassdoorExperience[];
}

interface UseGlassdoorReviewsResult {
  reviews: GlassdoorInterviewReview[];
  filteredReviews: GlassdoorInterviewReview[];
  stats: GlassdoorReviewStats;
  filters: GlassdoorReviewFilters;
  isLoading: boolean;
  error: string | null;
  setFilters: (filters: Partial<GlassdoorReviewFilters>) => void;
  refresh: () => Promise<void>;
}

function computeStats(reviews: GlassdoorInterviewReview[]): GlassdoorReviewStats {
  const total = reviews.length;
  const difficultyBreakdown: Record<GlassdoorDifficulty, number> = {
    easy: 0,
    medium: 0,
    hard: 0,
  };
  const experienceBreakdown: Record<GlassdoorExperience, number> = {
    positive: 0,
    negative: 0,
    neutral: 0,
  };
  let offersReceived = 0;
  const roleSet = new Set<string>();

  for (const review of reviews) {
    difficultyBreakdown[review.difficulty]++;
    experienceBreakdown[review.overall_experience]++;
    if (review.offer_received) offersReceived++;
    roleSet.add(review.role_title);
  }

  return {
    total,
    difficultyBreakdown,
    experienceBreakdown,
    offerRate: total > 0 ? (offersReceived / total) * 100 : 0,
    uniqueRoles: Array.from(roleSet).sort(),
  };
}

function applyFilters(
  reviews: GlassdoorInterviewReview[],
  filters: GlassdoorReviewFilters,
): GlassdoorInterviewReview[] {
  return reviews.filter((review) => {
    if (filters.role && review.role_title !== filters.role) {
      return false;
    }
    if (
      filters.difficulties.length > 0 &&
      !filters.difficulties.includes(review.difficulty)
    ) {
      return false;
    }
    if (
      filters.experiences.length > 0 &&
      !filters.experiences.includes(review.overall_experience)
    ) {
      return false;
    }
    return true;
  });
}

export function useGlassdoorReviews(companyId: string): UseGlassdoorReviewsResult {
  const [reviews, setReviews] = useState<GlassdoorInterviewReview[]>([]);
  const [filters, setFiltersState] = useState<GlassdoorReviewFilters>({
    role: "",
    difficulties: [],
    experiences: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReviews = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    setError(null);
    try {
      const loaded = await getGlassdoorInterviewReviewsByCompanyId(companyId);
      setReviews(loaded);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  const setFilters = useCallback((partial: Partial<GlassdoorReviewFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...partial }));
  }, []);

  const filteredReviews = applyFilters(reviews, filters);
  const stats = computeStats(reviews);

  return {
    reviews,
    filteredReviews,
    stats,
    filters,
    isLoading,
    error,
    setFilters,
    refresh: loadReviews,
  };
}
