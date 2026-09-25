import { useTranslation } from "react-i18next";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AtsFixSuggestion } from "./AtsFixSuggestion";
import type { AtsIssue, AtsSeverity } from "@/types/ats";

interface AtsIssueListProps {
  issues: AtsIssue[];
}

const SEVERITY_ORDER: AtsSeverity[] = ["critical", "warning", "info"];

const SEVERITY_BADGE_CLASS: Record<AtsSeverity, string> = {
  critical: "",
  warning:
    "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  info: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
};

const SEVERITY_I18N: Record<AtsSeverity, string> = {
  critical: "ats.severity_critical",
  warning: "ats.severity_warning",
  info: "ats.severity_info",
};

const CHECK_NAME_KEYS: Record<string, string> = {
  keyword_match: "ats.check_keyword_match",
  format_compatibility: "ats.check_format_compatibility",
  section_structure: "ats.check_section_structure",
  contact_data: "ats.check_contact_data",
  consistency: "ats.check_consistency",
  spelling_grammar: "ats.check_spelling_grammar",
  length_density: "ats.check_length_density",
};

export function AtsIssueList({ issues }: AtsIssueListProps) {
  const { t } = useTranslation("cv");

  const grouped = SEVERITY_ORDER.reduce(
    (acc, sev) => {
      acc[sev] = issues.filter((i) => i.severity === sev);
      return acc;
    },
    {} as Record<AtsSeverity, AtsIssue[]>
  );

  const nonEmptySeverities = SEVERITY_ORDER.filter(
    (sev) => grouped[sev].length > 0
  );

  if (nonEmptySeverities.length === 0) {
    return null;
  }

  // Critical section expanded by default
  const defaultValues = grouped.critical.length > 0 ? ["critical"] : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {t("ats.issues_title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion
          type="multiple"
          defaultValue={defaultValues}
          className="w-full"
        >
          {nonEmptySeverities.map((severity) => (
            <AccordionItem key={severity} value={severity}>
              <AccordionTrigger className="py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {t(SEVERITY_I18N[severity])}
                  </span>
                  <Badge
                    variant={severity === "critical" ? "destructive" : "outline"}
                    className={cn(
                      "text-[10px]",
                      SEVERITY_BADGE_CLASS[severity]
                    )}
                  >
                    {grouped[severity].length}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  {grouped[severity].map((issue, idx) => (
                    <div
                      key={idx}
                      className="space-y-2 pb-3 last:pb-0 border-b last:border-b-0 border-border/50"
                    >
                      <div className="flex items-start gap-2">
                        <Badge
                          variant={
                            severity === "critical" ? "destructive" : "outline"
                          }
                          className={cn(
                            "text-[10px] shrink-0 mt-0.5",
                            SEVERITY_BADGE_CLASS[severity]
                          )}
                        >
                          {t(SEVERITY_I18N[severity])}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] shrink-0 mt-0.5">
                          {t(CHECK_NAME_KEYS[issue.check] ?? issue.check)}
                        </Badge>
                        <p className="text-sm leading-relaxed flex-1">
                          {issue.message}
                        </p>
                      </div>
                      {issue.fix && (
                        <div className="ml-0 md:ml-6">
                          <AtsFixSuggestion
                            fix={issue.fix}
                            severity={issue.severity}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
