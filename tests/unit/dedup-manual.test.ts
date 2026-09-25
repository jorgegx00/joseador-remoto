/**
 * Pasted ("manual") jobs must never be fuzzy-merge targets for scraped jobs: a scraped
 * look-alike is stored as its own row instead of overwriting the user's pasted post.
 * The database module is mocked (no Tauri / SQLite).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "../../src/types/job";

const db = vi.hoisted(() => ({
  getAllJobs: vi.fn(),
  getJobByExternalId: vi.fn(),
  upsertJob: vi.fn(),
  findOrCreateCompanyByName: vi.fn(),
}));

vi.mock("../../src/services/database", () => db);

import {
  dedupService,
  fuzzyMergeCandidates,
  type IncomingScrapedJob,
} from "../../src/services/dedup";

const DESCRIPTION =
  "Acme is hiring a Senior React Developer to build our design system with TypeScript, React and GraphQL. Remote from Latin America.";

function job(overrides: Partial<Job>): Job {
  return {
    id: "job-1",
    external_id: "x:1",
    company_id: "company-1",
    company_name: "Acme",
    title: "Senior React Developer",
    description: DESCRIPTION,
    location: "Remote - LATAM",
    is_dr_friendly: true,
    dr_filter_reason: "",
    dr_eligibility: "explicit_latam",
    source: "aggregator",
    source_url: "",
    apply_url: "",
    salary_min: null,
    salary_max: null,
    salary_currency: "USD",
    employment_type: "full_time",
    seniority_level: "senior",
    skills_required: ["React"],
    posted_at: 1_700_000_000_000,
    expires_at: null,
    scraped_at: 1_700_000_000_000,
    created_at: 1_700_000_000_000,
    needs_recovery: false,
    raw_payload: null,
    ...overrides,
  };
}

const INCOMING: IncomingScrapedJob = {
  external_id: "serpapi:abc123",
  title: "Senior React Developer",
  company_name: "Acme",
  description: DESCRIPTION,
  location: "Remote - LATAM",
  source: "aggregator",
  source_url: "https://example.com/jobs/1",
  apply_url: "https://example.com/jobs/1/apply",
  skills_required: ["React", "TypeScript"],
};

describe("fuzzyMergeCandidates", () => {
  it("excludes pasted (manual) jobs and keeps every other source", () => {
    const jobs = [
      job({ id: "a", source: "aggregator" }),
      job({ id: "m", source: "manual", external_id: "manual:1" }),
      job({ id: "c", source: "career_page" }),
      job({ id: "l", source: "linkedin" }),
    ];
    expect(fuzzyMergeCandidates(jobs).map((j) => j.id)).toEqual(["a", "c", "l"]);
    expect(jobs).toHaveLength(4);
  });

  it("returns an empty list when only pasted jobs exist", () => {
    expect(fuzzyMergeCandidates([job({ source: "manual" })])).toEqual([]);
  });
});

describe("dedupService.deduplicateAndSave with pasted jobs", () => {
  beforeEach(() => {
    db.getAllJobs.mockReset();
    db.getJobByExternalId.mockReset().mockResolvedValue(null);
    db.upsertJob.mockReset().mockResolvedValue(undefined);
    db.findOrCreateCompanyByName.mockReset().mockResolvedValue("company-1");
  });

  it("stores a scraped look-alike as a new row instead of merging into a pasted job", async () => {
    const pasted = job({ id: "pasted-1", source: "manual", external_id: "manual:deadbeef" });
    db.getAllJobs.mockResolvedValue([pasted]);

    const stats = await dedupService.deduplicateAndSave([INCOMING]);

    expect(stats).toMatchObject({ total: 1, new: 1, merged: 0, duplicates: 0 });
    expect(db.upsertJob).toHaveBeenCalledTimes(1);
    const saved = db.upsertJob.mock.calls[0][0] as Job;
    expect(saved.id).not.toBe("pasted-1");
    expect(saved.external_id).toBe("serpapi:abc123");
    expect(saved.source).toBe("aggregator");
  });

  it("still merges a scraped look-alike into an existing scraped job", async () => {
    const scraped = job({ id: "scraped-1", source: "aggregator", external_id: "serpapi:old" });
    db.getAllJobs.mockResolvedValue([scraped]);

    const stats = await dedupService.deduplicateAndSave([INCOMING]);

    expect(stats).toMatchObject({ total: 1, new: 0, merged: 1, duplicates: 1 });
    const saved = db.upsertJob.mock.calls[0][0] as Job;
    expect(saved.id).toBe("scraped-1");
  });
});
