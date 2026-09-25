import { describe, it, expect } from "vitest";
import {
  buildCvExportFileName,
  defaultTailoredCvName,
  getCvExportMarkdown,
  getCvPlainText,
  hasParsedContent,
  pickDefaultCv,
} from "@/lib/cv/cv-document";
import { formatCvAsMarkdown } from "@/lib/cv/formatCvAsMarkdown";
import { minimalParsedCv, sampleParsedCv, sampleRawCvText } from "../fixtures/sample-cv";
import type { CvRecord } from "@/types/cv";

function makeCv(overrides: Partial<CvRecord> = {}): CvRecord {
  return {
    id: "cv-1",
    name: "My CV",
    file_path: "/tmp/cv.pdf",
    file_type: "pdf",
    raw_text: sampleRawCvText,
    parsed_data: sampleParsedCv,
    is_primary: false,
    source: "upload",
    parent_cv_id: null,
    target_job_id: null,
    target_job_title: null,
    target_company: null,
    generated_cv_id: null,
    created_at: 1_000,
    updated_at: 1_000,
    ...overrides,
  };
}

const TAILORED_MD = "# Juan Perez\n\n## Professional Summary\n\nTailored **summary** for Acme.\n";

describe("getCvExportMarkdown", () => {
  it("uses raw_text markdown for tailored CVs", () => {
    const cv = makeCv({ source: "tailored", file_type: "md", file_path: "", raw_text: TAILORED_MD });
    expect(getCvExportMarkdown(cv)).toBe(TAILORED_MD);
  });

  it("formats parsed_data for uploads and for tailored CVs with empty raw_text", () => {
    expect(getCvExportMarkdown(makeCv())).toBe(formatCvAsMarkdown(sampleParsedCv));
    expect(getCvExportMarkdown(makeCv({ source: "tailored", raw_text: "  \n" }))).toBe(
      formatCvAsMarkdown(sampleParsedCv),
    );
  });
});

describe("getCvPlainText", () => {
  it("strips markdown from tailored CVs", () => {
    const text = getCvPlainText(makeCv({ source: "tailored", raw_text: TAILORED_MD }));
    expect(text).toBe("Juan Perez\n\nProfessional Summary\n\nTailored summary for Acme.\n");
  });

  it("returns the extracted text for uploads as-is", () => {
    expect(getCvPlainText(makeCv())).toBe(sampleRawCvText);
  });

  it("falls back to the formatted parsed data when raw_text is empty", () => {
    const text = getCvPlainText(makeCv({ raw_text: "" }));
    expect(text).toContain("Juan Perez");
    expect(text).toContain("Senior Software Engineer at ABC Tech");
    expect(text).not.toContain("**");
  });
});

describe("hasParsedContent", () => {
  it("detects name, roles, skills or education", () => {
    expect(hasParsedContent(makeCv())).toBe(true);
    expect(hasParsedContent(makeCv({ parsed_data: minimalParsedCv }))).toBe(false);
    expect(
      hasParsedContent(makeCv({ parsed_data: { ...minimalParsedCv, full_name: "  " } })),
    ).toBe(false);
    expect(
      hasParsedContent(
        makeCv({ parsed_data: { ...minimalParsedCv, skills: { technical: [], soft: ["Grit"] } } }),
      ),
    ).toBe(true);
    expect(
      hasParsedContent(makeCv({ parsed_data: { ...minimalParsedCv, education: sampleParsedCv.education } })),
    ).toBe(true);
  });
});

describe("defaultTailoredCvName", () => {
  it("builds prefix – title @ company", () => {
    expect(defaultTailoredCvName("CV optimizado", "Backend Engineer", "Acme")).toBe(
      "CV optimizado – Backend Engineer @ Acme",
    );
  });

  it("omits the company when empty or unknown", () => {
    expect(defaultTailoredCvName("Tailored CV", "Backend Engineer", null)).toBe(
      "Tailored CV – Backend Engineer",
    );
    expect(defaultTailoredCvName("Tailored CV", "Backend Engineer", "  ")).toBe(
      "Tailored CV – Backend Engineer",
    );
    expect(defaultTailoredCvName("Tailored CV", "Backend Engineer", "Unknown Company")).toBe(
      "Tailored CV – Backend Engineer",
    );
  });

  it("caps the name at 120 characters", () => {
    const name = defaultTailoredCvName("Tailored CV", "T".repeat(300), "Acme");
    expect(Array.from(name).length).toBe(120);
    expect(name.endsWith("…")).toBe(true);
  });
});

