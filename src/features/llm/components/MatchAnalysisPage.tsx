import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Play,
  Settings,
  AlertTriangle,
  Briefcase,
  FileText,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { MatchScoreGauge } from "@/components/common/MatchScoreGauge";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { ErrorState } from "@/components/common/ErrorState";
import { SkillsOverlap } from "./SkillsOverlap";
import { GapAnalysis } from "./GapAnalysis";
import { useMatchAnalysis } from "@/features/llm/hooks/useMatchAnalysis";
import { useSettingsStore } from "@/stores/settingsStore";
import { getCvById, getJobById, getMatchAnalysis } from "@/services/database";
import type { CvRecord } from "@/types/cv";
import type { Job } from "@/types/job";

interface MatchAnalysisPageProps {
  cvId: string;
  jobId: string;
}

function getSeniorityBadgeColor(
  fit: "under_qualified" | "good_fit" | "over_qualified",
): string {
  switch (fit) {
    case "under_qualified":
      return "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800";
    case "good_fit":
      return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800";
    case "over_qualified":
      return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800";
  }
}

export function MatchAnalysisPage({ cvId, jobId }: MatchAnalysisPageProps) {
  const { t } = useTranslation("llm");
  const { t: tCommon } = useTranslation("common");

  const activeProvider = useSettingsStore((s) => s.llm.active_provider);
  const { analysis, isCached, isLoading, error, runAnalysis } = useMatchAnalysis();

  const [cv, setCv] = useState<CvRecord | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [isLoadingCache, setIsLoadingCache] = useState(true);

  // Load CV and Job data
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setIsLoadingData(true);
      setDataError(null);
      try {
        const [cvResult, jobResult] = await Promise.all([
          getCvById(cvId),
          getJobById(jobId),
        ]);
        if (cancelled) return;

        if (!cvResult) {
          setDataError("CV not found");
          return;
        }
        if (!jobResult) {
          setDataError("Job not found");
          return;
        }

        setCv(cvResult);
        setJob(jobResult);
      } catch (err) {
        if (!cancelled) {
          setDataError(String(err));
        }
      } finally {
        if (!cancelled) setIsLoadingData(false);
      }
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [cvId, jobId]);

  // Try to load cached analysis from DB first to avoid re-calling the LLM on navigation
  useEffect(() => {
    let cancelled = false;
    setIsLoadingCache(true);
    void getMatchAnalysis(cvId, jobId).then((cached) => {
      if (cancelled) return;
      if (cached) {
        void runAnalysis(cvId, jobId);
      }
      setIsLoadingCache(false);
    }).catch(() => {
      if (!cancelled) setIsLoadingCache(false);
    });
    return () => {
      cancelled = true;
    };
    // runAnalysis identity is stable via useCallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cvId, jobId]);

  const handleAnalyze = useCallback(() => {
    void runAnalysis(cvId, jobId);
  }, [cvId, jobId, runAnalysis]);

  const handleReanalyze = useCallback(() => {
    void runAnalysis(cvId, jobId, { force: true });
  }, [cvId, jobId, runAnalysis]);

  // Loading state
  if (isLoadingData) {
    return (
      <PageContainer>
        <div className="max-w-4xl">
          <LoadingSkeleton variant="detail-page" />
        </div>
      </PageContainer>
    );
  }

  // Data error
  if (dataError || !cv || !job) {
    return (
      <PageContainer>
        <div className="max-w-4xl">
          <ErrorState error={dataError ?? tCommon("errors.not_found")} />
        </div>
      </PageContainer>
    );
  }

  const hasProvider = activeProvider !== null;

  return (
    <PageContainer>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/cv/$cvId" params={{ cvId }}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {tCommon("actions.back")}
              </Button>
            </Link>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                {t("match_analysis.title")}
              </h2>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <FileText className="h-3.5 w-3.5" />
                {cv.name}
                <span className="text-muted-foreground/50 mx-1">
                  {t("match_analysis.vs")}
                </span>
                <Briefcase className="h-3.5 w-3.5" />
                {job.title}
              </p>
            </div>
          </div>
        </div>

        {/* No LLM Provider */}
        {!hasProvider && (
          <Card>
            <CardContent className="py-12 flex flex-col items-center gap-4">
              <div className="rounded-full bg-amber-100 dark:bg-amber-900 p-4">
                <AlertTriangle className="h-10 w-10 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold">
                  {t("match_analysis.no_provider_title")}
                </h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  {t("match_analysis.no_provider_description")}
                </p>
              </div>
              <Link to="/settings">
                <Button>
                  <Settings className="h-4 w-4 mr-2" />
                  {t("match_analysis.go_to_settings")}
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Has Provider, No Analysis Yet */}
        {hasProvider && !analysis && !isLoading && !error && !isLoadingCache && (
          <Card>
            <CardContent className="py-12 flex flex-col items-center gap-4">
              <div className="rounded-full bg-primary/10 p-4">
                <Play className="h-10 w-10 text-primary" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold">
                  {t("match_analysis.title")}
                </h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  {cv.name} {t("match_analysis.vs")} {job.title}
                </p>
              </div>
              <Button onClick={handleAnalyze} size="lg">
                <Play className="h-4 w-4 mr-2" />
                {t("match_analysis.analyze")}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Analyzing State */}
        {isLoading && (
          <Card>
            <CardContent className="py-12 flex flex-col items-center gap-4">
              <RefreshCw className="h-10 w-10 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">
                {t("match_analysis.analyzing")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("match_analysis.analyzing_hint")}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Error */}
        {error && !isLoading && (
          <ErrorState error={error} onRetry={handleAnalyze} />
        )}

        {/* Analysis Complete */}
        {analysis && !isLoading && (
          <>
            {/* Overall Match Score */}
            <div className="flex flex-col items-center gap-3 py-4">
              <MatchScoreGauge
                score={analysis.overall_match}
                size="lg"
                animated
              />
              <span className="text-sm font-medium text-muted-foreground">
                {t("match_analysis.overall_match")}
              </span>
              <Button variant="outline" size="sm" onClick={handleReanalyze}>
                <RefreshCw className="h-3.5 w-3.5 mr-2" />
                {t("match_analysis.reanalyze")}
              </Button>
              {isCached && (
                <span className="text-xs text-muted-foreground">
                  {t("match_analysis.cached_hint")}
                </span>
              )}
            </div>

            {/* Skills Overlap */}
            <SkillsOverlap skills={analysis.skills_match} />

            {/* Gap Analysis */}
            <GapAnalysis
              gaps={analysis.gaps}
              strengths={analysis.strengths}
            />

            {/* Experience & Seniority Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Experience Relevance */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {t("match_analysis.experience_relevance")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Progress
                      value={analysis.experience_match}
                      className="flex-1"
                    />
                    <span className="text-sm font-semibold min-w-[3rem] text-right">
                      {analysis.experience_match}%
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Seniority Fit */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {t("match_analysis.seniority_fit")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge
                    variant="outline"
                    className={`text-sm py-1 px-3 ${getSeniorityBadgeColor(analysis.seniority_fit)}`}
                  >
                    {t(
                      `match_analysis.seniority_${analysis.seniority_fit}` as const,
                    )}
                  </Badge>
                </CardContent>
              </Card>
            </div>

            {/* Recommendation */}
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {t("match_analysis.recommendation")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed">
                  {analysis.recommendation}
                </p>
              </CardContent>
            </Card>

            <Separator />

            {/* CTA: Generate Optimized CV */}
            <div className="flex justify-center py-2">
              <Link to="/generate/cv" search={{ cv: cvId, job: jobId }}>
                <Button size="lg" className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  {t("match_analysis.generate_optimized_cv")}
                </Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </PageContainer>
  );
}
