import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { useJobStore } from "@/stores/jobStore";
import { useCvStore } from "@/stores/cvStore";
import { pickDefaultCv } from "@/lib/cv/cv-document";
import { computeMatchScore } from "@/features/jobs/utils/matchScore";
import { JobCard } from "./JobCard";

const MAX_RECOMMENDED = 5;
const MIN_SCORE = 40;

export function RecommendedJobs() {
  const { t } = useTranslation("jobs");
  const jobs = useJobStore((s) => s.jobs);
  const activeCv = useCvStore((s) => s.activeCv);
  const cvs = useCvStore((s) => s.cvs);
  const cv = activeCv ?? pickDefaultCv(cvs);

  const ranked = useMemo(() => {
    if (!cv?.parsed_data) return [];
    return jobs
      .map((j) => ({ job: j, score: computeMatchScore(j, cv) }))
      .filter((r) => r.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECOMMENDED);
  }, [jobs, cv]);

  if (!cv?.parsed_data) {
    return (
      <div className="border-b bg-muted/30 px-4 py-3 text-xs text-muted-foreground flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5" />
        {t("recommended.empty_no_cv", {
          defaultValue: "Upload a CV in Settings to see personalized job recommendations.",
        })}
      </div>
    );
  }

  if (ranked.length === 0) return null;

  return (
    <div className="border-b">
      <div className="flex items-center gap-2 px-4 pt-3 pb-1">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("recommended.title", { defaultValue: "Recommended for you" })}
        </h3>
      </div>
      <div>
        {ranked.map(({ job, score }) => (
          <JobCard key={job.id} job={job} matchScore={score} />
        ))}
      </div>
    </div>
  );
}
