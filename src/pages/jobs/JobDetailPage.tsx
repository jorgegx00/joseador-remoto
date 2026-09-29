import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate, Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { open } from "@tauri-apps/plugin-shell";
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  Globe,
  Building2,
  Briefcase,
  Sparkles,
  FileSearch,
  FileText,
  Mail,
  Settings,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageContainer } from "@/components/layout/PageContainer";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { SourceBadge } from "@/components/common/SourceBadge";
import { attributionFor } from "@/services/ingest/sources";
import { EligibilityBadge } from "@/components/common/EligibilityBadge";
import { formatMoneyRange } from "@/lib/format/money";
import { ApplyDialog } from "@/features/jobs/components/ApplyDialog";
import { MatchAnalysisCard } from "@/features/jobs/components/MatchAnalysisCard";
import { useJobStore } from "@/stores/jobStore";
import { useCvStore } from "@/stores/cvStore";
import { useLlmAvailability } from "@/features/llm/hooks/useLlmAvailability";
import { getAtsReportsByCvId } from "@/services/database";
import type { Job, Company } from "@/types";

const SENIORITY_COLORS: Record<string, string> = {
  junior:
    "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900 dark:text-emerald-300 dark:border-emerald-800",
  mid: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-800",
  senior:
    "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900 dark:text-purple-300 dark:border-purple-800",
  lead: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900 dark:text-amber-300 dark:border-amber-800",
  principal:
    "bg-red-100 text-red-700 border-red-200 dark:bg-red-900 dark:text-red-300 dark:border-red-800",
};

