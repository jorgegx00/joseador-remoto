import { useEffect, useState, useCallback } from "react";
import { useJobStore } from "@/stores/jobStore";
import { useCvStore } from "@/stores/cvStore";
import { useApplicationStore } from "@/stores/applicationStore";
import { getAllCvs, getAtsReportsByCvId } from "@/services/database";
import type { Job, Interview, AtsReport, CvRecord } from "@/types";

export interface DashboardStats {
  totalJobs: number;
  jobsLastWeek: number;
  jobsThisWeek: number;
  applicationsSent: number;
  applicationsThisWeek: number;
  interviewsScheduled: number;
  offers: number;
}

export interface AtsDataPoint {
  date: number;
  score: number;
  cvName: string;
  cvId: string;
}

export interface DashboardData {
  stats: DashboardStats;
  upcomingInterviews: Interview[];
  recentJobs: Job[];
  atsHistory: AtsDataPoint[];
  primaryCvName: string;
  cvs: CvRecord[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useDashboard(): DashboardData {
  const {
    jobs,
    fetchJobs,
    isLoading: jobsLoading,
  } = useJobStore();

  const {
    cvs,
    fetchCvs,
    isLoading: cvsLoading,
  } = useCvStore();

  const {
    applications,
    interviews,
    fetchApplications,
    fetchInterviews,
    getUpcomingInterviews,
    isLoading: appsLoading,
  } = useApplicationStore();

  const [atsHistory, setAtsHistory] = useState<AtsDataPoint[]>([]);
  const [atsLoading, setAtsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAtsHistory = useCallback(async () => {
    setAtsLoading(true);
    try {
      const allCvs = await getAllCvs();
      const allPoints: AtsDataPoint[] = [];

      for (const cv of allCvs) {
        const reports: AtsReport[] = await getAtsReportsByCvId(cv.id);
        for (const report of reports) {
          allPoints.push({
            date: report.created_at,
            score: report.ats_score,
            cvName: cv.name,
            cvId: cv.id,
          });
        }
      }

      allPoints.sort((a, b) => a.date - b.date);
      setAtsHistory(allPoints);
    } catch (err) {
      setError(String(err));
    } finally {
      setAtsLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      await Promise.all([
        fetchJobs(),
        fetchCvs(),
        fetchApplications(),
        fetchInterviews(),
        loadAtsHistory(),
      ]);
    } catch (err) {
      setError(String(err));
    }
  }, [fetchJobs, fetchCvs, fetchApplications, fetchInterviews, loadAtsHistory]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Compute stats
  const now = Date.now();
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;

  const jobsThisWeek = jobs.filter((j) => j.created_at >= oneWeekAgo).length;
  const jobsLastWeek = jobs.filter(
    (j) => j.created_at >= twoWeeksAgo && j.created_at < oneWeekAgo,
  ).length;

  const applicationsSent = applications.filter(
    (a) => a.status !== "saved",
  ).length;
  const applicationsThisWeek = applications.filter(
    (a) => a.status !== "saved" && a.applied_at !== null && a.applied_at >= oneWeekAgo,
  ).length;

  const upcomingInterviews = getUpcomingInterviews();
  const interviewsScheduled = upcomingInterviews.length;

  const offers = applications.filter(
    (a) => a.status === "offered" || a.status === "accepted",
  ).length;

  // Recent jobs eligible for the user's markets (top 10)
  const recentJobs = [...jobs]
    .filter((j) => j.is_market_eligible)
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, 10);

  // Primary CV name
  const primaryCv = cvs.find((c) => c.is_primary);
  const primaryCvName = primaryCv?.parsed_data?.full_name || "";

  const stats: DashboardStats = {
    totalJobs: jobs.length,
    jobsLastWeek,
    jobsThisWeek,
    applicationsSent,
    applicationsThisWeek,
    interviewsScheduled,
    offers,
  };

  const isLoading = jobsLoading || cvsLoading || appsLoading || atsLoading;

  return {
    stats,
    upcomingInterviews: upcomingInterviews.slice(0, 5),
    recentJobs,
    atsHistory,
    primaryCvName,
    cvs,
    isLoading,
    error,
    refresh,
  };
}
