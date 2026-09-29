import { describe, it, expect } from "vitest";
import { cvMarketsForJob, cvRulesFor, cvRulesForMarkets, formatCvRulesForPrompt } from "../../src/lib/markets/cv-rules";
import { buildCvOptimizationPrompt } from "../../src/lib/llm/cv-optimization-prompts";
import type { Job } from "../../src/types";

describe("cvRulesFor", () => {
  it("forbids photos and personal data in the US", () => {
    const us = cvRulesFor("US");
    expect(us.photo).toBe("forbidden");
    expect(us.dateOfBirth).toBe("omit");
    expect(us.paper).toBe("LETTER");
  });

  it("keeps German conventions", () => {
    const de = cvRulesFor("DE");
    expect(de.photo).toBe("common");
    expect(de.languages[0]).toBe("de");
    expect(de.paper).toBe("A4");
  });

  it("derives region rules from their members", () => {
    expect(cvRulesFor("WORLDWIDE").photo).toBe("forbidden");
    expect(cvRulesFor("LATAM").dateOfBirth).toBe("omit"); // Brazil is the strictest member
  });
});

describe("cvRulesForMarkets", () => {
  it("the strictest rule wins", () => {
    const r = cvRulesForMarkets(["DE", "US"]);
    expect(r.photo).toBe("forbidden");
    expect(r.dateOfBirth).toBe("omit");
    expect(r.languages).toEqual(["de", "en"]);
    expect(r.paper).toBe("A4");
  });
});

describe("cvMarketsForJob", () => {
  it("prefers the countries the job names", () => {
    expect(cvMarketsForJob({ location_scope: { countries: ["DE"] } }, ["DO", "US"])).toEqual(["DE"]);
  });
  it("falls back to eligible markets, then all targets", () => {
    const job = { location_scope: { countries: [] }, market_eligibility: { US: { verdict: "explicit" }, DO: { verdict: "restricted" } } };
    expect(cvMarketsForJob(job, ["DO", "US"])).toEqual(["US"]);
    expect(cvMarketsForJob({}, ["DO", "US"])).toEqual(["DO", "US"]);
  });
});

describe("market block in the CV prompt", () => {
  const job = {
    id: "j", external_id: "", company_id: "", company_name: "Acme", title: "Engineer",
    description: "Build things", location: "Remote", is_dr_friendly: false, dr_filter_reason: "",
    dr_eligibility: null, source: "manual", source_url: "", apply_url: "", salary_min: null, salary_max: null,
    salary_currency: "USD", employment_type: "full_time", seniority_level: "mid", skills_required: [],
    posted_at: 0, expires_at: null, scraped_at: 0, created_at: 0, needs_recovery: false, raw_payload: null,
  } as Job;
  const base = {
    candidateName: "Ana", sourceMarkdown: "# Ana", job, analysis: null, outputLanguage: "en" as const,
    sourceLanguage: null, skillsToAdd: [], skillsToAvoid: [], experienceYears: null,
  };

  it("is included when market rules are given", () => {
    const { system } = buildCvOptimizationPrompt({ ...base, market: { rules: cvRulesFor("US"), label: "United States" } });
    expect(system).toContain("## Market conventions (United States: résumé)");
    expect(system).toContain("Do NOT include date of birth or age");
  });

  it("is absent otherwise", () => {
    expect(buildCvOptimizationPrompt(base).system).not.toContain("Market conventions");
  });

  it("formats if_requested fields conditionally", () => {
    expect(formatCvRulesForPrompt(cvRulesFor("DO"), "Dominican Republic")).toContain("only if <target_job> explicitly asks");
  });
});
