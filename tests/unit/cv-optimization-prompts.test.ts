import { describe, it, expect } from "vitest";
import {
  buildCvOptimizationPrompt,
  buildCvOptimizationChatPrompt,
  formatJobForCvPrompt,
  type CvOptimizationInput,
} from "@/lib/llm/cv-optimization-prompts";
import { buildMatchPrompt } from "@/lib/llm/prompts";
import { sampleParsedCv } from "../fixtures/sample-cv";
import type { Job } from "@/types";

const job: Job = {
  id: "job1",
  external_id: "x",
  company_id: "c1",
  company_name: "TechCorp",
  title: "Senior Backend Engineer",
  description: "We need Kubernetes and Go experience.",
  location: "Remote",
  is_dr_friendly: true,
  dr_filter_reason: "",
  dr_eligibility: "global_remote",
  source: "manual",
  source_url: "",
  apply_url: "",
  salary_min: null,
  salary_max: null,
  salary_currency: "USD",
  employment_type: "full_time",
  seniority_level: "senior",
  skills_required: ["Go", "Kubernetes"],
  posted_at: 0,
  expires_at: null,
  scraped_at: 0,
  created_at: 0,
  needs_recovery: false,
  raw_payload: null,
};

const base: CvOptimizationInput = {
  candidateName: "Juan Perez",
  sourceMarkdown: "# Juan Perez\n\n## Projects\n\n### Tool\n\n- Built it.\n",
  job,
  analysis: null,
  outputLanguage: "en",
  sourceLanguage: "es",
  skillsToAdd: [
    { skill: "Kubernetes", importance: "critical" },
    { skill: "Terraform", importance: "nice_to_have" },
  ],
  skillsToAvoid: ["Rust"],
  experienceYears: 8,
};

describe("buildCvOptimizationPrompt", () => {
  it("returns a system/prompt pair with the hard rules in the system message", () => {
    const { system, prompt } = buildCvOptimizationPrompt(base);
    expect(system).toMatch(/Numbers — hard rule/);
    expect(system).toMatch(/MUST already appear in <source_cv>/);
    expect(system).toMatch(/in English/);
    expect(system).toContain("# Juan Perez");
    expect(system).toContain("Projects");
    expect(prompt).toContain("<source_cv>");
    expect(prompt).toContain("## Projects");
  });

  it("puts data (company, skills, facts) in the prompt", () => {
    const { prompt } = buildCvOptimizationPrompt(base);
    expect(prompt).toContain("Company: TechCorp");
    expect(prompt).toContain("critical: Kubernetes");
    expect(prompt).toContain("nice_to_have: Terraform");
    expect(prompt).toMatch(/<skills_not_to_claim>\nRust/);
    expect(prompt).toContain("experience_years: 8");
    expect(prompt).toMatch(/source_language: Spanish/);
  });

  it("uses Spanish vocabulary when writing in Spanish", () => {
    const { system } = buildCvOptimizationPrompt({ ...base, outputLanguage: "es" });
    expect(system).toContain("Resumen Profesional");
    expect(system).toContain("### {Title} en {Company}");
    expect(system).toMatch(/in Spanish/);
  });

  it("says unknown when experience years can't be computed", () => {
    const { prompt } = buildCvOptimizationPrompt({ ...base, experienceYears: null });
    expect(prompt).toContain("experience_years: unknown");
  });
});

describe("formatJobForCvPrompt", () => {
  it("omits placeholder companies and caps long descriptions", () => {
    const text = formatJobForCvPrompt(
      { ...job, company_name: "Unknown company", description: "x".repeat(50) },
      10,
    );
    expect(text).not.toContain("Company:");
    expect(text).toContain("[description truncated]");
  });
});

describe("buildCvOptimizationChatPrompt", () => {
  it("treats user chat facts as ground truth and carries review decisions", () => {
    const { system, prompt } = buildCvOptimizationChatPrompt({
      ...base,
      currentDraft: "# Juan Perez\n\n## Skills\n\nGo",
      patchableHeadings: ["Juan Perez", "Skills"],
      history: [
        { role: "user", content: "I reduced costs by 30% at ABC" },
        { role: "assistant", content: "Done." },
      ],
      userMessage: "Add that to the ABC role",
      revertedSections: ["Professional Summary"],
      editedSections: ["Skills"],
    });
    expect(system).toMatch(/facts the USER states/);
    expect(system).toMatch(/<<<PATCH section=/);
    expect(prompt).toContain("USER (facts stated here are true): I reduced costs by 30% at ABC");
    expect(prompt).toContain("reverted_sections: Professional Summary");
    expect(prompt).toContain("edited_sections: Skills");
    expect(prompt).toContain("<instruction>\nAdd that to the ABC role");
  });
});

describe("formatJobForPrompt (shared)", () => {
  it("includes the company in match prompts", () => {
    expect(buildMatchPrompt(sampleParsedCv, job)).toContain("Company: TechCorp");
    expect(buildMatchPrompt(sampleParsedCv, { ...job, company_name: "Unknown company" })).not.toContain(
      "Company: Unknown company",
    );
  });
});
