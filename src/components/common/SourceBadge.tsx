import { useTranslation } from "react-i18next";
import { Globe, BriefcaseBusiness, Building2, ClipboardPaste } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { JobSource } from "@/types";

interface SourceBadgeProps {
  source: JobSource;
}

const SOURCE_CONFIG: Record<
  JobSource,
  { icon: typeof Globe; colorClass: string }
> = {
  aggregator: {
    icon: Globe,
    colorClass: "text-indigo-600 border-indigo-300 dark:text-indigo-400 dark:border-indigo-700",
  },
  career_page: {
    icon: Building2,
    colorClass: "text-green-600 border-green-300 dark:text-green-400 dark:border-green-700",
  },
  // Job post the user pasted manually.
  manual: {
    icon: ClipboardPaste,
    colorClass: "text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-700",
  },
  // Active again since the server's Apify LinkedIn source.
  linkedin: {
    icon: BriefcaseBusiness,
    colorClass: "text-sky-600 border-sky-300 dark:text-sky-400 dark:border-sky-700",
  },
  // Legacy value — rendered for rows scraped before the browser-based
  // scrapers were removed. No active scraper emits this.
  google_jobs: {
    icon: Globe,
    colorClass: "text-blue-600 border-blue-300 dark:text-blue-400 dark:border-blue-700",
  },
};

export function SourceBadge({ source }: SourceBadgeProps) {
  const { t } = useTranslation("common");
  const config = SOURCE_CONFIG[source] ?? SOURCE_CONFIG.aggregator;
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={config.colorClass}>
      <Icon className="h-3 w-3" />
      {t(`job_sources.${source}`)}
    </Badge>
  );
}
