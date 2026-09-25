import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useParams, Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  Play,
  FileSearch,
  Search,
  FileCheck,
  Layout,
  Contact,
  Clock,
  SpellCheck,
  Scale,
  RefreshCw,
  BookOpen,
  Briefcase,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { ErrorState } from "@/components/common/ErrorState";
import { useCv } from "@/features/cv/hooks/useCv";
import { useCvStore } from "@/stores/cvStore";
import { useJobStore } from "@/stores/jobStore";
import { getAtsReportsByCvId, insertAtsReport } from "@/services/database";
import { getCvPlainText } from "@/lib/cv/cv-document";
import { toast } from "sonner";
import { ulid } from "ulid";

import { AtsScoreGauge } from "./AtsScoreGauge";
import { AtsCheckCard } from "./AtsCheckCard";
import { AtsKeywordMap } from "./AtsKeywordMap";
import { AtsIssueList } from "./AtsIssueList";
import { JobPicker } from "./JobPicker";

import type { AtsReport, AtsCheckName } from "@/types/ats";
import type { Job } from "@/types/job";

// Icon mapping for each check
const CHECK_ICON_MAP: Record<AtsCheckName, LucideIcon> = {
  keyword_match: Search,
  format_compatibility: FileCheck,
  section_structure: Layout,
  contact_data: Contact,
  consistency: Clock,
  spelling_grammar: SpellCheck,
  length_density: Scale,
};

