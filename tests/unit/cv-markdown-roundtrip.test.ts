import { describe, it, expect } from "vitest";
import {
  formatCvAsMarkdown,
  formatDateRange,
  parseDateRange,
} from "@/lib/cv/formatCvAsMarkdown";
import { parseCvMarkdown } from "@/lib/cv/parseCvMarkdown";
import { minimalParsedCv, sampleParsedCv } from "../fixtures/sample-cv";
import type { ParsedCv } from "@/types/cv";

const roundTrip = (cv: ParsedCv) => parseCvMarkdown(formatCvAsMarkdown(cv));

describe("formatCvAsMarkdown ↔ parseCvMarkdown round trip", () => {
  it("round-trips the full sample CV exactly", () => {
    const result = roundTrip(sampleParsedCv);
    expect(result.parsed).toEqual(sampleParsedCv);
    expect(result.warnings).toEqual([]);
    expect(result.confidence).toBe("high");
    expect(result.recognizedSections).toEqual([
      "summary",
      "skills",
      "experience",
      "projects",
      "education",
      "certifications",
      "languages",
    ]);
  });

  it("keeps null end_date (Present), projects and education location", () => {
    const { parsed } = roundTrip(sampleParsedCv);
    expect(parsed.experience[0].end_date).toBeNull();
    expect(parsed.projects[0].url).toBe("github.com/juanperez/cli-tool");
    expect(parsed.education[0].location).toBe("Santo Domingo, DR");
  });

  it("is idempotent at the markdown level", () => {
    const md = formatCvAsMarkdown(sampleParsedCv);
    expect(formatCvAsMarkdown(parseCvMarkdown(md).parsed)).toBe(md);
  });

  it("round-trips a CV with only a name", () => {
    const cv: ParsedCv = { ...minimalParsedCv, full_name: "Solo Nombre" };
    const md = formatCvAsMarkdown(cv);
    expect(md).toBe("# Solo Nombre\n");
    expect(parseCvMarkdown(md).parsed).toEqual(cv);
  });

  it("round-trips extra sections verbatim, after the known sections", () => {
    const cv: ParsedCv = {
      ...sampleParsedCv,
      extra_sections: [
        { heading: "Volunteer", body: "- Habitat for Humanity, 2019\n- Coding mentor at *Girls Who Code*" },
        { heading: "Awards", body: "### Hackathon 2020\n\nFirst place out of **40** teams." },
      ],
    };
    const md = formatCvAsMarkdown(cv);
    expect(md.indexOf("## Volunteer")).toBeGreaterThan(md.indexOf("## Languages"));
    const result = parseCvMarkdown(md);
    expect(result.parsed).toEqual(cv);
    expect(result.warnings).toHaveLength(2);
  });

  it("round-trips entries with partial data", () => {
    const cv: ParsedCv = {
      ...minimalParsedCv,
      full_name: "Ana Gómez",
      location: "Santiago, RD",
      experience: [
        {
          company: "Acme",
          location: "",
          title: "QA Engineer",
          start_date: "",
          end_date: null,
          description: "",
          achievements: ["Automated regression suite"],
          technologies: [],
        },
        {
          company: "Beta",
          location: "Remote",
          title: "Tester",
          start_date: "",
          end_date: "",
          description: "Manual testing.\n\nSecond paragraph.",
          achievements: [],
          technologies: ["Cypress", "AWS (EC2, S3)"],
        },
      ],
      education: [
        {
          institution: "UASD",
          location: "",
          degree: "Licenciatura",
          field: "",
          start_date: "2015",
          end_date: "Present",
          honors: ["Dean's List, 2016", "Beca completa"],
        },
        {
          institution: "",
          location: "",
          degree: "",
          field: "Matemáticas",
          start_date: "",
          end_date: "2014",
          honors: [],
        },
      ],
      projects: [
        { name: "", description: "Tooling.", achievements: [], technologies: [], url: "" },
      ],
      languages: [{ name: "Spanish", level: "native", certification: "" }],
    };
    const md = formatCvAsMarkdown(cv);
    const { parsed } = parseCvMarkdown(md);
    expect(parsed.experience).toEqual(cv.experience);
    expect(parsed.education[0]).toEqual(cv.education[0]);
    // A field-only heading is read back as the degree (documented ambiguity).
    expect(parsed.education[1]).toEqual({ ...cv.education[1], degree: "Matemáticas", field: "" });
    expect(parsed.projects).toEqual(cv.projects);
    expect(parsed.location).toBe("Santiago, RD");
  });

  it("never emits broken fragments for empty fields", () => {
    const cv: ParsedCv = {
      ...minimalParsedCv,
      full_name: "X",
      experience: [
        {
          company: "",
          location: "",
          title: "Dev",
          start_date: "",
          end_date: null,
          description: "",
          achievements: [],
          technologies: [],
        },
        {
          company: "Co",
          location: "",
          title: "",
          start_date: "",
          end_date: "",
          description: "",
          achievements: [],
          technologies: [],
        },
      ],
      education: [
        {
          institution: "",
          location: "",
          degree: "BSc",
          field: "",
          start_date: "",
          end_date: "",
          honors: [],
        },
      ],
      skills: { technical: [], soft: [] },
      languages: [{ name: "", level: "basic", certification: "" }],
    };
    const md = formatCvAsMarkdown(cv);
    expect(md).not.toContain("* - Present*");
    expect(md).not.toMatch(/### .* in \n/);
    expect(md).not.toMatch(/### .* in $/m);
    expect(md).not.toContain(" |  - ");
    expect(md).not.toMatch(/\| *-? *$/m);
    expect(md).not.toContain("## Skills");
    expect(md).not.toContain("## Languages");
    expect(md).toContain("### Dev\n*Present*");
    expect(md).toContain("### Co\n");
    expect(md).toContain("### BSc\n");
    expect(md).not.toMatch(/\n{3,}/);
  });

  it("does not emit sections for empty arrays or an empty CV", () => {
    expect(formatCvAsMarkdown(minimalParsedCv)).toBe("");
  });
});

describe("formatDateRange / parseDateRange", () => {
  const pairs: Array<[string, string | null, "experience" | "education", string]> = [
    ["January 2021", null, "experience", "January 2021 - Present"],
    ["June 2018", "December 2020", "experience", "June 2018 - December 2020"],
    ["2012", "2016", "education", "2012 - 2016"],
    ["", null, "experience", "Present"],
    ["Jan 2020", "", "experience", "Jan 2020"],
    ["", "2016", "education", "2016"],
    ["", "", "experience", ""],
    ["", "", "education", ""],
  ];

  it.each(pairs)("formats (%j, %j, %s) → %j", (start, end, kind, expected) => {
    expect(formatDateRange(start, end, kind)).toBe(expected);
  });

  it.each(pairs)("parses back (%j, %j, %s)", (start, end, kind, formatted) => {
    expect(parseDateRange(formatted, kind)).toEqual({ start, end });
  });

  it("only-start education is formatted as the start date", () => {
    expect(formatDateRange("2012", "", "education")).toBe("2012");
  });

  it("trims whitespace and never leaves dangling separators", () => {
    expect(formatDateRange("  2020 ", "  ", "experience")).toBe("2020");
    expect(formatDateRange(" ", " 2021 ", "experience")).toBe("2021");
  });

  it("accepts the separator variants", () => {
    expect(parseDateRange("Jan 2020 – Mar 2021")).toEqual({ start: "Jan 2020", end: "Mar 2021" });
    expect(parseDateRange("Jan 2020 — Present")).toEqual({ start: "Jan 2020", end: null });
    expect(parseDateRange("Jan 2020 to Mar 2021")).toEqual({ start: "Jan 2020", end: "Mar 2021" });
    expect(parseDateRange("Enero 2020 a Marzo 2021")).toEqual({
      start: "Enero 2020",
      end: "Marzo 2021",
    });
    expect(parseDateRange("Enero 2020 hasta la actualidad")).toEqual({
      start: "Enero 2020",
      end: null,
    });
    expect(parseDateRange("2012–2016", "education")).toEqual({ start: "2012", end: "2016" });
    expect(parseDateRange("2012-2016", "education")).toEqual({ start: "2012", end: "2016" });
    expect(parseDateRange("2020-01 - 2021-03")).toEqual({ start: "2020-01", end: "2021-03" });
    expect(parseDateRange("2020-01")).toEqual({ start: "2020-01", end: "" });
  });

  it("maps present words to null", () => {
    for (const word of ["Present", "Current", "Now", "Actualidad", "Presente", "Actual", "Hoy", "present"]) {
      expect(parseDateRange(`2019 - ${word}`)).toEqual({ start: "2019", end: null });
    }
    expect(parseDateRange("*Mar 2019 - Present*")).toEqual({ start: "Mar 2019", end: null });
    expect(parseDateRange("(2019 - 2020)")).toEqual({ start: "2019", end: "2020" });
    expect(parseDateRange("Since 2019")).toEqual({ start: "2019", end: null });
  });

  it("reads a lone date as start for experience and end for education", () => {
    expect(parseDateRange("2019")).toEqual({ start: "2019", end: "" });
    expect(parseDateRange("2019", "education")).toEqual({ start: "", end: "2019" });
    expect(parseDateRange("")).toEqual({ start: "", end: "" });
  });
});
