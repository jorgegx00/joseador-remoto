import { useEffect, useRef } from "react";
import { getJobById } from "@/services/database";
import type { Job } from "@/types";

/**
 * Resolves `?job=<id>` into a Job. Tries the (filtered) job store first and falls back to
 * the database, so jobs hidden by the current Jobs-page filters — or pasted jobs — still
 * preselect.
 */
export function usePreselectedJob(
  searchJobId: string | undefined,
  jobs: Job[],
  selectedJob: Job | null,
  setSelectedJob: (job: Job) => void,
): void {
  const triedDb = useRef<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!searchJobId || selectedJob) return;
    const inStore = jobs.find((j) => j.id === searchJobId);
    if (inStore) {
      setSelectedJob(inStore);
      return;
    }
    // One DB lookup per id; not cancelled on re-render (the store list may update while
    // the lookup is in flight).
    if (triedDb.current === searchJobId) return;
    triedDb.current = searchJobId;
    void getJobById(searchJobId)
      .then((job) => {
        if (mounted.current && job) setSelectedJob(job);
      })
      .catch(() => undefined);
  }, [searchJobId, jobs, selectedJob, setSelectedJob]);
}
