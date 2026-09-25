import { useTranslation } from "react-i18next";
import { Briefcase, Send, Calendar, Trophy, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { es, enUS } from "date-fns/locale";
import type { DashboardStats } from "../hooks/useDashboard";
import type { Interview } from "@/types";

interface StatsCardsProps {
  stats: DashboardStats;
  nextInterview: Interview | null;
}

export function StatsCards({ stats, nextInterview }: StatsCardsProps) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = i18n.language === "es" ? es : enUS;

  const jobsTrend = stats.jobsThisWeek - stats.jobsLastWeek;

  const nextInterviewText = nextInterview
    ? t("stats.next_interview", {
        time: formatDistanceToNow(new Date(nextInterview.scheduled_at), {
          addSuffix: false,
          locale,
        }),
      })
    : t("stats.no_upcoming");

  const cards = [
    {
      icon: Briefcase,
      label: t("stats.total_jobs"),
      value: stats.totalJobs,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      sub: (
        <span className="flex items-center gap-1 text-xs">
          {jobsTrend > 0 ? (
            <ArrowUp className="h-3 w-3 text-green-500" />
          ) : jobsTrend < 0 ? (
            <ArrowDown className="h-3 w-3 text-red-500" />
          ) : (
            <Minus className="h-3 w-3 text-muted-foreground" />
          )}
          <span className={jobsTrend > 0 ? "text-green-600" : jobsTrend < 0 ? "text-red-600" : "text-muted-foreground"}>
            {jobsTrend > 0 ? "+" : ""}{jobsTrend}
          </span>
          <span className="text-muted-foreground">
            {t("stats.vs_last_week")}
          </span>
        </span>
      ),
    },
    {
      icon: Send,
      label: t("stats.applications_sent"),
      value: stats.applicationsSent,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
      sub: (
        <span className="text-xs text-muted-foreground">
          {stats.applicationsThisWeek} {t("stats.this_week")}
        </span>
      ),
    },
    {
      icon: Calendar,
      label: t("stats.interviews_scheduled"),
      value: stats.interviewsScheduled,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
      sub: (
        <span className="text-xs text-muted-foreground truncate">
          {nextInterviewText}
        </span>
      ),
    },
    {
      icon: Trophy,
      label: t("stats.offers"),
      value: stats.offers,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
      sub: null,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.label}
            </CardTitle>
            <div className={`rounded-lg p-2 ${card.bgColor}`}>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">{card.value}</div>
            {card.sub && <div className="mt-1">{card.sub}</div>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
