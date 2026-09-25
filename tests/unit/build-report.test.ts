import { describe, it, expect } from "vitest";
import { buildReport } from "../../src/features/reports/build-report";
import type { Company, Job } from "../../src/types";

function makeJob(overrides: Partial<Job>): Job {
  return {
    id: "j1",
    external_id: "ext1",
    company_id: "c1",
    title: "Senior Backend Engineer",
    description: "We need 5+ years of experience with Node.js, PostgreSQL and AWS. English required.",
    location: "Remote - LATAM",
    is_dr_friendly: true,
    dr_filter_reason: "LATAM/Caribbean region",
    dr_eligibility: "explicit_latam",
    source: "aggregator",
    source_url: "https://example.com/job",
    apply_url: "https://example.com/apply",
    salary_min: 4000,
    salary_max: 6000,
    salary_currency: "USD",
    employment_type: "full_time",
    seniority_level: "senior",
    skills_required: [],
    posted_at: 1_780_000_000_000,
    expires_at: null,
    scraped_at: 1_780_000_000_000,
    created_at: 1_780_000_000_000,
    needs_recovery: false,
    raw_payload: null,
    ...overrides,
  };
}

function makeCompany(overrides: Partial<Company>): Company {
  return {
    id: "c1",
    name: "Acme Corp",
    website: "https://acme.com",
    careers_url: "",
    logo_url: "",
    scraper_id: "serpapi",
    is_nearshore: true,
    headquarters_country: "US",
    glassdoor_url: "",
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

const NOW = 1_781_000_000_000;

describe("buildReport", () => {
  it("renders the agreed per-job block format", () => {
    const result = buildReport(
      [makeJob({})],
      new Map([["c1", makeCompany({})]]),
      { now: NOW, since: null }
    );

    expect(result.included).toBe(1);
    expect(result.text).toContain("[1] Senior Backend Engineer");
    expect(result.text).toContain("Empresa: Acme Corp");
    expect(result.text).toContain("Tipo: Extranjera (Estados Unidos)");
    expect(result.text).toContain("Salario: USD 4,000–6,000 mensual");
    expect(result.text).toContain("Descripción: We need 5+ years");
    expect(result.text).toContain("Tecnologías: Node.js, PostgreSQL, AWS");
    expect(result.text).toContain("Nivel: Senior — 5+ años de experiencia");
    expect(result.text).toContain(
      "Perfiles recomendados: Desarrollador/a Backend nivel Senior con experiencia en Node.js, PostgreSQL y AWS · requiere inglés"
    );
    expect(result.text).toContain("Aplicar: https://example.com/apply");
  });

  it("excludes non-DR-friendly jobs and non-tech roles", () => {
    const result = buildReport(
      [
        makeJob({ id: "j1" }),
        makeJob({ id: "j2", is_dr_friendly: false }),
        makeJob({ id: "j3", title: "Sales Representative" }),
      ],
      new Map([["c1", makeCompany({})]]),
      { now: NOW, since: null }
    );
    expect(result.included).toBe(1);
    expect(result.skippedNonTech).toBe(1);
  });

  it("groups jobs by category with counts in the header", () => {
    const result = buildReport(
      [
        makeJob({ id: "j1", title: "Backend Developer" }),
        makeJob({ id: "j2", title: "QA Engineer" }),
        makeJob({ id: "j3", title: "Frontend Developer (React)" }),
      ],
      new Map([["c1", makeCompany({})]]),
      { now: NOW, since: null }
    );
    expect(result.text).toContain("Por categoría: Backend (1) · Frontend (1) · QA (1)");
    expect(result.text).toContain("■ BACKEND (1)");
    expect(result.text).toContain("■ FRONTEND (1)");
    expect(result.text).toContain("■ QA (1)");
  });

  it("mentions the since date when provided", () => {
    const result = buildReport([], new Map(), { now: NOW, since: NOW - 7 * 86_400_000 });
    expect(result.text).toContain("Empleos nuevos desde el");
    expect(result.text).toContain("No hay empleos nuevos para este período.");
  });

  it("falls back to source_url and placeholders when fields are missing", () => {
    const result = buildReport(
      [
        makeJob({
          apply_url: "",
          salary_min: null,
          salary_max: null,
          description: "Join our team.",
          seniority_level: null as unknown as Job["seniority_level"],
          title: "Software Engineer",
        }),
      ],
      new Map(),
      { now: NOW, since: null }
    );
    expect(result.text).toContain("Aplicar: https://example.com/job");
    expect(result.text).toContain("Salario: No especificado");
    expect(result.text).toContain("Empresa: No especificada");
    expect(result.text).toContain("Tipo: Extranjera");
    expect(result.text).toContain("Nivel: No especificado");
    expect(result.text).toContain("Tecnologías: No especificadas");
  });
});
