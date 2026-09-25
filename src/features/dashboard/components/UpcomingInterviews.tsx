import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { Calendar, Briefcase } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { formatDistanceToNow, format, isToday, isTomorrow } from "date-fns";
import { es, enUS } from "date-fns/locale";
import type { Interview } from "@/types";

interface UpcomingInterviewsProps {
  interviews: Interview[];
}

export function UpcomingInterviews({ interviews }: UpcomingInterviewsProps) {
  const { t, i18n } = useTranslation("dashboard");
  const { t: tCommon } = useTranslation("common");
  const navigate = useNavigate();
  const locale = i18n.language === "es" ? es : enUS;

  function getCountdownText(scheduledAt: number): string {
    const date = new Date(scheduledAt);
    if (isToday(date)) {
      return t("upcoming_interviews.today_at", {
        time: format(date, "h:mm a", { locale }),
      });
    }
    if (isTomorrow(date)) {
      return t("upcoming_interviews.tomorrow_at", {
        time: format(date, "h:mm a", { locale }),
      });
    }
    return formatDistanceToNow(date, { addSuffix: true, locale });
  }

  const interviewTypeBadgeColor: Record<string, string> = {
    phone_screen: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
    technical: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    behavioral: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
    system_design: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
    hiring_manager: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    final: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    take_home: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  };

  if (interviews.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {t("upcoming_interviews.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Calendar}
            title={t("upcoming_interviews.empty_title")}
            description={t("upcoming_interviews.empty_description")}
            action={{
              label: t("upcoming_interviews.browse_jobs"),
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
        <CardTitle className="text-lg">
          {t("upcoming_interviews.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {interviews.map((interview) => {
            const scheduledDate = new Date(interview.scheduled_at);
            const badgeColor =
              interviewTypeBadgeColor[interview.interview_type] ?? "bg-gray-100 text-gray-700";

            return (
              <div
                key={interview.id}
                className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Briefcase className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className={badgeColor}>
                      {tCommon(`interview_types.${interview.interview_type}`)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>
                      {format(scheduledDate, "MMM d, yyyy h:mm a", { locale })}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {getCountdownText(interview.scheduled_at)}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void navigate({
                      to: "/applications/$appId/prep",
                      params: { appId: interview.application_id },
                      search: { interview: interview.id },
                    })
                  }
                >
                  {t("upcoming_interviews.prep")}
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
