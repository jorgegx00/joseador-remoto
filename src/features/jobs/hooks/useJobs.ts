import { useEffect } from "react";
import { useJobStore } from "@/stores/jobStore";

export function useJobs() {
  const {
    jobs,
    companies,
    totalCount,
    isLoading,
    error,
    filters,
    fetchJobs,
    fetchAllJobs,
    fetchCompanies,
    setFilters,
    resetFilters,
    eligibleJobs,
    selectJob,
    selectedJob,
    getJob,
  } = useJobStore();

  useEffect(() => {
    void fetchJobs();
    void fetchAllJobs();
    void fetchCompanies();
  }, [fetchJobs, fetchAllJobs, fetchCompanies]);

  const eligibleCount = jobs.filter((j) => j.is_market_eligible).length;

  const sourceCountMap: Record<string, number> = {};
  for (const job of jobs) {
    sourceCountMap[job.source] = (sourceCountMap[job.source] ?? 0) + 1;
  }

  const uniqueCompanyNames = Array.from(
    new Set(companies.map((c) => c.name))
  ).sort();

  return {
    jobs,
    companies,
    totalCount,
    isLoading,
    error,
    filters,
    eligibleCount,
    sourceCountMap,
    uniqueCompanyNames,
    fetchJobs,
    fetchCompanies,
    setFilters,
    resetFilters,
    eligibleJobs,
    selectJob,
    selectedJob,
    getJob,
  };
}
