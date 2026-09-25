import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MatchScoreGauge } from "@/components/common/MatchScoreGauge";

interface NarrativeScoreCardProps {
  title: string;
  score: number;
  feedback: string;
  icon: LucideIcon;
}

function getAccentColor(score: number): string {
  if (score >= 7) return "border-emerald-200 dark:border-emerald-800";
  if (score >= 5) return "border-amber-200 dark:border-amber-800";
  return "border-red-200 dark:border-red-800";
}

export function NarrativeScoreCard({
  title,
  score,
  feedback,
  icon: Icon,
}: NarrativeScoreCardProps) {
  const { t } = useTranslation("llm");

  // Normalize score from 0-10 to 0-100 for the gauge
  const normalizedScore = Math.round(score * 10);

  return (
    <Card className={getAccentColor(score)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-4">
          <div className="shrink-0 flex flex-col items-center gap-1">
            <MatchScoreGauge score={normalizedScore} size="sm" animated />
            <span className="text-[10px] text-muted-foreground">
              {score} {t("narrative.score_out_of")}
            </span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed flex-1">
            {feedback}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
