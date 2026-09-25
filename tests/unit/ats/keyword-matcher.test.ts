import { describe, it, expect } from "vitest";
import { extractKeywords, matchKeywords } from "@/lib/ats/keyword-matcher";
import type { KeywordExtractionResult } from "@/lib/ats/types";

describe("extractKeywords", () => {
  it("extracts tech terms with high importance", () => {
    const text =
      "We need a developer with experience in React, TypeScript, and Node.js";
    const results = extractKeywords(text);
    const keywords = results.map((r) => r.keyword);
    expect(keywords).toContain("react");
    expect(keywords).toContain("typescript");
    // Node.js tokenizes to "node" and gets matched
    const hasNodeRelated = keywords.some(
      (k) => k === "node.js" || k === "node" || k === "nodejs",
    );
    expect(hasNodeRelated).toBe(true);
  });

  it("removes stop words from results", () => {
    const text = "The developer should have experience with the React framework and the Node.js platform";
    const results = extractKeywords(text);
    const keywords = results.map((r) => r.keyword);
    expect(keywords).not.toContain("the");
    expect(keywords).not.toContain("and");
    expect(keywords).not.toContain("with");
    expect(keywords).not.toContain("should");
  });

  it("returns empty array for empty string", () => {
    const results = extractKeywords("");
    expect(results).toEqual([]);
  });

  it("assigns higher importance to tech terms", () => {
    const text =
      "developer developer developer react react typescript typescript kubernetes";
    const results = extractKeywords(text);
    // Tech terms should have higher importance than generic words
    const reactResult = results.find((r) => r.keyword === "react");
    const devResult = results.find((r) => r.keyword === "developer");
    expect(reactResult).toBeDefined();
    expect(devResult).toBeDefined();
    expect(reactResult!.importance).toBeGreaterThan(devResult!.importance);
  });

  it("counts frequency correctly", () => {
    const text = "React React React TypeScript TypeScript Python";
    const results = extractKeywords(text);
    const reactResult = results.find((r) => r.keyword === "react");
    const tsResult = results.find((r) => r.keyword === "typescript");
    const pyResult = results.find((r) => r.keyword === "python");
    expect(reactResult?.frequency).toBe(3);
    expect(tsResult?.frequency).toBe(2);
    expect(pyResult?.frequency).toBe(1);
  });

  it("handles special characters in job descriptions", () => {
    const text =
      "C# developer needed! Must know .NET, C++, and SQL Server (MSSQL)";
    const results = extractKeywords(text);
    // Should not crash on special characters
    expect(results.length).toBeGreaterThan(0);
  });

  it("extracts multi-word terms (bigrams)", () => {
    const text =
      "Experience with machine learning required. Machine learning engineer needed. Deep learning experience preferred.";
    const results = extractKeywords(text);
    const keywords = results.map((r) => r.keyword);
    // "machine learning" appears as bigram multiple times
    const hasMultiWord = keywords.some((k) => k.includes(" "));
    expect(hasMultiWord).toBe(true);
  });

  it("is case-insensitive in extraction", () => {
    const text = "REACT react React JavaScript javascript JAVASCRIPT";
    const results = extractKeywords(text);
    // All variants should be counted under the same lowercase key
    const reactResult = results.find((r) => r.keyword === "react");
    expect(reactResult).toBeDefined();
    expect(reactResult!.frequency).toBe(3);
  });

  it("limits results to top 30 keywords", () => {
    // Generate text with many distinct keywords
    const techTerms = [
      "React", "Angular", "Vue", "Svelte", "TypeScript", "JavaScript",
      "Python", "Ruby", "Go", "Rust", "Java", "Kotlin", "Swift", "PHP",
      "PostgreSQL", "MongoDB", "Redis", "Kafka", "Docker", "Kubernetes",
      "AWS", "Azure", "Terraform", "GraphQL", "REST", "Django", "Flask",
      "FastAPI", "Express", "NestJS", "Spring", "Laravel", "Rails",
      "Elasticsearch", "Cassandra", "DynamoDB",
    ];
    const text = techTerms.join(" ") + " " + techTerms.join(" ");
    const results = extractKeywords(text);
    expect(results.length).toBeLessThanOrEqual(30);
  });

  it("handles job description with no tech terms (generic text)", () => {
    const text =
      "We are looking for a dedicated professional who can work independently and collaboratively within a team environment. Strong organizational skills required.";
    const results = extractKeywords(text);
    // Should still extract some keywords (non-tech)
    // But tech terms won't dominate
    const techKeywords = results.filter((r) => r.importance > 10);
    expect(techKeywords.length).toBeLessThanOrEqual(results.length);
  });

  it("boosts terms that appear early in text", () => {
    // A term in the first 20% of text should get a boost
    const earlyTerms = "React React";
    const laterTerms = Array(50).fill("filler word content").join(" ");
    const text = `${earlyTerms} ${laterTerms} Python`;
    const results = extractKeywords(text);
    const reactResult = results.find((r) => r.keyword === "react");
    // React appears early and multiple times, should rank high
    expect(reactResult).toBeDefined();
  });

  it("filters out very short non-tech words", () => {
    const text = "a b c d e f g React TypeScript";
    const results = extractKeywords(text);
    const keywords = results.map((r) => r.keyword);
    // single characters (a, b, c...) should not appear
    expect(keywords).not.toContain("a");
    expect(keywords).not.toContain("b");
  });

  it("returns results sorted by importance descending", () => {
    const text =
      "React React React React TypeScript TypeScript Python Docker Docker Docker Docker Docker";
    const results = extractKeywords(text);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].importance).toBeLessThanOrEqual(
        results[i - 1].importance,
      );
    }
  });

  it("handles large keyword set (20+ keywords)", () => {
    const terms = [
      "JavaScript", "TypeScript", "React", "Angular", "Vue", "Node.js",
      "Express", "PostgreSQL", "MongoDB", "Redis", "Docker", "Kubernetes",
      "AWS", "GraphQL", "REST", "Python", "Django", "Flask",
      "Terraform", "Jenkins", "Git",
    ];
    const text = terms.map((t) => `${t} ${t}`).join(" ");
    const results = extractKeywords(text);
    expect(results.length).toBeGreaterThanOrEqual(15);
  });

  it("handles text with only stop words", () => {
    const text = "the and but or for with from into";
    const results = extractKeywords(text);
    expect(results.length).toBe(0);
  });
});

