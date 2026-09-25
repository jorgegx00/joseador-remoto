import { useTranslation } from "react-i18next";
import { CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { MatchAnalysis } from "@/types";

interface SkillsOverlapProps {
  skills: MatchAnalysis["skills_match"];
}

export function SkillsOverlap({ skills }: SkillsOverlapProps) {
  const { t } = useTranslation("llm");

  const matchedSkills = skills.filter((s) => s.found);
  const missingCritical = skills.filter(
    (s) => !s.found && s.importance === "critical",
  );
  const missingImportant = skills.filter(
    (s) => !s.found && s.importance === "important",
  );
  const missingNiceToHave = skills.filter(
    (s) => !s.found && s.importance === "nice_to_have",
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {t("match_analysis.skills_overlap")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Your Skills (matched) */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">
              {t("match_analysis.your_skills")}
            </h4>
            <div className="flex flex-wrap gap-2">
              {matchedSkills.length > 0 ? (
                matchedSkills.map((s) => (
                  <Badge
                    key={s.skill}
                    variant="outline"
                    className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
                  >
                    <CheckCircle className="h-3 w-3 mr-1" />
                    {s.skill}
                  </Badge>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t("match_analysis.no_strengths")}
                </p>
              )}
            </div>
          </div>

          {/* Required Skills */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">
              {t("match_analysis.required_skills")}
            </h4>
            <div className="flex flex-wrap gap-2">
              {/* Matched (green) */}
              {matchedSkills.map((s) => (
                <Badge
                  key={`req-${s.skill}`}
                  variant="outline"
                  className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {s.skill}
                </Badge>
              ))}

              {/* Missing critical (red) */}
              {missingCritical.map((s) => (
                <Badge
                  key={`req-${s.skill}`}
                  variant="outline"
                  className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800"
                >
                  <XCircle className="h-3 w-3 mr-1" />
                  {s.skill}
                  <span className="ml-1 text-[9px] opacity-70">
                    {t("match_analysis.critical")}
                  </span>
                </Badge>
              ))}

              {/* Missing important (red, lighter) */}
              {missingImportant.map((s) => (
                <Badge
                  key={`req-${s.skill}`}
                  variant="outline"
                  className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800"
                >
                  <XCircle className="h-3 w-3 mr-1" />
                  {s.skill}
                </Badge>
              ))}

              {/* Missing nice-to-have (yellow) */}
              {missingNiceToHave.map((s) => (
                <Badge
                  key={`req-${s.skill}`}
                  variant="outline"
                  className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {s.skill}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle className="h-3 w-3 text-emerald-500" />
            {t("match_analysis.matched")}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <XCircle className="h-3 w-3 text-red-500" />
            {t("match_analysis.missing")}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="h-3 w-3 text-amber-500" />
            {t("match_analysis.nice_to_have")}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
