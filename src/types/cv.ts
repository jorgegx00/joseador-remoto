export interface ParsedCv {
  full_name: string;
  email: string;
  phone: string;
  location: string;
  linkedin_url: string;
  github_url: string;
  portfolio_url: string;
  summary: string;
  skills: CvSkills;
  experience: CvExperience[];
  education: CvEducation[];
  certifications: string[];
  projects: CvProject[];
  languages: CvLanguage[];
  /**
   * Sections the structured model has no slot for (e.g. "Volunteer", "Awards").
   * Kept verbatim so a markdown → ParsedCv round trip never loses content.
   */
  extra_sections?: CvExtraSection[];
}

export interface CvExtraSection {
  heading: string;
  /** Markdown body of the section, without the heading line. */
  body: string;
}

export interface CvSkills {
  technical: string[];
  soft: string[];
}

export interface CvExperience {
  company: string;
  location: string;
  title: string;
  start_date: string;
  end_date: string | null;
  description: string;
  achievements: string[];
  technologies: string[];
}

export interface CvEducation {
  institution: string;
  location: string;
  degree: string;
  field: string;
  start_date: string;
  end_date: string;
  honors: string[];
}

export interface CvProject {
  name: string;
  description: string;
  achievements: string[];
  technologies: string[];
  url: string;
}

export interface CvLanguage {
  name: string;
  level: "native" | "fluent" | "advanced" | "intermediate" | "basic";
  certification: string;
}

/** "upload" = imported from a PDF/DOCX file; "tailored" = optimized for a job and saved from the generator. */
export type CvSource = "upload" | "tailored";

export type CvFileType = "pdf" | "docx" | "md";

export interface CvRecord {
  id: string;
  name: string;
  /** Empty for tailored CVs — their canonical content is `raw_text` (markdown). */
  file_path: string;
  file_type: CvFileType;
  raw_text: string;
  parsed_data: ParsedCv;
  is_primary: boolean;
  source: CvSource;
  /** Source CV a tailored CV was generated from. No FK: may dangle after deletes. */
  parent_cv_id: string | null;
  /** Job a tailored CV targets. No FK: jobs can be wiped while the CV survives. */
  target_job_id: string | null;
  target_job_title: string | null;
  target_company: string | null;
  generated_cv_id: string | null;
  created_at: number;
  updated_at: number;
}

/** Provenance fields are optional on insert (defaults: source "upload", nulls). */
export type NewCvRecord = Omit<
  CvRecord,
  | "created_at"
  | "updated_at"
  | "source"
  | "parent_cv_id"
  | "target_job_id"
  | "target_job_title"
  | "target_company"
  | "generated_cv_id"
> &
  Partial<
    Pick<
      CvRecord,
      | "source"
      | "parent_cv_id"
      | "target_job_id"
      | "target_job_title"
      | "target_company"
      | "generated_cv_id"
    >
  >;
