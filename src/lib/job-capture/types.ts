import type { EmploymentType, SalaryPeriod } from "@/types";

/**
 * A job posting as extracted from a structured source (ATS API, schema.org
 * JobPosting) or page text — before it becomes a Job row.
 */
export interface CapturedJob {
  title: string;
  company: string;
  location: string;
  /** Plain text / light markdown (lists as "- "), never HTML. */
  description: string;
  employmentType: EmploymentType | null;
  salary: { min: number | null; max: number | null; currency: string | null; period: SalaryPeriod | null } | null;
  remote: boolean | null;
  /** ISO countries the posting says applicants may be in (schema.org applicantLocationRequirements). */
  applicantCountries: string[];
  postedAt: number | null;
  expiresAt: number | null;
  applyUrl: string | null;
  /** Where the data came from, most trustworthy first. */
  via: "ats_api" | "json_ld" | "text";
}

export function emptyCapturedJob(via: CapturedJob["via"]): CapturedJob {
  return {
    title: "",
    company: "",
    location: "",
    description: "",
    employmentType: null,
    salary: null,
    remote: null,
    applicantCountries: [],
    postedAt: null,
    expiresAt: null,
    applyUrl: null,
    via,
  };
}
