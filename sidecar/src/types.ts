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

/**
 * One logical line of a CV document with the layout signals the parsers need.
 * Wrapped continuation lines are already merged into the line they continue.
 * Mirrored in the app as `CvLayoutLine` (src/types/cv.ts).
 */
export interface CvLine {
  text: string;
  page: number;
  /** Font size relative to the document's body text (1 = body size). */
  size: number;
  /** 0 = at the column's left edge, 1 = indented (bullets, sub-lines). */
  indent: number;
  /** Horizontally centered (typical for names and contact lines). */
  centered: boolean;
  /** Vertical gap before the line relative to the normal line spacing (1 = normal). */
  gap: number;
  bold: boolean;
  /** Starts with a bullet glyph or is a list item (the glyph is stripped from `text`). */
  bullet: boolean;
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
