import { describe, it, expect } from "vitest";
import {
  computeExperienceYears,
  computeMissingJdSkills,
  containsSkill,
  extractFigures,
  findAddedJdSkills,
  findNewTechTerms,
  findUnsupportedFigures,
  parseCvDate,
} from "@/lib/cv/cv-claims";
import type { ParsedCv } from "@/types/cv";
import type { MatchAnalysis } from "@/types/llm";
import { sampleParsedCv, minimalParsedCv } from "../fixtures/sample-cv";
import { sampleJob } from "../fixtures/sample-job";

describe("extractFigures", () => {
  it("extracts percentages, multipliers, currency and plain numbers canonically", () => {
    expect(extractFigures("Cut costs by 95% and 40 %")).toEqual(["95%", "40%"]);
    expect(extractFigures("un 40 por ciento menos")).toEqual(["40%"]);
    expect(extractFigures("3x faster, then 10× more")).toEqual(["3x", "10x"]);
    expect(extractFigures("2 times faster")).toEqual(["2x"]);
    expect(extractFigures("Saved $2M")).toEqual(["2000000"]);
    expect(extractFigures("Raised US$ 50k")).toEqual(["50000"]);
    expect(extractFigures("Ahorro de €1.5 millones")).toEqual(["1500000"]);
    expect(extractFigures("Serving 1M+ users, 15+ services")).toEqual(["1000000", "15"]);
    expect(extractFigures("from 2 hours to 15 minutes")).toEqual(["2", "15"]);
    expect(extractFigures("latency down to 200ms")).toEqual(["200"]);
    expect(extractFigures("teams of 10-15 engineers")).toEqual(["10", "15"]);
    expect(extractFigures("50 mil usuarios, COVID-19, B2B, x86, 9am")).toEqual(["50000"]);
  });

  it("normalizes thousands separators", () => {
    expect(extractFigures("1,000 users")).toEqual(["1000"]);
    expect(extractFigures("1.000 usuarios")).toEqual(["1000"]);
    expect(extractFigures("1000 users")).toEqual(["1000"]);
    expect(extractFigures("2.5% and 2,5%")).toEqual(["2.5%"]);
  });

  it("ignores years, dates, versions, contact data, ordinals and headings", () => {
    const text = [
      "### Top 10 Engineer at 3M",
      "*January 2021 - Present* | 2018-2020 | 01/2021 | 2021-01 | Jan 15, 2021",
      "Used EC2, S3, ES6, HTML5, Java 17, Python 3, Web 2.0, OAuth 2 and .NET 8",
      "juan.perez@email.com | +1-809-555-1234 | (407) 555-1234 | https://example.com/42 | github.com/juan/99",
      "Ranked 1st, 2nd and 3rd; support 24/7 with 5G and 2FA",
      "1. First item",
    ].join("\n");
    expect(extractFigures(text)).toEqual([]);
  });

  it("drops plain numbers below 2 but keeps small percentages", () => {
    expect(extractFigures("1 team, 1% error rate")).toEqual(["1%"]);
  });
});

describe("findUnsupportedFigures", () => {
  const source = "Reduced API response time by 40%. Led a team of 5 engineers serving 1,000 clients.";

  it("flags invented metrics", () => {
    expect(
      findUnsupportedFigures(source, "Made the API 95% faster, 10x throughput and saved $2M. Uptime 95 %."),
    ).toEqual(["95%", "10x", "$2M"]);
  });

  it("allows figures present in the source in any spelling", () => {
    expect(findUnsupportedFigures(source, "Cut response time by 40 % for 1.000 clients")).toEqual([]);
    expect(findUnsupportedFigures(source, "Mentored 5 engineers")).toEqual([]);
  });

  it("treats 1M+ as one million", () => {
    expect(findUnsupportedFigures("Served 1M+ users", "Served over 1 million users")).toEqual([]);
    expect(findUnsupportedFigures("Served 1M+ users", "Served 2M users")).toEqual(["2M"]);
  });

  it("allows N years up to maxYears", () => {
    expect(findUnsupportedFigures("", "8+ years of experience", { maxYears: 8 })).toEqual([]);
    expect(findUnsupportedFigures("", "Más de 8 años de experiencia", { maxYears: 8 })).toEqual([]);
    expect(findUnsupportedFigures("", "12 years of experience", { maxYears: 8 })).toEqual(["12"]);
    expect(findUnsupportedFigures("", "8+ years of experience")).toEqual(["8+"]);
  });

  it("honours allowedFigures and allowedTexts", () => {
    expect(findUnsupportedFigures("", "Improved by 30%", { allowedFigures: ["30 %"] })).toEqual([]);
    expect(
      findUnsupportedFigures("", "Handled 500 requests/sec", { allowedTexts: ["The system handles 500 rps"] }),
    ).toEqual([]);
  });

  it("dedupes by canonical form and keeps the first spelling", () => {
    expect(findUnsupportedFigures("", "95% then 95 % again")).toEqual(["95%"]);
  });

  it("ignores date lines and tech versions in the candidate", () => {
    expect(
      findUnsupportedFigures("", "*January 2021 - Present* | Santo Domingo\nMigrated to Java 17 on EC2"),
    ).toEqual([]);
  });
});