export function AtsReportPageContent() {
  const { t } = useTranslation("cv");
  const params = useParams({ strict: false });
  const cvId = (params as Record<string, string>).cvId ?? "";
  const jobIdParam = (params as Record<string, string | undefined>).jobId;

  const { cv, isLoading: cvLoading, error: cvError, refetch: refetchCv } = useCv(cvId);
  const { setCurrentAtsReport } = useCvStore();
  const { getJob, fetchJobs, jobs } = useJobStore();

  const [report, setReport] = useState<AtsReport | null>(null);
  const [history, setHistory] = useState<AtsReport[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobPickerOpen, setJobPickerOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoadingReport, setIsLoadingReport] = useState(true);

  // Load jobs if not loaded
  useEffect(() => {
    if (jobs.length === 0) {
      void fetchJobs();
    }
  }, [jobs.length, fetchJobs]);

  // Load report history and set current
  useEffect(() => {
    let cancelled = false;
    async function loadReports() {
      setIsLoadingReport(true);
      try {
        const reports = await getAtsReportsByCvId(cvId);
        if (cancelled) return;

        setHistory(reports);

        if (jobIdParam) {
          // Find report matching the job
          const jobReport = reports.find((r) => r.job_id === jobIdParam);
          if (jobReport) {
            setReport(jobReport);
            setCurrentAtsReport(jobReport);
          }
          // Load job info
          const job = await getJob(jobIdParam);
          if (!cancelled && job) {
            setSelectedJob(job);
          }
        } else if (reports.length > 0) {
          // Use most recent report
          setReport(reports[0]);
          setCurrentAtsReport(reports[0]);
        }
      } catch {
        // Reports not available yet is fine
      } finally {
        if (!cancelled) setIsLoadingReport(false);
      }
    }
    void loadReports();
    return () => {
      cancelled = true;
    };
  }, [cvId, jobIdParam, getJob, setCurrentAtsReport]);

  const handleRunAnalysis = useCallback(
    async (job: Job | null) => {
      if (!cv) return;
      setIsAnalyzing(true);
      try {
        // Dynamic import -- the other agent is building this module
        const { runAtsSimulation } = await import("@/lib/ats");
        const result = await runAtsSimulation(cv.parsed_data, getCvPlainText(cv), job ?? undefined);

        // Assign an id and persist
        const newReport: AtsReport = {
          ...result,
          id: ulid(),
          cv_id: cvId,
          job_id: job?.id ?? null,
        };

        await insertAtsReport(newReport);
        setReport(newReport);
        setCurrentAtsReport(newReport);

        // Refresh history
        const reports = await getAtsReportsByCvId(cvId);
        setHistory(reports);

        toast.success(t("ats.analysis_complete"));
      } catch {
        toast.error(t("ats.analysis_error"));
      } finally {
        setIsAnalyzing(false);
      }
    },
    [cv, cvId, setCurrentAtsReport, t]
  );

  if (cvLoading || isLoadingReport) {
    return (
      <PageContainer>
        <div className="max-w-4xl">
          <LoadingSkeleton variant="detail-page" />
        </div>
      </PageContainer>
    );
  }

  if (cvError || !cv) {
    return (
      <PageContainer>
        <div className="max-w-4xl">
          <ErrorState
            error={cvError ?? t("common:errors.not_found")}
            onRetry={refetchCv}
          />
        </div>
      </PageContainer>
    );
  }

  const hasReport = report !== null;
  const hasKeywordData =
    hasReport &&
    report.job_id !== null &&
    (report.keyword_matches.matched.length > 0 ||
      report.keyword_matches.missing.length > 0);

  return (
    <PageContainer>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/cv/$cvId" params={{ cvId }}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t("common:actions.back")}
              </Button>
            </Link>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                {t("ats.title")}
              </h2>
              <p className="text-sm text-muted-foreground">{cv.name}</p>
              {selectedJob && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <Briefcase className="h-3.5 w-3.5" />
                  {t("ats.job_for_analysis")} {selectedJob.title}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* No Report State */}
        {!hasReport && !isAnalyzing && (
          <Card>
            <CardContent className="py-12 flex flex-col items-center gap-6">
              <FileSearch className="h-16 w-16 text-muted-foreground opacity-40" />
              <div className="text-center space-y-2">
                <p className="text-lg font-medium">{t("ats.no_report")}</p>
                <p className="text-sm text-muted-foreground max-w-md">
                  {t("ats.no_report_general_hint")}
                </p>
              </div>

              {/* Job selection */}
              {selectedJob ? (
                <Badge variant="secondary" className="text-sm py-1 px-3">
                  <Briefcase className="h-3.5 w-3.5 mr-1.5" />
                  {selectedJob.title} - {selectedJob.company_name || selectedJob.company_id}
                </Badge>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setJobPickerOpen(true)}
                >
                  <Briefcase className="h-4 w-4 mr-2" />
                  {t("ats.select_job")}
                </Button>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => void handleRunAnalysis(null)}
                  disabled={isAnalyzing}
                >
                  <Play className="h-4 w-4 mr-2" />
                  {t("ats.run_general")}
                </Button>
                <Button
                  onClick={() => void handleRunAnalysis(selectedJob)}
                  disabled={isAnalyzing || !selectedJob}
                >
                  <Play className="h-4 w-4 mr-2" />
                  {t("ats.run_job_specific")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Analyzing State */}
        {isAnalyzing && (
          <Card>
            <CardContent className="py-12 flex flex-col items-center gap-4">
              <RefreshCw className="h-10 w-10 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">
                {t("ats.analyzing")}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Report Content */}
        {hasReport && !isAnalyzing && (
          <>
            {/* Score Gauge */}
            <div className="flex justify-center py-4">
              <AtsScoreGauge score={report.ats_score} animated />
            </div>

            {/* Check Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {report.checks.map((check) => (
                <AtsCheckCard
                  key={check.name}
                  check={check}
                  icon={CHECK_ICON_MAP[check.name] ?? FileSearch}
                />
              ))}
            </div>

            {/* Keyword Map (job-specific only) */}
            {hasKeywordData && (
              <AtsKeywordMap keywordMatches={report.keyword_matches} />
            )}

            {/* Issue List */}
            {report.issues.length > 0 && (
              <AtsIssueList issues={report.issues} />
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                variant="outline"
                onClick={() => void handleRunAnalysis(selectedJob)}
                disabled={isAnalyzing}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {t("ats.rerun")}
              </Button>
              {!selectedJob && (
                <Button
                  variant="outline"
                  onClick={() => setJobPickerOpen(true)}
                >
                  <Briefcase className="h-4 w-4 mr-2" />
                  {t("ats.select_job")}
                </Button>
              )}
              {report.narrative_report && (
                <Button variant="outline">
                  <BookOpen className="h-4 w-4 mr-2" />
                  {t("ats.view_narrative")}
                </Button>
              )}
            </div>

            {/* History */}
            {history.length > 1 && (
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="history">
                  <AccordionTrigger className="py-3">
                    <span className="text-sm font-medium">
                      {t("ats.history_title")}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2">
                      {history.map((entry) => {
                        const date = formatDistanceToNow(
                          new Date(entry.created_at),
                          { addSuffix: true }
                        );
                        const isCurrent = entry.id === report.id;
                        return (
                          <button
                            key={entry.id}
                            className={`w-full text-left p-3 rounded-md border transition-colors ${
                              isCurrent
                                ? "border-primary bg-primary/5"
                                : "border-border hover:bg-muted/50"
                            }`}
                            onClick={() => {
                              setReport(entry);
                              setCurrentAtsReport(entry);
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant={isCurrent ? "default" : "outline"}
                                  className="text-xs"
                                >
                                  {entry.ats_score}
                                </Badge>
                                <span className="text-sm">
                                  {entry.job_id
                                    ? t("ats.history_with_job", {
                                        jobTitle: entry.job_id,
                                      })
                                    : t("ats.history_general")}
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {date}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            {history.length <= 1 && (
              <div className="text-center py-4">
                <p className="text-xs text-muted-foreground">
                  {t("ats.history_empty")}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Job Picker Dialog */}
      <JobPicker
        open={jobPickerOpen}
        onSelect={(job) => {
          setSelectedJob(job);
          setJobPickerOpen(false);
        }}
        onOpenChange={setJobPickerOpen}
      />
    </PageContainer>
  );
}
