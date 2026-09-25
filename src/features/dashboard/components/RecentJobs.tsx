import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { Briefcase, ArrowRight, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SourceBadge } from "@/components/common/SourceBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { formatDistanceToNow } from "date-fns";
import { es, enUS } from "date-fns/locale";
import type { Job } from "@/types";

interface RecentJobsProps {
  jobs: Job[];
}

export function RecentJobs({ jobs }: RecentJobsProps) {
  const { t, i18n } = useTranslation("dashboard");
  const navigate = useNavigate();
  const locale = i18n.language === "es" ? es : enUS;

  if (jobs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("recent_jobs.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Briefcase}
            title={t("recent_jobs.empty_title")}
            description={t("recent_jobs.empty_description")}
            action={{
              label: t("quick_actions.search_jobs"),
              onClick: () => void navigate({ to: "/jobs" }),
            }}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("recent_jobs.title")}</CardTitle>
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1"
            onClick={() => void navigate({ to: "/jobs" })}
          >
            {t("recent_jobs.view_all")}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() =>
                void navigate({
                  to: "/jobs/$jobId",
                  params: { jobId: job.id },
                })
              }
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  void navigate({
                    to: "/jobs/$jobId",
                    params: { jobId: job.id },
                  });
                }
              }}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500/10">
                <Briefcase className="h-4 w-4 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{job.title}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  {job.location && (
                    <span className="flex items-center gap-0.5">
                      <MapPin className="h-3 w-3" />
                      {job.location}
                    </span>
                  )}
                  <span>
                    {t("recent_jobs.posted", {
                      date: formatDistanceToNow(new Date(job.posted_at || job.created_at), {
                        addSuffix: true,
                        locale,
                      }),
                    })}
                  </span>
                </div>
              </div>
              <SourceBadge source={job.source} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
