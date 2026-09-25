import { useTranslation } from "react-i18next";
import { CheckCircle, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DrFriendlyBadgeProps {
  isFriendly: boolean;
  reason?: string;
}

export function DrFriendlyBadge({ isFriendly, reason }: DrFriendlyBadgeProps) {
  const { t } = useTranslation("common");

  const badge = isFriendly ? (
    <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900 dark:text-green-300 dark:border-green-800">
      <CheckCircle className="h-3 w-3" />
      {t("dr_friendly.dr_friendly")}
    </Badge>
  ) : (
    <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-300 dark:border-yellow-800">
      <AlertTriangle className="h-3 w-3" />
      {t("dr_friendly.check_eligibility")}
    </Badge>
  );

  if (reason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent className="max-w-64">
          <p>{reason}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return badge;
}
