import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle,
  XCircle,
  Search,
  Loader2,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  BarChart3,
} from "lucide-react";
import { useGlassdoorReviews } from "../hooks/useGlassdoorReviews";
import type { GlassdoorDifficulty, GlassdoorExperience, GlassdoorInterviewReview } from "@/types";

interface GlassdoorReviewsProps {
  companyId: string;
  companyName: string;
}

const DIFFICULTY_COLORS: Record<GlassdoorDifficulty, string> = {
  easy: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  hard: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const EXPERIENCE_COLORS: Record<GlassdoorExperience, string> = {
  positive: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  neutral: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  negative: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

function DifficultyBar({
  label,
  count,
  total,
  colorClass,
}: {
  label: string;
  count: number;
  total: number;
  colorClass: string;
}) {
  const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs w-16 text-muted-foreground">{label}</span>
      <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs w-10 text-right text-muted-foreground">
        {percentage}%
      </span>
    </div>
  );
}

function ReviewCard({ review }: { review: GlassdoorInterviewReview }) {
  const { t } = useTranslation("interview-prep");
  const [isExpanded, setIsExpanded] = useState(false);

  const processText = review.interview_process;
  const shouldTruncate = processText.length > 200;
  const displayText = shouldTruncate && !isExpanded
    ? processText.slice(0, 200) + "..."
    : processText;

  return (
    <Card className="border">
      <CardContent className="pt-4 pb-4 space-y-3">
        {/* Header: role + badges */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-sm">{review.role_title}</span>
          <Badge
            variant="secondary"
            className={DIFFICULTY_COLORS[review.difficulty]}
          >
            {t(`glassdoor.difficulty_${review.difficulty}`)}
          </Badge>
          <Badge
            variant="secondary"
            className={EXPERIENCE_COLORS[review.overall_experience]}
          >
            {t(`glassdoor.experience_${review.overall_experience}`)}
          </Badge>
          <div className="ml-auto flex items-center gap-1">
            {review.offer_received ? (
              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <CheckCircle className="h-3.5 w-3.5" />
                {t("glassdoor.offer_received")}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-red-500 dark:text-red-400">
                <XCircle className="h-3.5 w-3.5" />
                {t("glassdoor.no_offer")}
              </span>
            )}
          </div>
        </div>

        {/* Interview process */}
        {processText && (
          <div className="text-sm text-muted-foreground">
            <p>{displayText}</p>
            {shouldTruncate && (
              <Button
                variant="ghost"
                size="sm"
                className="p-0 h-auto text-xs text-primary mt-1"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="h-3 w-3 mr-1" />
                    {t("glassdoor.show_less")}
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3 mr-1" />
                    {t("glassdoor.show_more")}
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {/* Questions */}
        {review.questions.length > 0 && (
          <Accordion type="single" collapsible>
            <AccordionItem value="questions" className="border-0">
              <AccordionTrigger className="py-2 text-xs font-medium">
                <span className="flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  {t("glassdoor.questions_asked", { count: review.questions.length })}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                  {review.questions.map((q, idx) => (
                    <li key={idx} className="pl-1">{q}</li>
                  ))}
                </ol>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {/* Tips */}
        {review.tips && (
          <div className="text-sm bg-muted/50 rounded-md p-3">
            <span className="font-medium text-xs block mb-1">
              {t("glassdoor.tips_label")}
            </span>
            <p className="text-muted-foreground text-xs">{review.tips}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function GlassdoorReviews({ companyId, companyName }: GlassdoorReviewsProps) {
  const { t } = useTranslation("interview-prep");
  const {
    filteredReviews,
    stats,
    filters,
    isLoading,
    setFilters,
  } = useGlassdoorReviews(companyId);

  const handleDifficultyToggle = (difficulty: GlassdoorDifficulty, checked: boolean) => {
    const current = filters.difficulties;
    if (checked) {
      setFilters({ difficulties: [...current, difficulty] });
    } else {
      setFilters({ difficulties: current.filter((d) => d !== difficulty) });
    }
  };

  const handleExperienceToggle = (experience: GlassdoorExperience, checked: boolean) => {
    const current = filters.experiences;
    if (checked) {
      setFilters({ experiences: [...current, experience] });
    } else {
      setFilters({ experiences: current.filter((e) => e !== experience) });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">
          {companyName} - {t("glassdoor.title")}
        </h3>
      </div>

      {/* Stats summary */}
      {stats.total > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              {t("glassdoor.stats_summary")}
              <Badge variant="outline">{stats.total} {t("glassdoor.reviews")}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Difficulty breakdown */}
            <div>
              <span className="text-xs font-medium text-muted-foreground mb-2 block">
                {t("glassdoor.difficulty_breakdown")}
              </span>
              <div className="space-y-1.5">
                <DifficultyBar
                  label={t("glassdoor.difficulty_easy")}
                  count={stats.difficultyBreakdown.easy}
                  total={stats.total}
                  colorClass="bg-green-500"
                />
                <DifficultyBar
                  label={t("glassdoor.difficulty_medium")}
                  count={stats.difficultyBreakdown.medium}
                  total={stats.total}
                  colorClass="bg-yellow-500"
                />
                <DifficultyBar
                  label={t("glassdoor.difficulty_hard")}
                  count={stats.difficultyBreakdown.hard}
                  total={stats.total}
                  colorClass="bg-red-500"
                />
              </div>
            </div>

            {/* Experience breakdown */}
            <div>
              <span className="text-xs font-medium text-muted-foreground mb-2 block">
                {t("glassdoor.experience_breakdown")}
              </span>
              <div className="space-y-1.5">
                <DifficultyBar
                  label={t("glassdoor.experience_positive")}
                  count={stats.experienceBreakdown.positive}
                  total={stats.total}
                  colorClass="bg-green-500"
                />
                <DifficultyBar
                  label={t("glassdoor.experience_neutral")}
                  count={stats.experienceBreakdown.neutral}
                  total={stats.total}
                  colorClass="bg-gray-400"
                />
                <DifficultyBar
                  label={t("glassdoor.experience_negative")}
                  count={stats.experienceBreakdown.negative}
                  total={stats.total}
                  colorClass="bg-red-500"
                />
              </div>
            </div>

            {/* Offer rate */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t("glassdoor.offer_rate")}:</span>
              <span className="font-medium">{Math.round(stats.offerRate)}%</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      {stats.total > 0 && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-center gap-4">
              {/* Role filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {t("glassdoor.filter_role")}:
                </span>
                <Select
                  value={filters.role || "__all__"}
                  onValueChange={(val) =>
                    setFilters({ role: val === "__all__" ? "" : val })
                  }
                >
                  <SelectTrigger className="w-48 h-8 text-xs">
                    <SelectValue placeholder={t("glassdoor.all_roles")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">
                      {t("glassdoor.all_roles")}
                    </SelectItem>
                    {stats.uniqueRoles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Difficulty filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {t("glassdoor.filter_difficulty")}:
                </span>
                {(["easy", "medium", "hard"] as const).map((d) => (
                  <label key={d} className="flex items-center gap-1 text-xs">
                    <Checkbox
                      checked={filters.difficulties.includes(d)}
                      onCheckedChange={(checked) =>
                        handleDifficultyToggle(d, checked === true)
                      }
                    />
                    {t(`glassdoor.difficulty_${d}`)}
                  </label>
                ))}
              </div>

              {/* Experience filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {t("glassdoor.filter_experience")}:
                </span>
                {(["positive", "neutral", "negative"] as const).map((e) => (
                  <label key={e} className="flex items-center gap-1 text-xs">
                    <Checkbox
                      checked={filters.experiences.includes(e)}
                      onCheckedChange={(checked) =>
                        handleExperienceToggle(e, checked === true)
                      }
                    />
                    {t(`glassdoor.experience_${e}`)}
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Review list */}
      {filteredReviews.length > 0 ? (
        <div className="space-y-3">
          {filteredReviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      ) : stats.total > 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              {t("glassdoor.no_matching_reviews")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center space-y-3">
            <Search className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t("glassdoor.no_reviews")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("glassdoor.no_reviews_hint")}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
