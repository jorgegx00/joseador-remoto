import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Briefcase, ClipboardPaste } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageContainer } from "@/components/layout/PageContainer";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { JobFilters } from "@/features/jobs/components/JobFilters";
import { JobSearchBar } from "@/features/jobs/components/JobSearchBar";
import { JobCard } from "@/features/jobs/components/JobCard";
import { RecommendedJobs } from "@/features/jobs/components/RecommendedJobs";
import { ScrapeControls } from "@/features/jobs/components/ScrapeControls";
import { PasteJobDialog } from "@/features/jobs/components/PasteJobDialog";
import { useJobs } from "@/features/jobs/hooks/useJobs";
import { useJobFilters } from "@/features/jobs/hooks/useJobFilters";
import { deriveJobTags } from "@/features/jobs/utils/jobTaxonomy";
import type { Job, JobFilters as JobFiltersType } from "@/types";

const SORT_OPTIONS: { value: JobFiltersType["sortBy"]; key: string }[] = [
  { value: "newest", key: "sort.newest" },
  { value: "match_score", key: "sort.match_score" },
  { value: "salary_desc", key: "sort.salary_high" },
  { value: "company_asc", key: "sort.company_az" },
];

type GroupBy = "none" | "role" | "language" | "framework";
const GROUP_OPTIONS: { value: GroupBy; key: string }[] = [
  { value: "none", key: "group_by.none" },
  { value: "role", key: "group_by.role" },
  { value: "language", key: "group_by.language" },
  { value: "framework", key: "group_by.framework" },
];

// A grouped list is flattened into header + job rows so it can still virtualize.
type ListRow =
  | { type: "header"; key: string; label: string; count: number }
  | { type: "job"; key: string; job: Job };

const GROUP_DIMENSION: Record<Exclude<GroupBy, "none">, "roles" | "languages" | "frameworks"> = {
  role: "roles",
  language: "languages",
  framework: "frameworks",
};
const OTHER_GROUP = "__other__";

export function JobsPage() {
  const { t } = useTranslation("jobs");
  const { jobs, totalCount, isLoading, drFriendlyCount } = useJobs();
  const { filters, setSortBy, hasActiveFilters } = useJobFilters();
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [pasteOpen, setPasteOpen] = useState(false);
  const showRecommended = !hasActiveFilters && !filters.search && groupBy === "none";

  // Flatten the (already sorted/filtered) list into header + job rows when grouping,
  // so the virtualizer still handles arbitrarily long lists. A job with several tags
  // in the grouped dimension appears under each; untagged jobs fall into "Other".
  const rows = useMemo<ListRow[]>(() => {
    if (groupBy === "none") {
      return jobs.map((job) => ({ type: "job", key: job.id, job }));
    }
    const dim = GROUP_DIMENSION[groupBy];
    const groups = new Map<string, Job[]>();
    for (const job of jobs) {
      const tags = deriveJobTags(job)[dim];
      const keys = tags.length > 0 ? tags : [OTHER_GROUP];
      for (const k of keys) {
        const arr = groups.get(k);
        if (arr) arr.push(job);
        else groups.set(k, [job]);
      }
    }
    const ordered = Array.from(groups.entries()).sort((a, b) => {
      if (a[0] === OTHER_GROUP) return 1;
      if (b[0] === OTHER_GROUP) return -1;
      return b[1].length - a[1].length || a[0].localeCompare(b[0]);
    });
    const out: ListRow[] = [];
    for (const [key, groupJobs] of ordered) {
      const label =
        key === OTHER_GROUP
          ? t("group_by.other")
          : groupBy === "role"
            ? t(`roles.${key}`)
            : key;
      out.push({ type: "header", key: `h-${key}`, label, count: groupJobs.length });
      for (const job of groupJobs) {
        out.push({ type: "job", key: `${key}-${job.id}`, job });
      }
    }
    return out;
  }, [jobs, groupBy, t]);

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (rows[index]?.type === "header" ? 44 : 140),
    overscan: 5,
  });

  return (
    <PageContainer className="p-0">
      <div className="flex h-full">
        {/* Sidebar Filters */}
        <aside className="hidden lg:block w-[280px] border-r p-4 overflow-hidden h-full">
          <JobFilters />
        </aside>

        {/* Main Area */}
        <div className="flex-1 flex flex-col h-full min-w-0">
          {/* Header Bar */}
          <div className="flex items-center justify-between gap-4 px-4 py-3 border-b flex-wrap">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">{t("title")}</h2>
              <Badge variant="secondary" className="text-xs">
                {t("header.showing_count", {
                  shown: jobs.length,
                  total: totalCount,
                  drFriendly: drFriendlyCount,
                })}
              </Badge>
            </div>

            <div className="flex items-center gap-3">
              <Select
                value={groupBy}
                onValueChange={(val) => setGroupBy(val as GroupBy)}
              >
                <SelectTrigger className="h-8 text-xs w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROUP_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {t(opt.key)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filters.sortBy}
                onValueChange={(val) =>
                  setSortBy(val as JobFiltersType["sortBy"])
                }
              >
                <SelectTrigger className="h-8 text-xs w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {t(opt.key)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPasteOpen(true)}
              >
                <ClipboardPaste className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                {t("paste.button")}
              </Button>
              <ScrapeControls />
            </div>
          </div>

          {/* Search Bar */}
          <div className="px-4 py-3 border-b">
            <JobSearchBar />
          </div>

          {/* Recommended (hidden when any filter or search is active) */}
          {showRecommended && <RecommendedJobs />}

          {/* Job List */}
          {isLoading ? (
            <div className="flex-1 p-4 space-y-3 overflow-auto">
              {Array.from({ length: 6 }).map((_, i) => (
                <LoadingSkeleton key={i} variant="job-card" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon={Briefcase}
                title={t("empty.title")}
                description={t("empty.description")}
                action={{ label: t("paste.button"), onClick: () => setPasteOpen(true) }}
              />
            </div>
          ) : (
            <div
              ref={parentRef}
              className="flex-1 overflow-auto"
            >
              <div
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  width: "100%",
                  position: "relative",
                }}
              >
                {virtualizer.getVirtualItems().map((virtualItem) => {
                  const row = rows[virtualItem.index];
                  if (!row) return null;
                  return (
                    <div
                      key={row.key}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: `${virtualItem.size}px`,
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      {row.type === "header" ? (
                        <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {row.label}
                          </span>
                          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                            {row.count}
                          </Badge>
                        </div>
                      ) : (
                        <JobCard job={row.job} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <PasteJobDialog open={pasteOpen} onOpenChange={setPasteOpen} mode="standalone" />
    </PageContainer>
  );
}
