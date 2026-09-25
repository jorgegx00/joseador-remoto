import { create } from "zustand";
import {
  getFilteredJobs,
  getAllJobs,
  getJobById,
  getAllCompanies,
  getCompanyBlacklist,
  setCompanyBlacklist,
} from "@/services/database";
import { computeMatchScore } from "@/features/jobs/utils/matchScore";
import { useCvStore } from "@/stores/cvStore";
import { pickDefaultCv } from "@/lib/cv/cv-document";
import type { Job, JobFilters, Company } from "@/types";

interface JobState {
  jobs: Job[];
  /** Unfiltered snapshot used to build filter facets (so they don't collapse as filters apply). */
  allJobs: Job[];
  companies: Company[];
  selectedJob: Job | null;
  selectedCompany: Company | null;
  filters: JobFilters;
  /** Blacklisted company names. Their jobs are hidden from every list (display-time filter). */
  blacklist: string[];
  isLoading: boolean;
  error: string | null;
  totalCount: number;

  setJobs: (jobs: Job[]) => void;
  setCompanies: (companies: Company[]) => void;
  selectJob: (job: Job | null) => void;
  selectCompany: (company: Company | null) => void;
  setFilters: (filters: Partial<JobFilters>) => void;
  resetFilters: () => void;
  fetchJobs: () => Promise<void>;
  fetchAllJobs: () => Promise<void>;
  fetchCompanies: () => Promise<void>;
  loadBlacklist: () => Promise<void>;
  setBlacklist: (names: string[] | null) => Promise<void>;
  getJob: (id: string) => Promise<Job | null>;
  drFriendlyJobs: () => Job[];
  jobsBySource: (source: string) => Job[];
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

const defaultFilters: JobFilters = {
  search: "",
  sources: [],
  // Jobs are ingested unfiltered (DR-friendliness is a flag, not a gate), so
  // the list view defaults to the DR-friendly slice; users can tighten to
  // explicit LATAM/DR only, or loosen to all.
  drFilter: "dr_friendly",
  seniorityLevels: [],
  employmentTypes: [],
  salaryMin: null,
  salaryMax: null,
  companies: [],
  skills: [],
  languages: [],
  frameworks: [],
  roles: [],
  datePosted: "all_time",
  sortBy: "newest",
};

export const useJobStore = create<JobState>((set, get) => ({
  jobs: [],
  allJobs: [],
  companies: [],
  selectedJob: null,
  selectedCompany: null,
  filters: defaultFilters,
  blacklist: [],
  isLoading: false,
  error: null,
  totalCount: 0,

  setJobs: (jobs) => set({ jobs, totalCount: jobs.length }),
  setCompanies: (companies) => set({ companies }),
  selectJob: (job) => set({ selectedJob: job }),
  selectCompany: (company) => set({ selectedCompany: company }),

  setFilters: (partial) => {
    set((state) => ({ filters: { ...state.filters, ...partial } }));
    // Re-fetch with new filters
    get().fetchJobs();
  },

  resetFilters: () => {
    set({ filters: defaultFilters });
    get().fetchJobs();
  },

  fetchJobs: async () => {
    set({ isLoading: true, error: null });
    try {
      const { filters } = get();
      const hasActiveFilters =
        filters.search ||
        filters.sources.length > 0 ||
        filters.drFilter !== "all" ||
        filters.seniorityLevels.length > 0 ||
        filters.employmentTypes.length > 0 ||
        filters.salaryMin !== null ||
        filters.salaryMax !== null ||
        filters.languages.length > 0 ||
        filters.frameworks.length > 0 ||
        filters.roles.length > 0 ||
        filters.datePosted !== "all_time";

      let jobs = hasActiveFilters
        ? await getFilteredJobs(filters)
        : await getAllJobs();

      if (filters.sortBy === "match_score") {
        const { activeCv, cvs } = useCvStore.getState();
        const cv = activeCv ?? pickDefaultCv(cvs);
        if (cv?.parsed_data) {
          jobs = [...jobs].sort(
            (a, b) => computeMatchScore(b, cv) - computeMatchScore(a, cv),
          );
        }
      }

      set({ jobs, totalCount: jobs.length, isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: String(err) });
    }
  },

  fetchAllJobs: async () => {
    try {
      const allJobs = await getAllJobs();
      set({ allJobs });
    } catch {
      // non-fatal — facets just stay empty
    }
  },

  fetchCompanies: async () => {
    set({ isLoading: true, error: null });
    try {
      const companies = await getAllCompanies();
      set({ companies, isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: String(err) });
    }
  },

  loadBlacklist: async () => {
    try {
      set({ blacklist: await getCompanyBlacklist() });
    } catch {
      // non-fatal — an empty blacklist just means nothing is hidden
    }
  },

  setBlacklist: async (names) => {
    // Persist (trims/de-dupes), reload the normalized value, then refresh the
    // list + facets so hidden companies disappear/reappear immediately.
    await setCompanyBlacklist(names ?? []);
    set({ blacklist: await getCompanyBlacklist() });
    await get().fetchJobs();
    await get().fetchAllJobs();
  },

  getJob: async (id: string) => {
    try {
      return await getJobById(id);
    } catch (err) {
      set({ error: String(err) });
      return null;
    }
  },

  drFriendlyJobs: () => {
    return get().jobs.filter((j) => j.is_dr_friendly);
  },

  jobsBySource: (source: string) => {
    return get().jobs.filter((j) => j.source === source);
  },

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
