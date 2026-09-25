import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useRouterState } from "@tanstack/react-router";
import { Search, Bell, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { OllamaStatusChip } from "./OllamaStatusChip";

interface BreadcrumbItem {
  label: string;
  path: string;
  isLast: boolean;
}

const ROUTE_LABEL_MAP: Record<string, string> = {
  "": "breadcrumb.home",
  jobs: "breadcrumb.jobs",
  cv: "breadcrumb.cv",
  applications: "breadcrumb.applications",
  interviews: "breadcrumb.interviews",
  settings: "breadcrumb.settings",
  prep: "breadcrumb.interview_prep",
  ats: "breadcrumb.ats_report",
};

export function Header() {
  const { t } = useTranslation("common");
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const breadcrumbs = useMemo((): BreadcrumbItem[] => {
    const segments = currentPath.split("/").filter(Boolean);

    if (segments.length === 0) {
      return [{ label: t("breadcrumb.home"), path: "/", isLast: true }];
    }

    const items: BreadcrumbItem[] = [
      { label: t("breadcrumb.home"), path: "/", isLast: false },
    ];

    let cumulativePath = "";
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      cumulativePath += `/${segment}`;
      const isLast = i === segments.length - 1;

      const labelKey = ROUTE_LABEL_MAP[segment];
      let label: string;
      if (labelKey) {
        label = t(labelKey);
      } else {
        // For dynamic segments (IDs), show a descriptive label based on parent
        const parentSegment = segments[i - 1];
        if (parentSegment === "jobs") {
          label = t("breadcrumb.job_detail");
        } else if (parentSegment === "cv") {
          label = t("breadcrumb.cv_detail");
        } else if (parentSegment === "applications") {
          label = t("breadcrumb.application_detail");
        } else {
          label = segment;
        }
      }

      items.push({ label, path: cumulativePath, isLast });
    }

    return items;
  }, [currentPath, t]);

  const unreadCount = 0;

  return (
    <header className="h-14 border-b border-border bg-background flex items-center justify-between px-6 shrink-0">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 min-w-0">
        {breadcrumbs.map((crumb, index) => (
          <div key={crumb.path} className="flex items-center gap-1 min-w-0">
            {index > 0 && (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            {crumb.isLast ? (
              <span className="text-sm font-medium text-foreground truncate">
                {crumb.label}
              </span>
            ) : (
              <Link
                to={crumb.path}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors truncate"
              >
                {crumb.label}
              </Link>
            )}
          </div>
        ))}
      </nav>

      {/* Right actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Active local Ollama model status (renders only when relevant) */}
        <OllamaStatusChip />

        {/* Search trigger */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline text-muted-foreground">
                {t("actions.search")}
              </span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {t("search_command")}
              </Badge>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("actions.search")}</TooltipContent>
        </Tooltip>

        {/* Notification bell */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="relative">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] flex items-center justify-center"
                >
                  {unreadCount}
                </Badge>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("notifications")}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
