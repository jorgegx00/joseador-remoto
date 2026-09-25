import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  ClipboardList,
  HelpCircle,
  Heart,
  Lightbulb,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Sparkles,
  Search,
  Clock,
  ThumbsUp,
  ThumbsDown,
  MessageSquareText,
  BrainCircuit,
} from "lucide-react";
import {
  useCompanyBrief,
  extractCommonQuestions,
  aggregateTips,
  computeInterviewStats,
} from "../hooks/useCompanyBrief";
import type { GlassdoorInterviewReview } from "@/types";

interface CompanyBriefProps {
  companyName: string;
  companyId: string;
  jobTitle: string;
  reviews: GlassdoorInterviewReview[];
  jobId?: string;
  onScrapeClick?: () => void;
}

function BriefSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function CompanyBrief({
  companyName,
  companyId,
  jobTitle,
  reviews,
  jobId,
  onScrapeClick,
}: CompanyBriefProps) {
  const { t } = useTranslation("interview-prep");
  const {
    brief,
    isGenerating,
    error,
    hasLlmProvider,
    generateBrief,
    regenerate,
  } = useCompanyBrief();

  // Locally computed data (no LLM needed)
  const commonQuestions = extractCommonQuestions(reviews, 10);
  const candidateTips = aggregateTips(reviews);
  const interviewStats = computeInterviewStats(reviews);

  // No reviews state
  if (reviews.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-3">
          <Search className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t("company_brief.no_reviews")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("company_brief.no_reviews_hint")}
          </p>
          {onScrapeClick && (
            <Button variant="outline" size="sm" onClick={onScrapeClick}>
              <Search className="h-4 w-4 mr-2" />
              {t("glassdoor.scrape_reviews")}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Loading state
  if (isGenerating) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("company_brief.generating")}
        </div>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with action buttons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">
            {t("company_brief.title")} - {companyName}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {!brief ? (
            <Button
              size="sm"
              onClick={() => void generateBrief(companyName, reviews, jobId)}
              disabled={isGenerating}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {t("company_brief.generate")}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void regenerate(companyName, reviews, jobId)}
              disabled={isGenerating}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {t("company_brief.regenerate")}
            </Button>
          )}
        </div>
      </div>

      {/* LLM warning */}
      {!hasLlmProvider && (
        <Card className="border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950">
          <CardContent className="py-3 flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
            <span className="text-yellow-700 dark:text-yellow-300">
              {t("company_brief.no_llm_warning")}
            </span>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {error && (
        <Card className="border-red-200 dark:border-red-800">
          <CardContent className="py-3 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </CardContent>
        </Card>
      )}

      {/* Interview Process Stats (always shown when reviews exist) */}
      <BriefSection
        icon={<ClipboardList className="h-4 w-4 text-blue-500" />}
        title={t("company_brief.interview_process")}
      >
        <div className="space-y-2">
          {brief?.interview_process ? (
            <p className="text-sm text-muted-foreground">{brief.interview_process}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="text-center p-3 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground">
                  {t("company_brief.avg_difficulty")}
                </p>
                <p className="text-lg font-semibold">{interviewStats.averageDifficulty}</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground">
                  {t("company_brief.success_rate")}
                </p>
                <p className="text-lg font-semibold">{interviewStats.successRate}%</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground">
                  {t("company_brief.typical_stages")}
                </p>
                <p className="text-xs font-medium mt-1">{interviewStats.typicalStages}</p>
              </div>
            </div>
          )}
        </div>
      </BriefSection>

      {/* Company Overview (LLM-generated) */}
      {brief?.overview && (
        <BriefSection
          icon={<Building2 className="h-4 w-4 text-indigo-500" />}
          title={t("company_brief.overview")}
        >
          <p className="text-sm text-muted-foreground">{brief.overview}</p>
        </BriefSection>
      )}

      {/* Common Questions (always from reviews, not LLM) */}
      {commonQuestions.length > 0 && (
        <BriefSection
          icon={<HelpCircle className="h-4 w-4 text-orange-500" />}
          title={t("company_brief.common_questions")}
        >
          <ol className="list-decimal list-inside space-y-1.5">
            {commonQuestions.map((question, idx) => (
              <li key={idx} className="text-sm text-muted-foreground pl-1">
                {question}
              </li>
            ))}
          </ol>
        </BriefSection>
      )}

      {/* Culture & Values (LLM-generated) */}
      {brief && brief.culture_values.length > 0 && (
        <BriefSection
          icon={<Heart className="h-4 w-4 text-pink-500" />}
          title={t("company_brief.culture")}
        >
          <div className="flex flex-wrap gap-2">
            {brief.culture_values.map((value, idx) => (
              <Badge key={idx} variant="secondary" className="text-xs">
                {value}
              </Badge>
            ))}
          </div>
        </BriefSection>
      )}

      {/* Pros & Cons (LLM-generated) */}
      {brief && (brief.pros.length > 0 || brief.cons.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {brief.pros.length > 0 && (
            <BriefSection
              icon={<ThumbsUp className="h-4 w-4 text-green-500" />}
              title={t("company_brief.pros")}
            >
              <ul className="space-y-1.5">
                {brief.pros.map((pro, idx) => (
                  <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-green-500 mt-0.5 shrink-0">+</span>
                    {pro}
                  </li>
                ))}
              </ul>
            </BriefSection>
          )}
          {brief.cons.length > 0 && (
            <BriefSection
              icon={<ThumbsDown className="h-4 w-4 text-red-500" />}
              title={t("company_brief.red_flags")}
            >
              <ul className="space-y-1.5">
                {brief.cons.map((con, idx) => (
                  <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-red-500 mt-0.5 shrink-0">-</span>
                    {con}
                  </li>
                ))}
              </ul>
            </BriefSection>
          )}
        </div>
      )}

      {/* Tips from Candidates (always from reviews) */}
      {candidateTips.length > 0 && (
        <BriefSection
          icon={<Lightbulb className="h-4 w-4 text-amber-500" />}
          title={t("company_brief.tips")}
        >
          <ul className="space-y-2">
            {candidateTips.map((tip, idx) => (
              <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                <Lightbulb className="h-3.5 w-3.5 mt-0.5 text-amber-400 shrink-0" />
                {tip}
              </li>
            ))}
          </ul>
        </BriefSection>
      )}

      {/* Talking Points & Questions to Ask (LLM-generated) */}
      {brief && brief.talking_points.length > 0 && (
        <BriefSection
          icon={<MessageSquareText className="h-4 w-4 text-cyan-500" />}
          title={t("company_brief.talking_points")}
        >
          <ul className="space-y-1.5">
            {brief.talking_points.map((point, idx) => (
              <li key={idx} className="text-sm text-muted-foreground">
                {point}
              </li>
            ))}
          </ul>
        </BriefSection>
      )}

      {brief && brief.questions_to_ask.length > 0 && (
        <BriefSection
          icon={<HelpCircle className="h-4 w-4 text-violet-500" />}
          title={t("company_brief.questions_to_ask")}
        >
          <ol className="list-decimal list-inside space-y-1.5">
            {brief.questions_to_ask.map((question, idx) => (
              <li key={idx} className="text-sm text-muted-foreground pl-1">
                {question}
              </li>
            ))}
          </ol>
        </BriefSection>
      )}

      {/* Last generated timestamp */}
      {brief && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {t("company_brief.last_generated", {
            date: new Date(brief.generated_at).toLocaleDateString(),
            time: new Date(brief.generated_at).toLocaleTimeString(),
          })}
        </div>
      )}
    </div>
  );
}
