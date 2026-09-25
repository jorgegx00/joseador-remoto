import {
  createRouter,
  createRoute,
  createRootRoute,
  Outlet,
} from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { JobsPage } from "@/pages/jobs/JobsPage";
import { JobDetailPage } from "@/pages/jobs/JobDetailPage";
import { CvListPage } from "@/pages/cv/CvListPage";
import { CvDetailPage } from "@/pages/cv/CvDetailPage";
import { AtsReportPage } from "@/pages/cv/AtsReportPage";
import { ApplicationsPage } from "@/pages/applications/ApplicationsPage";
import { ApplicationDetailPage } from "@/pages/applications/ApplicationDetailPage";
import { InterviewPrepPage } from "@/pages/applications/InterviewPrepPage";
import { CalendarPage } from "@/pages/interviews/CalendarPage";
import { ReportsPage } from "@/pages/reports/ReportsPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";
import { CvGenerationPage } from "@/features/llm/components/CvGenerationPage";
import { CoverLetterPage } from "@/features/llm/components/CoverLetterPage";
import { MatchAnalysisPage } from "@/features/llm/components/MatchAnalysisPage";
import { useParams } from "@tanstack/react-router";

const rootRoute = createRootRoute({
  component: () => (
    <AppLayout>
      <Outlet />
    </AppLayout>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
});

const jobsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/jobs",
  component: JobsPage,
});

const jobDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/jobs/$jobId",
  component: JobDetailPage,
});

const cvListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cv",
  component: CvListPage,
});

const cvDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cv/$cvId",
  component: CvDetailPage,
});

const atsReportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cv/$cvId/ats",
  component: AtsReportPage,
});

const atsReportJobRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cv/$cvId/ats/$jobId",
  component: AtsReportPage,
});

function MatchAnalysisRouteComponent() {
  const { cvId, jobId } = useParams({ from: "/cv/$cvId/match/$jobId" });
  return <MatchAnalysisPage cvId={cvId} jobId={jobId} />;
}

const matchAnalysisRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cv/$cvId/match/$jobId",
  component: MatchAnalysisRouteComponent,
});

const applicationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/applications",
  component: ApplicationsPage,
});

const applicationDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/applications/$appId",
  component: ApplicationDetailPage,
});

const interviewPrepRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/applications/$appId/prep",
  component: InterviewPrepPage,
});

const interviewsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/interviews",
  component: CalendarPage,
});

const reportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reports",
  component: ReportsPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

interface GenerationSearch {
  cv?: string;
  job?: string;
}

function validateGenerationSearch(
  search: Record<string, unknown>,
): GenerationSearch {
  return {
    cv: typeof search.cv === "string" ? search.cv : undefined,
    job: typeof search.job === "string" ? search.job : undefined,
  };
}

const cvGenerationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/generate/cv",
  component: CvGenerationPage,
  validateSearch: validateGenerationSearch,
});

const coverLetterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/generate/cover-letter",
  component: CoverLetterPage,
  validateSearch: validateGenerationSearch,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  jobsRoute,
  jobDetailRoute,
  cvListRoute,
  cvDetailRoute,
  atsReportRoute,
  atsReportJobRoute,
  matchAnalysisRoute,
  applicationsRoute,
  applicationDetailRoute,
  interviewPrepRoute,
  interviewsRoute,
  reportsRoute,
  settingsRoute,
  cvGenerationRoute,
  coverLetterRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
