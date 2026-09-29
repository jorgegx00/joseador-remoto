export type CvExportFormat = "pdf" | "docx" | "md";

export interface CvExportMeta {
  title: string;
  author: string;
  subject?: string;
  keywords?: string[];
  /** Paper size of the target market (US/CA/PR/MX… Letter, most others A4). Default Letter. */
  pageSize?: "LETTER" | "A4";
}
