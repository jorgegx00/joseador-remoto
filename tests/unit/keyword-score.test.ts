import { describe, it, expect } from "vitest";
import { buildJobKeywords, keywordCoverage, type JobKeyword } from "@/lib/cv/keyword-score";
import type { MatchAnalysis } from "@/types/llm";
import { sampleJob } from "../fixtures/sample-job";

const analysis: MatchAnalysis = {
  overall_match: 70,
  skills_match: [
    { skill: "k8s", found: false, importance: "critical" },
    { skill: "GraphQL", found: true, importance: "nice_to_have" },
    { skill: "Terraform", found: false, importance: "nice_to_have" },
  ],
  experience_match: 80,
  seniority_fit: "good_fit",
  gaps: [],
  strengths: [],
  recommendation: "",
};

describe("buildJobKeywords", () => {
  it("weights required skills 2 and analysis skills by importance, deduping synonyms", () => {
    const kws = buildJobKeywords(sampleJob, analysis);
    const get = (k: string) => kws.find((x) => x.keyword === k);
    expect(get("Kubernetes")).toEqual({ keyword: "Kubernetes", weight: 3 }); // k8s critical merged
    expect(get("k8s")).toBeUndefined();
    expect(get("GraphQL")!.weight).toBe(2); // max(required 2, nice 1)
    expect(get("Terraform")!.weight).toBe(1);
    expect(get("React")!.weight).toBe(2);
    expect(kws[0].weight).toBe(3);
    const keys = kws.map((k) => k.keyword.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("adds tech terms from the description with weight 1", () => {
    const kws = buildJobKeywords({ title: "Dev", description: "We use Kafka and Elasticsearch daily. Kafka is key.", skills_required: [] });
    expect(kws).toContainEqual({ keyword: "Kafka", weight: 1 });
    expect(kws).toContainEqual({ keyword: "Elasticsearch", weight: 1 });
    expect(kws.find((k) => k.keyword.toLowerCase() === "daily")).toBeUndefined();
  });

  it("skips lowercase common words and keeps the best-cased spelling", () => {
    const kws = buildJobKeywords({
      title: "Dev",
      description: "You are ready to go and react to change. Build APIs in Go. Spring boot and Spring Boot services.",
      skills_required: [],
    });
    expect(kws.map((k) => k.keyword)).toEqual(expect.arrayContaining(["Go", "Spring Boot"]));
    expect(kws.find((k) => k.keyword.toLowerCase() === "react")).toBeUndefined();
    expect(kws.find((k) => k.keyword === "go")).toBeUndefined();
  });

  it("works without analysis or description", () => {
    expect(buildJobKeywords({ title: "", description: "", skills_required: ["Go"] })).toEqual([
      { keyword: "Go", weight: 2 },
    ]);
  });
});

describe("keywordCoverage", () => {
  const keywords: JobKeyword[] = [
    { keyword: "Kubernetes", weight: 3 },
    { keyword: "React", weight: 2 },
    { keyword: "Go", weight: 1 },
  ];

  it("returns 100 for no keywords", () => {
    expect(keywordCoverage("anything", [])).toEqual({ score: 100, matched: [], missing: [] });
  });

  it("computes a weighted score on markdown-stripped text", () => {
    const md = "# Name\n\n**Technical Skills:** **React**, k8s\n\nA good engineer.";
    const r = keywordCoverage(md, keywords);
    expect(r.matched).toEqual(["Kubernetes", "React"]);
    expect(r.missing).toEqual(["Go"]);
    expect(r.score).toBe(83); // 5 / 6
  });

  it("scores 0 when nothing matches", () => {
    expect(keywordCoverage("Nothing relevant", keywords).score).toBe(0);
  });
});
