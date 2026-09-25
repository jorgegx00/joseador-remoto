import { useTranslation } from "react-i18next";
import {
  FileText,
  BarChart3,
  Star,
  Cpu,
  User,
  Eye,
  ArrowRight,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NarrativeScoreCard } from "./NarrativeScoreCard";
import type { NarrativeReport as NarrativeReportType } from "@/types";

interface NarrativeReportProps {
  report: NarrativeReportType;
}

export function NarrativeReport({ report }: NarrativeReportProps) {
  const { t } = useTranslation("llm");

  const scoreCards = [
    {
      title: t("narrative.summary_quality"),
      score: report.summary_score,
      feedback: report.summary_feedback,
      icon: FileText,
    },
    {
      title: t("narrative.achievement_quantification"),
      score: report.achievement_score,
      feedback: report.achievement_feedback,
      icon: BarChart3,
    },
    {
      title: t("narrative.star_format"),
      score: report.star_format_score,
      feedback: report.star_feedback,
      icon: Star,
    },
    {
      title: t("narrative.tech_per_role"),
      score: report.tech_per_role_score,
      feedback: report.tech_feedback,
      icon: Cpu,
    },
    {
      title: t("narrative.personalization"),
      score: report.personalization_score,
      feedback: report.personalization_feedback,
      icon: User,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Score cards in 2-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {scoreCards.map((card) => (
          <NarrativeScoreCard
            key={card.title}
            title={card.title}
            score={card.score}
            feedback={card.feedback}
            icon={card.icon}
          />
        ))}

        {/* Overall Impression - larger card spanning full width on md */}
        <Card className="md:col-span-2 border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              {t("narrative.overall_impression")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-foreground">
              {report.overall_impression}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Top Improvements */}
      {report.top_improvements.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">
            {t("narrative.top_improvements")}
          </h3>
          <div className="space-y-3">
            {report.top_improvements.map((improvement, idx) => (
              <Card key={idx}>
                <CardContent className="p-4">
                  <div className="space-y-3">
                    {/* Area badge */}
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {improvement.area}
                      </Badge>
                    </div>

                    {/* Before / After */}
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-start">
                      {/* Before */}
                      <div className="space-y-1">
                        <span className="text-xs font-medium text-red-600 dark:text-red-400">
                          {t("narrative.before")}
                        </span>
                        <div className="rounded-md bg-red-50 dark:bg-red-950/30 p-3 border border-red-100 dark:border-red-900">
                          <p className="text-sm text-red-900 dark:text-red-200">
                            {improvement.current}
                          </p>
                        </div>
                      </div>

                      {/* Arrow */}
                      <div className="hidden md:flex items-center justify-center pt-5">
                        <ArrowRight className="h-5 w-5 text-muted-foreground" />
                      </div>

                      {/* After */}
                      <div className="space-y-1">
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          {t("narrative.after")}
                        </span>
                        <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-3 border border-emerald-100 dark:border-emerald-900">
                          <p className="text-sm text-emerald-900 dark:text-emerald-200">
                            {improvement.suggested}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
