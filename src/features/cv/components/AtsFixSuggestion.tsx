import { useTranslation } from "react-i18next";
import { Lightbulb } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AtsSeverity } from "@/types/ats";

interface AtsFixSuggestionProps {
  fix: string;
  severity: AtsSeverity;
}

const SEVERITY_BG: Record<AtsSeverity, string> = {
  critical: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900",
  warning:
    "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900",
  info: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900",
};

const SEVERITY_ICON_COLOR: Record<AtsSeverity, string> = {
  critical: "text-red-500",
  warning: "text-amber-500",
  info: "text-blue-500",
};

export function AtsFixSuggestion({ fix, severity }: AtsFixSuggestionProps) {
  const { t } = useTranslation("cv");

  return (
    <Card className={cn("border", SEVERITY_BG[severity])}>
      <CardContent className="p-3 flex items-start gap-2.5">
        <Lightbulb
          className={cn("h-4 w-4 mt-0.5 shrink-0", SEVERITY_ICON_COLOR[severity])}
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground mb-0.5">
            {t("ats.fix_lightbulb")}
          </p>
          <p className="text-sm leading-relaxed">{fix}</p>
        </div>
      </CardContent>
    </Card>
  );
}
