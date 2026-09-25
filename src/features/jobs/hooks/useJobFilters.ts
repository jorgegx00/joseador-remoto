import { useCallback, useMemo } from "react";
import { useJobStore } from "@/stores/jobStore";
import { collectTagFacets } from "@/features/jobs/utils/jobTaxonomy";
import type { JobSource, SeniorityLevel, EmploymentType, JobFilters } from "@/types";

export function useJobFilters() {
  const { filters, setFilters, resetFilters, jobs, allJobs, companies } = useJobStore();

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.sources.length > 0) count++;
    if (filters.drFilter !== "all") count++;
    if (filters.seniorityLevels.length > 0) count++;
    if (filters.employmentTypes.length > 0) count++;
    if (filters.salaryMin !== null || filters.salaryMax !== null) count++;
    if (filters.companies.length > 0) count++;
    if (filters.skills.length > 0) count++;
    if (filters.roles.length > 0) count++;
    if (filters.languages.length > 0) count++;
    if (filters.frameworks.length > 0) count++;
    if (filters.datePosted !== "all_time") count++;
    return count;
  }, [filters]);

  const hasActiveFilters = activeFilterCount > 0;

  const toggleSource = useCallback(
    (source: JobSource) => {
      const current = filters.sources;
      const updated = current.includes(source)
        ? current.filter((s) => s !== source)
        : [...current, source];
      setFilters({ sources: updated });
    },
    [filters.sources, setFilters]
  );

  const setDrFilter = useCallback(
    (value: JobFilters["drFilter"]) => {
      setFilters({ drFilter: value });
    },
    [setFilters]
  );

  const toggleSeniority = useCallback(
    (level: SeniorityLevel) => {
      const current = filters.seniorityLevels;
      const updated = current.includes(level)
        ? current.filter((l) => l !== level)
        : [...current, level];
      setFilters({ seniorityLevels: updated });
    },
    [filters.seniorityLevels, setFilters]
  );

  const toggleEmploymentType = useCallback(
    (type: EmploymentType) => {
      const current = filters.employmentTypes;
      const updated = current.includes(type)
        ? current.filter((t) => t !== type)
        : [...current, type];
      setFilters({ employmentTypes: updated });
    },
    [filters.employmentTypes, setFilters]
  );

  const toggleTag = useCallback(
    (dimension: "roles" | "languages" | "frameworks", value: string) => {
      const current = filters[dimension];
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      setFilters({ [dimension]: updated });
    },
    [filters, setFilters]
  );

  const toggleRole = useCallback((value: string) => toggleTag("roles", value), [toggleTag]);
  const toggleLanguage = useCallback((value: string) => toggleTag("languages", value), [toggleTag]);
  const toggleFramework = useCallback((value: string) => toggleTag("frameworks", value), [toggleTag]);

  const setSalaryRange = useCallback(
    (min: number | null, max: number | null) => {
      setFilters({ salaryMin: min, salaryMax: max });
    },
    [setFilters]
  );

  const toggleCompany = useCallback(
    (companyId: string) => {
      const current = filters.companies;
      const updated = current.includes(companyId)
        ? current.filter((c) => c !== companyId)
        : [...current, companyId];
      setFilters({ companies: updated });
    },
    [filters.companies, setFilters]
  );

  const addSkill = useCallback(
    (skill: string) => {
      const trimmed = skill.trim();
      if (trimmed && !filters.skills.includes(trimmed)) {
        setFilters({ skills: [...filters.skills, trimmed] });
      }
    },
    [filters.skills, setFilters]
  );

  const removeSkill = useCallback(
    (skill: string) => {
      setFilters({ skills: filters.skills.filter((s) => s !== skill) });
    },
    [filters.skills, setFilters]
  );

  const setDatePosted = useCallback(
    (value: JobFilters["datePosted"]) => {
      setFilters({ datePosted: value });
    },
    [setFilters]
  );

  const setSortBy = useCallback(
    (value: JobFilters["sortBy"]) => {
      setFilters({ sortBy: value });
    },
    [setFilters]
  );

  const sourceCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const job of jobs) {
      map[job.source] = (map[job.source] ?? 0) + 1;
    }
    return map;
  }, [jobs]);

  const uniqueCompanyNames = useMemo(() => {
    return Array.from(new Set(companies.map((c) => c.name))).sort();
  }, [companies]);

  // Facets are derived from the unfiltered snapshot so the option lists don't
  // collapse to the current selection as tech filters are applied.
  const roleFacets = useMemo(() => collectTagFacets(allJobs, "roles"), [allJobs]);
  const languageFacets = useMemo(() => collectTagFacets(allJobs, "languages"), [allJobs]);
  const frameworkFacets = useMemo(() => collectTagFacets(allJobs, "frameworks"), [allJobs]);

  return {
    filters,
    activeFilterCount,
    hasActiveFilters,
    toggleSource,
    setDrFilter,
    toggleSeniority,
    toggleEmploymentType,
    toggleRole,
    toggleLanguage,
    toggleFramework,
    roleFacets,
    languageFacets,
    frameworkFacets,
    setSalaryRange,
    toggleCompany,
    addSkill,
    removeSkill,
    setDatePosted,
    setSortBy,
    resetFilters,
    sourceCountMap,
    uniqueCompanyNames,
    companies,
  };
}
