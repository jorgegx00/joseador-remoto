import { describe, it, expect } from "vitest";
import { validateConsistency } from "@/lib/ats/consistency-validator";
import { sampleParsedCv, minimalParsedCv } from "../../fixtures/sample-cv";
import type { ParsedCv, CvExperience } from "@/types/cv";

function makeCvWithExperience(
  entries: CvExperience[],
): ParsedCv {
  return { ...sampleParsedCv, experience: entries };
}

describe("validateConsistency", () => {
  it("scores high with consistent date format", () => {
    const text = `Experience
Company A | January 2022 - Present
Company B | March 2019 - December 2021
Company C | June 2016 - February 2019
`;
    const result = validateConsistency(text, sampleParsedCv);
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it("flags mixed date formats", () => {
    const text = `Experience
Company A | January 2022 - Present
Company B | 03/2019 - 12/2021
Company C | 2016-06 - 2019-02
`;
    const result = validateConsistency(text, sampleParsedCv);
    const hasDateIssue = result.issues.some(
      (i) => i.message.toLowerCase().includes("inconsistent date"),
    );
    expect(hasDateIssue).toBe(true);
  });

  it("detects timeline gaps greater than 6 months", () => {
    const cv = makeCvWithExperience([
      {
        company: "Company A",
        location: "",
        title: "Engineer",
        start_date: "January 2023",
        end_date: null,
        description: "Work",
        achievements: [],
        technologies: [],
      },
      {
        company: "Company B",
        location: "",
        title: "Engineer",
        start_date: "January 2020",
        end_date: "December 2021",
        description: "Work",
        achievements: [],
        technologies: [],
      },
    ]);
    const text = "Experience\nCompany A | January 2023 - Present\nCompany B | January 2020 - December 2021";
    const result = validateConsistency(text, cv);
    // 12-month gap between Dec 2021 and Jan 2023
    const hasGapIssue = result.issues.some(
      (i) => i.message.toLowerCase().includes("gap"),
    );
    expect(hasGapIssue).toBe(true);
  });

  it("detects timeline gaps greater than 12 months with warning severity", () => {
    const cv = makeCvWithExperience([
      {
        company: "Company A",
        location: "",
        title: "Engineer",
        start_date: "January 2024",
        end_date: null,
        description: "Work",
        achievements: [],
        technologies: [],
      },
      {
        company: "Company B",
        location: "",
        title: "Engineer",
        start_date: "January 2019",
        end_date: "June 2021",
        description: "Work",
        achievements: [],
        technologies: [],
      },
    ]);
    const text = "Experience\nCompany A | January 2024\nCompany B | January 2019 - June 2021";
    const result = validateConsistency(text, cv);
    const gapIssues = result.issues.filter(
      (i) => i.message.toLowerCase().includes("gap"),
    );
    expect(gapIssues.length).toBeGreaterThan(0);
    // gaps > 12 months should be warnings
    const warningGaps = gapIssues.filter((i) => i.severity === "warning");
    expect(warningGaps.length).toBeGreaterThan(0);
  });

  it("validates reverse-chronological order", () => {
    // Wrong order: oldest first
    const cv = makeCvWithExperience([
      {
        company: "OldCo",
        location: "",
        title: "Junior Dev",
        start_date: "January 2015",
        end_date: "December 2017",
        description: "Work",
        achievements: [],
        technologies: [],
      },
      {
        company: "NewCo",
        location: "",
        title: "Senior Dev",
        start_date: "January 2021",
        end_date: null,
        description: "Work",
        achievements: [],
        technologies: [],
      },
    ]);
    const text = "Experience\nOldCo | January 2015\nNewCo | January 2021";
    const result = validateConsistency(text, cv);
    const hasOrderIssue = result.issues.some(
      (i) => i.message.toLowerCase().includes("reverse-chronological"),
    );
    expect(hasOrderIssue).toBe(true);
  });

  it("flags mixed bullet styles", () => {
    const text = `Experience
• Led development of microservices
- Managed team of 5 engineers
* Implemented CI/CD pipeline
`;
    const result = validateConsistency(text, sampleParsedCv);
    const hasBulletIssue = result.issues.some(
      (i) => i.message.toLowerCase().includes("bullet"),
    );
    expect(hasBulletIssue).toBe(true);
  });

  it("handles no experience entries", () => {
    const cv = makeCvWithExperience([]);
    const text = "Summary\nDeveloper\n\nSkills\nJavaScript";
    const result = validateConsistency(text, cv);
    // Should not crash, no gap or order issues
    const gapIssues = result.issues.filter(
      (i) => i.message.toLowerCase().includes("gap"),
    );
    expect(gapIssues.length).toBe(0);
  });

  it("handles single experience entry (no gaps possible)", () => {
    const cv = makeCvWithExperience([
      {
        company: "OnlyCo",
        location: "",
        title: "Engineer",
        start_date: "January 2022",
        end_date: null,
        description: "Work here",
        achievements: [],
        technologies: [],
      },
    ]);
    const text = "Experience\nOnlyCo | January 2022 - Present";
    const result = validateConsistency(text, cv);
    const gapIssues = result.issues.filter(
      (i) => i.message.toLowerCase().includes("gap"),
    );
    expect(gapIssues.length).toBe(0);
  });

  it("handles overlapping dates without false gap detection", () => {
    const cv = makeCvWithExperience([
      {
        company: "Company A",
        location: "",
        title: "Engineer",
        start_date: "January 2021",
        end_date: null,
        description: "Work",
        achievements: [],
        technologies: [],
      },
      {
        company: "Company B",
        location: "",
        title: "Consultant",
        start_date: "June 2020",
        end_date: "March 2021",
        description: "Work",
        achievements: [],
        technologies: [],
      },
    ]);
    const text = "Experience\nCompany A | January 2021\nCompany B | June 2020 - March 2021";
    const result = validateConsistency(text, cv);
    // Overlapping dates should not produce gaps
    const gapIssues = result.issues.filter(
      (i) => i.message.toLowerCase().includes("gap"),
    );
    expect(gapIssues.length).toBe(0);
  });

  it("consistent bullet style scores well", () => {
    const text = `Experience
- Led development
- Managed team
- Built features
- Deployed services
`;
    const result = validateConsistency(text, sampleParsedCv);
    const bulletIssues = result.issues.filter(
      (i) => i.message.toLowerCase().includes("bullet"),
    );
    expect(bulletIssues.length).toBe(0);
  });
});
