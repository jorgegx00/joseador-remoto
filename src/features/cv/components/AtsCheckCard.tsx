import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AtsFixSuggestion } from "./AtsFixSuggestion";
import type { AtsCheckResult } from "@/types/ats";

interface AtsCheckCardProps {
  check: AtsCheckResult;
  icon: LucideIcon;
}

function getScoreBadgeClass(score: number): string {
  if (score >= 75)
    return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900 dark:text-emerald-300 dark:border-emerald-800";
  if (score >= 50)
    return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900 dark:text-amber-300 dark:border-amber-800";
  return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900 dark:text-red-300 dark:border-red-800";
}

function getStatusText(score: number, t: (k: string) => string): string {
  if (score >= 75) return t("ats.pass");
  if (score >= 50) return t("ats.warning");
  return t("ats.fail");
}

const CHECK_NAME_KEYS: Record<string, string> = {
  keyword_match: "ats.check_keyword_match",
  format_compatibility: "ats.check_format_compatibility",
  section_structure: "ats.check_section_structure",
  contact_data: "ats.check_contact_data",
  consistency: "ats.check_consistency",
  spelling_grammar: "ats.check_spelling_grammar",
  length_density: "ats.check_length_density",
};

export function AtsCheckCard({ check, icon: Icon }: AtsCheckCardProps) {
  const { t } = useTranslation("cv");
  const [expanded, setExpanded] = useState(false);

  const nameKey = CHECK_NAME_KEYS[check.name] ?? check.name;
  const hasIssues = check.issues.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2 px-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium">{t(nameKey)}</span>
          </div>
          <Badge variant="outline" className={cn("text-xs", getScoreBadgeClass(check.score))}>
            {check.score}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2">
        <p className="text-xs text-muted-foreground">
          {getStatusText(check.score, t)}
          {hasIssues && (
            <span className="ml-1">
              {" - "}
              {t("ats.issues_found", { count: check.issues.length })}
            </span>
          )}
        </p>

        {hasIssues && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs w-full justify-between"
              onClick={() => setExpanded(!expanded)}
            >
              <span>
                {t("ats.details")} ({check.issues.length} {t("ats.findings")})
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-200",
                  expanded && "rotate-180"
                )}
              />
            </Button>

            {expanded && (
              <div className="space-y-2 pt-1">
                {check.issues.map((issue, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex items-start gap-2">
                      <Badge
                        variant={
                          issue.severity === "critical" ? "destructive" : "outline"
                        }
                        className={cn(
                          "text-[10px] shrink-0 mt-0.5",
                          issue.severity === "warning" &&
                            "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
                          issue.severity === "info" &&
                            "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
                        )}
                      >
                        {t(`ats.severity_${issue.severity}`)}
                      </Badge>
                      <p className="text-xs leading-relaxed">{issue.message}</p>
                    </div>
                    {issue.fix && (
                      <AtsFixSuggestion fix={issue.fix} severity={issue.severity} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
