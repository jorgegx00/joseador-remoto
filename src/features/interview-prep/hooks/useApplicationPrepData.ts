import { useEffect, useState } from "react";
import {
  getApplicationById,
  getCompanyById,
  getCvById,
  getInterviewsByApplicationId,
  getJobById,
} from "@/services/database";
import type { Application, Company, CvRecord, Interview, Job } from "@/types";

export interface ApplicationPrepData {
  application: Application | null;
  job: Job | null;
  company: Company | null;
  cv: CvRecord | null;
  interviews: Interview[];
  isLoading: boolean;
}

/** Application + job + company + CV + interviews for the prep and mock-interview pages. */
export function useApplicationPrepData(appId: string): ApplicationPrepData {
  const [data, setData] = useState<ApplicationPrepData>({
    application: null,
    job: null,
    company: null,
    cv: null,
    interviews: [],
    isLoading: true,
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setData((d) => ({ ...d, isLoading: true }));
      try {
        const application = await getApplicationById(appId);
        if (!application) {
          if (!cancelled) setData((d) => ({ ...d, application: null, isLoading: false }));
          return;
        }
        const [job, cv, interviews] = await Promise.all([
          getJobById(application.job_id).catch(() => null),
          getCvById(application.cv_id).catch(() => null),
          getInterviewsByApplicationId(appId).catch(() => []),
        ]);
        const company = job ? await getCompanyById(job.company_id).catch(() => null) : null;
        if (!cancelled) setData({ application, job, company, cv, interviews, isLoading: false });
      } catch (err) {
        console.error("Failed to load application prep data:", err);
        if (!cancelled) setData((d) => ({ ...d, isLoading: false }));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [appId]);

  return data;
}
