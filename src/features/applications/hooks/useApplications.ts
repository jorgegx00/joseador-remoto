import { useEffect, useState, useCallback, useMemo } from "react";
import { useApplicationStore } from "@/stores/applicationStore";
import { useJobStore } from "@/stores/jobStore";
import { useCvStore } from "@/stores/cvStore";
import { getJobById, getCompanyById, getCvById } from "@/services/database";
import type { Application, Interview } from "@/types";
import type { Job, Company } from "@/types";
import type { CvRecord } from "@/types";

export interface EnrichedApplication extends Application {
  job: Job | null;
  company: Company | null;
  cv: CvRecord | null;
  interviews: Interview[];
}

export function useApplications() {
  const {
    applications,
    interviews,
    isLoading,
    error,
    fetchApplications,
    fetchInterviews,
  } = useApplicationStore();

  const [enrichedApps, setEnrichedApps] = useState<EnrichedApplication[]>([]);
  const [isEnriching, setIsEnriching] = useState(false);

  // Load applications and interviews on mount
  useEffect(() => {
    void fetchApplications();
    void fetchInterviews();
  }, [fetchApplications, fetchInterviews]);

  // Enrich applications with related data
  useEffect(() => {
    if (applications.length === 0) {
      setEnrichedApps([]);
      return;
    }

    let cancelled = false;
    setIsEnriching(true);

    async function enrich() {
      const results: EnrichedApplication[] = [];

      for (const app of applications) {
        if (cancelled) return;

        const job = await getJobById(app.job_id).catch(() => null);
        const company = job
          ? await getCompanyById(job.company_id).catch(() => null)
          : null;
        const cv = await getCvById(app.cv_id).catch(() => null);
        const appInterviews = interviews.filter(
          (i) => i.application_id === app.id,
        );

        results.push({
          ...app,
          job,
          company,
          cv,
          interviews: appInterviews,
        });
      }

      if (!cancelled) {
        setEnrichedApps(results);
        setIsEnriching(false);
      }
    }

    void enrich();

    return () => {
      cancelled = true;
    };
  }, [applications, interviews]);

  const stats = useMemo(() => {
    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

    return {
      total: applications.length,
      thisWeek: applications.filter(
        (a) => a.created_at > oneWeekAgo,
      ).length,
      interviewsScheduled: interviews.filter(
        (i) => i.status === "scheduled" && i.scheduled_at > now,
      ).length,
      offers: applications.filter((a) => a.status === "offered").length,
    };
  }, [applications, interviews]);

  const reload = useCallback(async () => {
    await fetchApplications();
    await fetchInterviews();
  }, [fetchApplications, fetchInterviews]);

  return {
    applications: enrichedApps,
    rawApplications: applications,
    interviews,
    stats,
    isLoading: isLoading || isEnriching,
    error,
    reload,
  };
}
