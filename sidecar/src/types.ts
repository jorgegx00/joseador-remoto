// Shared types between the sidecar and the main app.
// The sidecar's only remaining job is CV parsing — the scrape actions and
// their result types were removed along with the on-device scrapers.

export interface ScrapeCommand {
  action: "parse_cv";
  file_path?: string;
  file_type?: "pdf" | "docx";
  cv_id?: string;
}

export interface ScrapeResult {
  type: "cv_parsed" | "error" | "log";
  data: unknown;
}

export interface ParsedCvResult {
  full_name: string;
  email: string;
  phone: string;
  location: string;
  linkedin_url: string;
  github_url: string;
  portfolio_url: string;
  summary: string;
  skills: {
    technical: string[];
    soft: string[];
  };
  experience: Array<{
    company: string;
    location: string;
    title: string;
    start_date: string;
    end_date: string | null;
    description: string;
    achievements: string[];
    technologies: string[];
  }>;
  education: Array<{
    institution: string;
    location: string;
    degree: string;
    field: string;
    start_date: string;
    end_date: string;
    honors: string[];
  }>;
  certifications: string[];
  projects: Array<{
    name: string;
    description: string;
    achievements: string[];
    technologies: string[];
    url: string;
  }>;
  languages: Array<{
    name: string;
    level: "native" | "fluent" | "advanced" | "intermediate" | "basic";
    certification: string;
  }>;
}
