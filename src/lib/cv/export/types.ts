export type CvExportFormat = "pdf" | "docx" | "md";

export interface CvExportMeta {
  title: string;
  author: string;
  subject?: string;
  keywords?: string[];
}