export function JobDetailPage() {
  const { t } = useTranslation("jobs");
  const { t: tCommon, i18n } = useTranslation("common");
  const { jobId } = useParams({ from: "/jobs/$jobId" });
  const navigate = useNavigate();

  const { getJob, jobs, companies } = useJobStore();
  const { activeCv, setCurrentAtsReport } = useCvStore();
  const { hasProvider: hasLlmProvider } = useLlmAvailability();

  const [job, setJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    void getJob(jobId).then((result) => {
      setJob(result);
      setIsLoading(false);
    });
  }, [jobId, getJob]);

  // Restore the latest ATS report for the (activeCv, jobId) pair so that the
  // MatchAnalysisCard shows previously-run scores instead of always prompting
  // to re-run after a page refresh.
  useEffect(() => {
    if (!activeCv) {
      setCurrentAtsReport(null);
      return;
    }
    let cancelled = false;
    void getAtsReportsByCvId(activeCv.id).then((reports) => {
      if (cancelled) return;
      const latestForJob = reports.find((r) => r.job_id === jobId) ?? null;
      setCurrentAtsReport(latestForJob);
    });
    return () => {
      cancelled = true;
    };
  }, [activeCv, jobId, setCurrentAtsReport]);

  const company: Company | undefined = job
    ? companies.find((c) => c.id === job.company_id)
    : undefined;

  const handleOpenUrl = useCallback(
    async (url: string) => {
      try {
        await open(url);
      } catch {
        // Silently handle if URL cannot be opened
      }
    },
    []
  );

  // Find similar jobs: same company or overlapping skills
  const similarJobs = job
    ? jobs
        .filter((j) => {
          if (j.id === job.id) return false;
          if (j.company_id === job.company_id) return true;
          const overlap = j.skills_required.filter((s) =>
            job.skills_required.includes(s)
          );
          return overlap.length >= 2;
        })
        .slice(0, 5)
    : [];

  if (isLoading) {
    return (
      <PageContainer>
        <div className="max-w-6xl mx-auto">
          <LoadingSkeleton variant="detail-page" />
        </div>
      </PageContainer>
    );
  }

  if (!job) {
    return (
      <PageContainer>
        <div className="max-w-6xl mx-auto space-y-4">
          <Link to="/jobs">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {tCommon("actions.back")}
            </Button>
          </Link>
          <p className="text-muted-foreground text-center py-12">
            {t("detail.not_found")}
          </p>
        </div>
      </PageContainer>
    );
  }

  const postedDate = job.posted_at
    ? formatDistanceToNow(new Date(job.posted_at), { addSuffix: true })
    : null;

  return (
    <PageContainer>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Back Button */}
        <Link to="/jobs">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {tCommon("actions.back")}
          </Button>
        </Link>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
          {/* Main Column (70%) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Header */}
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <h1 className="text-2xl font-bold tracking-tight">
                    {job.title}
                  </h1>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="text-base">{company?.name || job.company_name || job.company_id}</span>
                    {company?.website && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => void handleOpenUrl(company.website)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsBookmarked((p) => !p)}
                >
                  {isBookmarked ? (
                    <BookmarkCheck className="h-5 w-5 text-primary" />
                  ) : (
                    <Bookmark className="h-5 w-5" />
                  )}
                </Button>
              </div>

              {/* Badge Row */}
              <div className="flex flex-wrap items-center gap-2">
                <SourceBadge source={job.source} via={attributionFor(job)?.label} />
                <EligibilityBadge job={job} />
                {job.workplace && job.workplace !== "unknown" && (
                  <Badge variant="outline">{tCommon(`markets.workplace.${job.workplace}`)}</Badge>
                )}
                {job.location_scope && job.location_scope.visaSponsorship !== "unknown" && (
                  <Badge variant="outline">{tCommon(`markets.visa.${job.location_scope.visaSponsorship}`)}</Badge>
                )}
                <Badge
                  variant="outline"
                  className={SENIORITY_COLORS[job.seniority_level] ?? ""}
                >
                  {t(`seniority.${job.seniority_level}`)}
                </Badge>
                <Badge variant="secondary">
                  {t(`employment.${job.employment_type}`)}
                </Badge>
              </div>
            </div>

            {/* Needs-recovery banner (recovery happens server-side on future syncs) */}
            {job.needs_recovery && (
              <Card className="border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-950/20">
                <CardContent className="py-3 px-4 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                      {t("detail.needs_recovery_title")}
                    </p>
                    <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
                      {t("detail.needs_recovery_description")}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Salary Card */}
            {(job.salary_min !== null || job.salary_max !== null) && (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="py-3 px-4">
                  <p className="text-lg font-semibold text-primary">
                    {formatMoneyRange(job.salary_min, job.salary_max, job.salary_currency || "USD", {
                      locale: i18n.language || "es",
                    })}{" "}
                    / {t(`detail.per_${job.salary_period ?? "year"}`)}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Posted Date */}
            {postedDate && (
              <p className="text-sm text-muted-foreground">
                {t("detail.posted")} {postedDate}
              </p>
            )}

            {/* Source credit — the feeds' terms ask for it, with a direct link. */}
            {(() => {
              const credit = attributionFor(job);
              const link = job.source_url || job.apply_url;
              if (!credit || !link) return null;
              return (
                <p className="text-sm text-muted-foreground">
                  {credit.attribution} ·{" "}
                  <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => void open(link)}>
                    {t("detail.view_original")}
                  </button>
                </p>
              );
            })()}

            <Separator />

            {/* Job Description */}
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">
                {t("detail.full_description")}
              </h2>
              <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
                {job.description}
              </div>
            </div>

            {/* Required Skills */}
            {job.skills_required.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold">
                    {t("detail.required_skills")}
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {job.skills_required.map((skill) => (
                      <Badge key={skill} variant="outline">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Sidebar Column (30%) */}
          <div className="lg:col-span-3 space-y-4">
            {/* Apply Card */}
            <Card>
              <CardContent className="py-4 px-4 space-y-3">
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => setApplyDialogOpen(true)}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  {t("detail.apply_now")}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  {t("detail.apply_description")}
                </p>
              </CardContent>
            </Card>

            {/* Match Analysis Card */}
            <MatchAnalysisCard
              job={job}
              cv={activeCv ?? undefined}
            />

            {/* AI Analysis Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  {t("detail.ai_analysis")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {!activeCv ? (
                  <p className="text-xs text-muted-foreground">
                    {t("detail.ai_no_cv")}
                  </p>
                ) : !hasLlmProvider ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {t("detail.ai_no_provider")}
                    </p>
                    <Link to="/settings">
                      <Button variant="outline" size="sm" className="w-full">
                        <Settings className="h-3.5 w-3.5 mr-2" />
                        {t("detail.ai_go_to_settings")}
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <>
                    <Link
                      to="/cv/$cvId/match/$jobId"
                      params={{ cvId: activeCv.id, jobId: job.id }}
                    >
                      <Button variant="outline" size="sm" className="w-full justify-start">
                        <FileSearch className="h-3.5 w-3.5 mr-2" />
                        {t("detail.ai_analyze_match")}
                      </Button>
                    </Link>
                    <Link
                      to="/generate/cv"
                      search={{ cv: activeCv.id, job: job.id }}
                    >
                      <Button variant="outline" size="sm" className="w-full justify-start">
                        <FileText className="h-3.5 w-3.5 mr-2" />
                        {t("detail.ai_generate_cv")}
                      </Button>
                    </Link>
                    <Link
                      to="/generate/cover-letter"
                      search={{ cv: activeCv.id, job: job.id }}
                    >
                      <Button variant="outline" size="sm" className="w-full justify-start">
                        <Mail className="h-3.5 w-3.5 mr-2" />
                        {t("detail.ai_generate_cover_letter")}
                      </Button>
                    </Link>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Company Info Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {t("detail.company_info")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="font-medium">{company?.name || job.company_name || job.company_id}</p>

                {company?.website && (
                  <button
                    className="flex items-center gap-1.5 text-primary hover:underline text-xs"
                    onClick={() => void handleOpenUrl(company.website)}
                  >
                    <Globe className="h-3 w-3" />
                    {t("detail.website")}
                  </button>
                )}

                {company?.careers_url && (
                  <button
                    className="flex items-center gap-1.5 text-primary hover:underline text-xs"
                    onClick={() => void handleOpenUrl(company.careers_url)}
                  >
                    <Briefcase className="h-3 w-3" />
                    {t("detail.careers_page")}
                  </button>
                )}

                {company?.glassdoor_url && (
                  <button
                    className="flex items-center gap-1.5 text-primary hover:underline text-xs"
                    onClick={() => void handleOpenUrl(company.glassdoor_url)}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Glassdoor
                  </button>
                )}

                {job.location && (
                  <p className="text-xs text-muted-foreground pt-1">
                    {t("detail.location")}: {job.location}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Similar Jobs Card */}
            {similarJobs.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {t("detail.similar_jobs")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {similarJobs.map((sj) => (
                    <button
                      key={sj.id}
                      className="w-full text-left p-2 rounded-md hover:bg-muted/50 transition-colors"
                      onClick={() =>
                        void navigate({
                          to: "/jobs/$jobId",
                          params: { jobId: sj.id },
                        })
                      }
                    >
                      <p className="text-sm font-medium leading-tight truncate">
                        {sj.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {sj.company_name || sj.company_id}
                      </p>
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Apply Dialog */}
      {job && (
        <ApplyDialog
          job={job}
          open={applyDialogOpen}
          onOpenChange={setApplyDialogOpen}
        />
      )}
    </PageContainer>
  );
}
