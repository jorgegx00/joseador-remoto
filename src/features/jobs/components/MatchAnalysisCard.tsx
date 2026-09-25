import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { FileSearch, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MatchScoreGauge } from "@/components/common/MatchScoreGauge";
import { useCvStore } from "@/stores/cvStore";
import { insertAtsReport } from "@/services/database";
import { getCvPlainText } from "@/lib/cv/cv-document";
import { toast } from "sonner";
import { ulid } from "ulid";
import type { Job } from "@/types/job";
import type { CvRecord } from "@/types/cv";
import type { AtsReport } from "@/types/ats";

interface MatchAnalysisCardProps {
  job: Job;
  cv?: CvRecord;
}

export function MatchAnalysisCard({ job, cv }: MatchAnalysisCardProps) {
  const { t } = useTranslation("cv");
  const { t: tJobs } = useTranslation("jobs");
  const { currentAtsReport, setCurrentAtsReport } = useCvStore();
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Check if we have a report for this job
  const matchingReport =
    currentAtsReport?.job_id === job.id ? currentAtsReport : null;

  const handleAnalyze = useCallback(async () => {
    if (!cv) return;
    setIsAnalyzing(true);
    try {
      const { runAtsSimulation } = await import("@/lib/ats");
      const result = await runAtsSimulation(cv.parsed_data, getCvPlainText(cv), job);

      const newReport: AtsReport = {
        ...result,
        id: ulid(),
        cv_id: cv.id,
        job_id: job.id,
      };

      await insertAtsReport(newReport);
      setCurrentAtsReport(newReport);
      toast.success(t("ats.analysis_complete"));
    } catch {
      toast.error(t("ats.analysis_error"));
    } finally {
      setIsAnalyzing(false);
    }
  }, [cv, job, setCurrentAtsReport, t]);

  // No CV loaded
  if (!cv) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileSearch className="h-4 w-4" />
            {t("ats.match_analysis")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-3">
              {t("ats.upload_cv_for_match")}
            </p>
            <Link to="/cv">
              <Button variant="outline" size="sm">
                {t("common:nav.cv")}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  // CV loaded but no analysis
  if (!matchingReport) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileSearch className="h-4 w-4" />
            {t("ats.match_analysis")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground mb-3">
              {cv.name}
            </p>
            <Button
              size="sm"
              onClick={() => void handleAnalyze()}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  {t("ats.analyzing")}
                </>
              ) : (
                <>
                  <FileSearch className="h-4 w-4 mr-2" />
                  {t("ats.analyze_match")}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Analysis exists
  const matchedSkills = matchingReport.keyword_matches.matched.slice(0, 3);
  const missingSkills = matchingReport.keyword_matches.missing.slice(0, 3);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FileSearch className="h-4 w-4" />
          {t("ats.match_analysis")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-center">
          <MatchScoreGauge score={matchingReport.ats_score} size="md" animated />
        </div>

        {/* Top matched skills */}
        {matchedSkills.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              {tJobs("detail.matched_skills")}
            </p>
            <div className="flex flex-wrap gap-1">
              {matchedSkills.map((kw) => (
                <Badge
                  key={kw.keyword}
                  variant="outline"
                  className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
                >
                  {kw.keyword}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Top missing skills */}
        {missingSkills.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              {tJobs("detail.missing_skills")}
            </p>
            <div className="flex flex-wrap gap-1">
              {missingSkills.map((kw) => (
                <Badge
                  key={kw.keyword}
                  variant="outline"
                  className="text-[10px] bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800"
                >
                  {kw.keyword}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Link to full analysis */}
        <Link
          to="/cv/$cvId/ats/$jobId"
          params={{ cvId: matchingReport.cv_id, jobId: job.id }}
        >
          <Button variant="link" size="sm" className="px-0 h-auto text-xs">
            {tJobs("detail.full_analysis")}
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
