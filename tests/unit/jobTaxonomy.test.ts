import { describe, it, expect } from "vitest";
import {
  deriveJobTags,
  collectTagFacets,
  jobMatchesTagFilters,
} from "../../src/features/jobs/utils/jobTaxonomy";
import type { Job } from "../../src/types";

let idCounter = 0;
function makeJob(title: string, description = "", skills: string[] = []): Job {
  idCounter += 1;
  return {
    id: `job-${idCounter}`, // unique — deriveJobTags memoizes by id
    external_id: `ext-${idCounter}`,
    company_id: "c1",
    title,
    description,
    location: "Remote",
    is_dr_friendly: true,
    dr_filter_reason: "",
    dr_eligibility: "global_remote",
    source: "aggregator",
    source_url: "",
    apply_url: "",
    salary_min: null,
    salary_max: null,
    salary_currency: "USD",
    employment_type: "full_time",
    seniority_level: "senior",
    skills_required: skills,
    posted_at: 0,
    expires_at: null,
    scraped_at: 0,
    created_at: 0,
    needs_recovery: false,
    raw_payload: null,
  };
}

describe("deriveJobTags", () => {
  it("tags a C#/.NET backend role", () => {
    const tags = deriveJobTags(makeJob("Senior C#/.NET Developer"));
    expect(tags.languages).toContain("C#");
    expect(tags.frameworks).toContain(".NET");
    expect(tags.roles).toContain("backend");
  });

  it("tags a React frontend role", () => {
    const tags = deriveJobTags(
      makeJob("React Frontend Engineer", "Build UIs with React and TypeScript."),
    );
    expect(tags.roles).toContain("frontend");
    expect(tags.frameworks).toContain("React");
    expect(tags.languages).toContain("TypeScript");
  });

  it("tags a QA role", () => {
    const tags = deriveJobTags(makeJob("QA Automation Engineer"));
    expect(tags.roles).toContain("qa");
  });

  it("infers fullstack when the title carries both a frontend and a backend framework", () => {
    const tags = deriveJobTags(makeJob("Software Engineer — React & Node.js"));
    expect(tags.roles).toContain("fullstack");
  });

  it("infers mobile from Flutter", () => {
    const tags = deriveJobTags(makeJob("Flutter Developer"));
    expect(tags.roles).toContain("mobile");
    expect(tags.frameworks).toContain("Flutter");
  });

  // --- boundary / false-match guards ---

  it("does not tag 'Go' inside 'Django'", () => {
    const tags = deriveJobTags(makeJob("Backend Engineer", "We use Django and Postgres."));
    expect(tags.languages).not.toContain("Go");
  });

  it("tags JavaScript (not Java) for a JavaScript role", () => {
    const tags = deriveJobTags(makeJob("JavaScript Developer"));
    expect(tags.languages).toContain("JavaScript");
    expect(tags.languages).not.toContain("Java");
  });

  it("does not tag JavaScript via 'js' inside 'Node.js'", () => {
    const tags = deriveJobTags(makeJob("Node.js Engineer", "Node.js services."));
    expect(tags.frameworks).toContain("Node.js");
    expect(tags.languages).not.toContain("JavaScript");
  });

  it("tags Go for a genuine Go role", () => {
    const tags = deriveJobTags(makeJob("Golang Engineer", "Write services in Go."));
    expect(tags.languages).toContain("Go");
  });
});

describe("collectTagFacets & jobMatchesTagFilters", () => {
  it("counts tags across jobs, descending", () => {
    const jobs = [
      makeJob("Python Data Engineer", "Python and SQL"),
      makeJob("Python Backend Engineer", "Python services"),
      makeJob("Java Backend Engineer", "Java and Spring"),
    ];
    const langFacets = collectTagFacets(jobs, "languages");
    expect(langFacets[0]).toEqual({ tag: "Python", count: 2 });
    expect(langFacets.find((f) => f.tag === "Java")?.count).toBe(1);
  });

  it("filters with OR within a dimension and AND across dimensions", () => {
    const job = makeJob("Senior Backend Engineer", "Python, Django, PostgreSQL");
    expect(jobMatchesTagFilters(job, { languages: ["Python"], frameworks: [], roles: ["backend"] })).toBe(true);
    expect(jobMatchesTagFilters(job, { languages: ["Go"], frameworks: [], roles: [] })).toBe(false);
    expect(jobMatchesTagFilters(job, { languages: ["Python"], frameworks: [], roles: ["frontend"] })).toBe(false);
    expect(jobMatchesTagFilters(job, { languages: [], frameworks: [], roles: [] })).toBe(true);
  });
});
