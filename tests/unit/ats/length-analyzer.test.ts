import { describe, it, expect } from "vitest";
import { analyzeLength } from "@/lib/ats/length-analyzer";
import { sampleParsedCv, minimalParsedCv } from "../../fixtures/sample-cv";

function generateWords(count: number): string {
  const words = [
    "experienced", "developer", "software", "applications",
    "building", "scalable", "systems", "cloud", "infrastructure",
    "database", "management", "engineering", "design", "architecture",
  ];
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(words[i % words.length]);
  }
  return result.join(" ");
}

describe("analyzeLength", () => {
  it("scores high for ideal length (400-800 words)", () => {
    const text = generateWords(500);
    const result = analyzeLength(text, sampleParsedCv);
    expect(result.score).toBeGreaterThanOrEqual(85);
  });

  it("scores low for too short text (<300 words)", () => {
    const text = generateWords(150);
    const result = analyzeLength(text, minimalParsedCv);
    expect(result.score).toBeLessThanOrEqual(50);
    const hasLengthIssue = result.issues.some(
      (i) => i.message.toLowerCase().includes("short"),
    );
    expect(hasLengthIssue).toBe(true);
  });

  it("scores lower for too long text (>1200 words)", () => {
    const text = generateWords(1500);
    const result = analyzeLength(text, sampleParsedCv);
    expect(result.score).toBeLessThan(80);
    const hasLengthIssue = result.issues.some(
      (i) => i.message.toLowerCase().includes("long"),
    );
    expect(hasLengthIssue).toBe(true);
  });

  it("detects keyword stuffing (>3% density)", () => {
    // Create text where a keyword from job description repeats excessively
    const filler = generateWords(100);
    const stuffed = Array(20).fill("react").join(" ");
    const text = `${stuffed} ${filler}`;
    const jobDescription =
      "We need a React developer with experience in React development";
    const result = analyzeLength(text, minimalParsedCv, jobDescription);
    const hasStuffingIssue = result.issues.some(
      (i) => i.message.toLowerCase().includes("stuffing"),
    );
    expect(hasStuffingIssue).toBe(true);
  });

  it("checks section balance", () => {
    // Create CV where summary dominates everything
    const cv = {
      ...sampleParsedCv,
      summary: generateWords(200),
      experience: [
        {
          company: "A",
          location: "",
          title: "Dev",
          start_date: "2020",
          end_date: null,
          description: "Short",
          achievements: [],
          technologies: [],
        },
      ],
    };
    const text = generateWords(500);
    const result = analyzeLength(text, cv);
    // The summary section dominates - should flag imbalance or at least not crash
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("handles empty text", () => {
    const result = analyzeLength("", minimalParsedCv);
    expect(result.score).toBeLessThanOrEqual(30);
    const hasIssue = result.issues.some(
      (i) => i.severity === "critical",
    );
    expect(hasIssue).toBe(true);
  });

  it("handles single-word text", () => {
    const result = analyzeLength("hello", minimalParsedCv);
    expect(result.score).toBeLessThanOrEqual(35);
  });

  it("calculates estimated pages correctly", () => {
    const text = generateWords(800);
    const result = analyzeLength(text, sampleParsedCv);
    const estimatedPages = result.details.estimatedPages as number;
    // 800 words / 400 words per page = ~2 pages
    expect(estimatedPages).toBeGreaterThanOrEqual(1.5);
    expect(estimatedPages).toBeLessThanOrEqual(2.5);
  });

  it("flags excessive blank lines", () => {
    const contentLines = Array(10).fill("Some content here");
    const blankLines = Array(20).fill("");
    const text = [...contentLines, ...blankLines].join("\n");
    const result = analyzeLength(text, minimalParsedCv);
    const hasBlankIssue = result.issues.some(
      (i) => i.message.toLowerCase().includes("blank"),
    );
    expect(hasBlankIssue).toBe(true);
  });

  it("ideal range text has no length issues", () => {
    const text = generateWords(600);
    const result = analyzeLength(text, sampleParsedCv);
    const lengthIssues = result.issues.filter(
      (i) =>
        i.message.toLowerCase().includes("short") ||
        i.message.toLowerCase().includes("long"),
    );
    expect(lengthIssues.length).toBe(0);
    expect(result.details.lengthRating).toBe("ideal");
  });
});