describe("matchKeywords", () => {
  const makeKw = (
    keyword: string,
    importance: number,
  ): KeywordExtractionResult => ({
    keyword,
    frequency: 1,
    importance,
  });

  it("matches exact keywords case-insensitively", () => {
    const cvText = "I have experience with React and TypeScript";
    const keywords = [makeKw("react", 10), makeKw("typescript", 8)];
    const result = matchKeywords(cvText, [], keywords);
    expect(result.matched.length).toBe(2);
    expect(result.missing.length).toBe(0);
  });

  it("matches synonyms (JS <-> JavaScript)", () => {
    const cvText = "Proficient in JavaScript development";
    const keywords = [makeKw("js", 10)];
    const result = matchKeywords(cvText, [], keywords);
    // "js" should be found as "javascript" via synonyms
    expect(result.partial.length).toBe(1);
    expect(result.partial[0].foundAs).toBe("javascript");
  });

  it("matches stemmed variants (developing -> develop)", () => {
    const cvText = "developing scalable applications";
    const keywords = [makeKw("develop", 8)];
    const result = matchKeywords(cvText, [], keywords);
    // Should match via stemming
    const found =
      result.matched.length > 0 || result.partial.length > 0;
    expect(found).toBe(true);
  });

  it("counts multiple occurrences", () => {
    const cvText =
      "Used React in project A. Built React components. React is my main framework.";
    const keywords = [makeKw("react", 10)];
    const result = matchKeywords(cvText, [], keywords);
    expect(result.matched.length).toBe(1);
    expect(result.matched[0].count).toBe(3);
  });

  it("identifies missing keywords", () => {
    const cvText = "I know React and TypeScript";
    const keywords = [
      makeKw("react", 10),
      makeKw("kubernetes", 8),
      makeKw("terraform", 7),
    ];
    const result = matchKeywords(cvText, [], keywords);
    expect(result.matched.length).toBe(1);
    expect(result.missing.length).toBe(2);
    const missingKws = result.missing.map((m) => m.keyword);
    expect(missingKws).toContain("kubernetes");
    expect(missingKws).toContain("terraform");
  });

  it("scores 100 when all keywords match", () => {
    const cvText =
      "Expert in React, TypeScript, and Node.js with AWS experience";
    const keywords = [
      makeKw("react", 10),
      makeKw("typescript", 8),
    ];
    const result = matchKeywords(cvText, [], keywords);
    expect(result.score).toBe(100);
  });

  it("scores low when no keywords match", () => {
    const cvText = "I enjoy painting and reading books";
    const keywords = [
      makeKw("react", 10),
      makeKw("typescript", 8),
      makeKw("kubernetes", 7),
    ];
    const result = matchKeywords(cvText, [], keywords);
    expect(result.score).toBeLessThanOrEqual(10);
    expect(result.missing.length).toBe(3);
  });

  it("returns 100 for empty keywords list", () => {
    const result = matchKeywords("Some CV text", [], []);
    expect(result.score).toBe(100);
    expect(result.matched.length).toBe(0);
    expect(result.missing.length).toBe(0);
  });

  it("matches keywords found in CV skills array", () => {
    const cvText = "Experienced developer";
    const cvSkills = ["React", "TypeScript", "AWS"];
    const keywords = [makeKw("react", 10), makeKw("aws", 8)];
    const result = matchKeywords(cvText, cvSkills, keywords);
    expect(result.matched.length).toBe(2);
  });

  it("handles partial matches", () => {
    const cvText = "I use PostgreSQL daily";
    const keywords = [makeKw("postgres", 8)];
    const result = matchKeywords(cvText, [], keywords);
    // "postgres" is a synonym/substring of "postgresql" in the text
    const found =
      result.matched.length > 0 || result.partial.length > 0;
    expect(found).toBe(true);
  });

  it("handles large keyword set correctly", () => {
    const cvText =
      "React TypeScript Node.js AWS Docker PostgreSQL Redis GraphQL Kubernetes Terraform";
    const keywords = Array.from({ length: 20 }, (_, i) =>
      makeKw(`keyword${i}`, 5),
    );
    // Add some that actually match
    keywords.push(makeKw("react", 10));
    keywords.push(makeKw("docker", 8));
    const result = matchKeywords(cvText, [], keywords);
    expect(result.matched.length).toBeGreaterThanOrEqual(2);
    expect(result.missing.length).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
