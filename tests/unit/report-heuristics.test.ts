import { describe, it, expect } from "vitest";
import { classifyRole } from "../../src/features/reports/utils/role-category";
import { extractTechs } from "../../src/features/reports/utils/tech-extract";
import { formatSalary } from "../../src/features/reports/utils/salary-format";
import { extractExperienceYears, formatLevel } from "../../src/features/reports/utils/experience";
import { companyOrigin } from "../../src/features/reports/utils/company-origin";
import { recommendedProfiles } from "../../src/features/reports/utils/recommended-profiles";
import type { Company } from "../../src/types";

describe("classifyRole", () => {
  it("classifies backend titles", () => {
    expect(classifyRole("Senior Backend Engineer")).toBe("Backend");
    expect(classifyRole("Node.js Developer")).toBe("Backend");
    expect(classifyRole("Java Developer (Remote)")).toBe("Backend");
  });

  it("classifies frontend titles", () => {
    expect(classifyRole("Frontend Developer")).toBe("Frontend");
    expect(classifyRole("React Engineer")).toBe("Frontend");
  });

  it("full stack wins over backend/frontend keywords", () => {
    expect(classifyRole("Full Stack Developer (React + Node)")).toBe("Full Stack");
    expect(classifyRole("Fullstack Engineer")).toBe("Full Stack");
  });

  it("mobile wins over frontend keywords", () => {
    expect(classifyRole("React Native Developer")).toBe("Mobile");
    expect(classifyRole("Senior iOS Engineer")).toBe("Mobile");
    expect(classifyRole("Android Developer (Kotlin)")).toBe("Mobile");
  });

  it("QA wins over other keywords", () => {
    expect(classifyRole("QA Automation Engineer (Selenium)")).toBe("QA");
    expect(classifyRole("Mobile QA Tester")).toBe("QA");
  });

  it("classifies PM titles", () => {
    expect(classifyRole("Technical Project Manager")).toBe("PM");
    expect(classifyRole("Product Owner")).toBe("PM");
    expect(classifyRole("Scrum Master")).toBe("PM");
  });

  it("classifies DevOps and Data titles", () => {
    expect(classifyRole("DevOps Engineer")).toBe("DevOps");
    expect(classifyRole("Site Reliability Engineer (SRE)")).toBe("DevOps");
    expect(classifyRole("Data Engineer")).toBe("Data");
    expect(classifyRole("Machine Learning Engineer")).toBe("Data");
  });

  it("falls back to Otros (tech) for generic dev titles", () => {
    expect(classifyRole("Software Engineer")).toBe("Otros (tech)");
    expect(classifyRole("Desarrollador de Software")).toBe("Otros (tech)");
  });

  it("returns null for non-tech roles", () => {
    expect(classifyRole("Sales Representative")).toBeNull();
    expect(classifyRole("Customer Support Agent")).toBeNull();
    expect(classifyRole("Accountant")).toBeNull();
    expect(classifyRole("Recruiter")).toBeNull();
  });
});

describe("extractTechs", () => {
  it("prefers structured skills_required", () => {
    const techs = extractTechs("Backend Dev", "We use many things", ["Node.js", "PostgreSQL"]);
    expect(techs[0]).toBe("Node.js");
    expect(techs[1]).toBe("PostgreSQL");
  });

  it("extracts from title and description when skills are empty", () => {
    const techs = extractTechs(
      "Senior React Developer",
      "Experience with TypeScript, Node.js and AWS required. Docker is a plus.",
      []
    );
    expect(techs).toContain("React");
    expect(techs).toContain("TypeScript");
    expect(techs).toContain("Node.js");
    expect(techs).toContain("AWS");
    expect(techs).toContain("Docker");
  });

  it("does not duplicate skills already listed", () => {
    const techs = extractTechs("React Developer", "react react react", ["React"]);
    expect(techs.filter((t) => t.toLowerCase() === "react")).toHaveLength(1);
  });

  it("does not match 'java' inside 'javascript'", () => {
    const techs = extractTechs("Frontend", "Strong JavaScript skills", []);
    expect(techs).toContain("JavaScript");
    expect(techs).not.toContain("Java");
  });
});

