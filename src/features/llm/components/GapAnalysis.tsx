import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface GapAnalysisProps {
  gaps: string[];
  strengths: string[];
}

export function GapAnalysis({ gaps, strengths }: GapAnalysisProps) {
  const { t } = useTranslation("llm");

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Gaps to Address */}
      <Card className="border-red-200 dark:border-red-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="h-4 w-4" />
            {t("match_analysis.gaps_to_address")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {gaps.length > 0 ? (
            <div className="space-y-2">
              {gaps.map((gap, idx) => (
                <Card
                  key={idx}
                  className="border-red-100 bg-red-50/50 dark:border-red-900 dark:bg-red-950/30"
                >
                  <CardContent className="p-3">
                    <div className="flex gap-2">
                      <span className="text-red-400 mt-0.5 shrink-0">
                        {"\u2022"}
                      </span>
                      <p className="text-sm text-red-900 dark:text-red-200">
                        {gap}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              {t("match_analysis.no_gaps")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Your Strengths */}
      <Card className="border-emerald-200 dark:border-emerald-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            {t("match_analysis.your_strengths")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {strengths.length > 0 ? (
            <div className="space-y-2">
              {strengths.map((strength, idx) => (
                <Card
                  key={idx}
                  className="border-emerald-100 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/30"
                >
                  <CardContent className="p-3">
                    <div className="flex gap-2">
                      <span className="text-emerald-400 mt-0.5 shrink-0">
                        {"\u2022"}
                      </span>
                      <p className="text-sm text-emerald-900 dark:text-emerald-200">
                        {strength}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              {t("match_analysis.no_strengths")}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
