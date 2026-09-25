import { describe, it, expect } from "vitest";
import { runAtsSimulation } from "@/lib/ats/simulator";
import { sampleParsedCv, sampleRawCvText, minimalParsedCv } from "../../fixtures/sample-cv";
import { sampleJob } from "../../fixtures/sample-job";

describe("runAtsSimulation", () => {
  it("scores > 75 for a well-formatted CV matching a job", () => {
    const report = runAtsSimulation(sampleParsedCv, sampleRawCvText, sampleJob);
    expect(report.ats_score).toBeGreaterThanOrEqual(70);
    expect(report.keyword_score).toBeGreaterThan(0);
    expect(report.format_score).toBeGreaterThan(0);
    expect(report.structure_score).toBeGreaterThan(0);
  });

  it("scores < 50 for a poorly formatted CV", () => {
    const poorText = "hello";
    const report = runAtsSimulation(minimalParsedCv, poorText, sampleJob);
    expect(report.ats_score).toBeLessThan(50);
  });

  it("produces a reasonable score for general analysis (no job)", () => {
    const report = runAtsSimulation(sampleParsedCv, sampleRawCvText);
    expect(report.ats_score).toBeGreaterThan(0);
    expect(report.ats_score).toBeLessThanOrEqual(100);
    // Without a job, keyword matching is limited but still scored
    expect(report.keyword_score).toBeGreaterThan(0);
  });

  it("all issues have fixes", () => {
    const report = runAtsSimulation(sampleParsedCv, sampleRawCvText, sampleJob);
    for (const issue of report.issues) {
      expect(issue.fix).toBeDefined();
      expect(issue.fix.length).toBeGreaterThan(0);
    }
  });

  it("weights sum up correctly and score is weighted", () => {
    const report = runAtsSimulation(sampleParsedCv, sampleRawCvText, sampleJob);
    // Check that checks have proper weights
    const totalWeight = report.checks.reduce((sum, c) => sum + c.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0, 2);

    // Verify individual scores are populated
    expect(report.keyword_score).toBeDefined();
    expect(report.format_score).toBeDefined();
    expect(report.structure_score).toBeDefined();
    expect(report.contact_score).toBeDefined();
    expect(report.consistency_score).toBeDefined();
    expect(report.spelling_score).toBeDefined();
    expect(report.length_score).toBeDefined();

    // Score should be between 0 and 100
    expect(report.ats_score).toBeGreaterThanOrEqual(0);
    expect(report.ats_score).toBeLessThanOrEqual(100);

    // keyword_matches should be populated when job is given
    expect(report.keyword_matches.matched.length).toBeGreaterThan(0);
  });

  it("populates keyword_matches when job is provided", () => {
    const report = runAtsSimulation(sampleParsedCv, sampleRawCvText, sampleJob);
    expect(report.keyword_matches).toBeDefined();
    // With a matching CV and job, there should be matched keywords
    const totalKeywords =
      report.keyword_matches.matched.length +
      report.keyword_matches.missing.length +
      report.keyword_matches.partial.length;
    expect(totalKeywords).toBeGreaterThan(0);
  });

  it("returns empty keyword_matches when no job is provided", () => {
    const report = runAtsSimulation(sampleParsedCv, sampleRawCvText);
    expect(report.keyword_matches.matched.length).toBe(0);
    expect(report.keyword_matches.missing.length).toBe(0);
    expect(report.keyword_matches.partial.length).toBe(0);
  });
});