describe("formatSalary", () => {
  const base = { salary_min: null, salary_max: null, salary_currency: "USD", description: "" };

  it("uses structured fields when present", () => {
    expect(formatSalary({ ...base, salary_min: 3000, salary_max: 4500 })).toBe(
      "USD 3,000–4,500 mensual"
    );
    expect(formatSalary({ ...base, salary_min: 60000, salary_max: 80000 })).toBe(
      "USD 60,000–80,000 anual"
    );
    expect(formatSalary({ ...base, salary_min: 25, salary_max: 40 })).toBe("USD 25–40 por hora");
  });

  it("formats DOP as RD$", () => {
    expect(
      formatSalary({ ...base, salary_min: 90000, salary_max: null, salary_currency: "DOP" })
    ).toBe("RD$ 90,000 anual");
  });

  it("extracts a range from the description", () => {
    expect(
      formatSalary({ ...base, description: "Compensation: $3,000 - $4,500 per month plus benefits" })
    ).toBe("USD 3,000–4,500 mensual");
  });

  it("extracts RD$ amounts from the description", () => {
    expect(
      formatSalary({ ...base, description: "Salario RD$80,000 mensual" })
    ).toBe("RD$ 80,000 mensual");
  });

  it("handles k-suffixed yearly figures", () => {
    expect(
      formatSalary({ ...base, description: "We pay $70k–$90k per year depending on experience" })
    ).toBe("USD 70,000–90,000 anual");
  });

  it("returns No especificado when nothing is found", () => {
    expect(formatSalary({ ...base, description: "Great culture and benefits" })).toBe(
      "No especificado"
    );
  });
});

describe("experience", () => {
  it("extracts years near an experience cue", () => {
    expect(extractExperienceYears("5+ years of experience with Node.js")).toBe(5);
    expect(extractExperienceYears("Requiere 3 años de experiencia en QA")).toBe(3);
  });

  it("ignores years without an experience cue", () => {
    expect(extractExperienceYears("We were founded 10 years ago in a garage")).toBeNull();
  });

  it("formats level with years", () => {
    expect(formatLevel("senior", "5+ years of experience required")).toBe(
      "Senior — 5+ años de experiencia"
    );
  });

  it("derives level from years when seniority is missing", () => {
    expect(formatLevel(null, "at least 6 years of professional experience")).toBe(
      "Senior — 6+ años de experiencia"
    );
    expect(formatLevel(null, "1 year of experience is enough")).toBe(
      "Junior — 1+ años de experiencia"
    );
  });

  it("returns No especificado when nothing is known", () => {
    expect(formatLevel(null, "join our amazing team")).toBe("No especificado");
  });
});

describe("companyOrigin", () => {
  const company = (overrides: Partial<Company>): Company => ({
    id: "c1",
    name: "Acme",
    website: "",
    careers_url: "",
    logo_url: "",
    scraper_id: "",
    is_nearshore: true,
    headquarters_country: "",
    glassdoor_url: "",
    created_at: 0,
    updated_at: 0,
    ...overrides,
  });

  it("marks DO headquarters as local", () => {
    expect(companyOrigin(company({ headquarters_country: "DO" }))).toBe(
      "Local (empresa dominicana)"
    );
  });

  it("names known foreign countries in Spanish", () => {
    expect(companyOrigin(company({ headquarters_country: "US" }))).toBe(
      "Extranjera (Estados Unidos)"
    );
  });

  it("detects Dominican companies by name or .do website", () => {
    expect(companyOrigin(company({ name: "Soluciones Dominicanas SRL" }))).toBe(
      "Local (empresa dominicana)"
    );
    expect(companyOrigin(company({ website: "https://empresa.com.do" }))).toBe(
      "Local (empresa dominicana)"
    );
  });

  it("defaults to Extranjera when unknown", () => {
    expect(companyOrigin(company({}))).toBe("Extranjera");
    expect(companyOrigin(undefined)).toBe("Extranjera");
  });
});

describe("recommendedProfiles", () => {
  it("composes role, level and top techs", () => {
    const line = recommendedProfiles(
      "Backend",
      "Senior",
      ["Node.js", "PostgreSQL", "AWS", "Docker"],
      "English required"
    );
    expect(line).toBe(
      "Desarrollador/a Backend nivel Senior con experiencia en Node.js, PostgreSQL y AWS · requiere inglés"
    );
  });

  it("omits missing parts gracefully", () => {
    expect(recommendedProfiles("QA", null, [], "")).toBe("Ingeniero/a QA");
  });
});