describe("containsSkill", () => {
  it("handles symbol-heavy skills with word boundaries", () => {
    expect(containsSkill("Expert in C++ and C#", "C++")).toBe(true);
    expect(containsSkill("Expert in C++ and C#", "C#")).toBe(true);
    expect(containsSkill("Expert in C", "C++")).toBe(false);
    expect(containsSkill("Built .NET services", ".NET")).toBe(true);
    expect(containsSkill("Backend in Node.js.", "Node.js")).toBe(true);
    expect(containsSkill("Owned the CI/CD pipeline", "CI/CD")).toBe(true);
    expect(containsSkill("JavaScript developer", "Java")).toBe(false);
  });

  it("does not match Go inside other words or as a verb", () => {
    expect(containsSkill("A good engineer who can go far", "Go")).toBe(false);
    expect(containsSkill("Microservices in Go and Rust", "Go")).toBe(true);
    expect(containsSkill("Microservices in Golang", "Go")).toBe(true);
  });

  it("uses synonyms", () => {
    expect(containsSkill("Strong JS skills", "JavaScript")).toBe(true);
    expect(containsSkill("Strong JavaScript skills", "JS")).toBe(true);
    expect(containsSkill("Ran k8s clusters", "Kubernetes")).toBe(true);
    expect(containsSkill("Postgres tuning", "PostgreSQL")).toBe(true);
  });

  it("is case- and accent-insensitive for regular skills", () => {
    expect(containsSkill("docker and KUBERNETES", "Docker")).toBe(true);
    expect(containsSkill("Comunicación efectiva", "comunicacion")).toBe(true);
    expect(containsSkill("problem solving", "Problem-Solving")).toBe(true);
  });
});

describe("findAddedJdSkills / findNewTechTerms", () => {
  it("lists JD skills added by the candidate", () => {
    expect(
      findAddedJdSkills("React and Node.js", "React, Node.js, Kubernetes and GraphQL", [
        "React",
        "Kubernetes",
        "GraphQL",
        "Terraform",
      ]),
    ).toEqual(["Kubernetes", "GraphQL"]);
  });

  it("lists tech terms absent from both source and job text", () => {
    const source = "Built services in Node.js with PostgreSQL.";
    const job = "We use Node.js, Kafka and AWS.";
    const candidate = "Built services in Node.js with PostgreSQL, Kafka, Terraform and GitHub Actions. Go ahead.";
    expect(findNewTechTerms(source, candidate, job)).toEqual(["Terraform", "GitHub Actions"]);
  });

  it("ignores lowercase generic words from the dictionary", () => {
    expect(findNewTechTerms("", "applied the strategy command pattern", "")).toEqual([]);
  });
});

describe("computeMissingJdSkills", () => {
  const cvText = "JavaScript, TypeScript, React, Node.js, AWS, Docker";

  it("merges analysis gaps and required skills, ordered by importance", () => {
    const analysis: MatchAnalysis = {
      overall_match: 70,
      skills_match: [
        { skill: "GraphQL", found: false, importance: "nice_to_have" },
        { skill: "k8s", found: false, importance: "critical" },
        { skill: "React", found: true, importance: "critical" },
        { skill: "Docker", found: false, importance: "important" },
      ],
      experience_match: 80,
      seniority_fit: "good_fit",
      gaps: [],
      strengths: [],
      recommendation: "",
    };
    const result = computeMissingJdSkills(cvText, sampleJob, analysis);
    // Docker is in the CV despite found:false → dropped; Kubernetes dedupes into k8s;
    // GraphQL is upgraded from nice_to_have to important by skills_required.
    expect(result).toEqual([
      { skill: "k8s", importance: "critical" },
      { skill: "GraphQL", importance: "important" },
      { skill: "PostgreSQL", importance: "important" },
      { skill: "Redis", importance: "important" },
    ]);
  });

  it("works without an analysis", () => {
    const result = computeMissingJdSkills(cvText, sampleJob, null);
    expect(result.map((r) => r.skill)).toEqual(["PostgreSQL", "Kubernetes", "GraphQL", "Redis"]);
    expect(result.every((r) => r.importance === "important")).toBe(true);
  });
});

describe("computeExperienceYears", () => {
  const withRoles = (roles: Array<[string, string | null]>): ParsedCv => ({
    ...minimalParsedCv,
    experience: roles.map(([start_date, end_date]) => ({
      company: "X",
      location: "",
      title: "Dev",
      start_date,
      end_date,
      description: "",
      achievements: [],
      technologies: [],
    })),
  });

  it("unions the sample CV roles up to an injected now", () => {
    expect(computeExperienceYears(sampleParsedCv, new Date(2026, 0, 15))).toBe(10);
  });

  it("parses ISO, numeric, English and Spanish month formats", () => {
    const now = new Date(2024, 0, 1);
    expect(computeExperienceYears(withRoles([["2021-01", "2023-01"]]), now)).toBe(2);
    expect(computeExperienceYears(withRoles([["01/2021", "12/2022"]]), now)).toBe(2);
    expect(computeExperienceYears(withRoles([["January 2020", "Dec 2021"]]), now)).toBe(2);
    expect(computeExperienceYears(withRoles([["Enero 2019", "ene. 2022"]]), now)).toBe(3);
    expect(computeExperienceYears(withRoles([["2016", "2017"]]), now)).toBe(2);
    expect(computeExperienceYears(withRoles([["Marzo 2021", "Actualidad"]]), now)).toBe(2);
    expect(computeExperienceYears(withRoles([["2020-06", null]]), now)).toBe(3);
  });

  it("merges overlapping roles instead of double counting", () => {
    const now = new Date(2024, 0, 1);
    expect(
      computeExperienceYears(withRoles([["2018-01", "2021-12"], ["2020-01", "2022-12"]]), now),
    ).toBe(5);
  });

  it("returns null when nothing is parseable", () => {
    expect(computeExperienceYears(withRoles([["sometime", "later"]]))).toBeNull();
    expect(computeExperienceYears(minimalParsedCv)).toBeNull();
  });

  it("parseCvDate recognizes present markers", () => {
    expect(parseCvDate("Present")).toBe("present");
    expect(parseCvDate("Actualidad")).toBe("present");
    expect(parseCvDate("sept. 2019")).toEqual({ year: 2019, month: 9 });
  });
});