describe("buildCvExportFileName", () => {
  it("includes name and company", () => {
    expect(buildCvExportFileName({ fullName: "Juan Perez", company: "Acme" }, "pdf")).toBe(
      "Juan Perez - CV - Acme.pdf",
    );
  });

  it("omits missing/unknown company", () => {
    expect(buildCvExportFileName({ fullName: "Juan Perez" }, "docx")).toBe("Juan Perez - CV.docx");
    expect(buildCvExportFileName({ fullName: "Juan Perez", company: null }, "md")).toBe(
      "Juan Perez - CV.md",
    );
    expect(
      buildCvExportFileName({ fullName: "Juan Perez", company: "unknown company" }, "pdf"),
    ).toBe("Juan Perez - CV.pdf");
  });

  it("falls back to CV.ext without a name", () => {
    expect(buildCvExportFileName({ fullName: "  " }, "pdf")).toBe("CV.pdf");
    expect(buildCvExportFileName({ fullName: "", company: "Acme" }, "md")).toBe("CV.md");
  });

  it("sanitizes unsafe characters but keeps accents", () => {
    expect(buildCvExportFileName({ fullName: "José Núñez", company: "A/B: Labs?" }, "pdf")).toBe(
      "José Núñez - CV - A-B- Labs.pdf",
    );
  });
});

describe("pickDefaultCv", () => {
  const oldUpload = makeCv({ id: "old-upload", created_at: 100 });
  const newUpload = makeCv({ id: "new-upload", created_at: 300 });
  const primary = makeCv({ id: "primary", is_primary: true, created_at: 50 });
  const tailoredA = makeCv({
    id: "tailored-a",
    source: "tailored",
    target_job_id: "job-1",
    created_at: 400,
  });
  const tailoredA2 = makeCv({
    id: "tailored-a2",
    source: "tailored",
    target_job_id: "job-1",
    created_at: 500,
  });
  const tailoredB = makeCv({
    id: "tailored-b",
    source: "tailored",
    target_job_id: "job-2",
    created_at: 900,
  });

  it("returns null for an empty list", () => {
    expect(pickDefaultCv([])).toBeNull();
    expect(pickDefaultCv([], "job-1")).toBeNull();
  });

  it("prefers the newest tailored CV targeting the job", () => {
    const cvs = [oldUpload, primary, tailoredA, tailoredA2, tailoredB];
    expect(pickDefaultCv(cvs, "job-1")?.id).toBe("tailored-a2");
    expect(pickDefaultCv(cvs, "job-2")?.id).toBe("tailored-b");
  });

  it("falls back to the primary CV", () => {
    const cvs = [oldUpload, tailoredB, primary, newUpload];
    expect(pickDefaultCv(cvs, "job-1")?.id).toBe("primary");
    expect(pickDefaultCv(cvs)?.id).toBe("primary");
    expect(pickDefaultCv(cvs, null)?.id).toBe("primary");
  });

  it("then the newest upload, ignoring tailored CVs for other jobs", () => {
    expect(pickDefaultCv([tailoredB, oldUpload, newUpload], "job-1")?.id).toBe("new-upload");
  });

  it("then the first CV", () => {
    expect(pickDefaultCv([tailoredB, tailoredA])?.id).toBe("tailored-b");
  });

  it("does not mutate the input order", () => {
    const cvs = [oldUpload, newUpload];
    pickDefaultCv(cvs);
    expect(cvs.map((c) => c.id)).toEqual(["old-upload", "new-upload"]);
  });
});
