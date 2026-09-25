import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { ApplicationStatus } from "@/types";

interface StatusBadgeProps {
  status: ApplicationStatus;
}

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  saved: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700",
  applied: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-800",
  phone_screen: "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900 dark:text-cyan-300 dark:border-cyan-800",
  interviewing: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900 dark:text-indigo-300 dark:border-indigo-800",
  technical: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900 dark:text-purple-300 dark:border-purple-800",
  final: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900 dark:text-violet-300 dark:border-violet-800",
  rejected: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900 dark:text-red-300 dark:border-red-800",
  offered: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900 dark:text-green-300 dark:border-green-800",
  accepted: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900 dark:text-emerald-300 dark:border-emerald-800",
  withdrawn: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-300 dark:border-yellow-800",
};

const DOT_COLORS: Record<ApplicationStatus, string> = {
  saved: "bg-gray-500",
  applied: "bg-blue-500",
  phone_screen: "bg-cyan-500",
  interviewing: "bg-indigo-500",
  technical: "bg-purple-500",
  final: "bg-violet-500",
  rejected: "bg-red-500",
  offered: "bg-green-500",
  accepted: "bg-emerald-500",
  withdrawn: "bg-yellow-500",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useTranslation("common");

  return (
    <Badge
      variant="outline"
      className={STATUS_COLORS[status]}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_COLORS[status]}`} />
      {t(`application_status.${status}`)}
    </Badge>
  );
}
