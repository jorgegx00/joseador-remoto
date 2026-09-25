import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  LayoutGrid,
  List,
  Briefcase,
  CalendarCheck,
  TrendingUp,
  Gift,
} from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { KanbanBoard } from "@/features/applications/components/KanbanBoard";
import { QuickApplyDialog } from "@/features/applications/components/QuickApplyDialog";
import { useApplications } from "@/features/applications/hooks/useApplications";
import type { ApplicationStatus } from "@/types";

const STATUS_OPTIONS: ApplicationStatus[] = [
  "saved",
  "applied",
  "phone_screen",
  "interviewing",
  "technical",
  "final",
  "offered",
  "accepted",
  "rejected",
  "withdrawn",
];

export function ApplicationsPage() {
  const { t } = useTranslation("applications");
  const { applications, stats, isLoading, reload } = useApplications();

  const [companySearch, setCompanySearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [quickApplyOpen, setQuickApplyOpen] = useState(false);

  const filteredApplications = useMemo(() => {
    let result = applications;

    if (companySearch.trim()) {
      const searchLower = companySearch.toLowerCase();
      result = result.filter(
        (app) =>
          app.company?.name?.toLowerCase().includes(searchLower) ||
          app.job?.title?.toLowerCase().includes(searchLower),
      );
    }

    if (statusFilter !== "all") {
      result = result.filter((app) => app.status === statusFilter);
    }

    return result;
  }, [applications, companySearch, statusFilter]);

  return (
    <PageContainer>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              {t("title")}
            </h2>
            {/* Stats bar */}
            <div className="flex gap-3 mt-2">
              <Badge variant="outline" className="gap-1.5 py-1">
                <Briefcase className="h-3.5 w-3.5" />
                {t("stats.total")}: {stats.total}
              </Badge>
              <Badge variant="outline" className="gap-1.5 py-1">
                <TrendingUp className="h-3.5 w-3.5" />
                {t("stats.this_week")}: {stats.thisWeek}
              </Badge>
              <Badge variant="outline" className="gap-1.5 py-1">
                <CalendarCheck className="h-3.5 w-3.5" />
                {t("stats.interviews_scheduled")}: {stats.interviewsScheduled}
              </Badge>
              <Badge variant="outline" className="gap-1.5 py-1">
                <Gift className="h-3.5 w-3.5" />
                {t("stats.offers")}: {stats.offers}
              </Badge>
            </div>
          </div>
          <Button onClick={() => setQuickApplyOpen(true)}>
            {t("new_application")}
          </Button>
        </div>

        {/* Filter bar */}
        <div className="flex gap-3">
          <Input
            placeholder={t("filters.search_company")}
            value={companySearch}
            onChange={(e) => setCompanySearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t("filters.all_statuses")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filters.all_statuses")}</SelectItem>
              {STATUS_OPTIONS.map((status) => (
                <SelectItem key={status} value={status}>
                  {t(`status.${status}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* View toggle */}
        <Tabs defaultValue="board">
          <TabsList>
            <TabsTrigger value="board" className="gap-2">
              <LayoutGrid className="h-4 w-4" />
              {t("view_toggle.kanban")}
            </TabsTrigger>
            <TabsTrigger value="list" className="gap-2">
              <List className="h-4 w-4" />
              {t("view_toggle.list")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="board" className="mt-4">
            {isLoading ? (
              <div className="flex gap-4 overflow-x-auto pb-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <LoadingSkeleton key={i} variant="kanban-column" />
                ))}
              </div>
            ) : filteredApplications.length === 0 && applications.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title={t("no_applications")}
                description={t("empty_description")}
                action={{
                  label: t("new_application"),
                  onClick: () => setQuickApplyOpen(true),
                }}
              />
            ) : (
              <KanbanBoard
                applications={filteredApplications}
                onReload={reload}
              />
            )}
          </TabsContent>

          <TabsContent value="list" className="mt-4">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <LoadingSkeleton key={i} variant="job-card" />
                ))}
              </div>
            ) : filteredApplications.length === 0 ? (
              <Card>
                <CardContent className="p-6">
                  <p className="text-muted-foreground text-center">
                    {t("no_applications")}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {filteredApplications.map((app) => (
                  <Card key={app.id} className="hover:bg-accent/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                            {(app.company?.name ?? "?").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium">
                              {app.job?.title ?? `Application #${app.id.slice(0, 8)}`}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {app.company?.name ?? ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <StatusBadge status={app.status} />
                          {app.cv && (
                            <Badge variant="secondary" className="text-xs">
                              {app.cv.name}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <QuickApplyDialog
        open={quickApplyOpen}
        onClose={async (created) => {
          setQuickApplyOpen(false);
          if (created) {
            await reload();
          }
        }}
      />
    </PageContainer>
  );
}
