import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Bookmark, BookmarkCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SourceBadge } from "@/components/common/SourceBadge";
import { attributionFor } from "@/services/ingest/sources";
import { EligibilityBadge } from "@/components/common/EligibilityBadge";
import { formatMoneyRange } from "@/lib/format/money";
import type { Job } from "@/types";

interface JobCardProps {
  job: Job;
  matchScore?: number;
}

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

function getCompanyColor(name: string | null | undefined): string {
  if (!name) return "hsl(0, 0%, 50%)";
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 60%, 45%)`;
}

export function JobCard({ job, matchScore }: JobCardProps) {
  const { t } = useTranslation("jobs");
  const { t: tCommon, i18n } = useTranslation("common");
  const navigate = useNavigate();
  const [isBookmarked, setIsBookmarked] = useState(false);

  const handleClick = useCallback(() => {
    void navigate({ to: "/jobs/$jobId", params: { jobId: job.id } });
  }, [navigate, job.id]);

  const handleBookmark = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsBookmarked((prev) => !prev);
    },
    []
  );

  const postedDate = job.posted_at
    ? formatDistanceToNow(new Date(job.posted_at), { addSuffix: true })
    : null;

  const maxVisibleSkills = 5;
  const visibleSkills = job.skills_required.slice(0, maxVisibleSkills);
  const remainingSkillsCount = Math.max(
    0,
    job.skills_required.length - maxVisibleSkills
  );

  const companyLabel = job.company_name || job.company_id;
  const companyInitial = companyLabel ? companyLabel.charAt(0).toUpperCase() : "?";
  const avatarColor = getCompanyColor(companyLabel);

  return (
    <div
      className="flex items-start gap-4 p-4 border-b cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {/* Company Avatar */}
      <div
        className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm"
        style={{ backgroundColor: avatarColor }}
      >
        {companyInitial}
      </div>

      {/* Center Content */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Title */}
        <h3 className="font-medium text-sm leading-tight truncate">
          {job.title}
        </h3>

        {/* Company + Location */}
        <p className="text-xs text-muted-foreground truncate">
          {companyLabel} {job.location ? `\u00B7 ${job.location}` : ""}
        </p>

        {/* Badge Row */}
        <div className="flex flex-wrap items-center gap-1.5">
          <SourceBadge source={job.source} via={attributionFor(job)?.label} />
          <EligibilityBadge job={job} />
          <Badge
            variant="outline"
            className={
              SENIORITY_COLORS[job.seniority_level] ?? ""
            }
          >
            {t(`seniority.${job.seniority_level}`)}
          </Badge>
          <Badge variant="secondary">
            {t(`employment.${job.employment_type}`)}
          </Badge>
          {job.needs_recovery && (
            <Badge
              variant="outline"
              className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700 gap-1"
              title={t("card.needs_recovery_hint")}
            >
              <AlertTriangle className="h-3 w-3" />
              {t("card.needs_recovery")}
            </Badge>
          )}
        </div>

        {/* Skills Row */}
        {job.skills_required.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 pt-0.5">
            {visibleSkills.map((skill) => (
              <Badge
                key={skill}
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-5"
              >
                {skill}
              </Badge>
            ))}
            {remainingSkillsCount > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {t("card.skills_more", { count: remainingSkillsCount })}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right Section */}
      <div className="flex-shrink-0 flex flex-col items-end gap-1 text-right">
        {typeof matchScore === "number" && (
          <Badge
            variant="outline"
            className="bg-primary/10 text-primary border-primary/20 text-[10px] font-semibold"
          >
            {t("match_chip", { score: matchScore, defaultValue: "Match {{score}}%" })}
          </Badge>
        )}

        {/* Salary */}
        {(job.salary_min !== null || job.salary_max !== null) && (
          <span className="text-sm font-medium text-foreground whitespace-nowrap">
            {formatMoneyRange(job.salary_min, job.salary_max, job.salary_currency || "USD", {
              locale: i18n.language || "es",
              compact: true,
            })}
          </span>
        )}

        {/* Posted Date */}
        {postedDate && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {postedDate}
          </span>
        )}

        {/* Bookmark */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleBookmark}
          aria-label={
            isBookmarked
              ? tCommon("actions.save")
              : tCommon("actions.save")
          }
        >
          {isBookmarked ? (
            <BookmarkCheck className="h-4 w-4 text-primary" />
          ) : (
            <Bookmark className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
