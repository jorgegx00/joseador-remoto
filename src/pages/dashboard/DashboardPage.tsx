import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageContainer } from "@/components/layout/PageContainer";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboard } from "@/features/dashboard/hooks/useDashboard";
import { useApplicationStore } from "@/stores/applicationStore";
import { StatsCards } from "@/features/dashboard/components/StatsCards";
import { ApplicationFunnel } from "@/features/dashboard/components/ApplicationFunnel";
import { UpcomingInterviews } from "@/features/dashboard/components/UpcomingInterviews";
import { RecentJobs } from "@/features/dashboard/components/RecentJobs";
import { AtsScoreTrend } from "@/features/dashboard/components/AtsScoreTrend";
import { QuickActions } from "@/features/dashboard/components/QuickActions";
import { ActionList } from "@/features/dashboard/components/ActionList";
import { usePipelineActions, type ActionItem } from "@/features/dashboard/hooks/usePipelineActions";
import { MessageDraftDialog } from "@/features/applications/components/MessageDraftDialog";

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border p-6 space-y-3">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border p-6 flex flex-col items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-xl" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border p-6 space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-48 w-full" />
        </div>
        <div className="rounded-xl border p-6 space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { t } = useTranslation("dashboard");
  const {
    stats,
    upcomingInterviews,
    recentJobs,
    atsHistory,
    primaryCvName,
    isLoading,
  } = useDashboard();

  const { applications, interviews } = useApplicationStore();
  const { groups: actionGroups, total: actionTotal, reloadEvents } = usePipelineActions();
  const [draftFor, setDraftFor] = useState<ActionItem | null>(null);

  const greeting = primaryCvName
    ? t("welcome", { name: primaryCvName })
    : t("welcome_generic");

  if (isLoading && stats.totalJobs === 0 && applications.length === 0) {
    return (
      <PageContainer>
        <DashboardSkeleton />
      </PageContainer>
    );
  }

  const nextInterview = upcomingInterviews.length > 0 ? upcomingInterviews[0] : null;

  return (
    <PageContainer>
      <div className="space-y-6">
        {/* Welcome header */}
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{greeting}</h2>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>

        {/* What to do next: follow-ups, thank-yous, prep, possible ghosting */}
        <ActionList
          groups={actionGroups}
          total={actionTotal}
          onChanged={() => void reloadEvents()}
          onDraft={setDraftFor}
        />
        {draftFor && (
          <MessageDraftDialog
            open
            onOpenChange={(open) => !open && setDraftFor(null)}
            applicationId={draftFor.application_id}
            kind={draftFor.kind === "thank_you" ? "thank_you" : "follow_up"}
            interview={draftFor.interview}
            onSent={() => void reloadEvents()}
          />
        )}

        {/* Stats cards */}
        <StatsCards stats={stats} nextInterview={nextInterview} />

        {/* Quick actions */}
        <QuickActions />

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Application funnel */}
          <ApplicationFunnel applications={applications} interviews={interviews} />

          {/* Upcoming interviews */}
          <UpcomingInterviews interviews={upcomingInterviews} />
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent jobs */}
          <RecentJobs jobs={recentJobs} />

          {/* ATS score trend */}
          <AtsScoreTrend atsHistory={atsHistory} />
        </div>
      </div>
    </PageContainer>
  );
}
